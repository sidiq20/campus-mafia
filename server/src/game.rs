use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use chrono::{Utc, Duration};

use crate::{ServerState, auth::AuthUser, rank};

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct TerritoryResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub controlling_faction_id: Option<uuid::Uuid>,
    pub controlling_faction_name: Option<String>,
    pub defense_score: i32,
}

pub async fn get_territories(State(state): State<ServerState>) -> Json<Vec<TerritoryResponse>> {
    // Check cache first
    if let Some(cached) = state.cache.get_territories().await {
        if let Ok(data) = serde_json::from_value(cached) {
            return Json(data);
        }
    }

    let pool = &state.pool;
    let territories = sqlx::query_as::<_, TerritoryResponse>(
        r#"
        SELECT 
            t.id, 
            t.name, 
            t.controlling_faction_id, 
            f.name as controlling_faction_name,
            t.defense_score
        FROM territories t
        LEFT JOIN factions f ON t.controlling_faction_id = f.id
        ORDER BY t.name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Update cache
    if let Ok(json) = serde_json::to_value(&territories) {
        state.cache.set_territories(json).await;
    }

    Json(territories)
}

#[derive(Deserialize)]
pub struct AttackRequest {
    pub influence_spent: i32,
}

pub async fn attack_territory(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(territory_id): Path<uuid::Uuid>,
    Json(payload): Json<AttackRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    if payload.influence_spent <= 0 {
        return Err((StatusCode::BAD_REQUEST, "Must spend positive influence".to_string()));
    }

    // Verify user has enough influence and get their faction
    #[derive(sqlx::FromRow)]
    struct UserInfo {
        influence: Option<i32>,
        faction_id: Option<uuid::Uuid>,
    }

    let user_info = sqlx::query_as::<_, UserInfo>(
        "SELECT influence, faction_id FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_influence = user_info.influence.unwrap_or(0);
    let user_faction = user_info.faction_id;

    if user_influence < payload.influence_spent {
        return Err((StatusCode::BAD_REQUEST, "Not enough influence".to_string()));
    }

    if user_faction.is_none() {
        return Err((StatusCode::BAD_REQUEST, "You must be in a faction to attack".to_string()));
    }

    let user_faction = user_faction.unwrap();

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check DDoS
    let is_ddosed: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'faction' AND target_id = $1 AND effect_id = 'ddos_attack' AND expires_at > NOW())"
    )
    .bind(user_faction)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if is_ddosed.unwrap_or(false) {
        return Err((StatusCode::BAD_REQUEST, "Your faction is under a DDoS attack. You cannot launch territory attacks.".to_string()));
    }

    // Deduct influence
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(payload.influence_spent)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get territory
    #[derive(sqlx::FromRow)]
    struct TerritoryInfo {
        controlling_faction_id: Option<uuid::Uuid>,
        defense_score: Option<i32>,
    }

    let territory = sqlx::query_as::<_, TerritoryInfo>("SELECT controlling_faction_id, defense_score FROM territories WHERE id = $1")
        .bind(territory_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if territory.controlling_faction_id == Some(user_faction) {
        // Reinforce territory
        sqlx::query("UPDATE territories SET defense_score = defense_score + $1 WHERE id = $2")
            .bind(payload.influence_spent)
            .bind(territory_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        return Ok(Json(serde_json::json!({"status": "reinforced"})));
    }

    // Attack territory
    let new_defense = territory.defense_score.unwrap_or(100) - payload.influence_spent;

    // Get territory and faction names for events
    let user_faction_name: Option<String> = sqlx::query_scalar("SELECT name FROM factions WHERE id = $1")
        .bind(user_faction)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten();

    let territory_name: String = sqlx::query_scalar("SELECT name FROM territories WHERE id = $1")
        .bind(territory_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if new_defense <= 0 {
        // Captured
        sqlx::query(
            "UPDATE territories SET controlling_faction_id = $1, defense_score = 100 WHERE id = $2",
        )
        .bind(user_faction)
        .bind(territory_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        let event = crate::ws::GameEvent::TerritoryCaptured {
            territory_name,
            new_faction: user_faction_name,
        };
        if let Ok(event_json) = serde_json::to_string(&event) {
            let _ = state.ws_state.tx.send(event_json);
        }

        return Ok(Json(serde_json::json!({"status": "captured"})));
    } else {
        // Just damaged
        sqlx::query(
            "UPDATE territories SET defense_score = $1 WHERE id = $2",
        )
        .bind(new_defense)
        .bind(territory_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let event = crate::ws::GameEvent::TerritoryAttacked {
            territory_name,
            attacker_faction: user_faction_name,
            damage: payload.influence_spent,
        };
        if let Ok(event_json) = serde_json::to_string(&event) {
            let _ = state.ws_state.tx.send(event_json);
        }

        return Ok(Json(serde_json::json!({"status": "damaged", "remaining_defense": new_defense})));
    }
}

#[derive(Deserialize)]
pub struct CreateFactionRequest {
    pub name: String,
    pub description: String,
}

pub async fn create_faction(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<CreateFactionRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Check user influence and last faction change
    #[derive(sqlx::FromRow)]
    struct UserData {
        influence: Option<i32>,
        last_faction_change: Option<chrono::DateTime<chrono::Utc>>,
    }

    let user_data = sqlx::query_as::<_, UserData>(
        "SELECT influence, last_faction_change FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_influence = user_data.influence.unwrap_or(0);

    let cost_to_create = 500; // Expensive to create a faction
    if user_influence < cost_to_create {
        return Err((StatusCode::BAD_REQUEST, format!("Not enough influence to create a faction. Need {}, have {}", cost_to_create, user_influence)));
    }

    if let Some(last_change) = user_data.last_faction_change {
        let now = chrono::Utc::now();
        if now.signed_duration_since(last_change).num_days() < 5 {
            return Err((StatusCode::BAD_REQUEST, "You must wait 5 days between changing factions.".to_string()));
        }
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let faction_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO factions (name, description) VALUES ($1, $2) RETURNING id"
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Deduct cost, set user's faction, role as head, and update last_faction_change
    sqlx::query(
        "UPDATE users SET influence = influence - $1, faction_id = $2, faction_role = 'head', last_faction_change = NOW() WHERE id = $3"
    )
    .bind(cost_to_create)
    .bind(faction_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Send faction welcome for the founder
    let user_display: Option<String> = sqlx::query_scalar("SELECT display_name FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or_default()
        .flatten();

    if let Some(ref name) = user_display {
        let _ = crate::comms::send_faction_welcome_message(
            pool,
            user_id,
            faction_id,
            name,
            state.ws_state.as_ref(),
        ).await;
    }

    Ok(Json(serde_json::json!({"status": "success", "faction_id": faction_id})))
}

pub async fn join_faction(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Check user's current faction and last faction change
    #[derive(sqlx::FromRow)]
    struct UserData {
        faction_id: Option<uuid::Uuid>,
        last_faction_change: Option<chrono::DateTime<chrono::Utc>>,
    }

    let user_data = sqlx::query_as::<_, UserData>(
        "SELECT faction_id, last_faction_change FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check if already in a faction
    if user_data.faction_id.is_some() {
        return Err((StatusCode::BAD_REQUEST, "You must leave your current faction before joining a new one.".to_string()));
    }

    // Check cooldown
    if let Some(last_change) = user_data.last_faction_change {
        let now = chrono::Utc::now();
        if now.signed_duration_since(last_change).num_days() < 5 {
            return Err((StatusCode::BAD_REQUEST, "You must wait 5 days between changing factions.".to_string()));
        }
    }

    // Verify faction exists
    let faction_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM factions WHERE id = $1)"
    )
    .bind(faction_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !faction_exists {
        return Err((StatusCode::NOT_FOUND, "Faction not found".to_string()));
    }

    // Update user's faction with default role
    sqlx::query(
        "UPDATE users SET faction_id = $1, faction_role = 'member', last_faction_change = NOW() WHERE id = $2"
    )
    .bind(faction_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get user display name for welcome message
    let display_name: Option<String> = sqlx::query_scalar("SELECT display_name FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or_default()
        .flatten();

    // Send faction welcome message
    if let Some(ref name) = display_name {
        let _ = crate::comms::send_faction_welcome_message(
            pool,
            user_id,
            faction_id,
            name,
            state.ws_state.as_ref(),
        ).await;
    }

    // Check faction join titles
    let _ = crate::titles::check_faction_join_titles(pool, user_id).await;

    Ok(Json(serde_json::json!({"status": "success", "message": "Joined faction successfully"})))
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct FactionResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub description: Option<String>,
    pub influence: i32,
    pub member_count: Option<i64>,
}

pub async fn get_factions(State(state): State<ServerState>) -> Json<Vec<FactionResponse>> {
    // Check cache first
    if let Some(cached) = state.cache.get_factions().await {
        if let Ok(data) = serde_json::from_value(cached) {
            return Json(data);
        }
    }

    let pool = &state.pool;
    let factions = sqlx::query_as::<_, FactionResponse>(
        r#"
        SELECT 
            f.id, 
            f.name, 
            f.description, 
            f.influence,
            (SELECT COUNT(*) FROM users u WHERE u.faction_id = f.id) as member_count
        FROM factions f
        ORDER BY f.influence DESC
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Update cache
    if let Ok(json) = serde_json::to_value(&factions) {
        state.cache.set_factions(json).await;
    }

    Json(factions)
}

pub async fn get_faction_by_id(
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
) -> Result<Json<FactionResponse>, (StatusCode, String)> {
    let pool = &state.pool;

    let faction = sqlx::query_as::<_, FactionResponse>(
        r#"
        SELECT 
            f.id, 
            f.name, 
            f.description, 
            f.influence,
            (SELECT COUNT(*) FROM users u WHERE u.faction_id = f.id) as member_count
        FROM factions f
        WHERE f.id = $1
        "#
    )
    .bind(faction_id)
    .fetch_one(pool)
    .await
    .map_err(|_e| (StatusCode::NOT_FOUND, "Faction not found".to_string()))?;

    Ok(Json(faction))
}

#[derive(Serialize)]
pub struct FactionMemberResponse {
    pub id: uuid::Uuid,
    pub username: String,
    pub influence: i32,
    pub rank: rank::RankInfo,
    pub faction_role: String,
}

pub async fn get_faction_members(
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
) -> Json<Vec<FactionMemberResponse>> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct MemberRow {
        id: uuid::Uuid,
        username: String,
        influence: i32,
        faction_role: String,
    }

    let rows = sqlx::query_as::<_, MemberRow>(
        r#"
        SELECT 
            id, 
            username, 
            COALESCE(influence, 0) as influence,
            COALESCE(faction_role, 'member') as faction_role
        FROM users
        WHERE faction_id = $1
        ORDER BY 
            CASE faction_role
                WHEN 'head' THEN 0
                WHEN 'vice_head' THEN 1
                WHEN 'executive' THEN 2
                ELSE 3
            END ASC,
            influence DESC
        "#
    )
    .bind(faction_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let members: Vec<FactionMemberResponse> = rows.into_iter().map(|r| FactionMemberResponse {
        id: r.id,
        username: r.username,
        influence: r.influence,
        rank: rank::get_rank_info(r.influence),
        faction_role: r.faction_role,
    }).collect();

    Json(members)
}

pub async fn leave_faction(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Check if user is head — must transfer role before leaving
    let user_role: Option<String> = sqlx::query_scalar(
        "SELECT faction_role FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if user_role.as_deref() == Some("head") {
        return Err((StatusCode::BAD_REQUEST, "You are the faction head. Transfer your role to another member before leaving.".to_string()));
    }

    let last_change: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar("SELECT last_faction_change FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten();

    if let Some(last_change) = last_change {
        let now = chrono::Utc::now();
        if now.signed_duration_since(last_change).num_days() < 5 {
            return Err((StatusCode::BAD_REQUEST, "You must wait 5 days between changing factions.".to_string()));
        }
    }

    let res = sqlx::query("UPDATE users SET faction_id = NULL, faction_role = 'member', last_faction_change = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "User not found".to_string()));
    }

    Ok(Json(serde_json::json!({"status": "success", "message": "Left faction"})))
}

#[derive(Deserialize)]
pub struct AssignRoleRequest {
    pub target_user_id: uuid::Uuid,
    pub role: String, // 'head', 'vice_head', 'executive', 'member'
}

pub async fn assign_role(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
    Json(payload): Json<AssignRoleRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let requester_id = auth_user.user_id;

    // Validate role
    let valid_roles = ["head", "vice_head", "executive", "member"];
    if !valid_roles.contains(&payload.role.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "Invalid role. Must be: head, vice_head, executive, or member".to_string()));
    }

    // Verify requester is head of this faction
    let requester_role: Option<String> = sqlx::query_scalar(
        "SELECT faction_role FROM users WHERE id = $1 AND faction_id = $2"
    )
    .bind(requester_id)
    .bind(faction_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    match requester_role.as_deref() {
        Some("head") => {} // Allowed
        _ => return Err((StatusCode::FORBIDDEN, "Only the faction head can assign roles".to_string())),
    }

    // Verify target is in this faction
    let target_in_faction: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND faction_id = $2)"
    )
    .bind(payload.target_user_id)
    .bind(faction_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !target_in_faction {
        return Err((StatusCode::BAD_REQUEST, "Target user is not in your faction".to_string()));
    }

    // Can't demote yourself from head
    if payload.target_user_id == requester_id && payload.role.as_str() != "head" {
        return Err((StatusCode::BAD_REQUEST, "You cannot demote yourself. Transfer head role to another member first.".to_string()));
    }

    // If assigning head, demote current head to member
    if payload.role == "head" && payload.target_user_id != requester_id {
        sqlx::query(
            "UPDATE users SET faction_role = 'member' WHERE faction_id = $1 AND faction_role = 'head'"
        )
        .bind(faction_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // Enforce limits: max 1 head, 1 vice_head, 4 executives
    if payload.role == "vice_head" {
        // Demote existing vice_head to member
        sqlx::query(
            "UPDATE users SET faction_role = 'member' WHERE faction_id = $1 AND faction_role = 'vice_head' AND id != $2"
        )
        .bind(faction_id)
        .bind(payload.target_user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    if payload.role == "executive" {
        let exec_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE faction_id = $1 AND faction_role = 'executive'"
        )
        .bind(faction_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // If target is not already executive, count them in the limit
        let current_target_role: Option<String> = sqlx::query_scalar(
            "SELECT faction_role FROM users WHERE id = $1"
        )
        .bind(payload.target_user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten();

        let is_already_exec = current_target_role.as_deref() == Some("executive");
        if !is_already_exec && exec_count >= 4 {
            return Err((StatusCode::BAD_REQUEST, "Maximum 4 executives allowed. Demote an existing executive first.".to_string()));
        }
    }

    // Assign role
    sqlx::query(
        "UPDATE users SET faction_role = $1 WHERE id = $2"
    )
    .bind(&payload.role)
    .bind(payload.target_user_id)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check leadership titles for the promoted user
    let _ = crate::titles::check_leadership_titles(pool, payload.target_user_id, &payload.role).await;

    Ok(Json(serde_json::json!({"status": "success", "message": format!("Role updated to {}", payload.role)})))
}

// ——— Raid Planning ———

#[derive(Serialize, sqlx::FromRow)]
pub struct RaidPlanResponse {
    pub id: uuid::Uuid,
    pub faction_id: uuid::Uuid,
    pub target_territory_id: uuid::Uuid,
    pub target_territory_name: String,
    pub total_influence: i32,
    pub status: String,
    pub created_by: uuid::Uuid,
    pub created_by_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub executes_at: chrono::DateTime<chrono::Utc>,
    pub participant_count: Option<i64>,
}

#[derive(Deserialize)]
pub struct PlanRaidRequest {
    pub influence_commitment: i32,
}

/// Propose a raid on a territory. Starts a 30-minute planning window.
pub async fn plan_raid(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(territory_id): Path<uuid::Uuid>,
    Json(payload): Json<PlanRaidRequest>,
) -> Result<Json<RaidPlanResponse>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    if payload.influence_commitment <= 0 {
        return Err((StatusCode::BAD_REQUEST, "Must commit positive influence".to_string()));
    }

    // Get user's faction and influence
    #[derive(sqlx::FromRow)]
    struct UserInfo {
        influence: Option<i32>,
        faction_id: Option<uuid::Uuid>,
        display_name: Option<String>,
    }

    let user_info = sqlx::query_as::<_, UserInfo>(
        "SELECT influence, faction_id, display_name FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_influence = user_info.influence.unwrap_or(0);
    let user_faction = user_info.faction_id;
    let display_name = user_info.display_name.unwrap_or_else(|| "Unknown".to_string());

    if user_faction.is_none() {
        return Err((StatusCode::BAD_REQUEST, "You must be in a faction to plan a raid".to_string()));
    }

    if user_influence < payload.influence_commitment {
        return Err((StatusCode::BAD_REQUEST, "Not enough influence".to_string()));
    }

    let user_faction = user_faction.unwrap();

    // Check territory exists and is not owned by the faction
    let territory_owner: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT controlling_faction_id FROM territories WHERE id = $1"
    )
    .bind(territory_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if territory_owner == Some(user_faction) {
        return Err((StatusCode::BAD_REQUEST, "Cannot plan a raid on your own territory".to_string()));
    }

    // Check DDoS
    let is_ddosed: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'faction' AND target_id = $1 AND effect_id = 'ddos_attack' AND expires_at > NOW())"
    )
    .bind(user_faction)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if is_ddosed.unwrap_or(false) {
        return Err((StatusCode::BAD_REQUEST, "Your faction is under a DDoS attack. Cannot plan raids.".to_string()));
    }

    // Check there isn't already an active plan for this territory by this faction
    let existing_plan: bool = sqlx::query_scalar::<_, Option<bool>>(
        "SELECT EXISTS(SELECT 1 FROM raid_plans WHERE faction_id = $1 AND target_territory_id = $2 AND status = 'planning')"
    )
    .bind(user_faction)
    .bind(territory_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .unwrap_or(false);

    if existing_plan {
        return Err((StatusCode::BAD_REQUEST, "This territory already has an active raid plan from your faction".to_string()));
    }

    let now = Utc::now();
    let executes_at = now + Duration::minutes(30);

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create the raid plan
    let raid = sqlx::query_as::<_, RaidPlanResponse>(
        r#"
        WITH inserted AS (
            INSERT INTO raid_plans (faction_id, target_territory_id, total_influence, created_by, executes_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, faction_id, target_territory_id, total_influence, status, created_by, created_at, executes_at
        )
        SELECT 
            i.id, i.faction_id, i.target_territory_id, i.total_influence, i.status, i.created_by, i.created_at, i.executes_at,
            t.name as target_territory_name,
            COALESCE(u.display_name, 'Unknown') as created_by_name,
            1::bigint as participant_count
        FROM inserted i
        JOIN territories t ON i.target_territory_id = t.id
        JOIN users u ON i.created_by = u.id
        "#
    )
    .bind(user_faction)
    .bind(territory_id)
    .bind(payload.influence_commitment)
    .bind(user_id)
    .bind(executes_at)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Deduct committed INF from proposer
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(payload.influence_commitment)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Record participant
    sqlx::query(
        "INSERT INTO raid_participants (raid_id, user_id, influence_committed) VALUES ($1, $2, $3)"
    )
    .bind(raid.id)
    .bind(user_id)
    .bind(payload.influence_commitment)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Use the updated comms notification that accepts direct parameters
    let territory_name = &raid.target_territory_name;
    let msg = format!("📡 @{} has proposed a raid on **{}** with **{} INF**! Join the planning phase!", display_name, territory_name, payload.influence_commitment);
    let _ = crate::comms::send_faction_system_message(
        pool,
        user_faction,
        &msg,
    ).await;

    Ok(Json(raid))
}

#[derive(Deserialize)]
pub struct JoinRaidRequest {
    pub influence_commitment: i32,
}

/// Join an existing planned raid and commit INF to it.
pub async fn join_raid(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(raid_id): Path<uuid::Uuid>,
    Json(payload): Json<JoinRaidRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    if payload.influence_commitment <= 0 {
        return Err((StatusCode::BAD_REQUEST, "Must commit positive influence".to_string()));
    }

    // Get user info and verify they're in the raiding faction
    #[derive(sqlx::FromRow)]
    struct UserInfo {
        influence: Option<i32>,
        faction_id: Option<uuid::Uuid>,
        display_name: Option<String>,
    }

    let user_info = sqlx::query_as::<_, UserInfo>(
        "SELECT influence, faction_id, display_name FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user_influence = user_info.influence.unwrap_or(0);
    let user_faction = user_info.faction_id;
    let display_name = user_info.display_name.unwrap_or_else(|| "Unknown".to_string());

    if user_faction.is_none() {
        return Err((StatusCode::BAD_REQUEST, "You must be in a faction to join a raid".to_string()));
    }

    if user_influence < payload.influence_commitment {
        return Err((StatusCode::BAD_REQUEST, "Not enough influence".to_string()));
    }

    // Verify the raid exists, is in planning status, and belongs to the user's faction
    #[derive(sqlx::FromRow)]
    struct RaidInfo {
        faction_id: uuid::Uuid,
        status: String,
        target_territory_name: Option<String>,
        executes_at: chrono::DateTime<chrono::Utc>,
    }

    let raid_info = sqlx::query_as::<_, RaidInfo>(
        r#"
        SELECT r.faction_id, r.status, t.name as target_territory_name, r.executes_at
        FROM raid_plans r
        JOIN territories t ON r.target_territory_id = t.id
        WHERE r.id = $1
        "#
    )
    .bind(raid_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Raid plan not found".to_string()))?;

    if raid_info.faction_id != user_faction.unwrap() {
        return Err((StatusCode::FORBIDDEN, "You are not in the raiding faction".to_string()));
    }

    if raid_info.status != "planning" {
        return Err((StatusCode::BAD_REQUEST, "This raid is no longer in the planning phase".to_string()));
    }

    if Utc::now() > raid_info.executes_at {
        return Err((StatusCode::BAD_REQUEST, "The planning phase has ended. This raid is being executed.".to_string()));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Deduct INF from participant
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(payload.influence_commitment)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Upsert participant (add to existing commitment if already joined)
    sqlx::query(
        r#"
        INSERT INTO raid_participants (raid_id, user_id, influence_committed)
        VALUES ($1, $2, $3)
        ON CONFLICT (raid_id, user_id)
        DO UPDATE SET influence_committed = raid_participants.influence_committed + EXCLUDED.influence_committed,
                      voted_at = NOW()
        "#
    )
    .bind(raid_id)
    .bind(user_id)
    .bind(payload.influence_commitment)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update total influence on the raid plan
    sqlx::query("UPDATE raid_plans SET total_influence = total_influence + $1 WHERE id = $2")
        .bind(payload.influence_commitment)
        .bind(raid_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Notify faction channel
    let territory_name = raid_info.target_territory_name.as_deref().unwrap_or("Unknown");
    let msg = format!("⚔️ @{} has joined the raid on **{}** with **{} INF**!", display_name, territory_name, payload.influence_commitment);
    let _ = crate::comms::send_faction_system_message(
        pool,
        user_faction.unwrap(),
        &msg,
    ).await;

    Ok(Json(serde_json::json!({"status": "joined", "influence_committed": payload.influence_commitment})))
}

/// Get all planned raids for the current user's faction (with auto-execution of expired plans).
pub async fn get_planned_raids(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<RaidPlanResponse>>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    let user_faction: Option<uuid::Uuid> = sqlx::query_scalar("SELECT faction_id FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten();

    if user_faction.is_none() {
        return Ok(Json(vec![]));
    }

    let user_faction = user_faction.unwrap();

    // Try to execute any expired planning raids
    let _ = execute_expired_raids(pool, user_faction).await;

    // Get active planning raids for the faction
    let raids = sqlx::query_as::<_, RaidPlanResponse>(
        r#"
        SELECT 
            r.id, r.faction_id, r.target_territory_id, r.total_influence, r.status,
            r.created_by, r.created_at, r.executes_at,
            t.name as target_territory_name,
            COALESCE(u.display_name, 'Unknown') as created_by_name,
            (SELECT COUNT(*) FROM raid_participants rp WHERE rp.raid_id = r.id) as participant_count
        FROM raid_plans r
        JOIN territories t ON r.target_territory_id = t.id
        JOIN users u ON r.created_by = u.id
        WHERE r.faction_id = $1 AND r.status = 'planning'
        ORDER BY r.executes_at ASC
        "#
    )
    .bind(user_faction)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(raids))
}

/// Cancel a planned raid (only creator or faction head can cancel).
pub async fn cancel_raid(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(raid_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    // Get raid info
    #[derive(sqlx::FromRow)]
    struct RaidInfo {
        faction_id: uuid::Uuid,
        created_by: uuid::Uuid,
        status: String,
    }

    let raid_info = sqlx::query_as::<_, RaidInfo>(
        "SELECT faction_id, created_by, status FROM raid_plans WHERE id = $1"
    )
    .bind(raid_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Raid plan not found".to_string()))?;

    if raid_info.status != "planning" {
        return Err((StatusCode::BAD_REQUEST, "This raid is no longer in planning phase".to_string()));
    }

    // Check if user is creator or faction head
    let user_role: Option<String> = sqlx::query_scalar(
        "SELECT faction_role FROM users WHERE id = $1 AND faction_id = $2"
    )
    .bind(user_id)
    .bind(raid_info.faction_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    let is_creator = raid_info.created_by == user_id;
    let is_head = user_role.as_deref() == Some("head");

    if !is_creator && !is_head {
        return Err((StatusCode::FORBIDDEN, "Only the raid creator or faction head can cancel a raid".to_string()));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Refund all participants
    let participants = sqlx::query_as::<_, (uuid::Uuid, i32)>(
        "SELECT user_id, influence_committed FROM raid_participants WHERE raid_id = $1"
    )
    .bind(raid_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for (participant_id, committed) in participants {
        let _ = sqlx::query("UPDATE users SET influence = influence + $1 WHERE id = $2")
            .bind(committed)
            .bind(participant_id)
            .execute(&mut *tx)
            .await;
    }

    // Mark raid as cancelled
    sqlx::query("UPDATE raid_plans SET status = 'cancelled' WHERE id = $1")
        .bind(raid_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "cancelled"})))
}

/// Execute all expired raid plans for a faction (called when fetching planned raids).
async fn execute_expired_raids(pool: &sqlx::PgPool, faction_id: uuid::Uuid) -> Result<(), sqlx::Error> {
    // Find all planning raids that have passed their execution time
    let expired_raids = sqlx::query_as::<_, (uuid::Uuid, uuid::Uuid, i32)>(
        "SELECT id, target_territory_id, total_influence FROM raid_plans WHERE faction_id = $1 AND status = 'planning' AND executes_at <= NOW()"
    )
    .bind(faction_id)
    .fetch_all(pool)
    .await?;

    for (raid_id, territory_id, total_influence) in expired_raids {
        let mut tx = pool.begin().await?;

        // Atomic claim: only process if still in planning status
        let result = sqlx::query("UPDATE raid_plans SET status = 'completed' WHERE id = $1 AND status = 'planning'")
            .bind(raid_id)
            .execute(&mut *tx)
            .await?;

        // Another call already processed this raid — skip
        if result.rows_affected() == 0 {
            let _ = tx.rollback().await;
            continue;
        }

        // Get territory info
        let defense_score: Option<i32> = sqlx::query_scalar(
            "SELECT defense_score FROM territories WHERE id = $1"
        )
        .bind(territory_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(None);

        let new_defense = defense_score.unwrap_or(100) - total_influence;

        // Get territory name for notifications
        let territory_name: Option<String> = sqlx::query_scalar(
            "SELECT name FROM territories WHERE id = $1"
        )
        .bind(territory_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(None);

        let raid_faction_name: Option<String> = sqlx::query_scalar(
            "SELECT name FROM factions WHERE id = $1"
        )
        .bind(faction_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(None);

        if new_defense <= 0 {
            // Captured!
            sqlx::query(
                "UPDATE territories SET controlling_faction_id = $1, defense_score = 100 WHERE id = $2"
            )
            .bind(faction_id)
            .bind(territory_id)
            .execute(&mut *tx)
            .await?;
        } else {
            // Damaged
            sqlx::query(
                "UPDATE territories SET defense_score = $1 WHERE id = $2"
            )
            .bind(new_defense)
            .bind(territory_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        // Send faction notification after transaction completes
        let tname = territory_name.as_deref().unwrap_or("Unknown");
        let fname = raid_faction_name.as_deref().unwrap_or("Unknown");
        if new_defense <= 0 {
            let msg = format!("🏴‍☠️ **Raid complete!** {} has been **captured** by {}!", tname, fname);
            let _ = crate::comms::send_faction_system_message(pool, faction_id, &msg).await;
        } else {
            let msg = format!("💥 **Raid executed!** {} defense reduced to **{}** ({} INF damage)", tname, new_defense, total_influence);
            let _ = crate::comms::send_faction_system_message(pool, faction_id, &msg).await;
        }
    }

    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
pub struct ActivityEvent {
    pub event_type: String,
    pub label: String,
    pub description: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub icon: String,
}

/// Returns a mix of recent activity across the game
pub async fn get_recent_activity(
    State(state): State<ServerState>,
) -> Json<Vec<ActivityEvent>> {
    let pool = &state.pool;
    let mut activities = Vec::new();

    // Recent posts
    if let Ok(rows) = sqlx::query_as::<_, ActivityEvent>(
        r#"
        SELECT 
            'post' as event_type,
            'New Intel Drop' as label,
            CONCAT(COALESCE(u.display_name, 'Anonymous'), ': ', LEFT(p.content, 80)) as description,
            p.created_at as timestamp,
            '📡' as icon
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 5
        "#
    )
    .fetch_all(pool)
    .await
    {
        activities.extend(rows);
    }

    // Leaderboard top movers (show top 3 users by influence)
    if let Ok(rows) = sqlx::query_as::<_, ActivityEvent>(
        r#"
        SELECT 
            'leaderboard' as event_type,
            'Top Operative' as label,
            CONCAT(u.display_name, ' — ', COALESCE(u.influence, 0), ' INF') as description,
            u.created_at as timestamp,
            '🏆' as icon
        FROM users u
        ORDER BY u.influence DESC
        LIMIT 3
        "#
    )
    .fetch_all(pool)
    .await
    {
        activities.extend(rows);
    }

    // Faction standings
    if let Ok(rows) = sqlx::query_as::<_, ActivityEvent>(
        r#"
        SELECT 
            'faction' as event_type,
            'Faction Standing' as label,
            CONCAT(f.name, ' — ', f.influence, ' INF (', COALESCE(mc.c, 0), ' members)') as description,
            f.created_at as timestamp,
            '🏴' as icon
        FROM factions f
        LEFT JOIN LATERAL (SELECT COUNT(*) as c FROM users u WHERE u.faction_id = f.id) mc ON true
        ORDER BY f.influence DESC
        LIMIT 5
        "#
    )
    .fetch_all(pool)
    .await
    {
        activities.extend(rows);
    }

    // Territory control stats
    if let Ok(rows) = sqlx::query_as::<_, ActivityEvent>(
        r#"
        SELECT 
            'territory' as event_type,
            'Territory Control' as label,
            CONCAT(COALESCE(f.name, 'Rogue'), ' holds ', t.name, ' (DEF: ', t.defense_score, ')') as description,
            t.created_at as timestamp,
            '🗺️' as icon
        FROM territories t
        LEFT JOIN factions f ON t.controlling_faction_id = f.id
        ORDER BY t.id
        "#
    )
    .fetch_all(pool)
    .await
    {
        activities.extend(rows);
    }

    // Sort all activities by timestamp, most recent first
    activities.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    activities.truncate(30);

    Json(activities)
}
