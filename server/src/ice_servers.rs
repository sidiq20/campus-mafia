use axum::Json;
use serde::Serialize;
use std::env;

#[derive(Serialize)]
pub struct IceServer {
    pub urls: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

#[derive(Serialize)]
pub struct IceServersResponse {
    pub ice_servers: Vec<IceServer>,
}

/// Returns ICE server configuration for WebRTC P2P connections.
///
/// If TURN_SERVER_URL, TURN_USERNAME, and TURN_CREDENTIAL are all set,
/// they are returned alongside the free Google STUN servers so the client
/// can negotiate NAT traversal.
///
/// Without TURN env vars, only free public STUN servers are returned,
/// which may fail for peers behind symmetric NATs.
pub async fn get_ice_servers() -> Json<IceServersResponse> {
    let mut servers = vec![
        IceServer { urls: "stun:stun.l.google.com:19302".to_string(), username: None, credential: None },
        IceServer { urls: "stun:stun1.l.google.com:19302".to_string(), username: None, credential: None },
    ];

    // Optional: TURN server for NAT traversal
    let turn_url = env::var("TURN_SERVER_URL").ok();
    let turn_user = env::var("TURN_USERNAME").ok();
    let turn_cred = env::var("TURN_CREDENTIAL").ok();

    if let (Some(url), Some(username), Some(credential)) = (turn_url, turn_user, turn_cred) {
        servers.push(IceServer {
            urls: url,
            username: Some(username),
            credential: Some(credential),
        });
    }

    Json(IceServersResponse { ice_servers: servers })
}
