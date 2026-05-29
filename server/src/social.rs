use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct CommentResponse {
    pub id: uuid::Uuid,
    pub post_id: uuid::Uuid,
    pub content: String,
    pub author_name: String,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
}

pub async fn create_comment(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(post_id): Path<uuid::Uuid>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<Json<CommentResponse>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    let comment = sqlx::query_as::<_, CommentResponse>(
        r#"
        WITH inserted AS (
            INSERT INTO comments (post_id, user_id, content)
            VALUES ($1, $2, $3)
            RETURNING id, post_id, content, user_id, created_at
        )
        SELECT 
            i.id,
            i.post_id,
            i.content,
            u.username as author_name,
            i.created_at
        FROM inserted i
        JOIN users u ON i.user_id = u.id
        "#
    )
    .bind(post_id)
    .bind(user_id)
    .bind(payload.content)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Reward user with 2 influence for commenting
    let _ = sqlx::query("UPDATE users SET influence = influence + 2 WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await;

    Ok(Json(comment))
}

pub async fn get_comments(
    State(state): State<ServerState>,
    Path(post_id): Path<uuid::Uuid>,
) -> Json<Vec<CommentResponse>> {
    let pool = &state.pool;

    let comments = sqlx::query_as::<_, CommentResponse>(
        r#"
        SELECT 
            c.id,
            c.post_id,
            c.content,
            u.username as author_name,
            c.created_at
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = $1
        ORDER BY c.created_at ASC
        "#
    )
    .bind(post_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(comments)
}

#[derive(Deserialize)]
pub struct AddReactionRequest {
    pub reaction_type: String,
}

pub async fn add_reaction(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(post_id): Path<uuid::Uuid>,
    Json(payload): Json<AddReactionRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Insert or update reaction
    sqlx::query(
        r#"
        INSERT INTO reactions (post_id, user_id, reaction_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (post_id, user_id) 
        DO UPDATE SET reaction_type = EXCLUDED.reaction_type
        "#
    )
    .bind(post_id)
    .bind(user_id)
    .bind(&payload.reaction_type)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Reward user with 1 influence for reacting
    let _ = sqlx::query("UPDATE users SET influence = influence + 1 WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await;

    Ok(Json(serde_json::json!({"status": "success"})))
}
