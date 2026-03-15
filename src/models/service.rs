use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct ServiceRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub category_id: Uuid,
    pub category: String,
    pub colors: serde_json::Value,
    pub links: serde_json::Value,
    pub localizations: Option<serde_json::Value>,
    pub default_locale: String,
    pub ref_link: Option<String>,
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
    pub category_id: Uuid,
    pub category: String,
    pub logo_url: String,
    pub links: serde_json::Value,
    pub localizations: serde_json::Value,
    pub default_locale: String,
    pub ref_link: Option<String>,
}
