use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct ServiceRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub category_id: Option<Uuid>,
    pub category: Option<String>,
    pub colors: serde_json::Value,
    pub links: serde_json::Value,
    pub localizations: Option<serde_json::Value>,
    pub ref_link: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct SearchRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
}
