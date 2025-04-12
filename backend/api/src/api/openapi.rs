use axum::Router;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use super::{health, maps, parties, users};
use crate::db::AppState;

#[derive(OpenApi)]
#[openapi(
    paths(
        // Health endpoints
        health::check_health,
        // User endpoints
        users::list_users,
        users::get_user,
        users::register_user,
        // Maps endpoints
        maps::list_maps,
        maps::get_map,
        maps::create_map,
        maps::delete_map,
        maps::get_checkpoints,
        maps::get_map_with_checkpoints,
        // Parties endpoints
        parties::list_parties,
        parties::get_party,
        parties::create_party,
        parties::join_party,
        parties::get_party_members,
        parties::update_party,
        parties::delete_party,
        parties::leave_party
    ),
    components(
        schemas(
            // Health schemas
            health::HealthResponse,
            // User schemas
            users::CreateUserRequest,
            users::UserResponse,
            // Map schemas
            maps::CreateMapRequest,
            maps::UpdateMapRequest,
            maps::MapResponse,
            maps::CheckpointData,
            maps::CheckpointResponse,
            maps::MapWithCheckpointsResponse,
            // Party schemas
            parties::CreatePartyRequest,
            parties::PartyResponse,
            parties::JoinPartyRequest,
            parties::UpdatePartyRequest
        )
    ),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "users", description = "User management endpoints"),
        (name = "maps", description = "Map management endpoints"),
        (name = "parties", description = "Party management endpoints")
    ),
    info(
        title = "World Racers API",
        version = "1.0.0",
        description = "API for World Racers game"
    )
)]
pub struct ApiDoc;

pub fn swagger_ui() -> Router<AppState> {
    let api_doc = ApiDoc::openapi();

    Router::new().merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", api_doc))
}
