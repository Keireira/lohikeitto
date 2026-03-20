use axum::Router;
use axum::extract::DefaultBodyLimit;
use s3::Bucket;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::config::Config;
use crate::routes::s3::ArchiveCache;

#[derive(Clone)]
pub struct AdminState {
    pub db: PgPool,
    pub config: Config,
    pub bucket: Arc<Bucket>,
    pub archive_cache: ArchiveCache,
}

/// Assemble the admin router.
pub fn build(state: AdminState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    crate::routes::router()
        .layer(cors)
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .with_state(state)
}
