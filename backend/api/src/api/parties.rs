use axum::{
    Router,
    extract::{Json, Path, State},
    http::StatusCode,
    routing::{get, post},
};
use entity::party::{self, Entity as Party};
use entity::user::{self, Entity as User};
use entity::user_party::{self, Entity as UserParty};
use sea_orm::{
    prelude::DateTime, ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::AppState;

#[derive(Deserialize)]
pub struct CreatePartyRequest {
    name: String,
    owner_id: i32,
}

#[derive(Serialize)]
pub struct PartyResponse {
    id: i32,
    name: String,
    code: String,
    owner_id: i32,
    created_at: DateTime,
}

impl From<party::Model> for PartyResponse {
    fn from(party: party::Model) -> Self {
        Self {
            id: party.id,
            name: party.name,
            code: party.code,
            owner_id: party.owner_id,
            created_at: party.created_at,
        }
    }
}

#[derive(Deserialize)]
pub struct JoinPartyRequest {
    code: String,
    user_id: i32,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/parties", get(list_parties))
        .route("/parties", post(create_party))
        .route("/parties/:id", get(get_party))
        .route("/parties/:id/members", get(get_party_members))
        .route("/parties/join", post(join_party))
}

async fn list_parties(
    State(state): State<AppState>,
) -> Result<Json<Vec<PartyResponse>>, (StatusCode, String)> {
    let db = &state.conn;

    let parties = Party::find()
        .order_by_asc(party::Column::Id)
        .all(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(parties.into_iter().map(PartyResponse::from).collect()))
}

async fn get_party(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<PartyResponse>, (StatusCode, String)> {
    let db = &state.conn;

    let party = Party::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Party with id {} not found", id),
        ))?;

    Ok(Json(party.into()))
}

async fn get_party_members(
    State(state): State<AppState>,
    Path(party_id): Path<i32>,
) -> Result<Json<Vec<user::Model>>, (StatusCode, String)> {
    let db = &state.conn;

    // First verify party exists
    let _ = Party::find_by_id(party_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Party with id {} not found", party_id),
        ))?;

    // Get all users in this party via user_party relation
    let users = UserParty::find()
        .filter(user_party::Column::PartyId.eq(party_id))
        .find_with_related(User)
        .all(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .into_iter()
        .map(|(_, users)| users[0].clone())
        .collect::<Vec<user::Model>>();

    Ok(Json(users))
}

fn generate_party_code() -> String {
    // Use current timestamp and format to create a unique code
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis();

    // Format into a 6 character uppercase code
    format!("{:06X}", timestamp % 0xFFFFFF).to_uppercase()
}

async fn create_party(
    State(state): State<AppState>,
    Json(payload): Json<CreatePartyRequest>,
) -> Result<Json<PartyResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Verify owner exists
    let _owner = User::find_by_id(payload.owner_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::BAD_REQUEST,
            format!("User with id {} not found", payload.owner_id),
        ))?;

    // Generate a unique party code
    let code = generate_party_code();

    // Start a transaction
    let txn = db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create party
    let new_party = party::ActiveModel {
        name: Set(payload.name),
        code: Set(code),
        owner_id: Set(payload.owner_id),
        ..Default::default()
    };

    let party = new_party
        .insert(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add owner as a party member
    let new_user_party = user_party::ActiveModel {
        user_id: Set(payload.owner_id),
        party_id: Set(party.id),
        ..Default::default()
    };

    let _ = new_user_party
        .insert(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Commit transaction
    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(party.into()))
}

async fn join_party(
    State(state): State<AppState>,
    Json(payload): Json<JoinPartyRequest>,
) -> Result<Json<PartyResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Verify user exists
    let _ = User::find_by_id(payload.user_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::BAD_REQUEST,
            format!("User with id {} not found", payload.user_id),
        ))?;

    // Find party by code
    let party = Party::find()
        .filter(party::Column::Code.eq(payload.code))
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Invalid party code".to_string()))?;

    // Check if user is already a member
    let existing_membership = UserParty::find()
        .filter(user_party::Column::UserId.eq(payload.user_id))
        .filter(user_party::Column::PartyId.eq(party.id))
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if existing_membership.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "User is already a member of this party".to_string(),
        ));
    }

    // Add user to party
    let new_user_party = user_party::ActiveModel {
        user_id: Set(payload.user_id),
        party_id: Set(party.id),
        ..Default::default()
    };

    let _ = new_user_party
        .insert(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(party.into()))
}
