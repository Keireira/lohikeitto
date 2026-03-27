use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct LimbusRow {
    pub id: Uuid,
    pub name: String,
    pub domain: String,
    pub logo_url: Option<String>,
    pub source: String,
}
