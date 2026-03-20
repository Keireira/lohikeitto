mod app;
mod config;
mod dto;
mod error;
mod models;
mod routes;
mod services;
mod telemetry;

use tokio::net::TcpListener;
use tracing::info;

use crate::config::Config;

#[tokio::main]
async fn main() {
    // Dump OpenAPI spec and exit
    // (used by `make openapi` to generate docs/public/openapi.json)
    if std::env::args().any(|a| a == "--openapi") {
        let spec = serde_json::to_string_pretty(&routes::openapi_spec()).unwrap();
        println!("{spec}");
        return;
    }

    dotenvy::from_filename("lohikeitto.local.env").ok();
    dotenvy::from_filename("lohikeitto.env").ok();

    shared::boot::init_tracing();

    let config = Config::from_env();

    shared::db::pool::ensure_database(&config.database_url).await;
    let pool = shared::db::pool::connect_with_retry(&config.database_url, 5).await;

    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    info!("database connected and migrations applied");

    let metrics_handle = telemetry::setup();
    tokio::spawn(telemetry::pool_monitor(pool.clone()));

    let state = app::AppState {
        db: pool,
        config: config.clone(),
        http: reqwest::Client::new(),
    };

    let app = app::build(state, metrics_handle);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr)
        .await
        .expect("failed to bind to address");

    info!(address = %listener.local_addr().unwrap(), "server is running");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shared::boot::shutdown_signal())
    .await
    .expect("failed to start server");
}
