use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct ServiceRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub category: String,
    pub aliases: serde_json::Value,
    pub colors: serde_json::Value,
    pub links: serde_json::Value,
    pub ref_link: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct SearchRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub colors: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub id: Uuid,
    pub name: String,
    pub colors: serde_json::Value,
    pub logo_url: String,
}

#[derive(Debug, Serialize)]
pub struct ServiceDetail {
    pub id: Uuid,
    pub name: String,
    pub colors: serde_json::Value,
    pub category: String,
    pub aliases: serde_json::Value,
    pub logo_url: String,
    pub links: serde_json::Value,
    pub ref_link: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
