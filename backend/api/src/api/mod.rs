mod auth;
mod health;
mod maps;
mod openapi;
mod parties;
mod users;
mod ws;

use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::db::AppState;

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Create router with empty state first, then add real state at the end
    Router::new()
        .nest("/api", health::router())
        .nest("/api", maps::router())
        .nest("/api", parties::router())
        .nest("/api", users::router())
        .nest("/api", ws::router())
        .nest("/api", auth::router())
        .merge(openapi::swagger_ui())
        .layer(cors)
        .with_state(state)
}
