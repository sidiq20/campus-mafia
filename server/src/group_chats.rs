use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use crate::{ServerState, auth::AuthUser};

#[derive(Serialize, sqlx::FromRow)]
pub struct GroupChat {
    pub id: uuid::Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_by: uuid::Uuid,
    pub created_by_name: String,
    pub member_count: Option<i64>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct GroupChatMessage {
    pub id: uuid::Uuid,
    pub group_id: uuid::Uuid,
    pub user_id: uuid::Uuid,
    pub content: String,
    pub author_name: String,
    pub display_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct GroupMember {
    pub user_id: uuid::Uuid,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub joined_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub member_usernames: Vec<String>,
}

#[derive(Deserialize)]
pub struct SendGroupMessageRequest {
    pub content: String,
}

#[derive(Deserialize)]
pub struct AddMemberRequest {
    pub username: String,
}

/// Create a new group chat
pub async fn create_group(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Json(payload): Json<CreateGroupRequest>,
) -> Result<Json<GroupChat>, (StatusCode, String)> {
    let pool = &state.pool;

    if payload.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Group name cannot be empty".to_string()));
    }

    if payload.name.len() > 50 {
        return Err((StatusCode::BAD_REQUEST, "Group name too long (max 50)".to_string()));
    }

    let mut tx = pool.begin().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create the group
    let group = sqlx::query_as::<_, GroupChat>(
        r#"
        WITH inserted AS (
            INSERT INTO group_chats (name, created_by)
            VALUES ($1, $2)
            RETURNING id, name, COALESCE(description, '') as description, created_by, created_at
        )
        SELECT 
            i.id, i.name, i.description, i.created_by,
            COALESCE(u.display_name, 'Unknown') as created_by_name,
            1::bigint as member_count,
            i.created_at
        FROM inserted i
        JOIN users u ON i.created_by = u.id
        "#
    )
    .bind(&payload.name)
    .bind(auth_user.user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add creator as admin
    sqlx::query(
        "INSERT INTO group_chat_members (group_id, user_id, role) VALUES ($1, $2, 'admin')"
    )
    .bind(group.id)
    .bind(auth_user.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add other members
    for username in &payload.member_usernames {
        if username.trim().is_empty() { continue; }
        if let Ok(Some(uid)) = sqlx::query_scalar::<_, uuid::Uuid>(
            "SELECT id FROM users WHERE username = $1"
        )
        .bind(username)
        .fetch_optional(&mut *tx)
        .await
        {
            if uid != auth_user.user_id {
                let _ = sqlx::query(
                    "INSERT INTO group_chat_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING"
                )
                .bind(group.id)
                .bind(uid)
                .execute(&mut *tx)
                .await;
            }
        }
    }

    tx.commit().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(group))
}

/// Get all groups the current user is a member of
pub async fn get_my_groups(
    auth_user: AuthUser,
    State(state): State<ServerState>,
) -> Json<Vec<GroupChat>> {
    let pool = &state.pool;

    let groups = sqlx::query_as::<_, GroupChat>(
        r#"
        SELECT 
            g.id, g.name, COALESCE(g.description, '') as description, g.created_by,
            COALESCE(u.display_name, 'Unknown') as created_by_name,
            (SELECT COUNT(*) FROM group_chat_members gm WHERE gm.group_id = g.id) as member_count,
            g.created_at
        FROM group_chats g
        JOIN group_chat_members m ON m.group_id = g.id
        JOIN users u ON g.created_by = u.id
        WHERE m.user_id = $1
        ORDER BY g.created_at DESC
        "#
    )
    .bind(auth_user.user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    Json(groups)
}

/// Get members of a group
pub async fn get_group_members(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(group_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<GroupMember>>, (StatusCode, String)> {
    let pool = &state.pool;

    // Verify membership
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM group_chat_members WHERE group_id = $1 AND user_id = $2)"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !is_member {
        return Err((StatusCode::FORBIDDEN, "Not a member of this group".to_string()));
    }

    let members = sqlx::query_as::<_, GroupMember>(
        r#"
        SELECT 
            u.id as user_id, u.username, u.display_name,
            gm.role, gm.joined_at
        FROM group_chat_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = $1
        ORDER BY 
            CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END,
            gm.joined_at ASC
        "#
    )
    .bind(group_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(members))
}

/// Add a member to the group
pub async fn add_group_member(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(group_id): Path<uuid::Uuid>,
    Json(payload): Json<AddMemberRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Check admin
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM group_chat_members WHERE group_id = $1 AND user_id = $2"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if role.as_deref() != Some("admin") {
        return Err((StatusCode::FORBIDDEN, "Only admins can add members".to_string()));
    }

    let new_user_id: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE username = $1"
    )
    .bind(&payload.username)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match new_user_id {
        Some(uid) => {
            sqlx::query(
                "INSERT INTO group_chat_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING"
            )
            .bind(group_id)
            .bind(uid)
            .execute(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::json!({"status": "added"})))
        }
        None => Err((StatusCode::NOT_FOUND, "User not found".to_string())),
    }
}

/// Remove a member from the group (admin only)
pub async fn remove_group_member(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path((group_id, user_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM group_chat_members WHERE group_id = $1 AND user_id = $2"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if role.as_deref() != Some("admin") {
        return Err((StatusCode::FORBIDDEN, "Only admins can remove members".to_string()));
    }

    if user_id == auth_user.user_id {
        return Err((StatusCode::BAD_REQUEST, "Cannot remove yourself".to_string()));
    }

    // Check target is not an admin
    let target_role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM group_chat_members WHERE group_id = $1 AND user_id = $2"
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if target_role.as_deref() == Some("admin") {
        return Err((StatusCode::BAD_REQUEST, "Cannot remove another admin".to_string()));
    }

    sqlx::query("DELETE FROM group_chat_members WHERE group_id = $1 AND user_id = $2")
        .bind(group_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "removed"})))
}

/// Promote a member to admin
pub async fn promote_to_admin(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path((group_id, user_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM group_chat_members WHERE group_id = $1 AND user_id = $2"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if role.as_deref() != Some("admin") {
        return Err((StatusCode::FORBIDDEN, "Only admins can promote members".to_string()));
    }

    if user_id == auth_user.user_id {
        return Err((StatusCode::BAD_REQUEST, "Cannot promote yourself".to_string()));
    }

    sqlx::query("UPDATE group_chat_members SET role = 'admin' WHERE group_id = $1 AND user_id = $2")
        .bind(group_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "promoted"})))
}

/// Send a message to a group
pub async fn send_group_message(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(group_id): Path<uuid::Uuid>,
    Json(payload): Json<SendGroupMessageRequest>,
) -> Result<Json<GroupChatMessage>, (StatusCode, String)> {
    let pool = &state.pool;

    if payload.content.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Message cannot be empty".to_string()));
    }

    // Verify membership
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM group_chat_members WHERE group_id = $1 AND user_id = $2)"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !is_member {
        return Err((StatusCode::FORBIDDEN, "Not a member of this group".to_string()));
    }

    let msg = sqlx::query_as::<_, GroupChatMessage>(
        r#"
        WITH inserted AS (
            INSERT INTO group_chat_messages (group_id, user_id, content)
            VALUES ($1, $2, $3)
            RETURNING id, group_id, user_id, content, created_at
        )
        SELECT 
            i.id, i.group_id, i.user_id, i.content,
            u.username as author_name,
            COALESCE(u.display_name, u.username) as display_name,
            i.created_at
        FROM inserted i
        JOIN users u ON i.user_id = u.id
        "#
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .bind(&payload.content)
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Broadcast real-time event to all connected clients
    let ws_event = crate::ws::GameEvent::GroupChatMessage {
        id: msg.id.to_string(),
        group_id: msg.group_id.to_string(),
        user_id: msg.user_id.to_string(),
        author_name: msg.author_name.clone(),
        display_name: msg.display_name.clone(),
        content: msg.content.clone(),
        created_at: msg.created_at.to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&ws_event) {
        let _ = state.ws_state.tx.send(json);
    }

    Ok(Json(msg))
}

#[derive(Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Get a single group's details (including description)
pub async fn get_group(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(group_id): Path<uuid::Uuid>,
) -> Result<Json<GroupChat>, (StatusCode, String)> {
    let pool = &state.pool;

    // Verify membership
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM group_chat_members WHERE group_id = $1 AND user_id = $2)"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !is_member {
        return Err((StatusCode::FORBIDDEN, "Not a member of this group".to_string()));
    }

    let group = sqlx::query_as::<_, GroupChat>(
        r#"
        SELECT 
            g.id, g.name, COALESCE(g.description, '') as description, g.created_by,
            COALESCE(u.display_name, 'Unknown') as created_by_name,
            (SELECT COUNT(*) FROM group_chat_members gm WHERE gm.group_id = g.id) as member_count,
            g.created_at
        FROM group_chats g
        JOIN users u ON g.created_by = u.id
        WHERE g.id = $1
        "#
    )
    .bind(group_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Group not found".to_string()))?;

    Ok(Json(group))
}

/// Update group name and/or description (admin only)
pub async fn update_group(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(group_id): Path<uuid::Uuid>,
    Json(payload): Json<UpdateGroupRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = &state.pool;

    // Check admin
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM group_chat_members WHERE group_id = $1 AND user_id = $2"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .flatten();

    if role.as_deref() != Some("admin") {
        return Err((StatusCode::FORBIDDEN, "Only admins can update the group".to_string()));
    }

    // Build dynamic UPDATE query with parameterized binds
    let mut set_clauses = Vec::new();
    let mut bind_idx = 2;

    if let Some(ref name) = payload.name {
        if name.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Group name cannot be empty".to_string()));
        }
        if name.len() > 50 {
            return Err((StatusCode::BAD_REQUEST, "Group name too long (max 50)".to_string()));
        }
        set_clauses.push(format!("name = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(ref description) = payload.description {
        if description.len() > 500 {
            return Err((StatusCode::BAD_REQUEST, "Description too long (max 500)".to_string()));
        }
        set_clauses.push(format!("description = ${}", bind_idx));
        bind_idx += 1;
    }

    if set_clauses.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No fields to update".to_string()));
    }

    let query_str = format!(
        "UPDATE group_chats SET {} WHERE id = $1",
        set_clauses.join(", ")
    );

    let mut query = sqlx::query(&query_str).bind(group_id);

    if let Some(ref name) = payload.name {
        query = query.bind(name);
    }
    if let Some(ref description) = payload.description {
        query = query.bind(description);
    }

    query
        .execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Return updated group
    let group = sqlx::query_as::<_, GroupChat>(
        r#"
        SELECT 
            g.id, g.name, COALESCE(g.description, '') as description, g.created_by,
            COALESCE(u.display_name, 'Unknown') as created_by_name,
            (SELECT COUNT(*) FROM group_chat_members gm WHERE gm.group_id = g.id) as member_count,
            g.created_at
        FROM group_chats g
        JOIN users u ON g.created_by = u.id
        WHERE g.id = $1
        "#
    )
    .bind(group_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match group {
        Some(g) => Ok(Json(serde_json::json!({
            "status": "updated",
            "group": {
                "id": g.id,
                "name": g.name,
                "created_by": g.created_by,
                "created_by_name": g.created_by_name,
                "member_count": g.member_count,
                "created_at": g.created_at,
            }
        }))),
        None => Err((StatusCode::NOT_FOUND, "Group not found".to_string())),
    }
}

/// Get messages for a group
pub async fn get_group_messages(
    auth_user: AuthUser,
    State(state): State<ServerState>,
    Path(group_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<GroupChatMessage>>, (StatusCode, String)> {
    let pool = &state.pool;

    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM group_chat_members WHERE group_id = $1 AND user_id = $2)"
    )
    .bind(group_id)
    .bind(auth_user.user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !is_member {
        return Err((StatusCode::FORBIDDEN, "Not a member of this group".to_string()));
    }

    let messages = sqlx::query_as::<_, GroupChatMessage>(
        r#"
        SELECT 
            m.id, m.group_id, m.user_id, m.content,
            u.username as author_name,
            COALESCE(u.display_name, u.username) as display_name,
            m.created_at
        FROM group_chat_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.group_id = $1
        ORDER BY m.created_at ASC
        LIMIT 100
        "#
    )
    .bind(group_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(messages))
}
