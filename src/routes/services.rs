use axum::Json;
use axum::extract::{Path, State};
use uuid::Uuid;

use crate::AppState;
use crate::db::services::get_service_by_id;
use crate::error::ApiError;
use crate::models::service::ServiceDetail;
use crate::logo;

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
        aliases: row.aliases,
        logo_url: logo::logo_url(&state.logo_base_url, &row.slug),
        links: row.links,
        ref_link: row.ref_link,
    };

    Ok(Json(detail))
}
