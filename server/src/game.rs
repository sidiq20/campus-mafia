use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct TerritoryResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub controlling_faction_id: Option<uuid::Uuid>,
    pub controlling_faction_name: Option<String>,
    pub defense_score: i32,
}

pub async fn get_territories(State(state): State<ServerState>) -> Json<Vec<TerritoryResponse>> {
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

    // Check user influence
    let user_influence: i32 = sqlx::query_scalar(
        "SELECT COALESCE(influence, 0) FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let cost_to_create = 500; // Expensive to create a faction
    if user_influence < cost_to_create {
        return Err((StatusCode::BAD_REQUEST, format!("Not enough influence to create a faction. Need {}, have {}", cost_to_create, user_influence)));
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

    // Deduct cost and set user's faction
    sqlx::query(
        "UPDATE users SET influence = influence - $1, faction_id = $2 WHERE id = $3"
    )
    .bind(cost_to_create)
    .bind(faction_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "success", "faction_id": faction_id})))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct FactionResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub description: Option<String>,
    pub influence: i32,
    pub member_count: Option<i64>,
}

pub async fn get_factions(State(state): State<ServerState>) -> Json<Vec<FactionResponse>> {
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
    .map_err(|e| (StatusCode::NOT_FOUND, "Faction not found".to_string()))?;

    Ok(Json(faction))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct FactionMemberResponse {
    pub id: uuid::Uuid,
    pub username: String,
    pub influence: i32,
}

pub async fn get_faction_members(
    State(state): State<ServerState>,
    Path(faction_id): Path<uuid::Uuid>,
) -> Json<Vec<FactionMemberResponse>> {
    let pool = &state.pool;

    let members = sqlx::query_as::<_, FactionMemberResponse>(
        r#"
        SELECT 
            id, 
            username, 
            COALESCE(influence, 0) as influence
        FROM users
        WHERE faction_id = $1
        ORDER BY influence DESC
        "#
    )
    .bind(faction_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(members)
}
