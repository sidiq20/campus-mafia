use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ServerState, auth::AuthUser, rank};

// ─── INF Transfer ───

#[derive(Deserialize)]
pub struct TransferRequest {
    pub receiver_username: String,
    pub amount: i32,
}

pub async fn transfer_inf(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<TransferRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let sender_id = auth_user.user_id;

    if payload.amount <= 0 {
        return Err((StatusCode::BAD_REQUEST, "Amount must be positive".to_string()));
    }

    // Find receiver
    let receiver_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    )
    .bind(&payload.receiver_username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::BAD_REQUEST, "User not found".to_string()))?;

    if receiver_id == sender_id {
        return Err((StatusCode::BAD_REQUEST, "Cannot transfer INF to yourself".to_string()));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check sender balance WITHIN transaction — lock row to prevent race conditions
    let sender_inf: i32 = sqlx::query_scalar("SELECT influence FROM users WHERE id = $1 FOR UPDATE")
        .bind(sender_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten()
        .unwrap_or(0);

    if sender_inf < payload.amount {
        return Err((StatusCode::BAD_REQUEST, format!("Not enough INF. You have {}, need {}", sender_inf, payload.amount)));
    }

    // Deduct from sender
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(payload.amount)
        .bind(sender_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add to receiver
    sqlx::query("UPDATE users SET influence = influence + $1 WHERE id = $2")
        .bind(payload.amount)
        .bind(receiver_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get sender name for notification
    let sender_name: String = sqlx::query_scalar("SELECT COALESCE(display_name, username) FROM users WHERE id = $1")
        .bind(sender_id)
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "Unknown".to_string());

    // Notify receiver
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
    )
    .bind(receiver_id)
    .bind(format!("💰 Received {} INF from @{}", payload.amount, sender_name))
    .execute(pool)
    .await;

    let _ = crate::push::notify_user(pool, receiver_id).await;

    // Check titles
    let _ = crate::titles::check_rank_titles(pool, sender_id, sender_inf - payload.amount).await;
    if let Ok(Some(receiver_inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
        .bind(receiver_id)
        .fetch_optional(pool).await
    {
        let _ = crate::titles::check_rank_titles(pool, receiver_id, receiver_inf).await;
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "amount": payload.amount,
        "receiver_username": payload.receiver_username
    })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct CommentResponse {
    pub id: uuid::Uuid,
    pub post_id: uuid::Uuid,
    pub content: String,
    pub author_display_name: String,
    pub author_username: Option<String>,
    pub parent_id: Option<uuid::Uuid>,
    pub is_edited: Option<bool>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
    pub parent_id: Option<uuid::Uuid>,
}

pub async fn create_comment(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(post_id): Path<uuid::Uuid>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<Json<CommentResponse>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Rate limit: max 2 replies per minute, 1h ban on 3rd+ attempt
    match crate::rate_limit::check_and_record(pool, user_id, crate::rate_limit::ACTION_REPLY).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        crate::rate_limit::RateLimitResult::Allowed => {}
        crate::rate_limit::RateLimitResult::Banned(until) => {
            let remaining = (until - chrono::Utc::now()).num_seconds().max(0);
            return Err((StatusCode::TOO_MANY_REQUESTS, format!("You have been temporarily banned from replying for {} more seconds. Slow down!", remaining)));
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

    // Extract @mentions BEFORE moving payload.content into the query
    let tags: Vec<String> = payload.content
        .split_whitespace()
        .filter(|w| w.starts_with('@') && w.len() > 1)
        .map(|w| {
            let w = w.trim_start_matches('@');
            w.trim_end_matches(|c: char| !c.is_alphanumeric()).to_string()
        })
        .collect();

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
            u.username as author_username,
            false as is_edited,
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

    // Reward the post owner with 2 influence for the reply
    if let Ok(post_owner_id) = sqlx::query_scalar::<_, Option<uuid::Uuid>>(
        "SELECT user_id FROM posts WHERE id = $1"
    )
    .bind(post_id)
    .fetch_one(pool)
    .await
    {
        if let Some(owner_id) = post_owner_id {
            let _ = crate::inf_limit::apply_inf_cap(pool, owner_id, 2).await;
            if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
                .bind(owner_id)
                .fetch_optional(pool).await
            {
                let _ = crate::titles::check_rank_titles(pool, owner_id, inf).await;
            }
        }
    }

    // Track comment titles for the commenter
    let _ = crate::titles::check_comment_titles(pool, user_id).await;

    for tag in tags {
        if let Ok(Some(tagged_id)) = sqlx::query_scalar::<_, uuid::Uuid>(
            "SELECT id FROM users WHERE username = $1"
        )
        .bind(&tag)
        .fetch_optional(pool)
        .await
        {
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
            )
            .bind(tagged_id)
            .bind(format!("@{} mentioned you in a reply", comment.author_display_name))
            .execute(pool)
            .await;
            let _ = crate::push::notify_user(pool, tagged_id).await;
        }
    }

    Ok(Json(comment))
}

#[derive(Deserialize)]
pub struct EditCommentRequest {
    pub content: String,
}

pub async fn edit_comment(
    auth_user: AuthUser,
    State(state): State<crate::ServerState>,
    Path((post_id, comment_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(payload): Json<EditCommentRequest>,
) -> Result<Json<CommentResponse>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;
    let cost = 1;

    if payload.content.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Content cannot be empty".to_string()));
    }

    // Verify ownership and get user INF
    #[derive(sqlx::FromRow)]
    struct CommentOwner {
        user_id: Option<uuid::Uuid>,
        influence: Option<i32>,
    }

    let owner = sqlx::query_as::<_, CommentOwner>(
        r#"
        SELECT c.user_id, u.influence
        FROM comments c
        LEFT JOIN users u ON u.id = $1
        WHERE c.id = $2 AND c.post_id = $3
        "#
    )
    .bind(user_id)
    .bind(comment_id)
    .bind(post_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Comment not found".to_string()))?;

    if owner.user_id != Some(user_id) {
        return Err((StatusCode::FORBIDDEN, "Not authorized to edit this comment".to_string()));
    }

    let user_influence = owner.influence.unwrap_or(0);
    if user_influence < cost {
        return Err((StatusCode::BAD_REQUEST, format!("Not enough INF. Editing a reply costs {} INF.", cost)));
    }

    // Deduct INF and update content
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(cost)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query("UPDATE comments SET content = $1, is_edited = true WHERE id = $2")
        .bind(&payload.content)
        .bind(comment_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Fetch and return the updated comment
    let comment = sqlx::query_as::<_, CommentResponse>(
        r#"
        SELECT 
            c.id,
            c.post_id,
            c.content,
            u.display_name as author_display_name,
            u.username as author_username,
            c.parent_id,
            COALESCE(c.is_edited, false) as is_edited,
            c.created_at
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = $1
        "#
    )
    .bind(comment_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
            u.username as author_username,
            c.parent_id,
            COALESCE(c.is_edited, false) as is_edited,
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

    // For boosts, reward the post owner; for other reactions, reward the reactor
    if payload.reaction_type == "boost" {
        if let Ok(post_owner_id) = sqlx::query_scalar::<_, Option<uuid::Uuid>>(
            "SELECT user_id FROM posts WHERE id = $1"
        )
        .bind(post_id)
        .fetch_one(pool)
        .await
        {
            if let Some(owner_id) = post_owner_id {
                let _ = crate::inf_limit::apply_inf_cap(pool, owner_id, 1).await;
                if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
                    .bind(owner_id)
                    .fetch_optional(pool).await
                {
                    let _ = crate::titles::check_rank_titles(pool, owner_id, inf).await;
                }
            }
        }
    } else {
        let _ = crate::inf_limit::apply_inf_cap(pool, user_id, 1).await;
        if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool).await
        {
            let _ = crate::titles::check_rank_titles(pool, user_id, inf).await;
        }
    }
    // Track boost titles for the reactor regardless
    let _ = crate::titles::check_boost_titles(pool, user_id).await;

    Ok(Json(serde_json::json!({"status": "success"})))
}

// ─── Faction Leaderboard ───

#[derive(Serialize)]
pub struct LeaderboardFaction {
    pub id: uuid::Uuid,
    pub name: String,
    pub influence: i32,
    pub member_count: i64,
    pub territory_count: i64,
}

pub async fn get_faction_leaderboard(
    State(state): State<ServerState>,
) -> Json<Vec<LeaderboardFaction>> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct FactionRow {
        id: uuid::Uuid,
        name: String,
        influence: i32,
        member_count: i64,
        territory_count: i64,
    }

    let rows = sqlx::query_as::<_, FactionRow>(
        r#"
        SELECT 
            f.id,
            f.name,
            COALESCE(f.influence, 0) as influence,
            COALESCE(mc.c, 0) as member_count,
            COALESCE(tc.c, 0) as territory_count
        FROM factions f
        LEFT JOIN LATERAL (SELECT COUNT(*) as c FROM users u WHERE u.faction_id = f.id) mc ON true
        LEFT JOIN LATERAL (SELECT COUNT(*) as c FROM territories t WHERE t.controlling_faction_id = f.id) tc ON true
        ORDER BY f.influence DESC
        LIMIT 10
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let factions: Vec<LeaderboardFaction> = rows.into_iter().map(|r| LeaderboardFaction {
        id: r.id,
        name: r.name,
        influence: r.influence,
        member_count: r.member_count,
        territory_count: r.territory_count,
    }).collect();

    Json(factions)
}

// ─── Top Raiders Leaderboard ───

#[derive(Serialize)]
pub struct LeaderboardRaider {
    pub id: uuid::Uuid,
    pub username: String,
    pub display_name: String,
    pub faction_name: Option<String>,
    pub total_influence_committed: i64,
    pub raid_count: i64,
}

pub async fn get_top_raiders(
    State(state): State<ServerState>,
) -> Json<Vec<LeaderboardRaider>> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct RaiderRow {
        id: uuid::Uuid,
        username: String,
        display_name: String,
        faction_name: Option<String>,
        total_influence_committed: i64,
        raid_count: i64,
    }

    let rows = sqlx::query_as::<_, RaiderRow>(
        r#"
        SELECT 
            u.id,
            u.username,
            u.display_name,
            f.name as faction_name,
            COALESCE(rp_stats.total_inf, 0) as total_influence_committed,
            COALESCE(rp_stats.raid_count, 0) as raid_count
        FROM users u
        LEFT JOIN factions f ON u.faction_id = f.id
        LEFT JOIN LATERAL (
            SELECT 
                SUM(rp2.influence_committed) as total_inf,
                COUNT(DISTINCT rp2.raid_id) as raid_count
            FROM raid_participants rp2
            WHERE rp2.user_id = u.id
        ) rp_stats ON true
        ORDER BY rp_stats.total_inf DESC NULLS LAST
        LIMIT 10
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let raiders: Vec<LeaderboardRaider> = rows.into_iter().map(|r| LeaderboardRaider {
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        faction_name: r.faction_name,
        total_influence_committed: r.total_influence_committed,
        raid_count: r.raid_count,
    }).collect();

    Json(raiders)
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
