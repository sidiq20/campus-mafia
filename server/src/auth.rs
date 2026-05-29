use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};

use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: uuid::Uuid, // user_id
    pub exp: usize,
}

pub fn create_jwt(user_id: uuid::Uuid) -> Result<String, String> {
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".into());
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id,
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub faction_name: String,
}

pub async fn register(
    State(state): State<crate::ServerState>,
    jar: CookieJar,
    Json(payload): Json<RegisterRequest>,
) -> Result<(CookieJar, Json<serde_json::Value>), (StatusCode, String)> {
    let pool = &state.pool;

    let faction_id_opt = sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT id FROM factions WHERE name = $1"
    )
    .bind(&payload.faction_name)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let faction_id = match faction_id_opt {
        Some(id) => id,
        None => return Err((StatusCode::BAD_REQUEST, "Invalid faction name".to_string())),
    };
    
    let member_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE faction_id = $1"
    )
    .bind(faction_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if member_count >= 50 {
        return Err((StatusCode::BAD_REQUEST, "Faction is full (maximum 50 users)".to_string()));
    }

    let hashed_pw = hash(&payload.password, DEFAULT_COST).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let user_id = sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO users (username, email, password_hash, faction_id) VALUES ($1, $2, $3, $4) RETURNING id"
    )
    .bind(&payload.username)
    .bind(&payload.email)
    .bind(&hashed_pw)
    .bind(faction_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let token = create_jwt(user_id).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let cookie = Cookie::build(("jwt", token))
        .path("/")
        .http_only(true)
        .same_site(axum_extra::extract::cookie::SameSite::Lax)
        .build();

    Ok((
        jar.add(cookie),
        Json(serde_json::json!({ "user_id": user_id, "username": payload.username })),
    ))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn login(
    State(state): State<crate::ServerState>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<(CookieJar, Json<serde_json::Value>), (StatusCode, String)> {
    let pool = &state.pool;
    #[derive(sqlx::FromRow)]
    struct LoginRecord {
        id: uuid::Uuid,
        password_hash: String,
    }

    let record = sqlx::query_as::<_, LoginRecord>(
        "SELECT id, password_hash FROM users WHERE username = $1 OR email = $1"
    )
    .bind(&payload.username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let record = record.ok_or((StatusCode::UNAUTHORIZED, "Invalid username or password".to_string()))?;

    let valid = verify(&payload.password, &record.password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !valid {
        return Err((StatusCode::UNAUTHORIZED, "Invalid username or password".to_string()));
    }

    let token = create_jwt(record.id).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let cookie = Cookie::build(("jwt", token))
        .path("/")
        .http_only(true)
        .same_site(axum_extra::extract::cookie::SameSite::Lax)
        .build();

    Ok((
        jar.add(cookie),
        Json(serde_json::json!({ "user_id": record.id, "username": payload.username })),
    ))
}

pub async fn logout(jar: CookieJar) -> (CookieJar, Json<serde_json::Value>) {
    let mut cookie = Cookie::new("jwt", "");
    cookie.set_path("/");
    cookie.make_removal();
    (jar.add(cookie), Json(serde_json::json!({ "message": "Logged out" })))
}

pub struct AuthUser {
    pub user_id: uuid::Uuid,
}

#[axum::async_trait]
impl<S> axum::extract::FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(parts: &mut axum::http::request::Parts, state: &S) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_request_parts(parts, state).await.unwrap_or_default();
        
        if let Some(cookie) = jar.get("jwt") {
            let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".into());
            let token = decode::<Claims>(
                cookie.value(),
                &DecodingKey::from_secret(secret.as_bytes()),
                &Validation::default(),
            ).map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token"))?;
            
            Ok(AuthUser { user_id: token.claims.sub })
        } else {
            Err((StatusCode::UNAUTHORIZED, "Missing token"))
        }
    }
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UserProfile {
    pub id: uuid::Uuid,
    pub username: String,
    pub email: String,
    pub faction_id: Option<uuid::Uuid>,
    pub faction_name: Option<String>,
    pub influence: i32,
    pub reputation: i32,
    pub heat_level: i32,
}

pub async fn me(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let pool = &state.pool;

    let profile = sqlx::query_as::<_, UserProfile>(
        r#"
        SELECT 
            u.id,
            u.username,
            u.email,
            u.faction_id,
            f.name as faction_name,
            COALESCE(u.influence, 0) as influence,
            COALESCE(u.reputation, 0) as reputation,
            COALESCE(u.heat_level, 0) as heat_level
        FROM users u
        LEFT JOIN factions f ON u.faction_id = f.id
        WHERE u.id = $1
        "#
    )
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(profile))
}
