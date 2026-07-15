use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Response,
    Json,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::Mutex;

pub struct AppState {
    pub tx: broadcast::Sender<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum GameEvent {
    ChatMessage {
        author: String,
        faction: Option<String>,
        msg: String,
        channel_type: String,
        channel_id: Option<String>,
    },
    NewPost {
        author: String,
        content: String,
    },
    TerritoryAttacked {
        territory_name: String,
        attacker_faction: Option<String>,
        damage: i32,
    },
    TerritoryCaptured {
        territory_name: String,
        new_faction: Option<String>,
    },
    /// User-specific notification — used to signal new DMs, mentions, etc.
    /// The client filters by `target_username` to avoid spamming all users.
    Notification {
        from: Option<String>,
        target_username: String,
    },
    /// Real-time typing indicator for DMs.
    /// Sent by the typing user, relayed to everyone; clients filter by `target_username`.
    TypingIndicator {
        from_username: String,
        target_username: String,
        is_typing: bool,
    },
    /// Real-time direct message — sent so the recipient sees the message instantly.
    NewDirectMessage {
        sender_id: String,
        sender_username: String,
        receiver_username: String,
        content: String,
        reply_to_content: Option<String>,
        created_at: String,
    },
    /// Real-time DM reaction update.
    DmReaction {
        message_id: String,
    },
    /// Raid planned event.
    RaidPlanned {
        faction_name: String,
        target_territory: String,
        planner_name: String,
        influence_committed: i32,
    },
    /// Raid joined event.
    RaidJoined {
        faction_name: String,
        target_territory: String,
        joiner_name: String,
        influence_committed: i32,
    },
    /// Raid executed event.
    RaidExecuted {
        faction_name: String,
        target_territory: String,
        total_influence: i32,
        captured: bool,
    },
    /// Real-time group chat message.
    GroupChatMessage {
        id: String,
        group_id: String,
        user_id: String,
        author_name: String,
        display_name: String,
        content: String,
        created_at: String,
    },
}

// ─── P2P Signaling ───
// Dedicated WebSocket for WebRTC peer-to-peer signaling.
// Clients connect here to exchange offers, answers, and ICE candidates.

/// Map of username → sender for P2P signaling routing
static P2P_CLIENTS: once_cell::sync::Lazy<Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<String>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

/// Returns the list of currently online (P2P-connected) usernames
pub async fn get_online_users() -> Json<Vec<String>> {
    let clients = P2P_CLIENTS.lock().await;
    Json(clients.keys().cloned().collect())
}

pub async fn p2p_ws_handler(
    ws: WebSocketUpgrade,
    _state: State<crate::ServerState>,
) -> Response {
    ws.on_upgrade(|socket| handle_p2p_socket(socket))
}

async fn handle_p2p_socket(socket: WebSocket) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let username_state = Arc::new(Mutex::new(None::<String>));
    let username_state_clone = username_state.clone();

    // Forward messages from the channel to the WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Receive messages from this client and route them
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                let msg_type = data["type"].as_str().unwrap_or("");
                let from = data["from"].as_str().unwrap_or("");
                let to = data["to"].as_str().unwrap_or("");

                // Register this user and their sender channel on first message
                if !from.is_empty() {
                    let mut state = username_state_clone.lock().await;
                    if state.is_none() {
                        *state = Some(from.to_string());
                        let mut clients = P2P_CLIENTS.lock().await;
                        clients.insert(from.to_string(), tx.clone());
                        // Signal to other connected peers that we're available
                        for (username, target_tx) in clients.iter() {
                            if username != &from {
                                if let Ok(json) = serde_json::to_string(&serde_json::json!({
                                    "type": "p2p-peer-available",
                                    "from": from,
                                })) {
                                    let _ = target_tx.send(json);
                                }
                            }
                        }
                    }
                }

                // Route P2P signaling messages to the target peer
                if !to.is_empty() {
                    let clients = P2P_CLIENTS.lock().await;
                    if let Some(target_tx) = clients.get(to) {
                        let _ = target_tx.send(text.clone());
                    }
                }

                // Handle connection requests
                if msg_type == "p2p-request-connect" && !to.is_empty() {
                    let clients = P2P_CLIENTS.lock().await;
                    if let Some(target_tx) = clients.get(to) {
                        if let Ok(json) = serde_json::to_string(&serde_json::json!({
                            "type": "p2p-peer-available",
                            "from": from,
                        })) {
                            let _ = target_tx.send(json);
                        }
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // Clean up on disconnect
    let username = username_state.lock().await.take();
    if let Some(ref u) = username {
        let mut clients = P2P_CLIENTS.lock().await;
        clients.remove(u);
        for (_, target_tx) in clients.iter() {
            if let Ok(json) = serde_json::to_string(&serde_json::json!({
                "type": "p2p-peer-disconnected",
                "from": u,
            })) {
                let _ = target_tx.send(json);
            }
        }
    }
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<crate::ServerState>,
) -> Response {
    let ws_state = state.ws_state.clone();
    ws.on_upgrade(|socket| handle_socket(socket, ws_state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    
    let mut rx = state.tx.subscribe();

    // Spawn a task to receive messages from the broadcast channel and send them to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let tx = state.tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(event) = serde_json::from_str::<GameEvent>(&text) {
                match &event {
                    GameEvent::ChatMessage { .. } | GameEvent::TypingIndicator { .. } => {
                        let _ = tx.send(serde_json::to_string(&event).unwrap());
                    }
                    _ => {}
                }
            }
        }
    });

    // If any task exits, abort the other one
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
