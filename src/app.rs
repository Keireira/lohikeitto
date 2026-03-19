use std::time::Duration;

use axum::Router;
use axum::http::{HeaderName, HeaderValue, header};
use axum::routing::get;
use metrics_exporter_prometheus::PrometheusHandle;
use reqwest::Client;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::telemetry;

static REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    pub http_client: Client,
}

// Assemble the full application: routes + middleware stack.
pub fn build(state: AppState, metrics_handle: PrometheusHandle) -> Router {
    let cors = cors_layer(&state.config.allowed_origins);

    // Rate limiting (60 req/min per IP)
    // Uses SmartIpKeyExtractor: tries X-Forwarded-For/X-Real-IP first (behind Cloudflare/Nginx),
    // falls back to peer IP for direct connections.
    let governor_conf = std::sync::Arc::new(
        tower_governor::governor::GovernorConfigBuilder::default()
            .per_second(1)
            .burst_size(60)
            .key_extractor(tower_governor::key_extractor::SmartIpKeyExtractor)
            .use_headers()
            .finish()
            .expect("failed to build governor config"),
    );
    let governor_limiter = tower_governor::GovernorLayer::new(governor_conf);

    // Security headers
    let hsts = SetResponseHeaderLayer::overriding(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
    );
    let nosniff = SetResponseHeaderLayer::overriding(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    let frame_deny = SetResponseHeaderLayer::overriding(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    );
    let referrer = SetResponseHeaderLayer::overriding(
        header::REFERRER_POLICY,
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );

    // Bottom-up: request flows from last .layer() -> first .layer() -> handler
    crate::routes::router()
        .route(
            "/metrics",
            get({
                let handle = metrics_handle;
                move || {
                    let handle = handle.clone();
                    async move { handle.render() }
                }
            }),
        )
        .layer(cors)
        .layer(hsts)
        .layer(nosniff)
        .layer(frame_deny)
        .layer(referrer)
        // Request ID: generate -> trace -> propagate to response
        .layer(PropagateRequestIdLayer::new(REQUEST_ID_HEADER.clone()))
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &axum::http::Request<_>| {
                let request_id = request
                    .headers()
                    .get(&REQUEST_ID_HEADER)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("-");

                tracing::info_span!(
                    "http",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = %request_id,
                )
            }),
        )
        .layer(SetRequestIdLayer::new(
            REQUEST_ID_HEADER.clone(),
            MakeRequestUuid,
        ))
        .layer(governor_limiter)
        // Request body limit (1 MB)
        .layer(RequestBodyLimitLayer::new(1 * 1024 * 1024))
        // Per-request timeout (30 seconds)
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        // Prometheus HTTP metrics (outermost — captures everything incl. rate-limited/timed-out)
        .layer(axum::middleware::from_fn(telemetry::track_http))
        .with_state(state)
}

fn cors_layer(allowed_origins: &[String]) -> CorsLayer {
    if allowed_origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        let origins: Vec<HeaderValue> = allowed_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    }
}
