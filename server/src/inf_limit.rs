use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use sqlx::PgPool;

use crate::{ServerState, auth::AuthUser};

pub const DAILY_INF_CAP: i32 = 200;

/// Returns the actual INF reward after applying the daily cap.
/// If the user has an active `inf_cap_bypass` effect, the full reward is returned.
/// Otherwise, the user's daily counter is checked/reset and the reward is capped.
/// The user's `daily_inf_earned` is updated accordingly.
pub async fn apply_inf_cap(
    pool: &PgPool,
    user_id: uuid::Uuid,
    base_reward: i32,
) -> Result<i32, sqlx::Error> {
    // Check if user has active cap bypass
    let has_bypass: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'inf_cap_bypass' AND expires_at > NOW())"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if has_bypass.unwrap_or(false) {
        // No cap — award full reward
        if let Err(e) = sqlx::query(
            "UPDATE users SET influence = influence + $1, daily_inf_earned = daily_inf_earned + $1 WHERE id = $2"
        )
        .bind(base_reward)
        .bind(user_id)
        .execute(pool)
        .await
        {
            eprintln!("[INF_LIMIT] bypass update failed for user {}: {}", user_id, e);
        }
        return Ok(base_reward);
    }

    // Reset daily counter if needed (new day)
    if let Err(e) = sqlx::query(
        r#"
        UPDATE users
        SET daily_inf_earned = 0, last_inf_reset = NOW()
        WHERE id = $1 AND last_inf_reset < DATE_TRUNC('day', NOW())
        "#
    )
    .bind(user_id)
    .execute(pool)
    .await
    {
        eprintln!("[INF_LIMIT] daily reset failed for user {}: {}", user_id, e);
    }

    // Get current daily earned
    let daily_earned: Option<i32> = sqlx::query_scalar(
        "SELECT daily_inf_earned FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .flatten();

    let current = daily_earned.unwrap_or(0);

    if current >= DAILY_INF_CAP {
        return Ok(0); // Cap reached, no reward
    }

    let remaining = DAILY_INF_CAP - current;
    let actual_reward = base_reward.min(remaining);

    if let Err(e) = sqlx::query(
        "UPDATE users SET influence = influence + $1, daily_inf_earned = daily_inf_earned + $1 WHERE id = $2"
    )
    .bind(actual_reward)
    .bind(user_id)
    .execute(pool)
    .await
    {
        eprintln!("[INF_LIMIT] cap update failed for user {}: {}", user_id, e);
    }

    Ok(actual_reward)
}

/// Returns the user's daily INF stats for display
#[derive(serde::Serialize)]
pub struct DailyInfStats {
    pub daily_earned: i32,
    pub daily_cap: i32,
    pub remaining: i32,
    pub has_bypass: bool,
}

pub async fn get_daily_inf_stats_endpoint(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<DailyInfStats>, (StatusCode, String)> {
    let pool = &state.pool;
    let stats = get_daily_inf_stats(pool, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(stats))
}

pub async fn get_daily_inf_stats(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<DailyInfStats, sqlx::Error> {
    // Reset if needed
    let _ = sqlx::query(
        r#"
        UPDATE users 
        SET daily_inf_earned = 0, last_inf_reset = NOW() 
        WHERE id = $1 AND last_inf_reset < DATE_TRUNC('day', NOW())
        "#
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    let daily_earned: Option<i32> = sqlx::query_scalar(
        "SELECT daily_inf_earned FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .flatten();

    let earned = daily_earned.unwrap_or(0);

    let has_bypass: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'inf_cap_bypass' AND expires_at > NOW())"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let bypass = has_bypass.unwrap_or(false);

    Ok(DailyInfStats {
        daily_earned: earned,
        daily_cap: if bypass { i32::MAX } else { DAILY_INF_CAP },
        remaining: if bypass { i32::MAX } else { (DAILY_INF_CAP - earned).max(0) },
        has_bypass: bypass,
    })
}
