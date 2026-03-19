mod health;

use axum::{Json, Router, routing::get};
use tower_http::compression::CompressionLayer;
use utoipa::OpenApi;

use crate::models::health::HealthResponse;
use crate::models::internal::ErrorResponse;
use crate::app::AppState;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Lohikeitto",
        description = "Brand Meta API",
        version = "1.0.0",
    ),
    servers(
        (url = "https://soup.uha.app", description = "Production"),
        (url = "http://localhost:3000", description = "Local development"),
    ),
    paths(health::health_check),
    components(schemas(
        HealthResponse,
        ErrorResponse,
    ))
)]
struct ApiDoc;

// Return the generated OpenAPI spec
pub fn openapi_spec() -> utoipa::openapi::OpenApi {
    ApiDoc::openapi()
}

// Build the application router with all routes
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/openapi.json", get(|| async { Json(ApiDoc::openapi()) }))
        .layer(CompressionLayer::new().gzip(true).br(true))
}
