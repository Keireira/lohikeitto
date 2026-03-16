use axum::extract::{Path, State};
use axum::routing::get;
use axum::Router;
use uuid::Uuid;

use crate::app::AppState;
use crate::db::services::get_service_by_id;
use crate::dto::service::ServiceDetail;
use crate::error::{ApiOk, AppError};
use crate::logo;

pub fn routes() -> Router<AppState> {
    Router::new().route("/services/{service_id}", get(get_service))
}

async fn get_service(
    State(state): State<AppState>,
    Path(service_id): Path<Uuid>,
) -> Result<ApiOk<ServiceDetail>, AppError> {
    let row = get_service_by_id(&state.db, service_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Service not found".into()))?;

    let logo_url = logo::logo_url(&state.logo_base_url, &row.slug);
    Ok(ApiOk(ServiceDetail::from_row(row, logo_url)))
}
