use axum::{
    extract::{State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct NotificationResponse {
    pub id: uuid::Uuid,
    pub content: String,
    pub is_read: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn get_notifications(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Json<Vec<NotificationResponse>> {
    let pool = &state.pool;

    let notifications = sqlx::query_as::<_, NotificationResponse>(
        r#"
        SELECT id, content, is_read, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(notifications)
}

pub async fn mark_notifications_read(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    sqlx::query("UPDATE notifications SET is_read = true WHERE user_id = $1")
        .bind(auth_user.user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "success"})))
}
