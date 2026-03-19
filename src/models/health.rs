use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthResponse {
    // "ok" or "degraded"
    pub status: String,
    pub message: String,
    // Whether the database is reachable
    pub db: bool,
}
