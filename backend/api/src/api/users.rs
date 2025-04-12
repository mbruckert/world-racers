use auth::Auth;
use axum::{
    Router,
    extract::{Json, State},
    http::{Request, StatusCode, header},
    routing::get,
};
use entity::user::{self, Entity as User};
use sea_orm::EntityTrait;
use serde::Serialize;
use utoipa::ToSchema;

use crate::db::AppState;

#[derive(Serialize, ToSchema)]
pub struct UserResponse {
    id: i32,
    name: String,
    created_at: chrono::DateTime<chrono::FixedOffset>,
}

impl From<user::Model> for UserResponse {
    fn from(user: user::Model) -> Self {
        Self {
            id: user.id,
            name: user.name,
            created_at: user.created_at,
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/users/me", get(me))
}

/// Get current authenticated user info
#[utoipa::path(
    get,
    path = "/api/users/me",
    tag = "users",
    responses(
        (status = 200, description = "Current user info retrieved successfully", body = UserResponse),
        (status = 401, description = "Unauthorized", body = String),
        (status = 404, description = "User not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
async fn me(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
) -> Result<Json<UserResponse>, (StatusCode, String)> {
    // Extract and validate the JWT token
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer ").map(|s| s.to_owned()))
        .ok_or((
            StatusCode::UNAUTHORIZED,
            "No authorization token provided".to_string(),
        ))?;

    // Create auth instance
    let auth = Auth::new(
        state.config.jwt_secret.clone(),
        state.config.jwt_expiry,
        state.config.refresh_expiry,
    );

    // Validate the token
    let claims = auth.verify_token(&auth_header).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            "Invalid authorization token".to_string(),
        )
    })?;

    // Get user from database
    let db = &state.conn;
    let user_id = claims.sub;

    let user = User::find_by_id(user_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("User with id {} not found", user_id),
        ))?;

    Ok(Json(user.into()))
}
