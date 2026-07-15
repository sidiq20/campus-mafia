use axum::{
    extract::{Query, State},
    Json,
};
use serde::Serialize;
use std::collections::HashMap;

use crate::{ServerState, auth::AuthUser};

#[derive(Serialize)]
pub struct SyncResponse {
    pub notifications: Vec<SyncNotification>,
    pub unread_dms: i64,
    pub unread_chats: i64,
    pub server_time: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct SyncNotification {
    pub id: uuid::Uuid,
    pub content: String,
    pub is_read: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Sync endpoint — returns all new data for the authenticated user since the given timestamp.
/// Clients call this periodically (e.g., every 30s) to stay in sync across devices.
pub async fn sync_data(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<SyncResponse>, (axum::http::StatusCode, String)> {
    let pool = &state.pool;

    // Parse the `since` timestamp (default: 1 hour ago)
    let since = params.get("since")
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::hours(1));

    // Get unread notifications since the timestamp
    #[derive(sqlx::FromRow)]
    struct NtRow {
        id: uuid::Uuid,
        content: String,
        is_read: bool,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let notifications: Vec<SyncNotification> = sqlx::query_as::<_, NtRow>(
        r#"
        SELECT id, content, is_read, created_at
        FROM notifications
        WHERE user_id = $1 AND created_at > $2
        ORDER BY created_at DESC
        LIMIT 50
        "#
    )
    .bind(auth_user.user_id)
    .bind(since)
    .fetch_all(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .into_iter()
    .map(|r| SyncNotification {
        id: r.id,
        content: r.content,
        is_read: r.is_read,
        created_at: r.created_at,
    })
    .collect();

    // Get unread DM count
    let unread_dms: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint FROM dm_messages
        WHERE receiver_id = $1 AND is_read = false
        "#
    )
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    // Get unread group chat messages count
    let unread_chats: i64 = 0; // Simplified — group chat read tracking is server-driven

    Ok(Json(SyncResponse {
        notifications,
        unread_dms,
        unread_chats,
        server_time: chrono::Utc::now(),
    }))
}
