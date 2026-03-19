use std::time::Instant;

use axum::{middleware::Next, response::Response};
use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use sqlx::PgPool;
use tracing::{info, warn};

const KNOWN_PATHS: &[&str] = &["/health"];

/*
 * Install the global Prometheus metrics recorder.
 * Returns a handle used to render the `/metrics` endpoint.
 */
pub fn setup() -> PrometheusHandle {
    PrometheusBuilder::new()
        .install_recorder()
        .expect("failed to install Prometheus recorder")
}

// Tower middleware that records per-request counters and latency histograms
pub async fn track_http(req: axum::extract::Request, next: Next) -> Response {
    let raw_path = req.uri().path();

    // Don't instrument the metrics endpoint itself.
    if raw_path == "/metrics" {
        return next.run(req).await;
    }

    // Normalize path to prevent cardinality explosion from unknown routes.
    let path = if KNOWN_PATHS.contains(&raw_path) {
        raw_path.to_string()
    } else {
        "unmatched".to_string()
    };

    let method = req.method().to_string();
    let start = Instant::now();

    let response = next.run(req).await;

    let status = response.status().as_u16().to_string();
    let duration = start.elapsed().as_secs_f64();

    counter!("http_requests_total", "method" => method.clone(), "path" => path.clone(), "status" => status).increment(1);
    histogram!("http_request_duration_seconds", "method" => method, "path" => path)
        .record(duration);

    response
}

/*
 * Background task that periodically records DB connection pool gauges
 * and runs a `SELECT 1` health probe.
 */
pub async fn pool_monitor(pool: PgPool) {
    let mut healthy = true;

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        let size = pool.size() as f64;
        let idle = pool.num_idle() as f64;
        gauge!("db_pool_size").set(size);
        gauge!("db_pool_idle").set(idle);
        gauge!("db_pool_active").set(size - idle);

        match sqlx::query_scalar::<_, i32>("SELECT 1")
            .fetch_one(&pool)
            .await
        {
            Ok(_) => {
                gauge!("db_pool_healthy").set(1.0);
                if !healthy {
                    info!("database connectivity restored");
                    healthy = true;
                }
            }
            Err(e) => {
                gauge!("db_pool_healthy").set(0.0);
                warn!(error = %e, "database health check failed");
                healthy = false;
            }
        }
    }
}
