use axum::{
    extract::{State, Path},
    http::StatusCode,
    Json,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::collections::HashMap;
use std::env;

use crate::rank::{self, RankInfo};

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
    pub display_name: String,
    pub username: String,
    pub email: String,
    pub password: String,
    pub faction_name: Option<String>,
}

pub async fn register(
    State(state): State<crate::ServerState>,
    jar: CookieJar,
    Json(payload): Json<RegisterRequest>,
) -> Result<(CookieJar, Json<serde_json::Value>), (StatusCode, String)> {
    let pool = &state.pool;

    let faction_id: Option<uuid::Uuid> = if let Some(ref faction_name) = payload.faction_name {
        let fid = sqlx::query_scalar::<_, uuid::Uuid>(
            "SELECT id FROM factions WHERE name = $1"
        )
        .bind(faction_name)
        .fetch_optional(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::BAD_REQUEST, "Invalid faction name".to_string()))?;

        let member_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM users WHERE faction_id = $1"
        )
        .bind(fid)
        .fetch_one(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if member_count >= 50 {
            return Err((StatusCode::BAD_REQUEST, "Faction is full (maximum 50 users)".to_string()));
        }

        Some(fid)
    } else {
        None
    };

    let hashed_pw = hash(&payload.password, DEFAULT_COST).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let user_id = sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO users (display_name, username, email, password_hash, faction_id) VALUES ($1, $2, $3, $4, $5) RETURNING id"
    )
    .bind(&payload.display_name)
    .bind(&payload.username)
    .bind(&payload.email)
    .bind(&hashed_pw)
    .bind(faction_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let token = create_jwt(user_id).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Send a welcome message in global comms
    crate::comms::send_welcome_message(
        pool,
        user_id,
        &payload.display_name,
        state.ws_state.as_ref(),
    ).await;

    Ok((
        jar,
        Json(serde_json::json!({ "user_id": user_id, "username": payload.username, "token": token })),
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

    Ok((
        jar,
        Json(serde_json::json!({ "user_id": record.id, "username": payload.username, "token": token })),
    ))
}

pub async fn logout(jar: CookieJar) -> (CookieJar, Json<serde_json::Value>) {
    let cookie = Cookie::build(("jwt", ""))
        .path("/")
        .http_only(true)
        .secure(true)
        .same_site(axum_extra::extract::cookie::SameSite::None)
        .build();
    let jar = jar.add(cookie);
    (jar, Json(serde_json::json!({ "message": "Logged out" })))
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
        let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".into());

        // Try Authorization: Bearer <token> header first
        if let Some(auth_header) = parts.headers.get("authorization") {
            if let Ok(auth_str) = auth_header.to_str() {
                if let Some(token_str) = auth_str.strip_prefix("Bearer ") {
                    let token = decode::<Claims>(
                        token_str,
                        &DecodingKey::from_secret(secret.as_bytes()),
                        &Validation::default(),
                    ).map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token"))?;
                    return Ok(AuthUser { user_id: token.claims.sub });
                }
            }
        }

        // Fall back to cookie
        let jar = CookieJar::from_request_parts(parts, state).await.unwrap_or_default();
        if let Some(cookie) = jar.get("jwt") {
            let token = decode::<Claims>(
                cookie.value(),
                &DecodingKey::from_secret(secret.as_bytes()),
                &Validation::default(),
            ).map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token"))?;
            return Ok(AuthUser { user_id: token.claims.sub });
        }

        Err((StatusCode::UNAUTHORIZED, "Missing token"))
    }
}

pub struct OptionalAuthUser {
    pub user_id: Option<uuid::Uuid>,
}

#[axum::async_trait]
impl<S> axum::extract::FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut axum::http::request::Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_result = AuthUser::from_request_parts(parts, state).await;
        match auth_result {
            Ok(auth_user) => Ok(OptionalAuthUser { user_id: Some(auth_user.user_id) }),
            Err(_) => Ok(OptionalAuthUser { user_id: None }),
        }
    }
}

#[derive(Serialize)]
pub struct UserProfile {
    pub id: uuid::Uuid,
    pub display_name: String,
    pub username: String,
    pub email: String,
    pub bio: String,
    pub faction_id: Option<uuid::Uuid>,
    pub faction_name: Option<String>,
    pub influence: i32,
    pub reputation: i32,
    pub heat_level: i32,
    pub rank: RankInfo,
    pub faction_role: String,
    pub pinned_post_id: Option<uuid::Uuid>,
    pub pinned_post_content: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_user_by_username(
    State(state): State<crate::ServerState>,
    Path(username): Path<String>,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct UserRow {
        pub id: uuid::Uuid,
        pub display_name: String,
        pub username: String,
        pub email: String,
        pub bio: String,
        pub faction_id: Option<uuid::Uuid>,
        pub faction_name: Option<String>,
        pub influence: i32,
        pub reputation: i32,
        pub heat_level: i32,
        pub faction_role: Option<String>,
        pub pinned_post_id: Option<uuid::Uuid>,
        pub created_at: chrono::DateTime<chrono::Utc>,
    }

    let row = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT 
            u.id,
            u.display_name,
            u.username,
            u.email,
            COALESCE(u.bio, '') as bio,
            u.faction_id,
            f.name as faction_name,
            COALESCE(u.influence, 0) as influence,
            COALESCE(u.reputation, 0) as reputation,
            COALESCE(u.heat_level, 0) as heat_level,
            u.faction_role,
            u.pinned_post_id,
            u.created_at
        FROM users u
        LEFT JOIN factions f ON u.faction_id = f.id
        WHERE u.username = $1
        "#
    )
    .bind(username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let row = row.ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

    // Fetch pinned post content if pinned
    let pinned_content: Option<String> = if row.pinned_post_id.is_some() {
        sqlx::query_scalar("SELECT content FROM posts WHERE id = $1")
            .bind(row.pinned_post_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    let profile = UserProfile {
        id: row.id,
        display_name: row.display_name,
        username: row.username,
        email: row.email,
        bio: row.bio,
        faction_id: row.faction_id,
        faction_name: row.faction_name,
        influence: row.influence,
        reputation: row.reputation,
        heat_level: row.heat_level,
        rank: rank::get_rank_info(row.influence),
        faction_role: row.faction_role.unwrap_or_else(|| "member".to_string()),
        pinned_post_id: row.pinned_post_id,
        pinned_post_content: pinned_content,
        created_at: row.created_at,
    };

    Ok(Json(profile))
}

pub async fn me(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct UserRow {
        pub id: uuid::Uuid,
        pub display_name: String,
        pub username: String,
        pub email: String,
        pub bio: String,
        pub faction_id: Option<uuid::Uuid>,
        pub faction_name: Option<String>,
        pub influence: i32,
        pub reputation: i32,
        pub heat_level: i32,
        pub faction_role: Option<String>,
        pub pinned_post_id: Option<uuid::Uuid>,
        pub created_at: chrono::DateTime<chrono::Utc>,
    }

    let row = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT 
            u.id,
            u.display_name,
            u.username,
            u.email,
            COALESCE(u.bio, '') as bio,
            u.faction_id,
            f.name as faction_name,
            COALESCE(u.influence, 0) as influence,
            COALESCE(u.reputation, 0) as reputation,
            COALESCE(u.heat_level, 0) as heat_level,
            u.faction_role,
            u.pinned_post_id,
            u.created_at
        FROM users u
        LEFT JOIN factions f ON u.faction_id = f.id
        WHERE u.id = $1
        "#
    )
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Fetch pinned post content if pinned
    let pinned_content: Option<String> = if row.pinned_post_id.is_some() {
        sqlx::query_scalar("SELECT content FROM posts WHERE id = $1")
            .bind(row.pinned_post_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    let profile = UserProfile {
        id: row.id,
        display_name: row.display_name,
        username: row.username,
        email: row.email,
        bio: row.bio,
        faction_id: row.faction_id,
        faction_name: row.faction_name,
        influence: row.influence,
        reputation: row.reputation,
        heat_level: row.heat_level,
        rank: rank::get_rank_info(row.influence),
        faction_role: row.faction_role.unwrap_or_else(|| "member".to_string()),
        pinned_post_id: row.pinned_post_id,
        pinned_post_content: pinned_content,
        created_at: row.created_at,
    };

    Ok(Json(profile))
}

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub bio: Option<String>,
}

pub async fn update_profile(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let pool = &state.pool;

    if let Some(name) = &payload.display_name {
        sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
            .bind(name)
            .bind(auth_user.user_id)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    if let Some(bio) = &payload.bio {
        sqlx::query("UPDATE users SET bio = $1 WHERE id = $2")
            .bind(bio)
            .bind(auth_user.user_id)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    me(auth_user, State(state)).await
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UserSearchResult {
    pub id: uuid::Uuid,
    pub username: String,
    pub display_name: String,
}

pub async fn search_users(
    State(state): State<crate::ServerState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<Vec<UserSearchResult>> {
    let pool = &state.pool;
    let query = params.get("q").cloned().unwrap_or_default();

    if query.is_empty() {
        return Json(vec![]);
    }

    let pattern = format!("%{}%", query);
    let users = sqlx::query_as::<_, UserSearchResult>(
        r#"
        SELECT id, username, display_name
        FROM users
        WHERE username ILIKE $1 OR display_name ILIKE $1
        ORDER BY influence DESC
        LIMIT 20
        "#
    )
    .bind(&pattern)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(users)
}

#[derive(Serialize, sqlx::FromRow)]
pub struct ProfileBroadcast {
    pub id: uuid::Uuid,
    pub content: String,
    pub channel_type: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_profile_broadcasts(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
) -> Result<Json<Vec<ProfileBroadcast>>, (StatusCode, String)> {
    let pool = &state.pool;
    let broadcasts = sqlx::query_as::<_, ProfileBroadcast>(
        r#"
        SELECT id, content, channel_type, created_at
        FROM chat_messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(broadcasts))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct BoostedPost {
    pub id: uuid::Uuid,
    pub content: String,
    pub author_name: String,
    pub author_username: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_boosted_posts(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
) -> Result<Json<Vec<BoostedPost>>, (StatusCode, String)> {
    let pool = &state.pool;
    let posts = sqlx::query_as::<_, BoostedPost>(
        r#"
        SELECT p.id, p.content, COALESCE(u.display_name, 'Anonymous') as author_name, u.username as author_username, p.created_at
        FROM reactions r
        JOIN posts p ON r.post_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE r.user_id = $1 AND r.reaction_type = 'boost'
        ORDER BY p.created_at DESC
        LIMIT 20
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(posts))
}

// ——— Pin / Unpin Posts ———

#[derive(Deserialize)]
pub struct PinPostRequest {
    pub post_id: Option<uuid::Uuid>,
}

pub async fn pin_post(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
    Json(payload): Json<PinPostRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Verify the post belongs to the user
    if let Some(pid) = payload.post_id {
        let is_owner: bool = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM posts WHERE id = $1 AND user_id = $2)"
        )
        .bind(pid)
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if !is_owner {
            return Err((StatusCode::FORBIDDEN, "You can only pin your own posts".to_string()));
        }

        sqlx::query("UPDATE users SET pinned_post_id = $1 WHERE id = $2")
            .bind(pid)
            .bind(auth_user.user_id)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    } else {
        // Unpin
        sqlx::query("UPDATE users SET pinned_post_id = NULL WHERE id = $1")
            .bind(auth_user.user_id)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    Ok(Json(serde_json::json!({"status": "ok"})))
}

// ——— Reposts ———

#[derive(Serialize, sqlx::FromRow)]
pub struct RepostResponse {
    pub post_id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn repost_post(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
    Path(post_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Check if post exists
    let exists: bool = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM posts WHERE id = $1)")
        .bind(post_id)
        .fetch_one(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !exists {
        return Err((StatusCode::NOT_FOUND, "Post not found".to_string()));
    }

    // Toggle repost (insert or delete)
    let result = sqlx::query(
        r#"
        INSERT INTO reposts (user_id, post_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, post_id)
        DO DELETE
        "#
    )
    .bind(auth_user.user_id)
    .bind(post_id)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let action = if result.rows_affected() == 1 { "reposted" } else { "unreposted" };
    Ok(Json(serde_json::json!({"status": action})))
}

pub async fn get_user_reposts(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
) -> Result<Json<Vec<RepostResponse>>, (StatusCode, String)> {
    let pool = &state.pool;
    let reposts = sqlx::query_as::<_, RepostResponse>(
        r#"
        SELECT post_id, created_at
        FROM reposts
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(reposts))
}

// ——— Signup Progress / Multi-step Wizard ———

#[derive(Deserialize)]
pub struct SignupStartRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct SignupStepRequest {
    pub temp_token: String,
    pub step: i32,
    pub data: HashMap<String, Value>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct SignupProgressRow {
    pub temp_token: uuid::Uuid,
    pub data: serde_json::Value,
    pub current_step: i32,
}

pub async fn signup_start(
    State(state): State<crate::ServerState>,
    Json(payload): Json<SignupStartRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Check username/email uniqueness
    let existing: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 OR email = $2)"
    )
    .bind(&payload.username)
    .bind(&payload.email)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if existing {
        return Err((StatusCode::CONFLICT, "Username or email already taken".to_string()));
    }

    let hashed_pw = hash(&payload.password, DEFAULT_COST)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let data = serde_json::json!({
        "username": payload.username,
        "email": payload.email,
        "password_hash": hashed_pw,
    });

    let row = sqlx::query_as::<_, SignupProgressRow>(
        r#"
        INSERT INTO signup_progress (data, current_step)
        VALUES ($1, 1)
        RETURNING temp_token, data, current_step
        "#
    )
    .bind(&data)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "temp_token": row.temp_token.to_string(),
        "current_step": row.current_step,
    })))
}

pub async fn signup_step(
    State(state): State<crate::ServerState>,
    Json(payload): Json<SignupStepRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let token = uuid::Uuid::parse_str(&payload.temp_token)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid token".to_string()))?;

    // Get existing progress
    let existing = sqlx::query_as::<_, SignupProgressRow>(
        "SELECT temp_token, data, current_step FROM signup_progress WHERE temp_token = $1 AND expires_at > NOW()"
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::BAD_REQUEST, "Progress expired or not found".to_string()))?;

    // Merge existing data with new data
    let mut merged = existing.data;
    if let Some(obj) = merged.as_object_mut() {
        for (key, val) in payload.data {
            obj.insert(key, val);
        }
    }

    sqlx::query("UPDATE signup_progress SET data = $1, current_step = $2 WHERE temp_token = $3")
        .bind(&merged)
        .bind(payload.step)
        .bind(token)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "saved", "current_step": payload.step})))
}

pub async fn signup_resume(
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
    State(state): State<crate::ServerState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let token_str = params.get("token").ok_or((StatusCode::BAD_REQUEST, "Missing token".to_string()))?;
    let token = uuid::Uuid::parse_str(token_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid token".to_string()))?;

    let row = sqlx::query_as::<_, SignupProgressRow>(
        "SELECT temp_token, data, current_step FROM signup_progress WHERE temp_token = $1 AND expires_at > NOW()"
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "No saved progress".to_string()))?;

    Ok(Json(serde_json::json!({
        "temp_token": row.temp_token.to_string(),
        "current_step": row.current_step,
        "data": row.data,
    })))
}

#[derive(Deserialize)]
pub struct SignupCompleteRequest {
    pub temp_token: String,
    pub display_name: String,
    pub bio: Option<String>,
    pub faction_name: Option<String>,
}

pub async fn signup_complete(
    State(state): State<crate::ServerState>,
    Json(payload): Json<SignupCompleteRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let token = uuid::Uuid::parse_str(&payload.temp_token)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid token".to_string()))?;

    let row = sqlx::query_as::<_, SignupProgressRow>(
        "SELECT temp_token, data, current_step FROM signup_progress WHERE temp_token = $1 AND expires_at > NOW()"
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::BAD_REQUEST, "Progress expired".to_string()))?;

    let username = row.data["username"].as_str().unwrap_or_default().to_string();
    let email = row.data["email"].as_str().unwrap_or_default().to_string();
    let password_hash = row.data["password_hash"].as_str().unwrap_or_default().to_string();

    // Check uniqueness again in case of race
    let existing: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 OR email = $2)"
    )
    .bind(&username)
    .bind(&email)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if existing {
        return Err((StatusCode::CONFLICT, "Username or email already taken".to_string()));
    }

    // Handle faction if provided
    let faction_id: Option<uuid::Uuid> = if let Some(ref faction_name) = payload.faction_name {
        sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM factions WHERE name = $1")
            .bind(faction_name)
            .fetch_optional(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        None
    };

    let user_id = sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO users (display_name, username, email, password_hash, faction_id, bio) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"
    )
    .bind(&payload.display_name)
    .bind(&username)
    .bind(&email)
    .bind(&password_hash)
    .bind(faction_id)
    .bind(&payload.bio.unwrap_or_default())
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Clean up progress
    let _ = sqlx::query("DELETE FROM signup_progress WHERE temp_token = $1")
        .bind(token)
        .execute(pool)
        .await;

    let token = create_jwt(user_id).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Send welcome message
    crate::comms::send_welcome_message(
        pool,
        user_id,
        &payload.display_name,
        state.ws_state.as_ref(),
    ).await;

    Ok(Json(serde_json::json!({
        "user_id": user_id,
        "username": username,
        "token": token,
    })))
}
