mod auth;
mod health;
mod maps;
mod openapi;
mod parties;
mod users;
mod ws;

use axum::{Router, middleware};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

use crate::db::AppState;
use ::auth::middleware::auth_middleware;

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Trace layer for instrumentation
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
        .on_response(trace::DefaultOnResponse::new().level(Level::INFO))
        .on_request(trace::DefaultOnRequest::new().level(Level::INFO))
        .on_failure(trace::DefaultOnFailure::new().level(Level::ERROR));

    // Public routes that don't require authentication
    let public_routes = Router::new()
        .nest("/api", health::router())
        .nest("/api", auth::router())
        .merge(openapi::swagger_ui());

    // Protected routes that require authentication
    let protected_routes = Router::new()
        .nest("/api", maps::router())
        .nest("/api", parties::router())
        .nest("/api", users::router())
        .nest("/api", ws::router())
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    // Combine public and protected routes
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(cors)
        .layer(trace_layer)
        .with_state(state)
}
