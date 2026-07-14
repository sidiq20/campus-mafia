use axum::{
    extract::{State, Path},
    http::StatusCode,
    Json,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};

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
    pub faction_id: Option<uuid::Uuid>,
    pub faction_name: Option<String>,
    pub influence: i32,
    pub reputation: i32,
    pub heat_level: i32,
    pub rank: RankInfo,
    pub faction_role: String,
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
        pub faction_id: Option<uuid::Uuid>,
        pub faction_name: Option<String>,
        pub influence: i32,
        pub reputation: i32,
        pub heat_level: i32,
        pub faction_role: Option<String>,
        pub created_at: chrono::DateTime<chrono::Utc>,
    }

    let row = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT 
            u.id,
            u.display_name,
            u.username,
            u.email,
            u.faction_id,
            f.name as faction_name,
            COALESCE(u.influence, 0) as influence,
            COALESCE(u.reputation, 0) as reputation,
            COALESCE(u.heat_level, 0) as heat_level,
            u.faction_role,
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

    let profile = UserProfile {
        id: row.id,
        display_name: row.display_name,
        username: row.username,
        email: row.email,
        faction_id: row.faction_id,
        faction_name: row.faction_name,
        influence: row.influence,
        reputation: row.reputation,
        heat_level: row.heat_level,
        rank: rank::get_rank_info(row.influence),
        faction_role: row.faction_role.unwrap_or_else(|| "member".to_string()),
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
        pub faction_id: Option<uuid::Uuid>,
        pub faction_name: Option<String>,
        pub influence: i32,
        pub reputation: i32,
        pub heat_level: i32,
        pub faction_role: Option<String>,
        pub created_at: chrono::DateTime<chrono::Utc>,
    }

    let row = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT 
            u.id,
            u.display_name,
            u.username,
            u.email,
            u.faction_id,
            f.name as faction_name,
            COALESCE(u.influence, 0) as influence,
            COALESCE(u.reputation, 0) as reputation,
            COALESCE(u.heat_level, 0) as heat_level,
            u.faction_role,
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

    let profile = UserProfile {
        id: row.id,
        display_name: row.display_name,
        username: row.username,
        email: row.email,
        faction_id: row.faction_id,
        faction_name: row.faction_name,
        influence: row.influence,
        reputation: row.reputation,
        heat_level: row.heat_level,
        rank: rank::get_rank_info(row.influence),
        faction_role: row.faction_role.unwrap_or_else(|| "member".to_string()),
        created_at: row.created_at,
    };

    Ok(Json(profile))
}

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: String,
}

pub async fn update_profile(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let pool = &state.pool;

    sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
        .bind(&payload.display_name)
        .bind(auth_user.user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_boosted_posts(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
) -> Result<Json<Vec<BoostedPost>>, (StatusCode, String)> {
    let pool = &state.pool;
    let posts = sqlx::query_as::<_, BoostedPost>(
        r#"
        SELECT p.id, p.content, COALESCE(u.display_name, 'Anonymous') as author_name, p.created_at
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
