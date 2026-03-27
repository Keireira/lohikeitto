use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::app::AdminState;

pub async fn health_check(State(state): State<AdminState>) -> Response {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();

    let status = if db_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    let body = Json(json!({
        "status": if db_ok { "ok" } else { "degraded" },
        "service": "admin",
        "db": db_ok,
    }));

    (status, body).into_response()
}
