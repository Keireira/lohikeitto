use axum::{
    Json,
    extract::{Query, State},
};

use crate::app::AppState;
use crate::dto::internal::ErrorResponse;
use crate::dto::search::{SearchQuery, SearchResult};
use crate::error::ApiError;
use crate::services::search as search_service;

#[utoipa::path(
    get,
    path = "/search",
    tag = "Search",
    summary = "Search services",
    description = "Search for services across local database and external APIs (Brandfetch, logo.dev). Results are deduplicated by domain with priority: local > brandfetch > logo.dev.",
    params(
        ("q" = String, Query, description = "Search string (required, non-empty)"),
        ("source" = String, Query, description = "Search source: `local`, `external`, `brandfetch`, `logodev`, or `all` (default)"),
        ("limit" = Option<u8>, Query, description = "Maximum number of results to return (1–15, default 10)"),
    ),
    responses(
        (status = 200, description = "Search results", body = [SearchResult],
            example = json!([
                {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "logo_url": "https://s3.uha.app/logos/adguard.webp",
                    "name": "AdGuard",
                    "domain": "adguard.com",
                    "source": "local"
                }
            ])
        ),
        (status = 400, description = "Invalid input (empty or missing `q`)", body = ErrorResponse),
    )
)]
pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, ApiError> {
    let q = params.q.trim();
    if q.is_empty() {
        return Err(ApiError::InvalidInput("q is required".into()));
    }

    let limit = params.safe_limit();

    let mut results =
        search_service::search(&state.db, &state.http, &state.config, q, &params.source).await;

    results.truncate(limit);

    Ok(Json(results))
}
