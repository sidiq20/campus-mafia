use axum::{
    extract::{State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::{ServerState, auth::AuthUser};

// ─── Title Definitions ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TitleDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: &'static str,
}

/// All available titles grouped by category
pub const ALL_TITLES: &[TitleDef] = &[
    // ── Social / Broadcasting ──
    TitleDef { id: "first_post",        name: "First Dispatch",       description: "Make your first broadcast",                    category: "social" },
    TitleDef { id: "gossip_girl",       name: "Gossip Girl",          description: "Make 10 broadcasts",                          category: "social" },
    TitleDef { id: "influencer",        name: "Influencer",           description: "Make 50 broadcasts",                          category: "social" },
    TitleDef { id: "propaganda_minister", name: "Propaganda Minister", description: "Make 100 broadcasts",                         category: "social" },
    TitleDef { id: "chatterbox",        name: "Chatterbox",           description: "Make 10 comments",                            category: "social" },
    TitleDef { id: "debater",           name: "Debater",              description: "Make 50 comments",                            category: "social" },
    TitleDef { id: "hype_man",          name: "Hype Man",             description: "Boost 10 posts",                              category: "social" },
    TitleDef { id: "amplifier",         name: "Amplifier",            description: "Boost 50 posts",                              category: "social" },

    // ── Faction / Warfare ──
    TitleDef { id: "recruit",           name: "Recruit",              description: "Join a faction",                              category: "warfare" },
    TitleDef { id: "loyalist",          name: "Loyalist",             description: "Stay in a faction for 7 days",                category: "warfare" },
    TitleDef { id: "warmonger",         name: "Warmonger",            description: "Attack 10 territories",                       category: "warfare" },
    TitleDef { id: "conqueror",         name: "Conqueror",            description: "Attack 50 territories",                       category: "warfare" },
    TitleDef { id: "territory_baron",   name: "Territory Baron",      description: "Capture 3 territories",                       category: "warfare" },
    TitleDef { id: "raider",            name: "Raider",               description: "Win 10 territory battles",                    category: "warfare" },
    TitleDef { id: "iron_fist",         name: "Iron Fist",            description: "Spend 10,000 INF on attacks",                 category: "warfare" },

    // ── Economy / Black Market ──
    TitleDef { id: "shopper",           name: "Shopper",              description: "Buy 5 items from the Black Market",           category: "economy" },
    TitleDef { id: "trader",            name: "Trader",               description: "Buy 20 items from the Black Market",          category: "economy" },
    TitleDef { id: "tycoon",            name: "Tycoon",               description: "Amass 10,000 total INF",                      category: "economy" },
    TitleDef { id: "mogul",             name: "Mogul",                description: "Amass 50,000 total INF",                      category: "economy" },
    TitleDef { id: "weapon_smuggler",   name: "Weapon Smuggler",      description: "Buy 3 Cyber Nukes",                           category: "economy" },

    // ── Rank-Based ──
    TitleDef { id: "rising_star",       name: "Rising Star",          description: "Reach Bronze rank",                           category: "rank" },
    TitleDef { id: "silver_tongue",     name: "Silver Tongue",        description: "Reach Silver rank",                           category: "rank" },
    TitleDef { id: "golden_boy",        name: "Golden Boy",           description: "Reach Gold rank",                             category: "rank" },
    TitleDef { id: "platinum_elite",    name: "Platinum Elite",       description: "Reach Platinum rank",                         category: "rank" },
    TitleDef { id: "diamond_rough",     name: "Diamond in the Rough", description: "Reach Diamond rank",                          category: "rank" },
    TitleDef { id: "legendary_figure",  name: "Legendary Figure",     description: "Reach Legendary rank",                        category: "rank" },
    TitleDef { id: "mythic_being",      name: "Mythic Being",         description: "Reach Mythic rank",                           category: "rank" },

    // ── Leadership ──
    TitleDef { id: "executive",         name: "Executive",            description: "Become a faction executive",                  category: "leadership" },
    TitleDef { id: "syndicate_leader",  name: "Syndicate Leader",     description: "Become a faction head",                       category: "leadership" },

    // ── Special ──
    TitleDef { id: "lone_wolf",         name: "Lone Wolf",            description: "Reach 1,000 INF without joining a faction",   category: "special" },
    TitleDef { id: "underdog",          name: "Underdog",             description: "Capture a territory with 3x higher defense",  category: "special" },
    TitleDef { id: "ghost",             name: "Ghost",                description: "Make 10 anonymous broadcasts",                category: "special" },
    TitleDef { id: "propaganda_king",   name: "Propaganda King",      description: "Use 5 Propaganda Boosts",                     category: "special" },
];

// ─── Title Checking Logic ───────────────────────────────────────────────────

/// Try to award a single title. Returns true if the title was newly earned.
pub async fn check_and_award_title(
    pool: &PgPool,
    user_id: uuid::Uuid,
    title_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
    )
    .bind(user_id)
    .bind(title_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Check and award a list of title IDs. Returns the count of newly earned titles.
pub async fn check_and_award_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
    title_ids: &[&str],
) -> Result<usize, sqlx::Error> {
    let mut count = 0;
    for title_id in title_ids {
        if check_and_award_title(pool, user_id, title_id).await? {
            count += 1;
        }
    }
    Ok(count)
}

// ─── Specific Title Checkers ────────────────────────────────────────────────

/// After making a post — check broadcasting titles + anonymous title
pub async fn check_post_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
    is_anonymous: bool,
) -> Result<usize, sqlx::Error> {
    let post_count: i64 = sqlx::query_scalar::<_, Option<i64>>("SELECT COUNT(*) FROM posts WHERE user_id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await?
        .unwrap_or(0);

    let mut titles_to_check = Vec::new();

    if post_count >= 1    { titles_to_check.push("first_post"); }
    if post_count >= 10   { titles_to_check.push("gossip_girl"); }
    if post_count >= 50   { titles_to_check.push("influencer"); }
    if post_count >= 100  { titles_to_check.push("propaganda_minister"); }

    if is_anonymous {
        let anon_count: i64 = sqlx::query_scalar::<_, Option<i64>>(
            "SELECT COUNT(*) FROM posts WHERE user_id = $1 AND is_anonymous = true"
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?
        .unwrap_or(0);

        if anon_count >= 10 { titles_to_check.push("ghost"); }
    }

    check_and_award_titles(pool, user_id, &titles_to_check).await
}

/// After making a comment
pub async fn check_comment_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<usize, sqlx::Error> {
    let comment_count: i64 = sqlx::query_scalar::<_, Option<i64>>("SELECT COUNT(*) FROM comments WHERE user_id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await?
        .unwrap_or(0);

    let mut titles = Vec::new();
    if comment_count >= 10  { titles.push("chatterbox"); }
    if comment_count >= 50  { titles.push("debater"); }
    check_and_award_titles(pool, user_id, &titles).await
}

/// After boosting a post
pub async fn check_boost_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<usize, sqlx::Error> {
    let boost_count: i64 = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COUNT(*) FROM reactions WHERE user_id = $1 AND reaction_type = 'boost'"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?
    .unwrap_or(0);

    let mut titles = Vec::new();
    if boost_count >= 10 { titles.push("hype_man"); }
    if boost_count >= 50 { titles.push("amplifier"); }
    check_and_award_titles(pool, user_id, &titles).await
}

/// After joining a faction
pub async fn check_faction_join_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<usize, sqlx::Error> {
    let mut count = 0;
    if check_and_award_title(pool, user_id, "recruit").await? {
        count += 1;
    }
    Ok(count)
}

/// After attacking a territory — currently a placeholder until attack tracking is added
pub async fn check_attack_titles(
    pool: &PgPool,
    _user_id: uuid::Uuid,
    _influence_spent: i32,
) -> Result<usize, sqlx::Error> {
    // territory_attacks table doesn't exist yet — attacks not tracked separately
    // TODO: implement when attack history is added
    let _ = pool;
    Ok(0)
}

/// After purchasing an item from the black market
pub async fn check_purchase_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
    _item_id: &str,
) -> Result<usize, sqlx::Error> {
    let purchase_count: i64 = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COALESCE(SUM(quantity), 0) FROM user_inventory WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?
    .unwrap_or(0);

    let cyber_nuke_count: i64 = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT COALESCE(SUM(quantity), 0) FROM user_inventory WHERE user_id = $1 AND item_id = 'cyber_nuke'"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?
    .unwrap_or(0);

    let mut titles = Vec::new();
    if purchase_count >= 5  { titles.push("shopper"); }
    if purchase_count >= 20 { titles.push("trader"); }
    if cyber_nuke_count >= 3 { titles.push("weapon_smuggler"); }

    check_and_award_titles(pool, user_id, &titles).await
}

/// Check rank-based titles when user's influence changes
pub async fn check_rank_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
    influence: i32,
) -> Result<usize, sqlx::Error> {
    let mut titles = Vec::new();

    // Rank thresholds matching the rank module
    if influence >= 200    { titles.push("rising_star"); }     // Bronze
    if influence >= 1400   { titles.push("silver_tongue"); }   // Silver
    if influence >= 5000   { titles.push("golden_boy"); }      // Gold
    if influence >= 14000  { titles.push("platinum_elite"); }  // Platinum
    if influence >= 32000  { titles.push("diamond_rough"); }   // Diamond
    if influence >= 65000  { titles.push("legendary_figure"); }// Legendary
    if influence >= 120000 { titles.push("mythic_being"); }    // Mythic

    // Tycoon / Mogul
    if influence >= 10_000  { titles.push("tycoon"); }
    if influence >= 50_000  { titles.push("mogul"); }

    check_and_award_titles(pool, user_id, &titles).await
}

/// Check leadership titles
pub async fn check_leadership_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
    role: &str,
) -> Result<usize, sqlx::Error> {
    let mut titles = Vec::new();
    if role == "head" || role == "vice_head" || role == "executive" {
        titles.push("executive");
    }
    if role == "head" {
        titles.push("syndicate_leader");
    }
    check_and_award_titles(pool, user_id, &titles).await
}

/// Check lone wolf title — user has influence >= 1000 and no faction
pub async fn check_lone_wolf_title(
    pool: &PgPool,
    user_id: uuid::Uuid,
    influence: i32,
) -> Result<bool, sqlx::Error> {
    let has_faction: Option<bool> = sqlx::query_scalar::<_, Option<bool>>(
        "SELECT faction_id IS NOT NULL FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !has_faction.unwrap_or(false) && influence >= 1000 {
        return check_and_award_title(pool, user_id, "lone_wolf").await;
    }
    Ok(false)
}

/// Check propaganda king title
pub async fn check_propaganda_king_title(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<bool, sqlx::Error> {
    // Simplified: check number of times purchased
    let times_purchased: i64 = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT SUM(quantity) FROM user_inventory WHERE user_id = $1 AND item_id = 'propaganda_boost'"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?
    .unwrap_or(0);

    if times_purchased >= 5 {
        return check_and_award_title(pool, user_id, "propaganda_king").await;
    }
    Ok(false)
}

/// After a territory capture — check underdog title (defense was 3x higher than spent)
pub async fn check_capture_underdog(
    pool: &PgPool,
    user_id: uuid::Uuid,
    defense_before: i32,
    influence_spent: i32,
) -> Result<bool, sqlx::Error> {
    if defense_before >= influence_spent * 3 && defense_before > 0 {
        return check_and_award_title(pool, user_id, "underdog").await;
    }
    Ok(false)
}

#[derive(Serialize)]
pub struct UserTitle {
    pub title_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub earned_at: String,
}

/// Get all titles earned by a user
pub async fn get_user_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<Vec<UserTitle>, sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct TitleRow {
        title_id: String,
        earned_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, TitleRow>(
        "SELECT title_id, earned_at FROM user_titles WHERE user_id = $1 ORDER BY earned_at ASC"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let titles: Vec<UserTitle> = rows.iter().filter_map(|row| {
        // Find the title definition matching this id
        let def = ALL_TITLES.iter().find(|t| t.id == row.title_id)?;
        Some(UserTitle {
            title_id: row.title_id.clone(),
            name: def.name.to_string(),
            description: def.description.to_string(),
            category: def.category.to_string(),
            earned_at: row.earned_at.to_rfc3339(),
        })
    }).collect();

    Ok(titles)
}

/// Check all titles for a user (for backfill / initial check)
pub async fn check_all_titles(
    pool: &PgPool,
    user_id: uuid::Uuid,
) -> Result<usize, sqlx::Error> {
    let mut total = 0;

    // Get user data
    #[derive(sqlx::FromRow)]
    struct UserData {
        influence: i32,
        faction_id: Option<uuid::Uuid>,
        faction_role: Option<String>,
    }

    let user = sqlx::query_as::<_, UserData>(
        "SELECT influence, faction_id, faction_role FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if let Some(user) = user {
        total += check_post_titles(pool, user_id, false).await?;
        total += check_comment_titles(pool, user_id).await?;
        total += check_boost_titles(pool, user_id).await?;
        total += check_rank_titles(pool, user_id, user.influence).await?;
        total += check_lone_wolf_title(pool, user_id, user.influence).await? as usize;

        if let Some(_fid) = user.faction_id {
            total += check_faction_join_titles(pool, user_id).await?;
            if let Some(role) = user.faction_role {
                total += check_leadership_titles(pool, user_id, &role).await?;
            }
        }

        total += check_propaganda_king_title(pool, user_id).await? as usize;
    }

    Ok(total)
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

pub async fn get_my_titles(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<UserTitle>>, (StatusCode, String)> {
    let titles = get_user_titles(&state.pool, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(titles))
}

pub async fn get_all_title_definitions(
    State(_state): State<ServerState>,
) -> Json<Vec<&'static TitleDef>> {
    Json(ALL_TITLES.iter().collect())
}

#[derive(Deserialize)]
pub struct CheckAllQuery {
    pub user_id: Option<uuid::Uuid>,
}

pub async fn check_all_titles_endpoint(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let count = check_all_titles(&state.pool, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "new_titles": count })))
}
