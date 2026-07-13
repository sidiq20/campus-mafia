use axum::{
    extract::{State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct InventoryItem {
    pub item_id: String,
    pub quantity: i32,
}

pub async fn get_inventory(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Json<Vec<InventoryItem>> {
    let pool = &state.pool;
    let inventory = sqlx::query_as::<_, InventoryItem>(
        "SELECT item_id, quantity FROM user_inventory WHERE user_id = $1 AND quantity > 0"
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(inventory)
}

#[derive(Deserialize)]
pub struct PurchaseRequest {
    pub item_id: String,
}

pub async fn purchase_item(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<PurchaseRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    let cost = match payload.item_id.as_str() {
        "cyber_nuke" => 500,
        "ddos_attack" => 1000,
        "firewall_upgrade" => 400,
        "propaganda_boost" => 250,
        "identity_scrambler" => 100,
        "inf_cap_bypass" => 5000,
        _ => return Err((StatusCode::BAD_REQUEST, "Invalid item".to_string())),
    };

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check influence
    let influence: Option<i32> = sqlx::query_scalar("SELECT influence FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .flatten();

    if influence.unwrap_or(0) < cost {
        return Err((StatusCode::BAD_REQUEST, "Not enough influence".to_string()));
    }

    // Deduct influence
    sqlx::query("UPDATE users SET influence = influence - $1 WHERE id = $2")
        .bind(cost)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add to inventory
    sqlx::query(
        r#"
        INSERT INTO user_inventory (user_id, item_id, quantity)
        VALUES ($1, $2, 1)
        ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1
        "#
    )
    .bind(user_id)
    .bind(&payload.item_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check purchase titles
    let _ = crate::titles::check_purchase_titles(pool, user_id, &payload.item_id).await;

    Ok(Json(serde_json::json!({"success": true, "message": format!("Purchased {}", payload.item_id)})))
}

#[derive(Deserialize)]
pub struct UseItemRequest {
    pub item_id: String,
    pub target_id: Option<uuid::Uuid>,
}

pub async fn use_item(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<UseItemRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;
    let user_id = auth_user.user_id;

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check inventory
    let qty: Option<i32> = sqlx::query_scalar("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2")
        .bind(user_id)
        .bind(&payload.item_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if qty.unwrap_or(0) <= 0 {
        return Err((StatusCode::BAD_REQUEST, "You don't own this item".to_string()));
    }

    // Process item
    match payload.item_id.as_str() {
        "cyber_nuke" => {
            let target_id = payload.target_id.ok_or((StatusCode::BAD_REQUEST, "Target territory required".to_string()))?;
            // Deal 50 flat damage
            sqlx::query("UPDATE territories SET defense_score = GREATEST(0, defense_score - 50) WHERE id = $1")
                .bind(target_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        },
        "firewall_upgrade" => {
            let target_id = payload.target_id.ok_or((StatusCode::BAD_REQUEST, "Target territory required".to_string()))?;
            sqlx::query("UPDATE territories SET defense_score = defense_score + 50 WHERE id = $1")
                .bind(target_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        },
        "identity_scrambler" => {
            // Adds 5 charges of identity_scrambler effect
            sqlx::query("INSERT INTO active_effects (target_type, target_id, effect_id, expires_at) VALUES ('user', $1, 'identity_scrambler', NOW() + INTERVAL '1 hour')")
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        },
        "propaganda_boost" => {
            sqlx::query("INSERT INTO active_effects (target_type, target_id, effect_id, expires_at) VALUES ('user', $1, 'propaganda_boost', NOW() + INTERVAL '30 minutes')")
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        },
        "inf_cap_bypass" => {
            // Removes daily INF cap for 24 hours
            let has_active: Option<bool> = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM active_effects WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'inf_cap_bypass' AND expires_at > NOW())"
            )
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .flatten();

            if has_active.unwrap_or(false) {
                // Extend existing bypass by 24h
                sqlx::query(
                    "UPDATE active_effects SET expires_at = expires_at + INTERVAL '24 hours' WHERE target_type = 'user' AND target_id = $1 AND effect_id = 'inf_cap_bypass'"
                )
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            } else {
                sqlx::query(
                    "INSERT INTO active_effects (target_type, target_id, effect_id, expires_at) VALUES ('user', $1, 'inf_cap_bypass', NOW() + INTERVAL '24 hours')"
                )
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            }
        },
        "ddos_attack" => {
            let target_id = payload.target_id.ok_or((StatusCode::BAD_REQUEST, "Target faction required".to_string()))?;
            sqlx::query("INSERT INTO active_effects (target_type, target_id, effect_id, expires_at) VALUES ('faction', $1, 'ddos_attack', NOW() + INTERVAL '1 hour')")
                .bind(target_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        },
        _ => return Err((StatusCode::BAD_REQUEST, "Invalid item".to_string())),
    }

    // Consume item
    sqlx::query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2")
        .bind(user_id)
        .bind(&payload.item_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"success": true, "message": "Item deployed successfully"})))
}
