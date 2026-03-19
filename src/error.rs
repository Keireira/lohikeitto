use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

pub const MAX_RESPONSE_SIZE: usize = 1024 * 1024;

#[derive(Debug)]
pub enum ApiError {
    NotFound,
    Internal(String),
    InvalidInput(String),
    PayloadTooLarge,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, "Data not found".to_string()),
            ApiError::Internal(msg) => {
                tracing::error!(error = %msg, "internal server error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            ApiError::InvalidInput(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("Response exceeds {} KB limit", MAX_RESPONSE_SIZE / 1024),
            ),
        };

        metrics::counter!(
            "http_errors_total",
            "status" => status.as_u16().to_string(),
        )
        .increment(1);

        let body = Json(json!({
            "status": "error",
            "code": status.as_u16(),
            "message": message,
        }));

        (status, body).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => ApiError::NotFound,
            _ => ApiError::Internal(err.to_string()),
        }
    }
}

impl From<reqwest::Error> for ApiError {
    fn from(err: reqwest::Error) -> Self {
        ApiError::Internal(err.to_string())
    }
}
