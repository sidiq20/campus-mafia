use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ServerState, auth::{AuthUser, OptionalAuthUser}, rank};

#[derive(Serialize, sqlx::FromRow)]
pub struct CommentResponse {
    pub id: uuid::Uuid,
    pub post_id: uuid::Uuid,
    pub content: String,
    pub author_display_name: String,
    pub parent_id: Option<uuid::Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
    pub parent_id: Option<uuid::Uuid>,
}

pub async fn create_comment(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>,
    Path(post_id): Path<uuid::Uuid>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<Json<CommentResponse>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Rate limit: max 2 replies per minute, 1h ban on 3rd+ attempt (only for authenticated users)
    if let Some(uid) = user_id {
        match crate::rate_limit::check_and_record(pool, uid, crate::rate_limit::ACTION_REPLY).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        {
            crate::rate_limit::RateLimitResult::Allowed => {}
            crate::rate_limit::RateLimitResult::Banned(until) => {
                let remaining = (until - chrono::Utc::now()).num_seconds().max(0);
                return Err((StatusCode::TOO_MANY_REQUESTS, format!("You have been temporarily banned from replying for {} more seconds. Slow down!", remaining)));
            }
        }
    }

    // Verify parent_id belongs to the same post if provided
    if let Some(pid) = payload.parent_id {
        let valid: bool = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM comments WHERE id = $1 AND post_id = $2)"
        )
        .bind(pid)
        .bind(post_id)
        .fetch_one(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if !valid {
            return Err((StatusCode::BAD_REQUEST, "Parent comment not found for this post".to_string()));
        }
    }

    let comment = sqlx::query_as::<_, CommentResponse>(
        r#"
        WITH inserted AS (
            INSERT INTO comments (post_id, user_id, content, parent_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, post_id, content, user_id, created_at
        )
        SELECT 
            i.id,
            i.post_id,
            i.content,
            u.display_name as author_display_name,
            i.created_at
        FROM inserted i
        JOIN users u ON i.user_id = u.id
        "#
    )
    .bind(post_id)
    .bind(user_id)
    .bind(payload.content)
    .bind(payload.parent_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Reward user with 2 influence for commenting if they have an account
    if let Some(uid) = user_id {
        let _ = crate::inf_limit::apply_inf_cap(pool, uid, 2).await;
        let _ = crate::titles::check_comment_titles(pool, uid).await;
        if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
            .bind(uid)
            .fetch_optional(pool).await
        {
            let _ = crate::titles::check_rank_titles(pool, uid, inf).await;
        }
    }

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
            u.display_name as author_display_name,
            c.parent_id,
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
    let _ = crate::inf_limit::apply_inf_cap(pool, user_id, 1).await;
    let _ = crate::titles::check_boost_titles(pool, user_id).await;
    if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool).await
    {
        let _ = crate::titles::check_rank_titles(pool, user_id, inf).await;
    }

    Ok(Json(serde_json::json!({"status": "success"})))
}

#[derive(Serialize)]
pub struct LeaderboardUser {
    pub id: uuid::Uuid,
    pub username: String,
    pub display_name: String,
    pub faction_name: Option<String>,
    pub influence: i32,
    pub rank: rank::RankInfo,
}

pub async fn get_leaderboard(
    State(state): State<ServerState>,
) -> Json<Vec<LeaderboardUser>> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct LeaderboardRow {
        id: uuid::Uuid,
        username: String,
        display_name: String,
        faction_name: Option<String>,
        influence: i32,
    }

    let rows = sqlx::query_as::<_, LeaderboardRow>(
        r#"
        SELECT 
            u.id, 
            u.username,
            u.display_name,
            f.name as faction_name,
            COALESCE(u.influence, 0) as influence
        FROM users u
        LEFT JOIN factions f ON u.faction_id = f.id
        ORDER BY influence DESC
        LIMIT 10
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let users: Vec<LeaderboardUser> = rows.into_iter().map(|r| LeaderboardUser {
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        faction_name: r.faction_name,
        influence: r.influence,
        rank: rank::get_rank_info(r.influence),
    }).collect();

    Json(users)
}
