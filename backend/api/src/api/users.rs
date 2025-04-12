use axum::{
    Router,
    extract::{Json, Path, State},
    http::StatusCode,
    routing::{get, post},
};
use entity::user::{self, Entity as User};
use sea_orm::{ActiveModelTrait, EntityTrait, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::db::AppState;

#[derive(Deserialize, ToSchema)]
pub struct CreateUserRequest {
    name: String,
}

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
    Router::new()
        .route("/users", get(list_users))
        .route("/users", post(register_user))
        .route("/users/{id}", get(get_user))
}

/// List all users
#[utoipa::path(
    get,
    path = "/api/users",
    tag = "users",
    responses(
        (status = 200, description = "List of users retrieved successfully", body = Vec<UserResponse>),
        (status = 500, description = "Internal server error", body = String)
    )
)]
async fn list_users(
    State(state): State<AppState>,
) -> Result<Json<Vec<UserResponse>>, (StatusCode, String)> {
    let db = &state.conn;

    let users = User::find()
        .order_by_asc(user::Column::Id)
        .all(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(users.into_iter().map(UserResponse::from).collect()))
}

/// Get a user by id
#[utoipa::path(
    get,
    path = "/api/users/{id}",
    tag = "users",
    params(
        ("id" = i32, Path, description = "User id")
    ),
    responses(
        (status = 200, description = "User found", body = UserResponse),
        (status = 404, description = "User not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<UserResponse>, (StatusCode, String)> {
    let db = &state.conn;

    let user = User::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("User with id {} not found", id),
        ))?;

    Ok(Json(user.into()))
}

/// Create a new user
#[utoipa::path(
    post,
    path = "/api/users",
    tag = "users",
    request_body = CreateUserRequest,
    responses(
        (status = 200, description = "User created successfully", body = UserResponse),
        (status = 500, description = "Internal server error", body = String)
    )
)]
async fn register_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> Result<Json<UserResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Using current_timestamp database function
    let new_user = user::ActiveModel {
        name: Set(payload.name),
        ..Default::default()
    };

    let user = new_user
        .insert(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(user.into()))
}
