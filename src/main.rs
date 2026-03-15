mod db;
mod error;
mod logo;
mod models;
mod routes;

use axum::Router;
use axum::routing::get;
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub logo_base_url: String,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let logo_base_url = std::env::var("LOGO_BASE_URL").expect("LOGO_BASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let state = AppState {
        db: pool,
        logo_base_url,
    };

    let app = Router::new()
        .route("/health", get(routes::health::health_check))
        .route("/search", get(routes::search::search))
        .route("/services/{service_id}", get(routes::services::get_service))
        .route("/init", get(routes::init::init))
        .with_state(state);

    let addr = format!("{host}:{port}");
    println!("Listening on {addr}");
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind");
    axum::serve(listener, app).await.expect("Server error");
}
