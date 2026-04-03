mod database;
mod health;
mod limbus;
mod logos;
pub mod s3;
mod services;
mod vectorize;

use axum::{
    Router,
    routing::{delete, get, post, put},
};

use crate::app::AdminState;

/// Build the admin router with all routes.
pub fn router() -> Router<AdminState> {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/services", get(services::list))
        .route("/services", post(services::create))
        .route("/services/{id}", put(services::update))
        .route("/services/{id}", delete(services::delete))
        .route("/categories", get(services::list_categories))
        .route("/categories", post(services::create_category))
        .route("/categories/{slug}", put(services::update_category))
        .route("/categories/{slug}", delete(services::delete_category))
        .route("/limbus", get(limbus::list))
        .route("/limbus", post(limbus::create))
        .route("/limbus/{id}", delete(limbus::remove))
        .route("/limbus/{id}/approve", post(limbus::approve))
        .route("/s3", get(s3::list))
        .route("/s3/info", get(s3::info))
        .route("/s3/archive", get(s3::archive_stream))
        .route("/s3/archive-keys", post(s3::archive_keys_stream))
        .route("/s3/archive/{token}", get(s3::archive_download))
        .route("/s3/file/{*key}", get(s3::download_file))
        .route("/s3/delete", delete(s3::delete_objects))
        .route("/s3/copy", post(s3::copy_move))
        .route("/s3/mkdir", post(s3::mkdir))
        .route("/s3/upload/{*key}", put(s3::upload))
        .route("/s3/rename", post(s3::rename))
        .route("/logos/fetch", post(logos::fetch_logo))
        .route("/logos/save", post(logos::save_logo))
        .route("/logos/vectorize", post(vectorize::vectorize))
        .route("/logos/gradient", post(vectorize::extract_gradient))
        .route("/db/export", get(database::export_sql))
        .route("/db/drop", post(database::drop_all))
        .route("/db/import", post(database::import_sql))
}
