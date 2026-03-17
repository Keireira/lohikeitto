use axum::extract::{Query, State};
use axum::routing::get;
use axum::Router;

use crate::app::AppState;
use crate::db::services::get_services_by_country;
use crate::dto::service::{InitQuery, ServiceDetail};
use crate::error::{ApiOk, AppError};
use crate::logo;

pub fn routes() -> Router<AppState> {
    Router::new().route("/init", get(init))
}

async fn init(
    State(state): State<AppState>,
    Query(params): Query<InitQuery>,
) -> Result<ApiOk<Vec<ServiceDetail>>, AppError> {
    if params.country.is_empty() || params.country.len() > 10 {
        return Err(AppError::BadRequest(
            "Invalid country parameter".into(),
        ));
    }

    let rows = get_services_by_country(&state.db, &params.country).await?;

    let results: Vec<ServiceDetail> = rows
        .into_iter()
        .map(|row| {
            let url = logo::logo_url(&state.logo_base_url, &row.slug);
            ServiceDetail::from_row(row, url)
        })
        .collect();

    Ok(ApiOk(results))
}
