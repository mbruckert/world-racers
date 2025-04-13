mod auth;
mod health;
mod maps;
mod openapi;
mod parties;
mod users;
mod ws;

use axum::body::{Body, Bytes};
use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::{Router, middleware};
use http_body_util::BodyExt;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

use crate::db::AppState;

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
        .nest("/api", ws::router());

    // Combine public and protected routes
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(middleware::from_fn(print_request_response))
        .layer(cors)
        .layer(trace_layer)
        .with_state(state)
}

async fn print_request_response(
    req: Request,
    next: Next,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (parts, body) = req.into_parts();
    let bytes = buffer_and_print("request", body).await?;
    let req = Request::from_parts(parts, Body::from(bytes));

    let res = next.run(req).await;

    let (parts, body) = res.into_parts();
    let bytes = buffer_and_print("response", body).await?;
    let res = Response::from_parts(parts, Body::from(bytes));

    Ok(res)
}

async fn buffer_and_print<B>(direction: &str, body: B) -> Result<Bytes, (StatusCode, String)>
where
    B: axum::body::HttpBody<Data = Bytes>,
    B::Error: std::fmt::Display,
{
    let bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(err) => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("failed to read {direction} body: {err}"),
            ));
        }
    };

    if let Ok(body) = std::str::from_utf8(&bytes) {
        tracing::debug!("{direction} body = {body:?}");
    }

    Ok(bytes)
}
