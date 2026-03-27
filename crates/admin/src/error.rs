use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug)]
pub enum AdminError {
    NotFound,
    Internal(String),
    InvalidInput(String),
}

impl IntoResponse for AdminError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AdminError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            AdminError::Internal(msg) => {
                tracing::error!(error = %msg, "internal server error");

                let response = (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                );

                response
            }
            AdminError::InvalidInput(msg) => (StatusCode::BAD_REQUEST, msg),
        };

        let answer = (
            status,
            Json(json!({
                "status": "error",
                "code": status.as_u16(),
                "message": message
            })),
        );

        answer.into_response()
    }
}

impl From<sqlx::Error> for AdminError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AdminError::NotFound,
            _ => AdminError::Internal(err.to_string()),
        }
    }
}
