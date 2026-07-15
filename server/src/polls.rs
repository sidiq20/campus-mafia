use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use crate::{ServerState, auth::{AuthUser, OptionalAuthUser}};

#[derive(Serialize, sqlx::FromRow)]
pub struct PollResponse {
    pub id: uuid::Uuid,
    pub post_id: uuid::Uuid,
    pub question: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub options: serde_json::Value, // JSON array of {id, label, vote_count, voted_by_me}
}

#[derive(Deserialize)]
pub struct CreatePollRequest {
    pub post_id: uuid::Uuid,
    pub question: String,
    pub options: Vec<String>, // at least 2, at most 6
}

pub async fn create_poll(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<CreatePollRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Validate post ownership
    let is_owner: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM posts WHERE id = $1 AND user_id = $2)"
    )
    .bind(payload.post_id)
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !is_owner {
        return Err((StatusCode::FORBIDDEN, "You can only add polls to your own posts".to_string()));
    }

    if payload.options.len() < 2 || payload.options.len() > 6 {
        return Err((StatusCode::BAD_REQUEST, "Polls must have between 2 and 6 options".to_string()));
    }

    if payload.question.trim().is_empty() || payload.question.len() > 200 {
        return Err((StatusCode::BAD_REQUEST, "Question must be 1-200 characters".to_string()));
    }

    for label in &payload.options {
        if label.trim().len() > 100 {
            return Err((StatusCode::BAD_REQUEST, "Each option label must be at most 100 characters".to_string()));
        }
    }

    // Check no existing poll on this post
    let has_poll: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM polls WHERE post_id = $1)"
    )
    .bind(payload.post_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if has_poll {
        return Err((StatusCode::BAD_REQUEST, "This post already has a poll".to_string()));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert poll
    let poll_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO polls (post_id, question) VALUES ($1, $2) RETURNING id"
    )
    .bind(payload.post_id)
    .bind(&payload.question)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert options
    for label in &payload.options {
        if label.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Option labels cannot be empty".to_string()));
        }
        sqlx::query(
            "INSERT INTO poll_options (poll_id, label) VALUES ($1, $2)"
        )
        .bind(poll_id)
        .bind(label.trim())
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "status": "created",
        "poll_id": poll_id.to_string(),
        "question": payload.question,
        "options": payload.options,
    })))
}

#[derive(Deserialize)]
pub struct VoteRequest {
    pub option_id: uuid::Uuid,
}

pub async fn vote_on_poll(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(poll_id): Path<uuid::Uuid>,
    Json(payload): Json<VoteRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Verify poll exists and is not expired
    let poll_info = sqlx::query_as::<_, (uuid::Uuid, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, expires_at FROM polls WHERE id = $1"
    )
    .bind(poll_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Poll not found".to_string()))?;

    if chrono::Utc::now() > poll_info.1 {
        return Err((StatusCode::BAD_REQUEST, "This poll has expired".to_string()));
    }

    // Verify option belongs to this poll
    let valid_option: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM poll_options WHERE id = $1 AND poll_id = $2)"
    )
    .bind(payload.option_id)
    .bind(poll_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !valid_option {
        return Err((StatusCode::BAD_REQUEST, "Invalid option for this poll".to_string()));
    }

    // Upsert vote (toggle if same option, else change vote)
    let existing_vote: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2"
    )
    .bind(poll_id)
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    match existing_vote {
        Some(opt_id) if opt_id == payload.option_id => {
            // Remove vote (toggle off)
            sqlx::query("DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2")
                .bind(poll_id)
                .bind(auth_user.user_id)
                .execute(pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::json!({"status": "unvoted"})))
        }
        _ => {
            // Insert or update vote
            sqlx::query(
                r#"
                INSERT INTO poll_votes (poll_id, option_id, user_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (poll_id, user_id)
                DO UPDATE SET option_id = EXCLUDED.option_id, created_at = NOW()
                "#
            )
            .bind(poll_id)
            .bind(payload.option_id)
            .bind(auth_user.user_id)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::json!({"status": "voted"})))
        }
    }
}

pub async fn get_poll(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>,
    Path(post_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    let poll_row = sqlx::query_as::<_, (uuid::Uuid, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, question, expires_at FROM polls WHERE post_id = $1"
    )
    .bind(post_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (poll_id, question, expires_at) = match poll_row {
        Some(r) => r,
        None => return Ok(Json(serde_json::json!(null))),
    };

    // Get options with vote counts
    #[derive(sqlx::FromRow)]
    struct OptionRow {
        id: uuid::Uuid,
        label: String,
        vote_count: i64,
    }

    let options = sqlx::query_as::<_, OptionRow>(
        r#"
        SELECT 
            po.id,
            po.label,
            COALESCE(vc.c, 0) as vote_count
        FROM poll_options po
        LEFT JOIN LATERAL (SELECT COUNT(*) as c FROM poll_votes pv WHERE pv.option_id = po.id) vc ON true
        WHERE po.poll_id = $1
        ORDER BY po.created_at ASC
        "#
    )
    .bind(poll_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check which option the current user voted for
    let my_vote: Option<uuid::Uuid> = if let Some(uid) = user_id {
        sqlx::query_scalar(
            "SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2"
        )
        .bind(poll_id)
        .bind(uid)
        .fetch_optional(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten()
    } else {
        None
    };

    let total_votes: i64 = options.iter().map(|o| o.vote_count).sum();

    let options_json: Vec<serde_json::Value> = options.into_iter().map(|o| {
        let pct = if total_votes > 0 { (o.vote_count as f64 / total_votes as f64 * 100.0).round() as i32 } else { 0 };
        serde_json::json!({
            "id": o.id.to_string(),
            "label": o.label,
            "vote_count": o.vote_count,
            "percentage": pct,
            "voted_by_me": my_vote == Some(o.id),
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "id": poll_id.to_string(),
        "question": question,
        "expires_at": expires_at,
        "total_votes": total_votes,
        "options": options_json,
    })))
}
