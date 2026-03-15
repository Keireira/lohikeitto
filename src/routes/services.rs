use axum::extract::{Path, State};
use uuid::Uuid;

use crate::AppState;
use crate::db::services::get_service_by_id;
use crate::logo;
use crate::models::service::ServiceDetail;
use crate::response::{ApiError, ApiOk};

pub async fn get_service(
    State(state): State<AppState>,
    Path(service_id): Path<Uuid>,
) -> Result<ApiOk<ServiceDetail>, ApiError> {
    let row = get_service_by_id(&state.db, service_id)
        .await
        .map_err(|_| ApiError::InternalServerError)?
        .ok_or(ApiError::NotFound)?;

    let detail = ServiceDetail {
        id: row.id,
        name: row.name,
        colors: row.colors,
        category_id: row.category_id,
        category: row.category,
        logo_url: logo::logo_url(&state.logo_base_url, &row.slug),
        links: row.links,
        localizations: row.localizations.unwrap_or(serde_json::json!({})),
        default_locale: row.default_locale,
        ref_link: row.ref_link,
    };

    Ok(ApiOk(detail))
}
