use axum::{
    routing::get,
    Json, Router,
};
use serde::Serialize;
use crate::db::AppState;

#[derive(Serialize)]
struct HealthResponse {
    status: String,
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
    })
}

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
} 