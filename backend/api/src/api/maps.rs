use axum::{
    Router,
    extract::{Json, Path, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use entity::checkpoint::{self, Entity as Checkpoint};
use entity::map::{self, Entity as Map};
use entity::user::Entity as User;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait, prelude::*,
};
use serde::{Deserialize, Serialize};

use crate::db::AppState;

#[derive(Deserialize)]
pub struct CheckpointData {
    latitude: f32,
    longitude: f32,
    position: i32,
}

#[derive(Deserialize)]
pub struct CreateMapRequest {
    title: String,
    description: String,
    author_id: i32,
    start_latitude: f32,
    start_longitude: f32,
    end_latitude: f32,
    end_longitude: f32,
    checkpoints: Vec<CheckpointData>,
}

#[derive(Serialize)]
pub struct MapResponse {
    id: i32,
    title: String,
    description: String,
    created_at: DateTimeWithTimeZone,
    author_id: i32,
    start_latitude: f32,
    start_longitude: f32,
    end_latitude: f32,
    end_longitude: f32,
    checkpoint_count: i32,
}

impl From<map::Model> for MapResponse {
    fn from(map: map::Model) -> Self {
        Self {
            id: map.id,
            title: map.title,
            description: map.description,
            created_at: map.created_at,
            author_id: map.author_id,
            start_latitude: map.start_latitude,
            start_longitude: map.start_longitude,
            end_latitude: map.end_latitude,
            end_longitude: map.end_longitude,
            checkpoint_count: map.checkpoint_count,
        }
    }
}

#[derive(Serialize)]
pub struct CheckpointResponse {
    id: i32,
    map_id: i32,
    latitude: f32,
    longitude: f32,
    position: i32,
}

impl From<checkpoint::Model> for CheckpointResponse {
    fn from(checkpoint: checkpoint::Model) -> Self {
        Self {
            id: checkpoint.id,
            map_id: checkpoint.map_id,
            latitude: checkpoint.latitude,
            longitude: checkpoint.longitude,
            position: checkpoint.position,
        }
    }
}

#[derive(Serialize)]
pub struct MapWithCheckpointsResponse {
    map: MapResponse,
    checkpoints: Vec<CheckpointResponse>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/maps", get(list_maps))
        .route("/maps", post(create_map))
        .route("/maps/:id", get(get_map))
        .route("/maps/:id", delete(delete_map))
        .route("/maps/:id/checkpoints", get(get_checkpoints))
        .route("/maps/:id/details", get(get_map_with_checkpoints))
}

async fn list_maps(
    State(state): State<AppState>,
) -> Result<Json<Vec<MapResponse>>, (StatusCode, String)> {
    let db = &state.conn;

    let maps = Map::find()
        .order_by_asc(map::Column::Id)
        .all(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(maps.into_iter().map(MapResponse::from).collect()))
}

async fn get_map(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<MapResponse>, (StatusCode, String)> {
    let db = &state.conn;

    let map = Map::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Map with id {} not found", id),
        ))?;

    Ok(Json(map.into()))
}

async fn get_map_with_checkpoints(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<MapWithCheckpointsResponse>, (StatusCode, String)> {
    let db: &DatabaseConnection = &state.conn;

    let map = Map::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Map with id {} not found", id),
        ))?;

    let checkpoints = Checkpoint::find()
        .filter(checkpoint::Column::MapId.eq(id))
        .order_by_asc(checkpoint::Column::Position)
        .all(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response = MapWithCheckpointsResponse {
        map: map.into(),
        checkpoints: checkpoints
            .into_iter()
            .map(CheckpointResponse::from)
            .collect(),
    };

    Ok(Json(response))
}

async fn create_map(
    State(state): State<AppState>,
    Json(payload): Json<CreateMapRequest>,
) -> Result<Json<MapWithCheckpointsResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Verify author exists
    let _author = User::find_by_id(payload.author_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::BAD_REQUEST,
            format!("User with id {} not found", payload.author_id),
        ))?;

    // Start a transaction
    let txn = db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create the map
    let new_map = map::ActiveModel {
        title: Set(payload.title),
        description: Set(payload.description),
        author_id: Set(payload.author_id),
        start_latitude: Set(payload.start_latitude),
        start_longitude: Set(payload.start_longitude),
        end_latitude: Set(payload.end_latitude),
        end_longitude: Set(payload.end_longitude),
        checkpoint_count: Set(payload.checkpoints.len() as i32),
        ..Default::default()
    };

    let map = new_map
        .insert(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create checkpoints
    let mut checkpoints = Vec::new();

    for checkpoint_data in payload.checkpoints {
        let new_checkpoint = checkpoint::ActiveModel {
            map_id: Set(map.id),
            latitude: Set(checkpoint_data.latitude),
            longitude: Set(checkpoint_data.longitude),
            position: Set(checkpoint_data.position),
            ..Default::default()
        };

        let checkpoint = new_checkpoint
            .insert(&txn)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        checkpoints.push(checkpoint);
    }

    // Commit transaction
    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create response
    let response = MapWithCheckpointsResponse {
        map: map.into(),
        checkpoints: checkpoints
            .into_iter()
            .map(CheckpointResponse::from)
            .collect(),
    };

    Ok(Json(response))
}

async fn delete_map(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    let db = &state.conn;

    // Check if map exists
    let _map = Map::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Map with id {} not found", id),
        ))?;

    // Start a transaction
    let txn = db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Delete all checkpoints first
    Checkpoint::delete_many()
        .filter(checkpoint::Column::MapId.eq(id))
        .exec(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Then delete the map
    Map::delete_by_id(id)
        .exec(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Commit the transaction
    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

async fn get_checkpoints(
    State(state): State<AppState>,
    Path(map_id): Path<i32>,
) -> Result<Json<Vec<CheckpointResponse>>, (StatusCode, String)> {
    let db = &state.conn;

    // First check if map exists
    let _ = Map::find_by_id(map_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Map with id {} not found", map_id),
        ))?;

    // Get all checkpoints for this map
    let checkpoints = Checkpoint::find()
        .filter(checkpoint::Column::MapId.eq(map_id))
        .order_by_asc(checkpoint::Column::Position)
        .all(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(
        checkpoints
            .into_iter()
            .map(CheckpointResponse::from)
            .collect(),
    ))
}
