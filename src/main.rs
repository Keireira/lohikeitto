mod app;
mod config;
mod db;
mod dto;
mod error;
mod logo;
mod models;
mod routes;
mod s3;
mod services;

use std::time::Duration;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    init_tracing();

    let config = config::Config::from_env().expect("Failed to load config");

    let pool = db::pool::create_pool(&config.database_url)
        .await
        .expect("Failed to create DB pool");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let bucket = s3::client::create_bucket(&config).expect("Failed to create S3 bucket");

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("Failed to create HTTP client");

    let state = app::AppState {
        db: pool.clone(),
        http,
        bucket,
        logo_base_url: config.logo_base_url,
        brandfetch_client_id: config.brandfetch_client_id,
        logodev_token: config.logodev_token,
        admin_token: config.admin_token,
    };

    let router = app::create_router(state, &config.cors_origin);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("listening on {addr}");

    let listener = TcpListener::bind(&addr).await.expect("Failed to bind");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");

    pool.close().await;
    tracing::info!("shutdown complete");
}

fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn,sqlx::postgres::connection=error,tower_http=debug"));

    let json_logs = std::env::var("LOG_JSON").is_ok();

    if json_logs {
        fmt()
            .with_env_filter(filter)
            .with_target(false)
            .json()
            .init();
    } else {
        fmt()
            .with_env_filter(filter)
            .with_target(false)
            .with_timer(fmt::time::ChronoLocal::new("%H:%M:%S".to_string()))
            .init();
    }
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to listen for ctrl+c");
    tracing::info!("shutdown signal received");
}
