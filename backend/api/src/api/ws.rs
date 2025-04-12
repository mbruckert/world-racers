use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::ops::ControlFlow;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use tokio::sync::broadcast;

use crate::db::AppState;

// Temporary user session tracking
type UserId = String;
type UserSessions = Arc<Mutex<HashMap<UserId, broadcast::Sender<String>>>>;

#[axum::debug_handler]
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    // Process incoming messages
    while let Some(Ok(message)) = receiver.next().await {
        if let Message::Text(text) = message {
            tracing::debug!("Received message: {}", text);

            // Echo the message back (just an example)
            if sender.send(Message::Text(text.clone())).await.is_err() {
                break;
            }
        }
    }

    tracing::debug!("WebSocket connection closed");
}

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(ws_handler))
} 