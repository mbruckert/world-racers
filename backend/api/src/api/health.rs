use crate::db::AppState;
use axum::{Json, Router, routing::get};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    status: String,
}

/// Check API health
#[utoipa::path(
    get,
    path = "/api/health",
    tag = "health",
    responses(
        (status = 200, description = "API is healthy", body = HealthResponse)
    )
)]
pub async fn check_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
    })
}

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(check_health))
}
