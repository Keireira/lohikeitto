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
    description = "Search for services across inhouse database and external sources (Brandfetch, logo.dev, App Store, Google Play, Web). Results are deduplicated by domain (www. stripped) with priority: inhouse > appstore > playstore > web > brandfetch > logo.dev.",
    params(
        ("q" = String, Query, description = "Search string (required, non-empty)"),
        ("sources" = String, Query, description = "Comma-separated sources: `inhouse`, `brandfetch`, `logo.dev`, `appstore`, `playstore`, `web`. Aliases: `external` (all external), `mobile` (appstore + playstore), `all` (default)"),
        ("app_store_country" = Option<String>, Query, description = "App Store country code (default: US)"),
        ("playstore_country" = Option<String>, Query, description = "Play Store country code (default: US)"),
        ("language" = Option<String>, Query, description = "Language code for store results (default: en)"),
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

    let app_store_country = params.app_store_country.unwrap_or_else(|| "US".into());
    let playstore_country = params.playstore_country.unwrap_or_else(|| "US".into());
    let language = params.language.unwrap_or_default();

    let results = search_service::search(
        &state.db,
        &state.http,
        &state.config,
        q,
        &params.sources,
        &app_store_country,
        &playstore_country,
        &language,
    )
    .await;

    Ok(Json(results))
}
