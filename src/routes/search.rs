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
    params(
        ("q" = String, Query, description = "Search query"),
        ("source" = String, Query, description = "Source: local, external, or all (default)"),
        ("limit" = Option<u8>, Query, description = "Max results (1-15, default 10)"),
    ),
    responses(
        (status = 200, description = "Search results", body = [SearchResult]),
        (status = 400, description = "Invalid input", body = ErrorResponse),
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
