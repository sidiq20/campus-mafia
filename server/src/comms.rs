use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct ChatMessageResponse {
    pub id: uuid::Uuid,
    pub channel_type: String,
    pub channel_id: Option<uuid::Uuid>,
    pub content: String,
    pub author_name: String,
    pub faction_name: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

fn extract_tags(content: &str) -> Vec<String> {
    content
        .split_whitespace()
        .filter(|w| w.starts_with('@') && w.len() > 1)
        .map(|w| {
            let w = w.trim_start_matches('@');
            w.trim_end_matches(|c: char| !c.is_alphanumeric()).to_string()
        })
        .collect()
}

pub async fn get_global_chat(State(state): State<ServerState>) -> Json<Vec<ChatMessageResponse>> {
    let pool = &state.pool;

    let messages = sqlx::query_as::<_, ChatMessageResponse>(
        r#"
        SELECT 
            c.id, 
            c.channel_type, 
            c.channel_id, 
            c.content, 
            u.username as author_name, 
            f.name as faction_name,
            c.created_at
        FROM chat_messages c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        WHERE c.channel_type = 'global'
        ORDER BY c.created_at ASC
        LIMIT 100
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(messages)
}

pub async fn send_global_chat(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<ChatMessageResponse>, (StatusCode, String)> {
    let pool = &state.pool;

    // Rate limit: max 2 broadcasts per minute, 1h ban on 3rd+ attempt
    match crate::rate_limit::check_and_record(pool, auth_user.user_id, crate::rate_limit::ACTION_BROADCAST).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        crate::rate_limit::RateLimitResult::Allowed => {}
        crate::rate_limit::RateLimitResult::Banned(until) => {
            let remaining = (until - chrono::Utc::now()).num_seconds().max(0);
            return Err((StatusCode::TOO_MANY_REQUESTS, format!("You have been temporarily banned from broadcasting for {} more seconds. Slow down!", remaining)));
        }
    }

    let msg = sqlx::query_as::<_, ChatMessageResponse>(
        r#"
        WITH inserted AS (
            INSERT INTO chat_messages (user_id, channel_type, content)
            VALUES ($1, 'global', $2)
            RETURNING id, channel_type, channel_id, content, user_id, created_at
        )
        SELECT 
            i.id, 
            i.channel_type, 
            i.channel_id, 
            i.content, 
            u.username as author_name, 
            f.name as faction_name,
            i.created_at
        FROM inserted i
        JOIN users u ON i.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        "#
    )
    .bind(auth_user.user_id)
    .bind(&payload.content)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Process Tags
    let tags = extract_tags(&payload.content);
    for tag in tags {
        let _ = sqlx::query(
            "INSERT INTO notifications (user_id, content) 
             SELECT id, $1 FROM users WHERE username = $2"
        )
        .bind(format!("You were mentioned in global comms by @{}", msg.author_name))
        .bind(&tag)
        .execute(pool)
        .await;
    }

    // Broadcast to WS
    let event = crate::ws::GameEvent::ChatMessage {
        author: msg.author_name.clone(),
        faction: msg.faction_name.clone(),
        msg: msg.content.clone(),
        channel_type: "global".to_string(),
        channel_id: None,
    };
    if let Ok(event_json) = serde_json::to_string(&event) {
        let _ = state.ws_state.tx.send(event_json);
    }

    Ok(Json(msg))
}

pub async fn get_faction_chat(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<ChatMessageResponse>>, (StatusCode, String)> {
    let pool = &state.pool;

    // Verify user is in this faction
    let user_faction: Option<uuid::Uuid> = sqlx::query_scalar("SELECT faction_id FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .map_err(|_| (StatusCode::UNAUTHORIZED, "User not found".to_string()))?;

    if user_faction != Some(faction_id) {
        return Err((StatusCode::FORBIDDEN, "Not authorized to read this faction's encrypted comms".to_string()));
    }

    let messages = sqlx::query_as::<_, ChatMessageResponse>(
        r#"
        SELECT 
            c.id, 
            c.channel_type, 
            c.channel_id, 
            c.content, 
            u.username as author_name, 
            f.name as faction_name,
            c.created_at
        FROM chat_messages c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        WHERE c.channel_type = 'faction' AND c.channel_id = $1
        ORDER BY c.created_at ASC
        LIMIT 100
        "#
    )
    .bind(faction_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Ok(Json(messages))
}

pub async fn send_faction_chat(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<ChatMessageResponse>, (StatusCode, String)> {
    let pool = &state.pool;

    // Rate limit: max 2 broadcasts per minute, 1h ban on 3rd+ attempt
    match crate::rate_limit::check_and_record(pool, auth_user.user_id, crate::rate_limit::ACTION_BROADCAST).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        crate::rate_limit::RateLimitResult::Allowed => {}
        crate::rate_limit::RateLimitResult::Banned(until) => {
            let remaining = (until - chrono::Utc::now()).num_seconds().max(0);
            return Err((StatusCode::TOO_MANY_REQUESTS, format!("You have been temporarily banned from broadcasting for {} more seconds. Slow down!", remaining)));
        }
    }

    // Verify user is in this faction
    let user_faction: Option<uuid::Uuid> = sqlx::query_scalar("SELECT faction_id FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .map_err(|_| (StatusCode::UNAUTHORIZED, "User not found".to_string()))?;

    if user_faction != Some(faction_id) {
        return Err((StatusCode::FORBIDDEN, "Not authorized to transmit on this faction's encrypted comms".to_string()));
    }

    let msg = sqlx::query_as::<_, ChatMessageResponse>(
        r#"
        WITH inserted AS (
            INSERT INTO chat_messages (user_id, channel_type, channel_id, content)
            VALUES ($1, 'faction', $2, $3)
            RETURNING id, channel_type, channel_id, content, user_id, created_at
        )
        SELECT 
            i.id, 
            i.channel_type, 
            i.channel_id, 
            i.content, 
            u.username as author_name, 
            f.name as faction_name,
            i.created_at
        FROM inserted i
        JOIN users u ON i.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        "#
    )
    .bind(auth_user.user_id)
    .bind(faction_id)
    .bind(&payload.content)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Process Tags
    let tags = extract_tags(&payload.content);
    for tag in tags {
        let _ = sqlx::query(
            "INSERT INTO notifications (user_id, content) 
             SELECT id, $1 FROM users WHERE username = $2"
        )
        .bind(format!("You were mentioned in faction comms by @{}", msg.author_name))
        .bind(&tag)
        .execute(pool)
        .await;
    }

    // Broadcast to WS
    let event = crate::ws::GameEvent::ChatMessage {
        author: msg.author_name.clone(),
        faction: msg.faction_name.clone(),
        msg: msg.content.clone(),
        channel_type: "faction".to_string(),
        channel_id: Some(faction_id.to_string()),
    };
    if let Ok(event_json) = serde_json::to_string(&event) {
        let _ = state.ws_state.tx.send(event_json);
    }

    Ok(Json(msg))
}
