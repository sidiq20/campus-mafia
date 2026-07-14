use axum::{
    extract::State,
    Json,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::{ServerState, auth::AuthUser};

/// Action types that are rate-limited
pub const ACTION_BROADCAST: &str = "broadcast";
pub const ACTION_REPLY: &str = "reply";

/// Maximum allowed actions per 60-second rolling window
const MAX_ACTIONS_PER_WINDOW: i32 = 2;

/// Ban duration when rate limit is exceeded (1 hour)
const BAN_DURATION: chrono::Duration = chrono::Duration::hours(1);

/// The result of checking a rate limit
pub enum RateLimitResult {
    /// Action is allowed — proceed
    Allowed,
    /// Action is blocked by a temporary ban. Contains the time when ban expires.
    Banned(chrono::DateTime<chrono::Utc>),
}

/// Check whether the user can perform the given action.
///
/// Uses a single UPSERT that atomically creates or updates the rate-limit row
/// and returns the current state (count, window_start, banned_until).
/// If the user exceeds the limit, a 1-hour ban is applied automatically.
pub async fn check_and_record(
    pool: &PgPool,
    user_id: uuid::Uuid,
    action_type: &str,
) -> Result<RateLimitResult, sqlx::Error> {
    let now = chrono::Utc::now();

    // Single UPSERT: create the row if it doesn't exist, otherwise update it.
    let row = sqlx::query_as::<_, RateLimitRow>(
        r#"
        INSERT INTO rate_limits (user_id, action_type, window_start, count)
        VALUES ($1, $2, $3, 1)
        ON CONFLICT (user_id, action_type)
        DO UPDATE SET
            window_start = CASE
                WHEN rate_limits.window_start < $3 - INTERVAL '1 minute' THEN $3
                ELSE rate_limits.window_start
            END,
            count = CASE
                WHEN rate_limits.window_start < $3 - INTERVAL '1 minute' THEN 1
                WHEN rate_limits.banned_until IS NOT NULL AND rate_limits.banned_until > $3 THEN rate_limits.count
                ELSE rate_limits.count + 1
            END,
            banned_until = CASE
                WHEN rate_limits.banned_until IS NOT NULL AND rate_limits.banned_until > $3 THEN rate_limits.banned_until
                ELSE NULL
            END
        RETURNING count, window_start, banned_until
        "#,
    )
    .bind(user_id)
    .bind(action_type)
    .bind(now)
    .fetch_one(pool)
    .await?;

    // Check if currently banned (banned_until is in the future)
    if let Some(banned_until) = row.banned_until {
        if banned_until > now {
            return Ok(RateLimitResult::Banned(banned_until));
        }
    }

    // Check if the count exceeds the limit — apply ban immediately
    if row.count > MAX_ACTIONS_PER_WINDOW {
        let banned_until = now + BAN_DURATION;
        sqlx::query(
            "UPDATE rate_limits SET banned_until = $3 WHERE user_id = $1 AND action_type = $2",
        )
        .bind(user_id)
        .bind(action_type)
        .bind(banned_until)
        .execute(pool)
        .await?;

        return Ok(RateLimitResult::Banned(banned_until));
    }

    Ok(RateLimitResult::Allowed)
}

#[derive(Serialize, sqlx::FromRow)]
pub struct RateLimitRow {
    count: i32,
    pub window_start: chrono::DateTime<chrono::Utc>,
    pub banned_until: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize)]
pub struct RateLimitStatus {
    pub used: i32,
    pub max: i32,
    pub banned_until: Option<chrono::DateTime<chrono::Utc>>,
    pub window_reset: chrono::DateTime<chrono::Utc>,
}

/// Return the current broadcast rate-limit status for the logged-in user (read-only, no upsert).
pub async fn get_broadcast_status(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Json<RateLimitStatus> {
    let pool = &state.pool;
    let now = chrono::Utc::now();

    let row = sqlx::query_as::<_, RateLimitRow>(
        r#"
        SELECT count, window_start, banned_until
        FROM rate_limits
        WHERE user_id = $1 AND action_type = $2
        "#
    )
    .bind(auth_user.user_id)
    .bind(ACTION_BROADCAST)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match row {
        Some(r) => {
            // If the window has expired, the count effectively resets
            let window_expired = r.window_start < now - chrono::Duration::minutes(1);
            let used = if window_expired { 0 } else { r.count };
            let window_reset = if window_expired {
                now
            } else {
                r.window_start + chrono::Duration::minutes(1)
            };

            // Only return banned_until if it's still active
            let banned = r.banned_until.filter(|b| *b > now);

            Json(RateLimitStatus {
                used,
                max: MAX_ACTIONS_PER_WINDOW,
                banned_until: banned,
                window_reset,
            })
        }
        None => Json(RateLimitStatus {
            used: 0,
            max: MAX_ACTIONS_PER_WINDOW,
            banned_until: None,
            window_reset: now,
        }),
    }
}
