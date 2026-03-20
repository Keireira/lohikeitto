mod health;
mod search;

use axum::{Json, Router, routing::get};
use tower_http::compression::CompressionLayer;
use utoipa::OpenApi;

use crate::app::AppState;
use crate::dto::health::HealthResponse;
use crate::dto::internal::ErrorResponse;
use crate::dto::search::SearchResult;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Lohikeitto",
        description = "Service catalog API with search, logos, and categories. Aggregates data from a local database and external brand APIs (Brandfetch, logo.dev).",
        version = "1.0.0",
        license(name = "AGPL-3.0"),
    ),
    servers(
        (url = "https://soup.uha.app", description = "Production"),
        (url = "http://localhost:3000", description = "Local development"),
    ),
    tags(
        (name = "Search", description = "Service search across local and external sources"),
        (name = "System", description = "Health checks and diagnostics"),
    ),
    paths(health::health_check, search::search),
    components(schemas(
        HealthResponse,
        ErrorResponse,
        SearchResult,
    ))
)]
struct ApiDoc;

/// Return the generated OpenAPI spec
pub fn openapi_spec() -> utoipa::openapi::OpenApi {
    ApiDoc::openapi()
}

/// Build the application router with all routes
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/search", get(search::search))
        .route("/openapi.json", get(|| async { Json(ApiDoc::openapi()) }))
        .layer(CompressionLayer::new().gzip(true).br(true))
}
