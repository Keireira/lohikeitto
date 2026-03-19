use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    // Always "error"
    pub status: String,
    // HTTP status code
    pub code: u16,
    pub message: String,
}
