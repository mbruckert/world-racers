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
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use utoipa::ToSchema;

use crate::db::AppState;

#[derive(Deserialize, ToSchema)]
pub struct CreatePartyRequest {
    name: String,
    owner_id: i32,
}

#[derive(Serialize, ToSchema)]
pub struct PartyResponse {
    id: i32,
    name: String,
    code: String,
    owner_id: i32,
    created_at: chrono::DateTime<chrono::FixedOffset>,
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

#[derive(Deserialize, ToSchema)]
pub struct JoinPartyRequest {
    code: String,
    user_id: i32,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdatePartyRequest {
    name: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct LeavePartyRequest {
    user_id: i32,
}

#[derive(Deserialize, ToSchema)]
pub struct DisbandPartyRequest {
    owner_id: i32,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/parties", get(list_parties))
        .route("/parties", post(create_party))
        .route("/parties/{id}", get(get_party))
        .route("/parties/{id}", post(update_party))
        .route("/parties/{id}/members", get(get_party_members))
        .route("/parties/{id}/leave", post(leave_party))
        .route("/parties/{id}/disband", post(disband_party))
        .route("/parties/join", post(join_party))
}

/// List all parties
#[utoipa::path(
    get,
    path = "/api/parties",
    tag = "parties",
    responses(
        (status = 200, description = "List of parties retrieved successfully", body = Vec<PartyResponse>),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn list_parties(
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

/// Get a party by ID
#[utoipa::path(
    get,
    path = "/api/parties/{id}",
    tag = "parties",
    params(
        ("id" = i32, Path, description = "Party ID")
    ),
    responses(
        (status = 200, description = "Party found", body = PartyResponse),
        (status = 404, description = "Party not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn get_party(
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

/// Get members of a party
#[utoipa::path(
    get,
    path = "/api/parties/{party_id}/members",
    tag = "parties",
    params(
        ("party_id" = i32, Path, description = "Party ID")
    ),
    responses(
        (status = 200, description = "Party members retrieved successfully"),
        (status = 404, description = "Party not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn get_party_members(
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

/// Create a new party
#[utoipa::path(
    post,
    path = "/api/parties",
    tag = "parties",
    request_body = CreatePartyRequest,
    responses(
        (status = 200, description = "Party created successfully", body = PartyResponse),
        (status = 400, description = "Invalid request", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn create_party(
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

/// Join an existing party
#[utoipa::path(
    post,
    path = "/api/parties/join",
    tag = "parties",
    request_body = JoinPartyRequest,
    responses(
        (status = 200, description = "Successfully joined party", body = PartyResponse),
        (status = 400, description = "Invalid request or already a member", body = String),
        (status = 404, description = "Party not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn join_party(
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

/// Update party information
#[utoipa::path(
    post,
    path = "/api/parties/{id}",
    tag = "parties",
    params(
        ("id" = i32, Path, description = "Party ID")
    ),
    request_body = UpdatePartyRequest,
    responses(
        (status = 200, description = "Party updated successfully", body = PartyResponse),
        (status = 404, description = "Party not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn update_party(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdatePartyRequest>,
) -> Result<Json<PartyResponse>, (StatusCode, String)> {
    let db = &state.conn;

    // Get the party
    let party = Party::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Party with id {} not found", id),
        ))?;

    // Update party
    let mut party_model: party::ActiveModel = party.clone().into();

    if let Some(name) = payload.name {
        party_model.name = Set(name);
    }

    let updated_party = party_model
        .update(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(updated_party.into()))
}

/// Leave a party
#[utoipa::path(
    post,
    path = "/api/parties/{party_id}/leave",
    tag = "parties",
    params(
        ("party_id" = i32, Path, description = "Party ID")
    ),
    request_body = LeavePartyRequest,
    responses(
        (status = 204, description = "Successfully left party"),
        (status = 404, description = "Party or membership not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn leave_party(
    State(state): State<AppState>,
    Path(party_id): Path<i32>,
    Json(payload): Json<LeavePartyRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let db = &state.conn;
    let user_id = payload.user_id;

    // Verify the party exists
    let party = Party::find_by_id(party_id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Party with id {} not found", party_id),
        ))?;

    // Check if user is the owner
    if party.owner_id == user_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "Party owner cannot leave the party. Delete the party instead.".to_string(),
        ));
    }

    // Find and delete the user-party relationship
    let result = UserParty::delete_many()
        .filter(user_party::Column::UserId.eq(user_id))
        .filter(user_party::Column::PartyId.eq(party_id))
        .exec(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            "User is not a member of this party".to_string(),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Disband a party (only by owner)
#[utoipa::path(
    post,
    path = "/api/parties/{id}/disband",
    tag = "parties",
    params(
        ("id" = i32, Path, description = "Party ID")
    ),
    request_body = DisbandPartyRequest,
    responses(
        (status = 204, description = "Party disbanded successfully"),
        (status = 403, description = "Only the party owner can disband it", body = String),
        (status = 404, description = "Party not found", body = String),
        (status = 500, description = "Internal server error", body = String)
    )
)]
pub async fn disband_party(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<DisbandPartyRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let db = &state.conn;

    // Verify the party exists
    let party = Party::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            format!("Party with id {} not found", id),
        ))?;

    // Verify the user is the owner
    if party.owner_id != payload.owner_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Only the party owner can disband the party".to_string(),
        ));
    }

    // Start a transaction
    let txn = db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Delete all user-party relationships
    UserParty::delete_many()
        .filter(user_party::Column::PartyId.eq(id))
        .exec(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Delete the party
    Party::delete_by_id(id)
        .exec(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Commit transaction
    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
