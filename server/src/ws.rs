use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Response,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;
use serde::{Deserialize, Serialize};

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
