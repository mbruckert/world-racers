mod config;
mod db;
mod api;

use std::net::SocketAddr;
use anyhow::Result;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "api=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = config::Config::from_env()?;
    
    // Initialize database connections
    let state = db::init_state(&config).await?;
    
    // Build application router
    let app = api::create_router(state);
    
    // Start the server
    let addr = SocketAddr::new(
        config.server_host.parse()?,
        config.server_port,
    );
    
    tracing::info!("Server listening on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    
    Ok(())
}
