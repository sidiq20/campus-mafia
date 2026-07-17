use axum::{
    routing::get,
    Router,
    extract::State,
    Json,
};
use sqlx::{postgres::PgPoolOptions, PgPool, FromRow};
use std::env;
use std::net::SocketAddr;
use tower_http::cors::{AllowOrigin, CorsLayer};
use serde::Serialize;

mod auth;
use auth::{AuthUser, OptionalAuthUser};

mod social;
mod game;
mod comms;
mod blackmarket;
mod notifications;
mod dm;
mod ws;
mod rank;
mod inf_limit;
mod rate_limit;
mod titles;
mod push;
mod cache;
mod group_chats;
mod ice_servers;
mod polls;
mod bounties;
mod sync;
mod stats;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct ServerState {
    pub pool: PgPool,
    pub ws_state: Arc<ws::AppState>,
    pub cache: Arc<cache::SimpleCache>,
}

#[derive(Serialize, FromRow)]
struct PostResponse {
    id: uuid::Uuid,
    content: String,
    influence_earned: Option<i32>,
    author_name: String,
    author_username: Option<String>,
    faction_name: Option<String>,
    is_anonymous: Option<bool>,
    user_id: Option<uuid::Uuid>,
    reply_count: Option<i64>,
    boost_count: Option<i64>,
    repost_count: Option<i64>,
    has_boosted: Option<bool>,
    has_reposted: Option<bool>,
    is_edited: Option<bool>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(serde::Deserialize)]
struct CreatePostRequest {
    content: String,
    is_anonymous: Option<bool>,
}

fn extract_tags(content: &str) -> Vec<String> {
    content
        .split_whitespace()
        .filter(|w| w.starts_with('@') && w.len() > 1)
        .map(|w| {
            let w = w.trim_start_matches('@');
            w.trim_end_matches(|c: char| !c.is_alphanumeric()).to_string()
        })
        .collect()
}

async fn create_post(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<CreatePostRequest>,
) -> Result<Json<PostResponse>, (axum::http::StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Rate limit broadcasts: max 2 per minute, 1h ban on 3rd+ attempt
    if let Some(uid) = user_id {
        match crate::rate_limit::check_and_record(pool, uid, crate::rate_limit::ACTION_BROADCAST).await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        {
            crate::rate_limit::RateLimitResult::Allowed => {}
            crate::rate_limit::RateLimitResult::Banned(until) => {
                let remaining = (until - chrono::Utc::now()).num_seconds().max(0);
                return Err((axum::http::StatusCode::TOO_MANY_REQUESTS,
                    format!("You have exceeded the broadcast limit. You are temporarily restricted for {} more seconds.", remaining)
                ));
            }
        }
    }

    let is_anon = payload.is_anonymous.unwrap_or(false) || user_id.is_none();

    let post = sqlx::query_as::<_, PostResponse>(
        r#"
        WITH inserted AS (
            INSERT INTO posts (user_id, content, influence_earned, is_anonymous)
            VALUES ($1, $2, 10, $3)
            RETURNING id, content, influence_earned, user_id, is_anonymous, created_at
        )
        SELECT 
            i.id, 
            i.content, 
            i.influence_earned, 
            COALESCE(u.display_name, 'Anonymous') as author_name, 
            u.username as author_username,
            f.name as faction_name,
            i.is_anonymous,
            i.user_id,
            0::bigint as reply_count,
            0::bigint as boost_count,
            0::bigint as repost_count,
            false as has_boosted,
            false as has_reposted,
            false as is_edited,
            i.created_at
        FROM inserted i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        "#
    )
    .bind(user_id)
    .bind(&payload.content)
    .bind(is_anon)
    .fetch_one(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check for propaganda boost and award INF in a single UPDATE
    if let Some(uid) = user_id {
        // Single atomic UPDATE: checks bypass, resets daily if needed, awards INF
        // Returns the actual INF awarded (0 if capped, full if bypass active)
        sqlx::query(
            r#"
            UPDATE users SET
                influence = influence + CASE
                    WHEN EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'propaganda_boost' AND expires_at > NOW())
                    THEN 20 ELSE 10
                END,
                daily_inf_earned = CASE
                    WHEN EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'inf_cap_bypass' AND expires_at > NOW())
                    THEN daily_inf_earned + CASE
                        WHEN EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'propaganda_boost' AND expires_at > NOW())
                        THEN 20 ELSE 10
                    END
                    WHEN last_inf_reset < DATE_TRUNC('day', NOW()) THEN CASE
                        WHEN EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'propaganda_boost' AND expires_at > NOW())
                        THEN 20 ELSE 10
                    END
                    ELSE daily_inf_earned + CASE
                        WHEN EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'propaganda_boost' AND expires_at > NOW())
                        THEN 20 ELSE 10
                    END
                END,
                last_inf_reset = CASE
                    WHEN last_inf_reset < DATE_TRUNC('day', NOW()) THEN NOW()
                    ELSE last_inf_reset
                END
            WHERE id = $1
                AND (EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'inf_cap_bypass' AND expires_at > NOW())
                    OR daily_inf_earned < 200
                    OR last_inf_reset < DATE_TRUNC('day', NOW()))
            "#
        )
        .bind(uid)
        .execute(pool)
        .await
        .ok();

        // Check titles (throttled: only every 5th post by doing cheap COUNT check first)
        let _ = crate::titles::check_post_titles(pool, uid, is_anon).await;
        // Get updated influence for rank check — single query instead of two
        if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>(
            "SELECT influence FROM users WHERE id = $1"
        )
        .bind(uid)
        .fetch_optional(pool).await
        {
            let _ = crate::titles::check_lone_wolf_title(pool, uid, inf).await;
        }
    }

    // Process @mentions in the broadcast
    let tags = extract_tags(&payload.content);
    for tag in tags {
        if let Ok(Some(tagged_id)) = sqlx::query_scalar::<_, uuid::Uuid>(
            "SELECT id FROM users WHERE username = $1"
        )
        .bind(&tag)
        .fetch_optional(pool)
        .await
        {
            let notif_msg = if is_anon {
                format!("An anonymous operative mentioned you in a broadcast")
            } else {
                format!("@{} mentioned you in a broadcast", post.author_name)
            };
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, content) VALUES ($1, $2)"
            )
            .bind(tagged_id)
            .bind(&notif_msg)
            .execute(pool)
            .await;
            let _ = crate::push::notify_user(pool, tagged_id).await;
        }
    }

    let display_author = if is_anon { "Anonymous".to_string() } else { post.author_name.clone() };

    let event = crate::ws::GameEvent::NewPost {
        author: display_author,
        content: post.content.clone(),
    };
    if let Ok(event_json) = serde_json::to_string(&event) {
        let _ = state.ws_state.tx.send(event_json);
    }

    Ok(Json(post))
}

async fn get_post_by_id(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>,
    axum::extract::Path(post_id): axum::extract::Path<uuid::Uuid>,
) -> Result<Json<PostResponse>, (axum::http::StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    let post = sqlx::query_as::<_, PostResponse>(
        r#"
        SELECT 
            p.id, 
            p.content, 
            p.influence_earned, 
            COALESCE(u.display_name, 'Anonymous') as author_name, 
            u.username as author_username,
            f.name as faction_name,
            p.is_anonymous,
            p.user_id,
            COALESCE(c.cnt, 0) as reply_count,
            COALESCE(b.cnt, 0) as boost_count,
            COALESCE(rp.cnt, 0) as repost_count,
            COALESCE(hb.has, false) as has_boosted,
            COALESCE(hr.has, false) as has_reposted,
            COALESCE(p.is_edited, false) as is_edited,
            p.created_at
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM comments c WHERE c.post_id = p.id) c ON true
        LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM reactions r WHERE r.post_id = p.id AND r.reaction_type = 'boost') b ON true
        LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM reposts rp WHERE rp.post_id = p.id) rp ON true
        LEFT JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1 AND r.reaction_type = 'boost') as has) hb ON true
        LEFT JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id = p.id AND rp.user_id = $1) as has) hr ON true
        WHERE p.id = $2
        "#
    )
    .bind(user_id)
    .bind(post_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Post not found".to_string()))?;

    Ok(Json(post))
}

async fn get_posts(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<Vec<PostResponse>> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Support author_id=me to filter by current user
    let author_filter = params.get("author_id").map(|s| s.as_str());
    let target_user_id: Option<uuid::Uuid> = match author_filter {
        Some("me") => user_id,
        Some(username) => {
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM users WHERE username = $1")
                .bind(username)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None)
        },
        _ => None,
    };

    // Support q=search query to filter by content text
    let search_query = params.get("q").map(|s| s.clone());

    let posts = if let Some(ref q) = search_query {
        if q.trim().is_empty() {
            vec![]
        } else {
            let pattern = format!("%{}%", q);
            sqlx::query_as::<_, PostResponse>(
                r#"
                SELECT 
                    p.id, 
                    p.content, 
                    p.influence_earned, 
                    COALESCE(u.display_name, 'Anonymous') as author_name, 
                    u.username as author_username,
                    f.name as faction_name,
                    p.is_anonymous,
                    p.user_id,
                    COALESCE(c.cnt, 0) as reply_count,
                    COALESCE(b.cnt, 0) as boost_count,
                    COALESCE(rp.cnt, 0) as repost_count,
                    COALESCE(hb.has, false) as has_boosted,
                    COALESCE(hr.has, false) as has_reposted,
                    COALESCE(p.is_edited, false) as is_edited,
                    p.created_at
                FROM posts p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN factions f ON u.faction_id = f.id
                LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM comments c WHERE c.post_id = p.id) c ON true
                LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM reactions r WHERE r.post_id = p.id AND r.reaction_type = 'boost') b ON true
                LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM reposts rp WHERE rp.post_id = p.id) rp ON true
                LEFT JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1 AND r.reaction_type = 'boost') as has) hb ON true
                LEFT JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id = p.id AND rp.user_id = $1) as has) hr ON true
                WHERE ($2::uuid IS NULL OR p.user_id = $2)
                  AND p.content ILIKE $3
                ORDER BY p.created_at DESC
                LIMIT 50
                "#
            )
            .bind(user_id)
            .bind(target_user_id)
            .bind(&pattern)
            .fetch_all(pool)
            .await
            .unwrap_or_else(|_| vec![])
        }
    } else {
        sqlx::query_as::<_, PostResponse>(
            r#"
            SELECT 
                p.id, 
                p.content, 
                p.influence_earned, 
                COALESCE(u.display_name, 'Anonymous') as author_name, 
                u.username as author_username,
                f.name as faction_name,
                p.is_anonymous,
                p.user_id,
                COALESCE(c.cnt, 0) as reply_count,
                COALESCE(b.cnt, 0) as boost_count,
                COALESCE(rp.cnt, 0) as repost_count,
                COALESCE(hb.has, false) as has_boosted,                    COALESCE(hr.has, false) as has_reposted,
                    COALESCE(p.is_edited, false) as is_edited,
                    p.created_at
                FROM posts p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN factions f ON u.faction_id = f.id
                LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM comments c WHERE c.post_id = p.id) c ON true
                LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM reactions r WHERE r.post_id = p.id AND r.reaction_type = 'boost') b ON true
                LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM reposts rp WHERE rp.post_id = p.id) rp ON true
                LEFT JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1 AND r.reaction_type = 'boost') as has) hb ON true
                LEFT JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id = p.id AND rp.user_id = $1) as has) hr ON true
                WHERE ($2::uuid IS NULL OR p.user_id = $2)
                ORDER BY p.created_at DESC
            LIMIT 50
            "#
        )
        .bind(user_id)
        .bind(target_user_id)
        .fetch_all(pool)
        .await
        .unwrap_or_else(|_| vec![])
    };

    Json(posts)
}

async fn delete_post(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    axum::extract::Path(post_id): axum::extract::Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let pool = &state.pool;

    let res = sqlx::query("DELETE FROM posts WHERE id = $1 AND user_id = $2")
        .bind(post_id)
        .bind(auth_user.user_id)
        .execute(pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if res.rows_affected() == 0 {
        return Err((axum::http::StatusCode::FORBIDDEN, "Not authorized to delete this post or post does not exist".to_string()));
    }

    Ok(Json(serde_json::json!({ "status": "deleted" })))
}

#[derive(serde::Deserialize)]
struct EditPostRequest {
    content: String,
}

async fn edit_post(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    axum::extract::Path(post_id): axum::extract::Path<uuid::Uuid>,
    Json(payload): Json<EditPostRequest>,
) -> Result<Json<PostResponse>, (axum::http::StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;
    let cost = 15;

    if payload.content.trim().is_empty() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Content cannot be empty".to_string()));
    }

    // Verify ownership and get user INF in one query
    #[derive(sqlx::FromRow)]
    struct PostOwner {
        user_id: Option<uuid::Uuid>,
        influence: Option<i32>,
    }

    let owner = sqlx::query_as::<_, PostOwner>(
        r#"
        SELECT p.user_id, u.influence
        FROM posts p
        LEFT JOIN users u ON u.id = $1
        WHERE p.id = $2
        "#
    )
    .bind(user_id)
    .bind(post_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Post not found".to_string()))?;

    if owner.user_id != Some(user_id) {
        return Err((axum::http::StatusCode::FORBIDDEN, "Not authorized to edit this post".to_string()));
    }

    let user_influence = owner.influence.unwrap_or(0);
    if user_influence < cost {
        return Err((axum::http::StatusCode::BAD_REQUEST, format!("Not enough INF. Editing a broadcast costs {} INF.", cost)));
    }

    // Deduct INF and update content
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(cost)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query("UPDATE posts SET content = $1, is_edited = true WHERE id = $2")
        .bind(&payload.content)
        .bind(post_id)
        .execute(pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Return the updated post
    get_post_by_id(
        OptionalAuthUser { user_id: Some(user_id) },
        State(state.clone()),
        axum::extract::Path(post_id),
    ).await
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    tracing::info!("Starting server...");
    tracing::info!("Loading environment variables...");

    let database_url =
        env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    tracing::info!("Connecting to database...");

    let pool = match PgPoolOptions::new()
        .max_connections(10)          // Reduced from 25 — container only has 512MB RAM
        .min_connections(1)           // Keep 1 warm connection always alive
        .acquire_timeout(std::time::Duration::from_secs(10))  // Give more time to reconnect
        .idle_timeout(std::time::Duration::from_secs(60 * 5)) // 5 min idle timeout
        .max_lifetime(std::time::Duration::from_secs(60 * 30)) // Recycle connections every 30 min
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                // Test the connection is alive right after acquiring
                sqlx::query("SELECT 1").execute(conn).await?;
                Ok(())
            })
        })
        .connect(&database_url)
        .await
    {
        Ok(pool) => {
            tracing::info!("✅ Connection to the database is successful!");

            tracing::info!("Running database migrations...");

            tracing::info!("Attempting to run migrations...");
            match sqlx::migrate!("./migrations").run(&pool).await {
                Ok(_) => tracing::info!("✅ Migrations completed successfully!"),
                Err(e) => {
                    tracing::error!("🔥 Failed to run migrations: {:?}", e);
                    std::process::exit(1);
                }
            }
            tracing::info!("Migrations logic finished.");

            pool
        }
        Err(err) => {
            tracing::error!("🔥 Failed to connect to the database: {:?}", err);
            std::process::exit(1);
        }
    };

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(
            |origin: &axum::http::HeaderValue,
             _request_parts: &axum::http::request::Parts| {
                if let Ok(origin_str) = origin.to_str() {
                    origin_str == "http://localhost:3000"
                        || origin_str.ends_with(".vercel.app")
                        || origin_str.ends_with(".leapcell.dev")
                } else {
                    false
                }
            },
        ))
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
        .allow_credentials(true);

    let app = Router::<ServerState>::new()
        // Health checks
        .route("/", get(|| async { "Server Running" }))
        .route("/health", get(|| async { "OK" }))
        .route("/kaithheathcheck", get(|| async { "OK" }))
        .route("/api/health", get(|| async { "Healthy" }))

        // Auth
        .route("/api/auth/register", axum::routing::post(auth::register))
        .route("/api/auth/login", axum::routing::post(auth::login))
        .route("/api/auth/logout", axum::routing::post(auth::logout))
        .route("/api/auth/me", get(auth::me).put(auth::update_profile))
        .route("/api/auth/username", axum::routing::put(auth::update_username))
        .route("/api/auth/password", axum::routing::post(auth::change_password))
        .route("/api/auth/account", axum::routing::delete(auth::delete_account))
        .route("/api/users/:username", get(auth::get_user_by_username))
        .route("/api/users/search", get(auth::search_users))
        .route("/api/users/online", get(ws::get_online_users))
        .route("/api/profile/broadcasts", get(auth::get_profile_broadcasts))
        .route("/api/profile/boosted", get(auth::get_boosted_posts))

        // Social — Transfers & Leaderboards
        .route("/api/transfer", axum::routing::post(social::transfer_inf))
        .route("/api/leaderboard", get(social::get_leaderboard))
        .route("/api/leaderboard/factions", get(social::get_faction_leaderboard))
        .route("/api/leaderboard/raiders", get(social::get_top_raiders))
        
        // Pin / Repost
        .route("/api/posts/:id/pin", axum::routing::post(auth::pin_post))
        .route("/api/posts/:id/repost", axum::routing::post(auth::repost_post))
        .route("/api/reposts", get(auth::get_user_reposts))
        
        // Signup Wizard
        .route("/api/auth/signup/start", axum::routing::post(auth::signup_start))
        .route("/api/auth/signup/step", axum::routing::post(auth::signup_step))
        .route("/api/auth/signup/resume", get(auth::signup_resume))
        .route("/api/auth/signup/complete", axum::routing::post(auth::signup_complete))
        
        // Notifications
        .route("/api/notifications", axum::routing::get(notifications::get_notifications).post(notifications::mark_notifications_read))
        .route("/api/notifications/latest", get(notifications::get_latest_notification))

        // Direct Messaging
        .route("/api/chat/direct", axum::routing::post(dm::send_dm).get(dm::get_chat_list))
        .route("/api/chat/direct/unread/count", axum::routing::get(dm::get_unread_dm_count))
        .route("/api/chat/direct/:username/read", axum::routing::post(dm::mark_dms_read))
        .route("/api/chat/direct/:username", axum::routing::get(dm::get_dm_history))
        .route("/api/chat/direct/:username/react", axum::routing::post(dm::add_dm_reaction))
        .route("/api/chat/direct/:username/reactions", axum::routing::get(dm::get_dm_reactions))
        .route("/api/chat/direct/messages/:id", axum::routing::put(dm::edit_dm))

        // Posts
        .route("/api/posts", axum::routing::post(create_post).get(get_posts))
        .route("/api/posts/:id", axum::routing::get(get_post_by_id).delete(delete_post).put(edit_post))        .route("/api/posts/:id/comments",
            axum::routing::post(social::create_comment)
                .get(social::get_comments),
        )
        .route("/api/posts/:post_id/comments/:comment_id", axum::routing::put(social::edit_comment))
        .route(
            "/api/posts/:id/react",
            axum::routing::post(social::add_reaction),
        )

        // Game
        .route("/api/territories", get(game::get_territories))
        .route(
            "/api/territories/:id/attack",
            axum::routing::post(game::attack_territory),
        )
        .route("/api/factions", get(game::get_factions))
        .route("/api/factions/:id/join", axum::routing::post(game::join_faction))
        .route("/api/factions/:id", get(game::get_faction_by_id))
        .route(
            "/api/factions/:id/members",
            get(game::get_faction_members),
        )
        .route(
            "/api/factions/create",
            axum::routing::post(game::create_faction),
        )
        .route(
            "/api/factions/:id/assign-role",
            axum::routing::post(game::assign_role),
        )
        .route(
            "/api/factions/leave",
            axum::routing::post(game::leave_faction),
        )

        // Comms
        .route(
            "/api/comms/global",
            axum::routing::post(comms::send_global_chat)
                .get(comms::get_global_chat),
        )
        .route(
            "/api/comms/faction/:id",
            axum::routing::post(comms::send_faction_chat)
                .get(comms::get_faction_chat),
        )
        .route("/api/comms/messages/:id", axum::routing::put(comms::edit_chat_message).delete(comms::delete_chat_message))

        // Ranks
        .route("/api/ranks", get(rank::get_ranks_endpoint))

        // Titles
        .route("/api/titles", get(titles::get_my_titles))
        .route("/api/titles/definitions", get(titles::get_all_title_definitions))
        .route("/api/titles/check-all", axum::routing::post(titles::check_all_titles_endpoint))

        // INF Grind Limit
        .route("/api/inf/daily-stats", get(inf_limit::get_daily_inf_stats_endpoint))

        // Black Market
        .route("/api/blackmarket/inventory", get(blackmarket::get_inventory))
        .route("/api/blackmarket/purchase", axum::routing::post(blackmarket::purchase_item))
        .route("/api/blackmarket/use", axum::routing::post(blackmarket::use_item))

        // Rate Limit Status
        .route("/api/rate-limit/status", get(rate_limit::get_broadcast_status))

        // Raid Planning
        .route("/api/territories/:id/plan-raid", axum::routing::post(game::plan_raid))
        .route("/api/raids/planned", get(game::get_planned_raids))
        .route("/api/raids/:id/join", axum::routing::post(game::join_raid))
        .route("/api/raids/:id/cancel", axum::routing::post(game::cancel_raid))

        // Polls
        .route("/api/polls", axum::routing::post(polls::create_poll))
        .route("/api/polls/:id/vote", axum::routing::post(polls::vote_on_poll))
        .route("/api/posts/:id/poll", get(polls::get_poll))

        // Bounties
        .route("/api/bounties", axum::routing::post(bounties::place_bounty).get(bounties::list_bounties))
        .route("/api/bounties/:id/collect", axum::routing::post(bounties::collect_bounty))
        .route("/api/bounties/user/:username", get(bounties::get_user_bounty_total))
        .route("/api/bounties/hunter-status", get(bounties::get_hunter_status))

        // Group Chats
        .route("/api/groups", axum::routing::post(group_chats::create_group).get(group_chats::get_my_groups))
        .route("/api/groups/:id", get(group_chats::get_group))
        .route("/api/groups/:id/members", get(group_chats::get_group_members))
        .route("/api/groups/:id/members/add", axum::routing::post(group_chats::add_group_member))
        .route("/api/groups/:id/members/:user_id/remove", axum::routing::post(group_chats::remove_group_member))
        .route("/api/groups/:id/members/:user_id/promote", axum::routing::post(group_chats::promote_to_admin))
        .route("/api/groups/:id/messages", axum::routing::post(group_chats::send_group_message).get(group_chats::get_group_messages))
        .route("/api/groups/:group_id/messages/:message_id", axum::routing::put(group_chats::edit_group_message))
        .route("/api/groups/:id/update", axum::routing::post(group_chats::update_group))

        // Multi-device Sync
        .route("/api/sync", get(sync::sync_data))

        // Live Stats
        .route("/api/stats", get(stats::get_live_stats))

        // Activity
        .route("/api/activity/recent", get(crate::game::get_recent_activity))

        // Push Notifications
        .route("/api/push/vapid-public-key", get(push::get_vapid_public_key))
        .route("/api/push/subscribe", axum::routing::post(push::subscribe))
        .route("/api/push/unsubscribe", axum::routing::post(push::unsubscribe))

        // ICE Servers (TURN/STUN for P2P)
        .route("/api/ice-servers", get(ice_servers::get_ice_servers))

        // Websocket
        .route("/api/ws", get(ws::ws_handler))
        .route("/api/ws/p2p", get(ws::p2p_ws_handler))

        .layer(cors)
        .layer(tower_http::compression::CompressionLayer::new())
        .with_state(ServerState {
            pool: pool.clone(),
            ws_state: Arc::new(ws::AppState {
                tx: broadcast::channel(100).0,
            }),
            cache: cache::SimpleCache::new(),
        });

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("Binding to {}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            tracing::info!("✅ TCP listener bound successfully");
            listener
        }
        Err(e) => {
            tracing::error!("🔥 Failed to bind listener: {:?}", e);
            std::process::exit(1);
        }
    };

    tracing::info!("🚀 Server listening on {}", addr);
    tracing::info!("🚀 Starting Axum...");

    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("🔥 Axum server crashed: {:?}", e);
    }
}