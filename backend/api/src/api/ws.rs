use axum::{
    Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;

use crate::db::AppState;
use auth::Auth;
use entity::user_party::Entity as UserParty;
use entity::{party::Entity as Party, user::Entity as User};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

// Position and rotation data structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlayerState {
    user_id: i32,
    position: Position,
    rotation: Rotation,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Position {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Rotation {
    yaw: f32,
    pitch: f32,
    roll: f32,
}

// WebSocket message types
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum WsMessage {
    Connect { user_id: i32, party_id: i32 },
    NewPartyMember { user_id: i32, name: String },

    Update { state: PlayerState },
    Disconnect { user_id: i32 },
}

// Query parameters for the WebSocket connection
#[derive(Deserialize)]
struct WsQueryParams {
    token: String,
    party_id: Option<i32>,
}

#[axum::debug_handler]
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(params): Query<WsQueryParams>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // 1. Validate the JWT token
    let auth = Auth::new(
        state.config.jwt_secret.clone(),
        state.config.jwt_expiry,
        state.config.refresh_expiry,
    );

    let claims = auth.verify_token(&params.token).map_err(|e| {
        (
            StatusCode::UNAUTHORIZED,
            format!("Invalid authentication token: {}", e),
        )
    })?;

    // Get the authenticated user id from the token claims
    let authenticated_user_id = claims.sub;

    // 2. If party_id is provided, verify that the user is a member of the party
    if let Some(party_id) = params.party_id {
        let is_member = verify_user_in_party(authenticated_user_id, party_id, &state.conn).await;
        if !is_member {
            return Err((
                StatusCode::FORBIDDEN,
                "You are not a member of this party".to_string(),
            ));
        }
    }
    // 3. Proceed with the WebSocket upgrade with the authenticated user's info
    let conn = state.conn.clone();
    let party_channels = state.party_channels.clone();
    let user_parties = state.user_parties.clone();

    Ok(ws.on_upgrade(move |socket| async move {
        handle_socket(
            socket,
            conn,
            party_channels,
            user_parties,
            authenticated_user_id,
        )
        .await
    }))
}

async fn handle_socket(
    socket: WebSocket,
    conn: sea_orm::DatabaseConnection,
    party_channels: std::sync::Arc<
        std::sync::Mutex<std::collections::HashMap<i32, tokio::sync::broadcast::Sender<String>>>,
    >,
    user_parties: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<i32, i32>>>,
    authenticated_user_id: i32,
) {
    // Split the socket
    let (mut sender, mut receiver) = socket.split();

    // Create a channel for sending messages to the websocket
    let (tx, mut rx) = mpsc::channel::<Message>(100);

    // Spawn a task to forward messages from rx to the websocket
    let send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sender.send(message).await.is_err() {
                break;
            }
        }
    });

    // To track the current user's state
    let user_id = Some(authenticated_user_id);
    let mut party_id: Option<i32> = None;
    let mut party_tx: Option<broadcast::Sender<String>> = None;
    let mut party_rx_task: Option<JoinHandle<()>> = None;

    // Process incoming messages
    while let Some(Ok(message)) = receiver.next().await {
        if let Message::Text(text) = message {
            tracing::debug!("Received message: {}", text);

            // Parse the message
            let ws_message: Result<WsMessage, _> = serde_json::from_str(&text);

            match ws_message {
                Ok(WsMessage::NewPartyMember { .. }) => {
                    // Ignore
                }
                Ok(WsMessage::Connect {
                    user_id: uid,
                    party_id: pid,
                }) => {
                    // Ensure the user_id in the Connect message matches the authenticated user
                    if uid != authenticated_user_id {
                        if tx
                            .send(Message::Text(
                                serde_json::to_string(&serde_json::json!({
                                    "error": "User ID in message does not match authenticated user"
                                }))
                                .unwrap()
                                .into(),
                            ))
                            .await
                            .is_err()
                        {
                            tracing::error!("Error sending error message");
                        }
                        continue;
                    }

                    party_id = Some(pid);

                    // Verify that user is a member of the party
                    if verify_user_in_party(uid, pid, &conn).await {
                        // Register the user to the party
                        {
                            let mut user_parties_lock = user_parties.lock().unwrap();
                            user_parties_lock.insert(uid, pid);
                        }

                        // Get or create the broadcast channel for this party
                        {
                            let mut party_channels_lock = party_channels.lock().unwrap();
                            party_channels_lock.entry(pid).or_insert_with(|| {
                                let (new_tx, _) = broadcast::channel(100);
                                new_tx
                            });

                            party_tx = Some(party_channels_lock.get(&pid).unwrap().clone());
                        }

                        // Notify other party members of the new connection
                        if let Some(channel) = &party_tx {
                            // Get the User name
                            let user = User::find_by_id(uid).one(&conn).await.unwrap();
                            let name = user.unwrap().name;

                            let connect_msg = serde_json::to_string(&WsMessage::NewPartyMember {
                                user_id: uid,
                                name,
                            })
                            .unwrap();

                            let _ = channel.send(connect_msg);
                        }

                        tracing::info!("User {} connected to party {}", uid, pid);

                        // Set up a receiver to listen for party updates
                        if let Some(channel) = &party_tx {
                            let mut party_rx = channel.subscribe();
                            let tx_clone = tx.clone();

                            // Spawn a task to listen for party broadcasts and forward to the client
                            party_rx_task = Some(tokio::spawn(async move {
                                while let Ok(msg) = party_rx.recv().await {
                                    if tx_clone.send(Message::Text(msg.into())).await.is_err() {
                                        break;
                                    }
                                }
                            }));
                        }
                    } else {
                        // Send error message
                        let error_msg = serde_json::to_string(&serde_json::json!({
                            "error": "You are not a member of this party"
                        }))
                        .unwrap();

                        if tx.send(Message::Text(error_msg.into())).await.is_err() {
                            tracing::error!("Error sending error message");
                        }
                        break;
                    }
                }
                Ok(WsMessage::Update {
                    state: player_state,
                }) => {
                    // Make sure user is connected to a party
                    if user_id.is_none() || party_id.is_none() || party_tx.is_none() {
                        continue;
                    }

                    // Verify the user ID in the message matches the authenticated user
                    if user_id.unwrap() != player_state.user_id {
                        continue;
                    }

                    // Broadcast the update to all members of the party
                    if let Some(channel) = &party_tx {
                        let message_str = serde_json::to_string(&WsMessage::Update {
                            state: player_state,
                        })
                        .unwrap();

                        if let Err(e) = channel.send(message_str) {
                            tracing::error!("Error broadcasting message: {}", e);
                        }
                    }
                }
                Ok(WsMessage::Disconnect { user_id: uid }) => {
                    if let Some(id) = user_id {
                        if id == uid {
                            // Remove user from party tracking
                            {
                                if let Ok(mut user_parties_lock) = user_parties.try_lock() {
                                    user_parties_lock.remove(&id);
                                }
                            }
                            break;
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to parse websocket message: {}", e);
                }
            }
        }
    }

    // Clean up when user disconnects
    if let Some(uid) = user_id {
        {
            if let Ok(mut user_parties_lock) = user_parties.try_lock() {
                user_parties_lock.remove(&uid);
            }
        }

        if let Some(pid) = party_id {
            if let Some(channel) = &party_tx {
                // Notify others of disconnection
                let disconnect_msg =
                    serde_json::to_string(&WsMessage::Disconnect { user_id: uid }).unwrap();

                let _ = channel.send(disconnect_msg);

                // Clean up empty party channels
                {
                    let party_channels_lock = party_channels.lock().unwrap();
                    if let Some(ch) = party_channels_lock.get(&pid) {
                        if ch.receiver_count() == 0 {
                            drop(party_channels_lock);
                            let mut party_channels_lock = party_channels.lock().unwrap();
                            party_channels_lock.remove(&pid);
                        }
                    }
                }
            }
        }
    }

    // Cancel our party rx task if it exists
    if let Some(task) = party_rx_task {
        task.abort();
    }

    // Cancel our send task
    send_task.abort();

    tracing::debug!("WebSocket connection closed");
}

// Helper function to verify a user is in a party
async fn verify_user_in_party(
    user_id: i32,
    party_id: i32,
    conn: &sea_orm::DatabaseConnection,
) -> bool {
    // Check if party exists first
    match Party::find_by_id(party_id).one(conn).await {
        Ok(Some(_)) => {
            // Now check if user is in the party
            matches!(
                UserParty::find()
                    .filter(entity::user_party::Column::UserId.eq(user_id))
                    .filter(entity::user_party::Column::PartyId.eq(party_id))
                    .one(conn)
                    .await,
                Ok(Some(_))
            )
        }
        _ => false,
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ws", get(ws_handler))
        .route("/ws/docs", get(ws_documentation))
}

#[axum::debug_handler]
async fn ws_documentation() -> impl IntoResponse {
    let docs = r#"
    WebSocket Connection Documentation:
    
    To connect to the WebSocket, you need to provide:
    1. A valid JWT token in the 'token' query parameter
    2. Optionally, a party_id parameter if you want to pre-validate party membership
    
    Example URL: ws://your-server.com/api/ws?token=your.jwt.token&party_id=123
    
    Message Format:
    All messages use JSON format with a "type" field determining the message type.
    
    1. Connect to a party:
    {
        "type": "Connect",
        "user_id": 42,
        "party_id": 123
    }
    
    2. Send position update:
    {
        "type": "Update",
        "state": {
            "user_id": 42,
            "position": {
                "x": 10.5,
                "y": 20.0,
                "z": 30.2
            },
            "rotation": {
                "yaw": 45.0,
                "pitch": 0.0,
                "roll": 0.0
            }
        }
    }
    
    3. Disconnect:
    {
        "type": "Disconnect",
        "user_id": 42
    }
    
    Authentication:
    - You must provide a valid JWT token as a query parameter
    - Your user_id in messages must match the authenticated user ID from the token
    - You must be a member of a party to send/receive updates within that party
    "#;

    docs
}
