mod health;
pub mod s3;
mod services;

use axum::{Router, routing::{delete, get, post, put}};

use crate::app::AdminState;

/// Build the admin router with all routes.
pub fn router() -> Router<AdminState> {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/services", get(services::list))
        .route("/s3", get(s3::list))
        .route("/s3/info", get(s3::info))
        .route("/s3/archive", get(s3::archive_stream))
        .route("/s3/archive/{token}", get(s3::archive_download))
        .route("/s3/file/{*key}", get(s3::download_file))
        .route("/s3/delete", delete(s3::delete_objects))
        .route("/s3/copy", post(s3::copy_move))
        .route("/s3/mkdir", post(s3::mkdir))
        .route("/s3/upload/{*key}", put(s3::upload))
}
