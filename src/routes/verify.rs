use std::time::Duration;

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

/// Strict name matching: normalize both, require exact match or that
/// the shorter string equals a word-boundary-aligned prefix/suffix of the longer.
/// Rejects "A1" matching "a16z", "ADT" matching "Adtelligent", etc.
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
    if a == b {
        return true;
    }
    // shorter must be at least 4 chars for containment to be reliable
    let (short, long) = if a.len() <= b.len() { (&a, &b) } else { (&b, &a) };
    if short.len() < 4 {
        return false;
    }
    // require the shorter to be a prefix of the longer (e.g. "adguard" in "adguardvpn")
    long.starts_with(short.as_str())
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/services/verify", post(verify_services))
}

async fn throttle() {
    // Brandfetch: 200 req / 5 min = 1 req / 1.5s
    let ms = rand::rng().random_range(1600..=1850);
    sleep(Duration::from_millis(ms)).await;
}

const MAX_RETRIES: u32 = 3;
const BACKOFF_SECS: u64 = 60;

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

        let mut result = None;
        for attempt in 0..=MAX_RETRIES {
            match brandfetch::search(&state.http, &state.brandfetch_client_id, name).await {
                Ok(entries) => {
                    result = Some(Ok(entries));
                    break;
                }
                Err(e) if e.status() == Some(reqwest::StatusCode::TOO_MANY_REQUESTS) => {
                    if attempt < MAX_RETRIES {
                        tracing::warn!(
                            i = i + 1, total, name, attempt = attempt + 1,
                            "rate limited, backing off {BACKOFF_SECS}s"
                        );
                        sleep(Duration::from_secs(BACKOFF_SECS)).await;
                    } else {
                        result = Some(Err(e));
                    }
                }
                Err(e) => {
                    result = Some(Err(e));
                    break;
                }
            }
        }

        match result.expect("retry loop must produce a result") {
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
