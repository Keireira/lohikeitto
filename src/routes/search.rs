use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;

use crate::AppState;
use crate::db::services::search_services;
use crate::error::ApiError;
use crate::models::service::SearchResult;
use crate::logo;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub count: Option<i64>,
    pub locale: Option<String>,
}

pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, ApiError> {
    let q = params
        .q
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Missing required parameter: q".to_string()))?;

    let count = params.count.unwrap_or(10).min(10).max(1);

    let rows = search_services(&state.db, &q, count, params.locale.as_deref())
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

    Ok(Json(results))
}
