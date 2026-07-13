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
mod titles;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct ServerState {
    pub pool: PgPool,
    pub ws_state: Arc<ws::AppState>,
}

#[derive(Serialize, FromRow)]
struct PostResponse {
    id: uuid::Uuid,
    content: String,
    influence_earned: Option<i32>,
    author_name: String,
    faction_name: Option<String>,
    is_anonymous: Option<bool>,
    user_id: Option<uuid::Uuid>,
    reply_count: Option<i64>,
    has_boosted: Option<bool>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(serde::Deserialize)]
struct CreatePostRequest {
    content: String,
    is_anonymous: Option<bool>,
}

async fn create_post(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<CreatePostRequest>,
) -> Result<Json<PostResponse>, (axum::http::StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

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
            COALESCE(u.username, 'Anonymous') as author_name, 
            f.name as faction_name,
            i.is_anonymous,
            i.user_id,
            0::bigint as reply_count,
            false as has_boosted,
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

    // Check for propaganda boost
    let has_propaganda_boost: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'propaganda_boost' AND expires_at > NOW())"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    let base_reward = if has_propaganda_boost.unwrap_or(false) { 20 } else { 10 };

    // Apply daily INF cap + check titles
    if let Some(uid) = user_id {
        let _ = crate::inf_limit::apply_inf_cap(pool, uid, base_reward).await;
        let _ = crate::titles::check_post_titles(pool, uid, is_anon).await;
        let _ = crate::titles::check_rank_titles(pool, uid, 0).await;
        // Get updated influence for rank check
        if let Ok(Some(inf)) = sqlx::query_scalar::<_, i32>("SELECT influence FROM users WHERE id = $1")
            .bind(uid)
            .fetch_optional(pool).await
        {
            let _ = crate::titles::check_rank_titles(pool, uid, inf).await;
            let _ = crate::titles::check_lone_wolf_title(pool, uid, inf).await;
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

async fn get_posts(
    auth_user: OptionalAuthUser,
    State(state): State<ServerState>
) -> Json<Vec<PostResponse>> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;
    let posts = sqlx::query_as::<_, PostResponse>(
        r#"
        SELECT 
            p.id, 
            p.content, 
            p.influence_earned, 
            COALESCE(u.username, 'Anonymous') as author_name, 
            f.name as faction_name,
            p.is_anonymous,
            p.user_id,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as reply_count,
            EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1 AND r.reaction_type = 'boost') as has_boosted,
            p.created_at
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN factions f ON u.faction_id = f.id
        ORDER BY p.created_at DESC
        LIMIT 50
        "#
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_else(|_| vec![]);

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

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    println!("Starting server...");
    println!("Loading environment variables...");

    let database_url =
        env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    println!("Connecting to database...");

    let pool = match PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
    {
        Ok(pool) => {
            println!("✅ Connection to the database is successful!");

            println!("Running database migrations...");

            match sqlx::migrate!("./migrations").run(&pool).await {
                Ok(_) => println!("✅ Migrations completed successfully!"),
                Err(e) => {
                    println!("🔥 Failed to run migrations: {:?}", e);
                    std::process::exit(1);
                }
            }

            pool
        }
        Err(err) => {
            println!("🔥 Failed to connect to the database: {:?}", err);
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
        .route("/api/auth/me", get(auth::me))
        .route("/api/users/:username", get(auth::get_user_by_username))

        // Social
        .route("/api/leaderboard", get(social::get_leaderboard))
        
        // Notifications
        .route("/api/notifications", axum::routing::get(notifications::get_notifications).post(notifications::mark_notifications_read))

        // Direct Messaging
        .route("/api/chat/direct", axum::routing::post(dm::send_dm))
        .route("/api/chat/direct/:username", axum::routing::get(dm::get_dm_history))

        // Posts
        .route("/api/posts", axum::routing::post(create_post).get(get_posts))
        .route("/api/posts/:id", axum::routing::delete(delete_post))
        .route(
            "/api/posts/:id/comments",
            axum::routing::post(social::create_comment)
                .get(social::get_comments),
        )
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

        // Websocket
        .route("/api/ws", get(ws::ws_handler))

        .layer(cors)
        .with_state(ServerState {
            pool,
            ws_state: Arc::new(ws::AppState {
                tx: broadcast::channel(100).0,
            }),
        });

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    println!("Binding to {}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            println!("✅ TCP listener bound successfully");
            listener
        }
        Err(e) => {
            println!("🔥 Failed to bind listener: {:?}", e);
            std::process::exit(1);
        }
    };

    println!("🚀 Server listening on {}", addr);
    println!("🚀 Starting Axum...");

    if let Err(e) = axum::serve(listener, app).await {
        println!("🔥 Axum server crashed: {:?}", e);
    }
}