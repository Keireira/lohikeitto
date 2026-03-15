use axum::extract::{Query, State};
use serde::Deserialize;

use crate::AppState;
use crate::db::services::search_services;
use crate::models::service::SearchResult;
use crate::response::{ApiError, ApiOk};
use crate::logo;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub count: Option<i64>,
    #[serde(default)]
    pub locales: Vec<String>,
}

pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<ApiOk<Vec<SearchResult>>, ApiError> {
    let q = params
        .q
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Missing required parameter: q".to_string()))?;

    let count = params.count.unwrap_or(10).clamp(1, 10);
    let locales: Vec<&str> = params.locales.iter().map(|s| s.as_str()).collect();

    let rows = search_services(&state.db, &q, count, &locales)
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    let results: Vec<SearchResult> = rows
        .into_iter()
        .map(|row| SearchResult {
            id: row.id,
            name: row.name,
            colors: row.colors,
            logo_url: logo::logo_url(&state.logo_base_url, &row.slug),
        })
        .collect();

    Ok(ApiOk(results))
}
