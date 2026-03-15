use axum::extract::{Query, State};
use serde::Deserialize;

use crate::AppState;
use crate::db::services::get_services_by_locale;
use crate::logo;
use crate::models::service::ServiceDetail;
use crate::response::{ApiError, ApiOk};

#[derive(Debug, Deserialize)]
pub struct InitQuery {
    pub locale: String,
}

/// GET /init?locale=ja
/// Returns services available in the given locale, same shape as GET /services/:id.
pub async fn init(
    State(state): State<AppState>,
    Query(params): Query<InitQuery>,
) -> Result<ApiOk<Vec<ServiceDetail>>, ApiError> {
    let locale = params.locale;

    if locale.is_empty() {
        return Err(ApiError::BadRequest(
            "Missing required parameter: locale".to_string(),
        ));
    }

    let rows = get_services_by_locale(&state.db, &locale)
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    let results: Vec<ServiceDetail> = rows
        .into_iter()
        .map(|row| ServiceDetail {
            id: row.id,
            name: row.name,
            colors: row.colors,
            category: row.category,
            logo_url: logo::logo_url(&state.logo_base_url, &row.slug),
            links: row.links,
            localizations: row.localizations.unwrap_or(serde_json::json!({})),
            default_locale: row.default_locale,
            ref_link: row.ref_link,
            created_at: row.created_at,
        })
        .collect();

    Ok(ApiOk(results))
}
