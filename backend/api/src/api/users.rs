use axum::{
    Router,
    extract::{Json, Path, State},
    http::StatusCode,
    routing::{get, post},
};
use entity::user::{self, Entity as User};
use sea_orm::{ActiveModelTrait, EntityTrait, QueryOrder, Set, prelude::DateTime};
use serde::{Deserialize, Serialize};

use crate::db::AppState;

#[derive(Deserialize)]
pub struct CreateUserRequest {
    name: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    id: i32,
    name: String,
    created_at: DateTime,
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
        .route("/users", post(create_user))
        .route("/users/:id", get(get_user))
}

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

async fn create_user(
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
