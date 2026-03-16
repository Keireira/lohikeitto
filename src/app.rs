use std::time::Duration;

use axum::extract::DefaultBodyLimit;
use axum::http::header::{
    HeaderValue, REFERRER_POLICY, STRICT_TRANSPORT_SECURITY, X_CONTENT_TYPE_OPTIONS,
    X_FRAME_OPTIONS,
};
use axum::http::{header, Method, Request};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub http: reqwest::Client,
    pub bucket: Box<s3::Bucket>,
    pub logo_base_url: String,
    pub brandfetch_client_id: String,
    pub logodev_token: String,
    pub admin_token: String,
}

pub fn create_router(state: AppState, cors_origin: &str) -> Router {
    let public = crate::routes::public_routes().layer(
        tower_http::timeout::TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ),
    );

    let admin = crate::routes::admin_routes();

    public
        .merge(admin)
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(middleware::from_fn(security_headers))
        .layer(
            TraceLayer::new_for_http().make_span_with(|req: &Request<_>| {
                tracing::info_span!(
                    "http",
                    method = %req.method(),
                    path = %req.uri().path(),
                )
            }),
        )
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(cors_layer(cors_origin))
        .with_state(state)
}

fn cors_layer(origin: &str) -> CorsLayer {
    if origin == "*" {
        CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
            .allow_methods([Method::GET, Method::POST])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
    } else {
        CorsLayer::new()
            .allow_origin(origin.parse::<HeaderValue>().expect("Invalid CORS_ORIGIN"))
            .allow_methods([Method::GET, Method::POST])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
            .max_age(Duration::from_secs(3600))
    }
}

async fn security_headers(req: Request<axum::body::Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert(X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    h.insert(X_FRAME_OPTIONS, "DENY".parse().unwrap());
    h.insert(REFERRER_POLICY, "no-referrer".parse().unwrap());
    h.insert(
        STRICT_TRANSPORT_SECURITY,
        "max-age=31536000; includeSubDomains".parse().unwrap(),
    );
    res
}
