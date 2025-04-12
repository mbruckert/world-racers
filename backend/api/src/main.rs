mod api;
mod config;
mod db;

use anyhow::Result;
use migration::MigratorTrait;
use std::net::SocketAddr;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = config::Config::from_env()?;

    // Initialize database connections
    let state = db::init_state(&config).await?;

    // Run migrations
    migration::Migrator::up(&state.conn, None).await?;

    // Build application router
    let app = api::create_router(state);

    // Start the server
    let addr = SocketAddr::new(config.server_host.parse()?, config.server_port);

    // Set up shutdown signal
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        r.store(false, Ordering::SeqCst);
        tracing::info!("Shutdown signal received, gracefully shutting down...");
    })?;

    tracing::info!("Server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
        while running.load(Ordering::SeqCst) {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
        tracing::info!("Server shutdown complete");
    });

    server.await?;

    Ok(())
}
