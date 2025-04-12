use redis::Client as RedisClient;
use sea_orm::{Database, DatabaseConnection, DbErr};

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub conn: DatabaseConnection,
    pub redis: RedisClient,
    pub config: Config,
}

pub async fn init_database(config: &Config) -> Result<DatabaseConnection, DbErr> {
    tracing::info!("Connecting to database...");
    Database::connect(&config.database_url).await
}

pub fn init_redis(config: &Config) -> Result<RedisClient, redis::RedisError> {
    let redis_url = format!("redis://{}:{}", config.redis_host, config.redis_port);
    tracing::info!("Connecting to Redis at {}", redis_url);
    RedisClient::open(redis_url)
}

pub async fn init_state(config: &Config) -> anyhow::Result<AppState> {
    let conn = init_database(config).await?;
    let redis = init_redis(config)?;

    Ok(AppState {
        conn,
        redis,
        config: config.clone(),
    })
}
