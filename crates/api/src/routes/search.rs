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
    description = "Search for services across inhouse database and external APIs (Brandfetch, logo.dev, App Store, Google Play). Results are deduplicated by domain with priority: inhouse > appstore > playstore > brandfetch > logo.dev. Inhouse (curated) services may have multiple domains; external results always have one.",
    params(
        ("q" = String, Query, description = "Search string (required, non-empty)"),
        ("sources" = String, Query, description = "Comma-separated sources: `inhouse`, `brandfetch`, `logodev`, `appstore`, `playstore`. Aliases: `external` (brandfetch + logodev + appstore + playstore), `mobile` (appstore + playstore), `all` (default)"),
    ),
    responses(
        (status = 200, description = "Search results", body = [SearchResult],
            example = json!([
                {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "logo_url": "https://s3.uha.app/logos/adguard.webp",
                    "name": "AdGuard",
                    "domains": ["adguard.com"],
                    "source": "inhouse"
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

    let results =
        search_service::search(&state.db, &state.http, &state.config, q, &params.sources).await;

    Ok(Json(results))
}
