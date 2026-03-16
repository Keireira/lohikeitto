use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::post;
use axum::Router;
use rand::Rng;
use tokio::time::sleep;

use crate::app::AppState;
use crate::error::{ApiOk, AppError};
use crate::routes::check_admin;
use crate::services::logo_sync;

pub fn routes() -> Router<AppState> {
    Router::new().route("/logos/sync", post(sync_logos))
}

async fn throttle() {
    let ms = rand::rng().random_range(150..=400);
    sleep(std::time::Duration::from_millis(ms)).await;
}

async fn sync_logos(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<ApiOk<Vec<serde_json::Value>>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT slug, domain FROM services WHERE domain IS NOT NULL")
            .fetch_all(&state.db)
            .await?;

    let total = rows.len();
    tracing::info!(total, "logo sync started");

    let mut results = Vec::new();
    for (i, (slug, domain)) in rows.iter().enumerate() {
        let r = logo_sync::sync_service(&state, slug, domain).await;
        tracing::info!(
            i = i + 1,
            total,
            slug,
            domain,
            bf_logo = r.bf_logo,
            bf_symbol = r.bf_symbol,
            logodev = r.logodev,
            "synced"
        );
        results.push(serde_json::json!({
            "slug": slug,
            "domain": domain,
            "result": r,
        }));
        throttle().await;
    }

    tracing::info!(total, "logo sync complete");

    Ok(ApiOk(results))
}
