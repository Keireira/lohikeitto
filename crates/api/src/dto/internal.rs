use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
#[schema(example = json!({
    "status": "error",
    "code": 400,
    "message": "q is required"
}))]
pub struct ErrorResponse {
    /// Always `error`
    #[schema(example = "error")]
    pub status: String,
    /// HTTP status code
    #[schema(example = 400)]
    pub code: u16,
    /// Error description
    #[schema(example = "q is required")]
    pub message: String,
}
