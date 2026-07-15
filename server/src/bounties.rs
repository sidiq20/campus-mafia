use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct BountyResponse {
    pub id: uuid::Uuid,
    pub target_user_id: uuid::Uuid,
    pub target_username: String,
    pub target_display_name: String,
    pub placed_by_user_id: uuid::Uuid,
    pub placed_by_username: String,
    pub amount: i32,
    pub status: String,
    pub collected_by_user_id: Option<uuid::Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct PlaceBountyRequest {
    pub target_username: String,
    pub amount: i32,
}

/// Place a bounty on a player. Deducts INF from the placer.
pub async fn place_bounty(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<PlaceBountyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    if payload.amount < 50 {
        return Err((StatusCode::BAD_REQUEST, "Minimum bounty is 50 INF".to_string()));
    }

    if auth_user.user_id.to_string() == payload.target_username {
        return Err((StatusCode::BAD_REQUEST, "You cannot place a bounty on yourself".to_string()));
    }

    // Find target user
    let target_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    )
    .bind(&payload.target_username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Target user not found".to_string()))?;

    // Can't place bounty on yourself (check by ID)
    if target_id == auth_user.user_id {
        return Err((StatusCode::BAD_REQUEST, "You cannot place a bounty on yourself".to_string()));
    }

    // Check balance
    let balance: Option<i32> = sqlx::query_scalar("SELECT influence FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let balance = balance.unwrap_or(0);

    if balance < payload.amount {
        return Err((StatusCode::BAD_REQUEST, format!("Not enough INF. You have {}, need {}", balance, payload.amount)));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Deduct INF
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(payload.amount)
        .bind(auth_user.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create bounty (24h expiry)
    let bounty_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO bounties (target_user_id, placed_by_user_id, amount, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
        RETURNING id
        "#
    )
    .bind(target_id)
    .bind(auth_user.user_id)
    .bind(payload.amount)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Notify target
    let placer_name: String = sqlx::query_scalar("SELECT display_name FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "Someone".to_string());

    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
    )
    .bind(target_id)
    .bind(format!("🎯 A bounty of {} INF has been placed on your head by {}!", payload.amount, placer_name))
    .execute(pool)
    .await;

    let _ = crate::push::notify_user(pool, target_id).await;

    Ok(Json(serde_json::json!({
        "status": "placed",
        "bounty_id": bounty_id.to_string(),
        "amount": payload.amount,
        "target_username": payload.target_username,
    })))
}

/// Collect a bounty. The caller must provide the target_id (the bounty target).
/// This is called when someone uses a "bounty_kill" item or otherwise neutralizes the target.
pub async fn collect_bounty(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(bounty_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Get bounty info
    #[derive(sqlx::FromRow)]
    struct BountyInfo {
        target_user_id: uuid::Uuid,
        placed_by_user_id: uuid::Uuid,
        amount: i32,
        status: String,
    }

    let bounty = sqlx::query_as::<_, BountyInfo>(
        "SELECT target_user_id, placed_by_user_id, amount, status FROM bounties WHERE id = $1"
    )
    .bind(bounty_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Bounty not found".to_string()))?;

    if bounty.status != "active" {
        return Err((StatusCode::BAD_REQUEST, "This bounty is no longer active".to_string()));
    }

    // The collector must be different from both target and placer
    if auth_user.user_id == bounty.target_user_id {
        return Err((StatusCode::BAD_REQUEST, "You cannot collect the bounty on your own head".to_string()));
    }

    if auth_user.user_id == bounty.placed_by_user_id {
        return Err((StatusCode::BAD_REQUEST, "You cannot collect your own bounty".to_string()));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Mark bounty as collected
    sqlx::query(
        "UPDATE bounties SET status = 'collected', collected_by_user_id = $1, collected_at = NOW() WHERE id = $2"
    )
    .bind(auth_user.user_id)
    .bind(bounty_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Award INF to collector
    sqlx::query("UPDATE users SET influence = influence + $1 WHERE id = $2")
        .bind(bounty.amount)
        .bind(auth_user.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Notify target that bounty was collected (they got "killed")
    let collector_name: String = sqlx::query_scalar("SELECT display_name FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "An operative".to_string());

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Notify target
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
    )
    .bind(bounty.target_user_id)
    .bind(format!("💀 The bounty on your head ({}) INF was collected by {}!", bounty.amount, collector_name))
    .execute(pool)
    .await;

    let _ = crate::push::notify_user(pool, bounty.target_user_id).await;

    // Notify placer
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
    )
    .bind(bounty.placed_by_user_id)
    .bind(format!("💀 The {} INF bounty you placed was collected by {}!", bounty.amount, collector_name))
    .execute(pool)
    .await;

    Ok(Json(serde_json::json!({
        "status": "collected",
        "amount": bounty.amount,
        "collector_bonus": bounty.amount,
    })))
}

/// List active bounties (or bounties on a specific user)
pub async fn list_bounties(
    State(state): State<ServerState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<Vec<BountyResponse>> {
    let pool = &state.pool;

    let target_username = params.get("target");

    #[derive(sqlx::FromRow)]
    struct BountyRow {
        id: uuid::Uuid,
        target_user_id: uuid::Uuid,
        target_username: String,
        target_display_name: String,
        placed_by_user_id: uuid::Uuid,
        placed_by_username: String,
        amount: i32,
        status: String,
        collected_by_user_id: Option<uuid::Uuid>,
        created_at: chrono::DateTime<chrono::Utc>,
        expires_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = if let Some(target) = target_username {
        sqlx::query_as::<_, BountyRow>(
            r#"
            SELECT 
                b.id,
                b.target_user_id,
                tu.username as target_username,
                tu.display_name as target_display_name,
                b.placed_by_user_id,
                pu.username as placed_by_username,
                b.amount,
                b.status,
                b.collected_by_user_id,
                b.created_at,
                b.expires_at
            FROM bounties b
            JOIN users tu ON b.target_user_id = tu.id
            JOIN users pu ON b.placed_by_user_id = pu.id
            WHERE tu.username = $1 AND b.status = 'active'
            ORDER BY b.amount DESC
            LIMIT 20
            "#
        )
        .bind(target)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, BountyRow>(
            r#"
            SELECT 
                b.id,
                b.target_user_id,
                tu.username as target_username,
                tu.display_name as target_display_name,
                b.placed_by_user_id,
                pu.username as placed_by_username,
                b.amount,
                b.status,
                b.collected_by_user_id,
                b.created_at,
                b.expires_at
            FROM bounties b
            JOIN users tu ON b.target_user_id = tu.id
            JOIN users pu ON b.placed_by_user_id = pu.id
            WHERE b.status = 'active'
            ORDER BY b.amount DESC
            LIMIT 50
            "#
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    };

    let bounties: Vec<BountyResponse> = rows.into_iter().map(|r| BountyResponse {
        id: r.id,
        target_user_id: r.target_user_id,
        target_username: r.target_username,
        target_display_name: r.target_display_name,
        placed_by_user_id: r.placed_by_user_id,
        placed_by_username: r.placed_by_username,
        amount: r.amount,
        status: r.status,
        collected_by_user_id: r.collected_by_user_id,
        created_at: r.created_at,
        expires_at: r.expires_at,
    }).collect();

    Json(bounties)
}

/// Get the active bounty amount on a specific user
pub async fn get_user_bounty_total(
    State(state): State<ServerState>,
    Path(username): Path<String>,
) -> Json<serde_json::Value> {
    let pool = &state.pool;

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(amount), 0) as total
        FROM bounties b
        JOIN users u ON b.target_user_id = u.id
        WHERE u.username = $1 AND b.status = 'active'
        "#
    )
    .bind(&username)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    Json(serde_json::json!({ "total_bounty": total }))
}
