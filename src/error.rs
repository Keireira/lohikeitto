use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use serde_json::json;

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    Unauthorized,
    NotFound(String),
    Internal(anyhow::Error),
    Sqlx(sqlx::Error),
    S3(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".into()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::Internal(err) => {
                tracing::error!(?err, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".into())
            }
            AppError::Sqlx(err) => {
                tracing::error!(?err, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".into())
            }
            AppError::S3(msg) => {
                tracing::error!(msg, "s3 error");
                (StatusCode::INTERNAL_SERVER_ERROR, "Storage error".into())
            }
        };

        let body = json!({
            "status": "error",
            "code": status.as_u16(),
            "message": message,
        });

        (status, Json(body)).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match &err {
            sqlx::Error::RowNotFound => AppError::NotFound("Not found".into()),
            _ => AppError::Sqlx(err),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}

// Success wrapper: { "status": "success", "data": T }
pub struct ApiOk<T: Serialize>(pub T);

impl<T: Serialize> IntoResponse for ApiOk<T> {
    fn into_response(self) -> Response {
        Json(json!({
            "status": "success",
            "data": self.0,
        }))
        .into_response()
    }
}
