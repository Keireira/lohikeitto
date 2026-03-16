use axum::extract::{Query, State};
use axum::routing::get;
use axum::Router;

use crate::app::AppState;
use crate::db::services::search_services;
use crate::dto::service::{SearchQuery, SearchResult};
use crate::error::{ApiOk, AppError};
use crate::logo;
use crate::services::brandfetch;

pub fn routes() -> Router<AppState> {
    Router::new().route("/search", get(search))
}

async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<ApiOk<Vec<SearchResult>>, AppError> {
    let q = params
        .q
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: q".into()))?;

    if q.len() > 200 {
        return Err(AppError::BadRequest("Query too long".into()));
    }

    let count = params.count.unwrap_or(10).clamp(1, 10);
    let locales: Vec<&str> = params.locales.iter().map(|s| s.as_str()).collect();

    let rows = search_services(&state.db, &q, count, &locales).await?;

    let mut results: Vec<SearchResult> = rows
        .into_iter()
        .map(|row| {
            let url = logo::logo_url(&state.logo_base_url, &row.slug);
            SearchResult::from_row(row, url)
        })
        .collect();

    if (results.len() as i64) < count {
        let remaining = (count - results.len() as i64) as usize;
        match brandfetch::search(&state.http, &state.brandfetch_client_id, &q).await {
            Ok(entries) => {
                for entry in entries.into_iter().take(remaining) {
                    results.push(SearchResult::Brandfetch {
                        name: entry.name,
                        domain: entry.domain,
                        icon: entry.icon,
                    });
                }
            }
            Err(e) => {
                tracing::warn!(%e, "brandfetch search fallback failed");
            }
        }
    }

    Ok(ApiOk(results))
}
