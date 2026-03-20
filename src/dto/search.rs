use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchSource {
    Local,
    External,
    Brandfetch,
    Logodev,
    #[default]
    All,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default)]
    pub source: SearchSource,
    pub limit: Option<u8>,
}

impl SearchQuery {
    pub fn safe_limit(&self) -> usize {
        self.limit.unwrap_or(10).clamp(1, 15) as usize
    }
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(example = json!({
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "logo_url": "https://s3.uha.app/logos/adguard.webp",
    "name": "AdGuard",
    "domain": "adguard.com",
    "source": "local"
}))]
pub struct SearchResult {
    /// For local results — ID from DB; for external — deterministic UUID v5 from domain
    pub id: Uuid,
    /// Logo image URL
    #[schema(example = "https://s3.uha.app/logos/adguard.webp")]
    pub logo_url: String,
    /// Service name
    #[schema(example = "AdGuard")]
    pub name: String,
    /// Service domain
    #[schema(example = "adguard.com")]
    pub domain: String,
    /// Result source: `local`, `brandfetch`, or `logo.dev`
    #[schema(example = "local")]
    pub source: String,
}
