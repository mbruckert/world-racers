use sea_orm::{Database, DatabaseConnection, DbErr};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

use crate::config::Config;

// Define type aliases for WebSocket party tracking
pub type PartyId = i32;
pub type UserId = i32;
pub type PartyChannels = Arc<Mutex<HashMap<PartyId, broadcast::Sender<String>>>>;
pub type UserParties = Arc<Mutex<HashMap<UserId, PartyId>>>;

#[derive(Clone)]
pub struct AppState {
    pub conn: DatabaseConnection,
    pub config: Config,
    pub party_channels: PartyChannels,
    pub user_parties: UserParties,
}

pub async fn init_database(config: &Config) -> Result<DatabaseConnection, DbErr> {
    tracing::info!("Connecting to database...");
    Database::connect(&config.database_url).await
}

pub async fn init_state(config: &Config) -> anyhow::Result<AppState> {
    let conn = init_database(config).await?;

    // Initialize WebSocket party tracking
    let party_channels: PartyChannels = Arc::new(Mutex::new(HashMap::new()));
    let user_parties: UserParties = Arc::new(Mutex::new(HashMap::new()));

    Ok(AppState {
        conn,
        config: config.clone(),
        party_channels,
        user_parties,
    })
}
