use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;

use crate::AppState;
use crate::db::services::get_services_by_locale;
use crate::error::ApiError;
use crate::logo;
use crate::models::service::ServicePreload;

#[derive(Debug, Deserialize)]
pub struct InitQuery {
    pub locale: String,
    pub category: Option<String>,
}

/// GET /init?locale=ja&category=Music
/// Returns services popular in the given locale, with localized names.
/// Used by the mobile app to preload service data.
pub async fn init(
    State(state): State<AppState>,
    Query(params): Query<InitQuery>,
) -> Result<Json<Vec<ServicePreload>>, ApiError> {
    let locale = params.locale;

    if locale.is_empty() {
        return Err(ApiError::BadRequest(
            "Missing required parameter: locale".to_string(),
        ));
    }

    let rows = get_services_by_locale(&state.db, &locale, params.category.as_deref())
        .await
        .map_err(|_| ApiError::InternalServerError)?;

    let results: Vec<ServicePreload> = rows
        .into_iter()
        .map(|row| ServicePreload {
            id: row.id,
            name: row.name,
            slug: row.slug.clone(),
            category: row.category,
            colors: row.colors,
            logo_url: logo::logo_url(&state.logo_base_url, &row.slug),
            localized_name: row.localized_name,
        })
        .collect();

    Ok(Json(results))
}
