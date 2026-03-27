use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Serialize, ToSchema)]
pub struct CategoryRef {
    pub id: Uuid,
    pub title: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(example = json!({
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "AdGuard",
    "slug": "adguard",
    "domains": ["adguard.com"],
    "verified": true,
    "category": {"id": "660e8400-e29b-41d4-a716-446655440000", "title": "Security"},
    "colors": {"bg": "#000000"},
    "logo_url": "https://s3.uha.app/logos/adguard.webp",
    "ref_link": null
}))]
pub struct ServiceResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub domains: Vec<String>,
    pub verified: bool,
    pub category: Option<CategoryRef>,
    pub colors: serde_json::Value,
    pub logo_url: String,
    pub ref_link: Option<String>,
}
