use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::post;
use axum::Router;
use rand::Rng;
use tokio::time::sleep;

use crate::app::AppState;
use crate::dto::service::VerifyReport;
use crate::error::{ApiOk, AppError};
use crate::routes::check_admin;
use crate::services::brandfetch;

/// Check if Brandfetch name is a reasonable match for our service name.
/// Normalizes both to lowercase, strips non-alphanumeric, checks containment.
fn name_matches(ours: &str, theirs: &str) -> bool {
    let norm = |s: &str| -> String {
        s.to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect()
    };
    let a = norm(ours);
    let b = norm(theirs);
    if a.is_empty() || b.is_empty() {
        return false;
    }
    // exact match after normalization, or one contains the other
    a == b || a.contains(&b) || b.contains(&a)
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/services/verify", post(verify_services))
}

async fn throttle() {
    let ms = rand::rng().random_range(150..=400);
    sleep(std::time::Duration::from_millis(ms)).await;
}

async fn verify_services(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<ApiOk<VerifyReport>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;
    let rows: Vec<(uuid::Uuid, String)> = sqlx::query_as(
        "SELECT id, name FROM services WHERE verified = false ORDER BY name",
    )
    .fetch_all(&state.db)
    .await?;

    let total = rows.len();
    tracing::info!(total, "verify started");

    let mut verified = Vec::new();
    let mut not_found = Vec::new();
    let mut errors = Vec::new();

    for (i, (id, name)) in rows.iter().enumerate() {
        throttle().await;
        match brandfetch::search(&state.http, &state.brandfetch_client_id, name).await {
            Ok(entries) => {
                let matched = entries.iter().find(|e| name_matches(name, &e.name));
                if let Some(entry) = matched {
                    let domain = &entry.domain;
                    let _ = sqlx::query(
                        "UPDATE services SET verified = true, domain = COALESCE(domain, $1) WHERE id = $2",
                    )
                    .bind(domain)
                    .bind(id)
                    .execute(&state.db)
                    .await;
                    tracing::info!(i = i + 1, total, name, bf_name = entry.name.as_str(), domain, "verified");
                    verified.push(serde_json::json!({
                        "name": name,
                        "domain": domain,
                    }));
                } else {
                    let top = entries.first().map(|e| e.name.as_str()).unwrap_or("-");
                    tracing::warn!(i = i + 1, total, name, bf_top = top, "no match");
                    not_found.push(name.clone());
                }
            }
            Err(e) => {
                tracing::error!(i = i + 1, total, name, %e, "verify error");
                errors.push(serde_json::json!({
                    "name": name,
                    "error": e.to_string(),
                }));
            }
        }
    }

    tracing::info!(
        verified = verified.len(),
        not_found = not_found.len(),
        errors = errors.len(),
        "verify complete"
    );

    Ok(ApiOk(VerifyReport {
        total,
        verified_count: verified.len(),
        not_found_count: not_found.len(),
        error_count: errors.len(),
        verified,
        not_found,
        errors,
    }))
}
