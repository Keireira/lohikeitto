mod app;
mod config;
mod db;
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

    init_tracing();

    let config = Config::from_env();

    db::pool::ensure_database(&config.database_url).await;
    let pool = db::pool::connect_with_retry(&config.database_url, 5).await;

    sqlx::migrate!("./migrations")
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
    .with_graceful_shutdown(shutdown_signal())
    .await
    .expect("failed to start server");
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new(
            "info,sqlx=warn,sqlx::postgres::connection=error,tower_http=debug",
        )
    });

    if std::env::var("LOG_JSON").is_ok_and(|v| v == "1") {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(filter)
            .init();
    } else {
        tracing_subscriber::fmt().with_env_filter(filter).init();
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => info!("received Ctrl+C, shutting down"),
        () = terminate => info!("received SIGTERM, shutting down"),
    }
}
