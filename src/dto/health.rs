use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
#[schema(example = json!({
    "status": "ok",
    "message": "Lohikeitto is ready",
    "db": true
}))]
pub struct HealthResponse {
    /// Service status: `ok` or `degraded`
    #[schema(example = "ok")]
    pub status: String,
    /// Human-readable status message
    #[schema(example = "Lohikeitto is ready")]
    pub message: String,
    /// Whether the database is reachable
    pub db: bool,
}
