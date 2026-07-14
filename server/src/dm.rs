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
    pub reply_to_id: Option<uuid::Uuid>,
    pub reply_to_content: Option<String>,
    pub is_read: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct SendDMRequest {
    pub receiver_username: String,
    pub content: String,
    pub reply_to_id: Option<uuid::Uuid>,
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

    // Look up reply content if replying to a message
    let reply_content: Option<String> = if let Some(reply_id) = payload.reply_to_id {
        sqlx::query_scalar("SELECT content FROM direct_messages WHERE id = $1 AND (sender_id = $2 OR receiver_id = $2)")
            .bind(reply_id)
            .bind(auth_user.user_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        None
    };

    let dm = sqlx::query_as::<_, DirectMessage>(
        r#"
        WITH inserted AS (
            INSERT INTO direct_messages (sender_id, receiver_id, content, reply_to_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, sender_id, receiver_id, content, reply_to_id, is_read, created_at
        )
        SELECT 
            i.id, i.sender_id, i.receiver_id, i.content, i.reply_to_id,
            (SELECT content FROM direct_messages WHERE id = i.reply_to_id) as reply_to_content,
            i.is_read, i.created_at
        FROM inserted i
        "#
    )
    .bind(auth_user.user_id)
    .bind(receiver_id)
    .bind(&payload.content)
    .bind(payload.reply_to_id)
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

    // Broadcast the actual message data so the recipient sees it in real-time
    let sender_user = auth_user.user_id;
    let sender_name_for_ws = sender_name.clone().unwrap_or_else(|| "Unknown".to_string());
    let realtime_event = crate::ws::GameEvent::NewDirectMessage {
        sender_id: sender_user.to_string(),
        sender_username: sender_name_for_ws,
        receiver_username: payload.receiver_username.clone(),
        content: payload.content.clone(),
        reply_to_content: reply_content.clone(),
        created_at: dm.created_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
    };
    if let Ok(event_json) = serde_json::to_string(&realtime_event) {
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
        SELECT 
            dm.id, dm.sender_id, dm.receiver_id, dm.content, dm.reply_to_id,
            (SELECT content FROM direct_messages WHERE id = dm.reply_to_id) as reply_to_content,
            dm.is_read, dm.created_at
        FROM direct_messages dm
        WHERE (dm.sender_id = $1 AND dm.receiver_id = $2)
           OR (dm.sender_id = $2 AND dm.receiver_id = $1)
        ORDER BY dm.created_at ASC
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
    pub unread_count: Option<i64>,
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

    #[derive(sqlx::FromRow)]
    struct ChatListRow {
        pub username: String,
        pub display_name: String,
        pub last_message: String,
        pub created_at: chrono::DateTime<chrono::Utc>,
        pub unread_count: Option<i64>,
    }

    let rows = sqlx::query_as::<_, ChatListRow>(
        r#"
        SELECT DISTINCT ON (u.username)
            u.username,
            u.display_name,
            dm.content as last_message,
            dm.created_at,
            (SELECT COUNT(*) FROM direct_messages sub WHERE sub.sender_id = u.id AND sub.receiver_id = $1 AND sub.is_read = false) as unread_count
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

    let items: Vec<ChatListItem> = rows.into_iter().map(|r| ChatListItem {
        username: r.username,
        display_name: r.display_name,
        last_message: r.last_message,
        created_at: r.created_at,
        unread_count: r.unread_count,
    }).collect();

    // Sort by most recent message first
    let mut sorted = items;
    sorted.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(Json(sorted))
}

// ——— DM Reactions ———

#[derive(Serialize, sqlx::FromRow)]
pub struct DmReactionRow {
    pub message_id: uuid::Uuid,
    pub user_id: uuid::Uuid,
    pub reaction: String,
}

#[derive(Deserialize)]
pub struct AddDmReactionRequest {
    pub message_id: uuid::Uuid,
    pub reaction: String,
}

pub async fn add_dm_reaction(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(_other_username): Path<String>,
    Json(payload): Json<AddDmReactionRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Toggle reaction: insert if not exists, delete if same reaction
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT reaction FROM dm_reactions WHERE message_id = $1 AND user_id = $2"
    )
    .bind(payload.message_id)
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match existing {
        Some(ref r) if r == &payload.reaction => {
            // Remove reaction
            sqlx::query("DELETE FROM dm_reactions WHERE message_id = $1 AND user_id = $2")
                .bind(payload.message_id)
                .bind(auth_user.user_id)
                .execute(pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
        _ => {
            // Upsert reaction
            sqlx::query(
                r#"
                INSERT INTO dm_reactions (message_id, user_id, reaction)
                VALUES ($1, $2, $3)
                ON CONFLICT (message_id, user_id)
                DO UPDATE SET reaction = EXCLUDED.reaction
                "#
            )
            .bind(payload.message_id)
            .bind(auth_user.user_id)
            .bind(&payload.reaction)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
    }

    // Broadcast reaction event via WS
    let event = crate::ws::GameEvent::DmReaction {
        message_id: payload.message_id.to_string(),
    };
    if let Ok(event_json) = serde_json::to_string(&event) {
        let _ = state.ws_state.tx.send(event_json);
    }

    Ok(Json(serde_json::json!({"status": "ok"})))
}

pub async fn get_dm_reactions(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(_other_username): Path<String>,
) -> Result<Json<Vec<DmReactionRow>>, (StatusCode, String)> {
    let pool = &state.pool;
    let reactions = sqlx::query_as::<_, DmReactionRow>(
        r#"
        SELECT dr.message_id, dr.user_id, dr.reaction
        FROM dm_reactions dr
        JOIN direct_messages dm ON dr.message_id = dm.id
        WHERE (dm.sender_id = $1 OR dm.receiver_id = $1)
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(reactions))
}
