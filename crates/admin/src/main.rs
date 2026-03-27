mod app;
mod config;
mod error;
mod routes;

use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

use crate::config::Config;

#[tokio::main]
async fn main() {
    // Env vars init
    dotenvy::from_filename("admin.local.env").ok();
    dotenvy::from_filename("admin.env").ok();
    dotenvy::from_filename("lohikeitto.local.env").ok();
    dotenvy::from_filename("lohikeitto.env").ok();

    shared::boot::init_tracing();

    let config = Config::from_env();

    // DB init
    shared::db::pool::ensure_database(&config.database_url).await;
    let pool = shared::db::pool::connect_with_retry(&config.database_url, 5).await;

    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    info!("admin: database connected and migrations applied");

    // S3 init
    let region = s3::Region::Custom {
        region: "auto".into(),
        endpoint: config.s3_endpoint.clone(),
    };
    let s3_credentials = s3::creds::Credentials::new(
        Some(&config.s3_access_key),
        Some(&config.s3_secret_key),
        None,
        None,
        None,
    )
    .expect("failed to create S3 credentials");
    let bucket = s3::Bucket::new(&config.s3_bucket, region, s3_credentials)
        .expect("failed to create S3 bucket")
        .with_path_style();

    // App init
    let state = app::AdminState {
        db: pool,
        config: config.clone(),
        bucket: Arc::new(*bucket),
        archive_cache: routes::s3::new_archive_cache(),
    };

    let app = app::build(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = TcpListener::bind(&addr)
        .await
        .expect("failed to bind to address");

    info!(address = %listener.local_addr().expect("failed to get local address"), "admin server is running");

    axum::serve(listener, app)
        .with_graceful_shutdown(shared::boot::shutdown_signal())
        .await
        .expect("failed to start admin server");
}
