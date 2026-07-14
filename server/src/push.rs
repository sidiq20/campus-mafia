use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct PushSubscription {
    pub id: uuid::Uuid,
    pub user_id: uuid::Uuid,
    pub endpoint: String,
    pub p256dh_key: String,
    pub auth_key: String,
}

#[derive(Deserialize)]
pub struct SubscribeRequest {
    pub endpoint: String,
    pub p256dh_key: String,
    pub auth_key: String,
}

/// Subscribe a push endpoint for the authenticated user
pub async fn subscribe(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<SubscribeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    sqlx::query(
        r#"
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, endpoint)
        DO UPDATE SET p256dh_key = EXCLUDED.p256dh_key, auth_key = EXCLUDED.auth_key
        "#
    )
    .bind(auth_user.user_id)
    .bind(&payload.endpoint)
    .bind(&payload.p256dh_key)
    .bind(&payload.auth_key)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "status": "subscribed" })))
}

/// Unsubscribe a push endpoint for the authenticated user
pub async fn unsubscribe(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<SubscribeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    sqlx::query(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2"
    )
    .bind(auth_user.user_id)
    .bind(&payload.endpoint)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "status": "unsubscribed" })))
}

/// Return the VAPID public key so the client can subscribe
pub async fn get_vapid_public_key() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let public_key = std::env::var("VAPID_PUBLIC_KEY")
        .map_err(|_| (StatusCode::NOT_FOUND, "VAPID keys not configured".to_string()))?;
    Ok(Json(serde_json::json!({"publicKey": public_key})))
}

// ─── Web Push Sending (VAPID ping — no payload encryption) ────────────────

/// Send an empty VAPID-signed push ping to a user's subscribed devices.
/// The Service Worker receives the ping and shows a generic notification.
pub async fn notify_user(
    pool: &sqlx::PgPool,
    user_id: uuid::Uuid,
) {
    let subscriptions = sqlx::query_as::<_, PushSubscription>(
        "SELECT id, user_id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await;

    match subscriptions {
        Ok(subs) => {
            for sub in &subs {
                match send_vapid_ping(sub).await {
                    Err(e) => {
                        tracing::warn!("Push notification failed for {}: {:?}", sub.endpoint, e);
                    }
                    Ok(_) => {}
                }
            }
        }
        Err(e) => {
            tracing::warn!("Failed to fetch push subscriptions for {user_id}: {e}");
        }
    }
}

/// Send a VAPID-signed ping to a push endpoint.
async fn send_vapid_ping(
    sub: &PushSubscription,
) -> Result<(), Box<dyn std::error::Error>> {
    let vapid_private_b64 = std::env::var("VAPID_PRIVATE_KEY")
        .map_err(|_| "VAPID_PRIVATE_KEY not set")?;
    let vapid_public_b64 = std::env::var("VAPID_PUBLIC_KEY")
        .map_err(|_| "VAPID_PUBLIC_KEY not set")?;
    let endpoint = &sub.endpoint;

    // Determine the audience (origin of the push endpoint)
    let endpoint_url = url::Url::parse(endpoint)?;
    let origin = format!(
        "{}://{}",
        endpoint_url.scheme(),
        endpoint_url.host_str().unwrap_or("")
    );

    // Build VAPID JWT
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() + 43200; // 12 hours

    let header_b64 = base64_url_encode(br#"{"typ":"JWT","alg":"ES256"}"#);
    let jwt_payload = format!(
        r#"{{"aud":"{origin}","exp":{exp},"sub":"mailto:admin@campus-mafia.com"}}"#
    );
    let payload_b64 = base64_url_encode(jwt_payload.as_bytes());

    let signing_input = format!("{header_b64}.{payload_b64}");
    let signature_b64 = ecdsa_sign_p256(&signing_input, &vapid_private_b64)?;

    let auth_header = format!("vapid t={signing_input}.{signature_b64}, k={vapid_public_b64}");

    // Send empty push ping — no payload body, no Content-Encoding.
    // The Service Worker receives this ping, then fetches the latest
    // notification from the server to display.
    let client = reqwest::Client::new();
    let response = client
        .post(endpoint)
        .header("Authorization", &auth_header)
        .header("TTL", "86400")
        .header("Content-Length", "0")
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        tracing::warn!("Push endpoint returned {status}: {endpoint}");
        if status == reqwest::StatusCode::GONE {
            tracing::info!("Push subscription expired (410 Gone): {endpoint}");
        }
    }

    Ok(())
}

// ─── VAPID JWT Signing (ECDSA P-256 via ring) ─────────────────────────────

fn base64_url_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

fn base64_url_decode(data: &str) -> Result<Vec<u8>, base64::DecodeError> {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(data)
}

/// Sign a message with ECDSA P-256 and return the raw r||s signature (64 bytes)
fn ecdsa_sign_p256(
    message: &str,
    private_key_b64: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    use ring::signature::{EcdsaKeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};

    // Decode private key (32 bytes)
    let priv_raw = base64_url_decode(private_key_b64)?;
    if priv_raw.len() != 32 {
        return Err(format!("Invalid private key length: {}, expected 32", priv_raw.len()).into());
    }

    // Decode public key (65 bytes: 0x04 || x || y)
    let pub_b64 = std::env::var("VAPID_PUBLIC_KEY")?;
    let pub_raw = base64_url_decode(&pub_b64)?;

    // Build PKCS#8 document
    let pkcs8 = build_pkcs8_p256(&priv_raw, &pub_raw)?;

    let rng = ring::rand::SystemRandom::new();
    let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &pkcs8, &rng)?;

    let signature = key_pair.sign(&rng, message.as_bytes())?;
    let der_sig = signature.as_ref();

    // Convert DER-encoded signature to raw r||s (64 bytes)
    let raw_sig = der_signature_to_raw_p256(der_sig)?;

    Ok(base64_url_encode(&raw_sig))
}

/// Parse a DER-encoded ECDSA P-256 signature and return raw r||s (64 bytes)
fn der_signature_to_raw_p256(der: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // DER: SEQUENCE { INTEGER r, INTEGER s }
    if der.len() < 8 || der[0] != 0x30 {
        return Err("Not a valid DER SEQUENCE".into());
    }

    let mut pos = 2; // skip SEQUENCE tag and length

    // Read INTEGER r
    if pos >= der.len() || der[pos] != 0x02 {
        return Err("Expected INTEGER for r".into());
    }
    pos += 1;
    let r_len = der[pos] as usize;
    pos += 1;
    let r_val = read_integer_bytes(der, &mut pos, r_len, 32)?;

    // Read INTEGER s
    if pos >= der.len() || der[pos] != 0x02 {
        return Err("Expected INTEGER for s".into());
    }
    pos += 1;
    let s_len = der[pos] as usize;
    pos += 1;
    let s_val = read_integer_bytes(der, &mut pos, s_len, 32)?;

    let mut sig = Vec::with_capacity(64);
    sig.extend_from_slice(&r_val);
    sig.extend_from_slice(&s_val);
    Ok(sig)
}

/// Read an INTEGER value, padding or truncating to the given byte length
fn read_integer_bytes(
    data: &[u8],
    pos: &mut usize,
    len: usize,
    target_len: usize,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    if *pos + len > data.len() {
        return Err("Integer value extends past end of data".into());
    }

    let raw = &data[*pos..*pos + len];
    *pos += len;

    // DER integers may have a leading 0x00 to indicate unsigned
    let start = if raw.len() > target_len && raw[0] == 0x00 { 1 } else { 0 };
    let value = &raw[start..];

    if value.len() > target_len {
        return Err(format!("Integer value too long: {} > {}", value.len(), target_len).into());
    }

    // Pad to target_len with leading zeros
    let mut padded = vec![0u8; target_len - value.len()];
    padded.extend_from_slice(value);
    Ok(padded)
}

/// Build a PKCS#8 PrivateKeyInfo document for P-256
fn build_pkcs8_p256(
    private_key: &[u8],
    public_key: &[u8],
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // ECPrivateKey SEQUENCE (inner)
    let mut ec_private = Vec::new();

    // version = 1 (INTEGER)
    ec_private.extend_from_slice(&[0x02, 0x01, 0x01]);

    // privateKey (OCTET STRING, 32 bytes)
    ec_private.push(0x04);
    ec_private.push(0x20);
    ec_private.extend_from_slice(private_key);

    // [1] publicKey (context-tagged BIT STRING)
    if !public_key.is_empty() {
        ec_private.push(0xA1);
        // BIT STRING content: 0x00 (unused bits) + public_key bytes
        let bitstring_content: Vec<u8> = {
            let mut v = vec![0x00]; // 0 unused bits
            v.extend_from_slice(public_key);
            v
        };
        ec_private.push(bitstring_content.len() as u8);
        ec_private.extend_from_slice(&bitstring_content);
    }

    // Wrap in SEQUENCE for ECPrivateKey
    let mut ec_seq = vec![0x30, ec_private.len() as u8];
    ec_seq.extend_from_slice(&ec_private);

    // AlgorithmIdentifier for EC with P-256
    let algo_id: &[u8] = &[
        0x30, 0x13,       // SEQUENCE (19 bytes)
        0x06, 0x07,       // OID (ecPublicKey)
        0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
        0x06, 0x08,       // OID (prime256v1)
        0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07,
    ];

    // PrivateKey OCTET STRING wrapping the ECPrivateKey
    let mut priv_octet = vec![0x04, ec_seq.len() as u8];
    priv_octet.extend_from_slice(&ec_seq);

    // PrivateKeyInfo SEQUENCE
    let mut pkcs8 = vec![0x30u8];
    // version = 0 (INTEGER)
    let version: &[u8] = &[0x02, 0x01, 0x00];

    let total = version.len() + algo_id.len() + priv_octet.len();
    pkcs8.push(total as u8);
    pkcs8.extend_from_slice(version);
    pkcs8.extend_from_slice(algo_id);
    pkcs8.extend_from_slice(&priv_octet);

    Ok(pkcs8)
}
