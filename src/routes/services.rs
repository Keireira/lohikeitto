use axum::Json;
use axum::extract::{Path, State};
use uuid::Uuid;

use crate::AppState;
use crate::db::services::get_service_by_id;
use crate::error::ApiError;
use crate::logo;
use crate::models::service::ServiceDetail;

pub async fn get_service(
    State(state): State<AppState>,
    Path(service_id): Path<Uuid>,
) -> Result<Json<ServiceDetail>, ApiError> {
    let row = get_service_by_id(&state.db, service_id)
        .await
        .map_err(|_| ApiError::InternalServerError)?
        .ok_or(ApiError::NotFound)?;

    let detail = ServiceDetail {
        id: row.id,
        name: row.name,
        colors: row.colors,
        category: row.category,
        logo_url: logo::logo_url(&state.logo_base_url, &row.slug),
        links: row.links,
        locales: row.locales,
        localizations: row.localizations.unwrap_or(serde_json::json!({})),
        default_locale: row.default_locale,
        ref_link: row.ref_link,
        created_at: row.created_at,
    };

    Ok(Json(detail))
}
