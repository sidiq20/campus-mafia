use axum::{Json, extract::State};
use serde::Serialize;
use crate::{ServerState, ws};

#[derive(Serialize)]
pub struct LiveStats {
    pub total_operatives: i64,
    pub operatives_online: i64,
    pub total_posts: i64,
    pub territories_controlled: i64,
    pub total_factions: i64,
    pub total_influence_circulating: i64,
}

/// Returns live platform statistics for the landing page hero.
pub async fn get_live_stats(
    State(state): State<ServerState>,
) -> Json<LiveStats> {
    let pool = &state.pool;

    // Run all queries in parallel via join_all or just sequentially since it's fast
    let total_operatives: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool).await.unwrap_or(0);

    // Use the existing WebSocket online user tracking rather than raw DB tables
    let operatives_online = ws::get_online_count().await as i64;

    let total_posts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM posts")
        .fetch_one(pool).await.unwrap_or(0);

    let territories_controlled: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM territories WHERE controlling_faction_id IS NOT NULL"
    )
    .fetch_one(pool).await.unwrap_or(0);

    let total_factions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM factions")
        .fetch_one(pool).await.unwrap_or(0);

    let total_influence_circulating: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(influence), 0) FROM users")
        .fetch_one(pool).await.unwrap_or(0);

    Json(LiveStats {
        total_operatives,
        operatives_online,
        total_posts,
        territories_controlled,
        total_factions,
        total_influence_circulating,
    })
}
