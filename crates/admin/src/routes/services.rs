use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::app::AdminState;
use crate::error::AdminError;

#[derive(Debug, Serialize)]
pub struct ServiceItem {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub bundle_id: Option<String>,
    pub description: Option<String>,
    pub domains: Vec<String>,
    pub alternative_names: Vec<String>,
    pub tags: Vec<String>,
    pub verified: bool,
    pub category: Option<CategoryRef>,
    pub colors: serde_json::Value,
    pub social_links: serde_json::Value,
    pub logo_url: String,
    pub ref_link: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CategoryRef {
    pub slug: String,
    pub title: String,
}

#[derive(Debug, sqlx::FromRow)]
struct ServiceWithCategory {
    id: Uuid,
    name: String,
    slug: String,
    bundle_id: Option<String>,
    description: Option<String>,
    domains: Vec<String>,
    alternative_names: Vec<String>,
    tags: Vec<String>,
    verified: bool,
    colors: serde_json::Value,
    social_links: serde_json::Value,
    ref_link: Option<String>,
    category_slug: Option<String>,
    category_title: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CategoryItem {
    pub slug: String,
    pub title: String,
}

/// List all services.
pub async fn list(State(state): State<AdminState>) -> Result<Json<Vec<ServiceItem>>, AdminError> {
    let s3_base_url = &state.config.s3_base_url;

    let rows = sqlx::query_as::<sqlx::Postgres, ServiceWithCategory>(
        r#"
        SELECT s.id, s.name, s.slug, s.bundle_id, s.description,
               s.domains, s.alternative_names, s.tags,
               s.verified, s.colors, s.social_links, s.ref_link,
               c.slug as category_slug, c.title as category_title
        FROM services s
        LEFT JOIN categories c ON s.category_slug = c.slug
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
                bundle_id: r.bundle_id,
                description: r.description,
                domains: r.domains,
                alternative_names: r.alternative_names,
                tags: r.tags,
                verified: r.verified,
                colors: r.colors,
                social_links: r.social_links,
                logo_url,
                ref_link: r.ref_link,
                category: r
                    .category_slug
                    .zip(r.category_title)
                    .map(|(slug, title)| CategoryRef { slug, title }),
            }
        })
        .collect();

    Ok(Json(items))
}

/// List all categories.
pub async fn list_categories(
    State(state): State<AdminState>,
) -> Result<Json<Vec<CategoryItem>>, AdminError> {
    let rows = sqlx::query_as::<sqlx::Postgres, CategoryItem>(
        "SELECT slug, title FROM categories ORDER BY title",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

/// Create a new service.
#[derive(Debug, Deserialize)]
pub struct CreateService {
    pub name: String,
    pub slug: String,
    pub bundle_id: Option<String>,
    pub description: Option<String>,
    pub domains: Vec<String>,
    pub alternative_names: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub category_slug: Option<String>,
    pub colors: serde_json::Value,
    pub social_links: Option<serde_json::Value>,
    pub ref_link: Option<String>,
}

pub async fn create(
    State(state): State<AdminState>,
    Json(req): Json<CreateService>,
) -> Result<Json<ServiceItem>, AdminError> {
    let alt_names = req.alternative_names.as_deref().unwrap_or(&[]);
    let tags = req.tags.as_deref().unwrap_or(&[]);
    let social_links = req
        .social_links
        .as_ref()
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO services (name, slug, bundle_id, description, domains, alternative_names, tags, verified, category_slug, colors, social_links, ref_link)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11)
        RETURNING id
        "#,
    )
    .bind(&req.name)
    .bind(&req.slug)
    .bind(&req.bundle_id)
    .bind(&req.description)
    .bind(&req.domains)
    .bind(alt_names)
    .bind(tags)
    .bind(&req.category_slug)
    .bind(&req.colors)
    .bind(&social_links)
    .bind(&req.ref_link)
    .fetch_one(&state.db)
    .await?;

    let s3_base_url = &state.config.s3_base_url;
    let logo_url = format!("{}/logos/{}.webp", s3_base_url, req.slug);

    let category = if let Some(cat_slug) = &req.category_slug {
        sqlx::query_as::<sqlx::Postgres, CategoryItem>(
            "SELECT slug, title FROM categories WHERE slug = $1",
        )
        .bind(cat_slug)
        .fetch_optional(&state.db)
        .await?
        .map(|c| CategoryRef {
            slug: c.slug,
            title: c.title,
        })
    } else {
        None
    };

    Ok(Json(ServiceItem {
        id,
        name: req.name,
        slug: req.slug,
        bundle_id: req.bundle_id,
        description: req.description,
        domains: req.domains,
        alternative_names: req.alternative_names.unwrap_or_default(),
        tags: req.tags.unwrap_or_default(),
        verified: false,
        colors: req.colors,
        social_links,
        logo_url,
        ref_link: req.ref_link,
        category,
    }))
}

/// Update a service.
#[derive(Debug, Deserialize)]
pub struct UpdateService {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub bundle_id: Option<String>,
    pub description: Option<String>,
    pub domains: Option<Vec<String>>,
    pub alternative_names: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub verified: Option<bool>,
    pub category_slug: Option<String>,
    pub colors: Option<serde_json::Value>,
    pub social_links: Option<serde_json::Value>,
    pub ref_link: Option<String>,
}

pub async fn update(
    State(state): State<AdminState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateService>,
) -> Result<Json<serde_json::Value>, AdminError> {
    // Build dynamic update
    let mut sets = Vec::new();
    let mut idx = 2u32; // $1 is id

    if req.name.is_some() {
        sets.push(format!("name = ${idx}"));
        idx += 1;
    }
    if req.slug.is_some() {
        sets.push(format!("slug = ${idx}"));
        idx += 1;
    }
    if req.bundle_id.is_some() {
        sets.push(format!("bundle_id = ${idx}"));
        idx += 1;
    }
    if req.description.is_some() {
        sets.push(format!("description = ${idx}"));
        idx += 1;
    }
    if req.domains.is_some() {
        sets.push(format!("domains = ${idx}"));
        idx += 1;
    }
    if req.alternative_names.is_some() {
        sets.push(format!("alternative_names = ${idx}"));
        idx += 1;
    }
    if req.tags.is_some() {
        sets.push(format!("tags = ${idx}"));
        idx += 1;
    }
    if req.verified.is_some() {
        sets.push(format!("verified = ${idx}"));
        idx += 1;
    }
    if req.category_slug.is_some() {
        sets.push(format!("category_slug = ${idx}"));
        idx += 1;
    }
    if req.colors.is_some() {
        sets.push(format!("colors = ${idx}"));
        idx += 1;
    }
    if req.social_links.is_some() {
        sets.push(format!("social_links = ${idx}"));
        idx += 1;
    }
    if req.ref_link.is_some() {
        sets.push(format!("ref_link = ${idx}"));
        idx += 1;
    }

    if sets.is_empty() {
        return Ok(Json(serde_json::json!({ "updated": false })));
    }

    let sql = format!("UPDATE services SET {} WHERE id = $1", sets.join(", "));

    let mut query = sqlx::query(&sql).bind(id);

    if let Some(v) = &req.name {
        query = query.bind(v);
    }
    if let Some(v) = &req.slug {
        query = query.bind(v);
    }
    if let Some(v) = &req.bundle_id {
        query = query.bind(v);
    }
    if let Some(v) = &req.description {
        query = query.bind(v);
    }
    if let Some(v) = &req.domains {
        query = query.bind(v);
    }
    if let Some(v) = &req.alternative_names {
        query = query.bind(v);
    }
    if let Some(v) = &req.tags {
        query = query.bind(v);
    }
    if let Some(v) = &req.verified {
        query = query.bind(v);
    }
    if let Some(v) = &req.category_slug {
        query = query.bind(v);
    }
    if let Some(v) = &req.colors {
        query = query.bind(v);
    }
    if let Some(v) = &req.social_links {
        query = query.bind(v);
    }
    if let Some(v) = &req.ref_link {
        query = query.bind(v);
    }

    let _ = idx; // suppress unused warning

    query.execute(&state.db).await?;

    Ok(Json(serde_json::json!({ "updated": id })))
}

/// Delete a service.
pub async fn delete(
    State(state): State<AdminState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AdminError> {
    sqlx::query("DELETE FROM services WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "deleted": id })))
}

// ── Categories CRUD ───────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateCategory {
    pub slug: String,
    pub title: String,
}

pub async fn create_category(
    State(state): State<AdminState>,
    Json(req): Json<CreateCategory>,
) -> Result<Json<CategoryItem>, AdminError> {
    sqlx::query("INSERT INTO categories (slug, title) VALUES ($1, $2)")
        .bind(&req.slug)
        .bind(&req.title)
        .execute(&state.db)
        .await?;

    Ok(Json(CategoryItem {
        slug: req.slug,
        title: req.title,
    }))
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategory {
    pub slug: Option<String>,
    pub title: Option<String>,
}

pub async fn update_category(
    State(state): State<AdminState>,
    Path(slug): Path<String>,
    Json(req): Json<UpdateCategory>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let mut sets = Vec::new();
    let mut idx = 2u32; // $1 is slug
    if req.slug.is_some() {
        sets.push(format!("slug = ${idx}"));
        idx += 1;
    }
    if req.title.is_some() {
        sets.push(format!("title = ${idx}"));
        idx += 1;
    }
    if sets.is_empty() {
        return Ok(Json(serde_json::json!({ "updated": false })));
    }
    let sql = format!("UPDATE categories SET {} WHERE slug = $1", sets.join(", "));
    let mut query = sqlx::query(&sql).bind(&slug);
    if let Some(v) = &req.slug {
        query = query.bind(v);
    }
    if let Some(v) = &req.title {
        query = query.bind(v);
    }
    let _ = idx;
    query.execute(&state.db).await?;

    Ok(Json(serde_json::json!({ "updated": slug })))
}

pub async fn delete_category(
    State(state): State<AdminState>,
    Path(slug): Path<String>,
) -> Result<Json<serde_json::Value>, AdminError> {
    // Unassign services first
    sqlx::query("UPDATE services SET category_slug = NULL WHERE category_slug = $1")
        .bind(&slug)
        .execute(&state.db)
        .await?;

    sqlx::query("DELETE FROM categories WHERE slug = $1")
        .bind(&slug)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "deleted": slug })))
}
