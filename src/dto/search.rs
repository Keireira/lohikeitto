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
pub struct SearchResult {
    pub id: Uuid,
    pub logo_url: String,
    pub name: String,
    pub domain: String,
    pub source: String,
}
