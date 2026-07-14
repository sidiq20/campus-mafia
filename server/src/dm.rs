use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct DirectMessage {
    pub id: uuid::Uuid,
    pub sender_id: uuid::Uuid,
    pub receiver_id: uuid::Uuid,
    pub content: String,
    pub is_read: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct SendDMRequest {
    pub receiver_username: String,
    pub content: String,
}

pub async fn send_dm(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<SendDMRequest>,
) -> Result<Json<DirectMessage>, (StatusCode, String)> {
    let pool = &state.pool;

    // Find receiver
    let receiver_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    )
    .bind(&payload.receiver_username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::BAD_REQUEST, "User not found".to_string()))?;

    if receiver_id == auth_user.user_id {
        return Err((StatusCode::BAD_REQUEST, "Cannot send message to yourself".to_string()));
    }

    let dm = sqlx::query_as::<_, DirectMessage>(
        r#"
        INSERT INTO direct_messages (sender_id, receiver_id, content)
        VALUES ($1, $2, $3)
        RETURNING id, sender_id, receiver_id, content, is_read, created_at
        "#
    )
    .bind(auth_user.user_id)
    .bind(receiver_id)
    .bind(&payload.content)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert notification for the receiver
    let sender_name: Option<String> = sqlx::query_scalar(
        "SELECT COALESCE(display_name, username) FROM users WHERE id = $1"
    )
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let notification_content = match &sender_name {
        Some(name) => format!("📩 New DM from {}", name),
        None => "📩 You received a new direct message".to_string(),
    };

    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
    )
    .bind(receiver_id)
    .bind(&notification_content)
    .execute(pool)
    .await;

    // Broadcast a Notification event via WebSocket so only the receiver gets a real-time popup
    let event = crate::ws::GameEvent::Notification {
        from: sender_name.clone(),
        target_username: payload.receiver_username.clone(),
    };
    if let Ok(event_json) = serde_json::to_string(&event) {
        let _ = state.ws_state.tx.send(event_json);
    }

    Ok(Json(dm))
}

pub async fn get_dm_history(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(other_username): Path<String>,
) -> Result<Json<Vec<DirectMessage>>, (StatusCode, String)> {
    let pool = &state.pool;

    let other_user_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    )
    .bind(&other_username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::BAD_REQUEST, "User not found".to_string()))?;

    let dms = sqlx::query_as::<_, DirectMessage>(
        r#"
        SELECT id, sender_id, receiver_id, content, is_read, created_at
        FROM direct_messages
        WHERE (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1)
        ORDER BY created_at ASC
        "#
    )
    .bind(auth_user.user_id)
    .bind(other_user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(dms))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct ChatListItem {
    pub username: String,
    pub display_name: String,
    pub last_message: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_unread_dm_count(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let count: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM direct_messages WHERE receiver_id = $1 AND is_read = false"
    )
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .unwrap_or(0);

    Ok(Json(serde_json::json!({ "unread": count })))
}

pub async fn mark_dms_read(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(other_username): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    let other_user_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    )
    .bind(&other_username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::BAD_REQUEST, "User not found".to_string()))?;

    sqlx::query(
        "UPDATE direct_messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2"
    )
    .bind(other_user_id)
    .bind(auth_user.user_id)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "status": "marked_read" })))
}

pub async fn get_chat_list(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<ChatListItem>>, (StatusCode, String)> {
    let pool = &state.pool;

    let rows = sqlx::query_as::<_, ChatListItem>(
        r#"
        SELECT DISTINCT ON (u.username)
            u.username,
            u.display_name,
            dm.content as last_message,
            dm.created_at
        FROM direct_messages dm
        JOIN users u ON (u.id = dm.sender_id OR u.id = dm.receiver_id)
        WHERE (dm.sender_id = $1 OR dm.receiver_id = $1)
          AND u.id != $1
        ORDER BY u.username, dm.created_at DESC
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(rows))
}
