use auth::{Auth, user};
use axum::{
    Router,
    extract::{Json, State},
    http::StatusCode,
    routing::post,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::db::AppState;

// Local types for OpenAPI
#[derive(Serialize, Deserialize, ToSchema)]
pub struct RegisterRequest {
    pub name: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub token_type: String,
}

impl From<auth::AuthResponse> for AuthResponse {
    fn from(response: auth::AuthResponse) -> Self {
        Self {
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            expires_in: response.expires_in,
            token_type: response.token_type,
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/refresh", post(refresh))
}

/// Register a new user
#[utoipa::path(
    post,
    path = "/api/auth/register",
    tag = "auth",
    request_body = RegisterRequest,
    responses(
        (status = 200, description = "User registered successfully", body = AuthResponse),
        (status = 400, description = "Bad request", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Create Auth instance
    let auth = Auth::new(
        state.config.jwt_secret.clone(),
        state.config.jwt_expiry,
        state.config.refresh_expiry,
    );

    // Convert to internal type
    let req = user::RegisterRequest { name: payload.name };

    // Register user
    let result = user::register(db, &auth, req)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(result.into()))
}

/// Refresh access token
#[utoipa::path(
    post,
    path = "/api/auth/refresh",
    tag = "auth",
    request_body = RefreshRequest,
    responses(
        (status = 200, description = "Token refreshed successfully", body = AuthResponse),
        (status = 401, description = "Invalid or expired refresh token", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
async fn refresh(
    State(state): State<AppState>,
    Json(payload): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Create Auth instance
    let auth = Auth::new(
        state.config.jwt_secret.clone(),
        state.config.jwt_expiry,
        state.config.refresh_expiry,
    );

    // Convert to internal type
    let req = user::RefreshRequest {
        refresh_token: payload.refresh_token,
    };

    // Refresh token
    let result = user::refresh_token(db, &auth, req)
        .await
        .map_err(|e| match e {
            auth::AuthError::InvalidToken | auth::AuthError::RefreshTokenExpired => {
                (StatusCode::UNAUTHORIZED, e.to_string())
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    Ok(Json(result.into()))
}
