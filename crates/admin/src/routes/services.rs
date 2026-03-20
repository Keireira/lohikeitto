use axum::{Json, extract::State};
use serde::Serialize;
use uuid::Uuid;

use crate::app::AdminState;
use crate::error::AdminError;

#[derive(Debug, Serialize)]
pub struct ServiceItem {
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

#[derive(Debug, Serialize)]
pub struct CategoryRef {
    pub id: Uuid,
    pub title: String,
}

#[derive(Debug, sqlx::FromRow)]
struct ServiceWithCategory {
    id: Uuid,
    name: String,
    slug: String,
    domains: Vec<String>,
    verified: bool,
    colors: serde_json::Value,
    ref_link: Option<String>,
    category_id: Option<Uuid>,
    category_title: Option<String>,
}

pub async fn list(State(state): State<AdminState>) -> Result<Json<Vec<ServiceItem>>, AdminError> {
    let s3_base_url = &state.config.s3_base_url;
    let rows = sqlx::query_as::<sqlx::Postgres, ServiceWithCategory>(
        r#"
        SELECT s.id, s.name, s.slug, s.domains, s.verified, s.colors, s.ref_link,
               c.id as category_id, c.title as category_title
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        ORDER BY s.name
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    let items = rows
        .into_iter()
        .map(|r| {
            let logo_url = format!("{}/logos/{}.webp", s3_base_url, r.slug);
            ServiceItem {
                id: r.id,
                name: r.name,
                slug: r.slug,
                domains: r.domains,
                verified: r.verified,
                colors: r.colors,
                logo_url,
                ref_link: r.ref_link,
                category: r.category_id.zip(r.category_title).map(|(id, title)| CategoryRef { id, title }),
            }
        })
        .collect();

    Ok(Json(items))
}
