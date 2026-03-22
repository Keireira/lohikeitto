use axum::{Json, extract::{Path, State}};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CategoryItem {
    pub id: Uuid,
    pub title: String,
}

/// List all services.
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

/// List all categories.
pub async fn list_categories(State(state): State<AdminState>) -> Result<Json<Vec<CategoryItem>>, AdminError> {
    let rows = sqlx::query_as::<sqlx::Postgres, CategoryItem>(
        "SELECT id, title FROM categories ORDER BY title",
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
    pub domains: Vec<String>,
    pub category_id: Option<Uuid>,
    pub colors: serde_json::Value,
    pub ref_link: Option<String>,
}

pub async fn create(
    State(state): State<AdminState>,
    Json(req): Json<CreateService>,
) -> Result<Json<ServiceItem>, AdminError> {
    let id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO services (name, slug, domains, verified, category_id, colors, ref_link)
        VALUES ($1, $2, $3, false, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(&req.name)
    .bind(&req.slug)
    .bind(&req.domains)
    .bind(req.category_id)
    .bind(&req.colors)
    .bind(&req.ref_link)
    .fetch_one(&state.db)
    .await?;

    let s3_base_url = &state.config.s3_base_url;
    let logo_url = format!("{}/logos/{}.webp", s3_base_url, req.slug);

    let category = if let Some(cat_id) = req.category_id {
        sqlx::query_as::<sqlx::Postgres, CategoryItem>(
            "SELECT id, title FROM categories WHERE id = $1",
        )
        .bind(cat_id)
        .fetch_optional(&state.db)
        .await?
        .map(|c| CategoryRef { id: c.id, title: c.title })
    } else {
        None
    };

    Ok(Json(ServiceItem {
        id,
        name: req.name,
        slug: req.slug,
        domains: req.domains,
        verified: false,
        colors: req.colors,
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
    pub domains: Option<Vec<String>>,
    pub verified: Option<bool>,
    pub category_id: Option<Uuid>,
    pub colors: Option<serde_json::Value>,
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

    if req.name.is_some() { sets.push(format!("name = ${idx}")); idx += 1; }
    if req.slug.is_some() { sets.push(format!("slug = ${idx}")); idx += 1; }
    if req.domains.is_some() { sets.push(format!("domains = ${idx}")); idx += 1; }
    if req.verified.is_some() { sets.push(format!("verified = ${idx}")); idx += 1; }
    if req.category_id.is_some() { sets.push(format!("category_id = ${idx}")); idx += 1; }
    if req.colors.is_some() { sets.push(format!("colors = ${idx}")); idx += 1; }
    if req.ref_link.is_some() { sets.push(format!("ref_link = ${idx}")); idx += 1; }

    if sets.is_empty() {
        return Ok(Json(serde_json::json!({ "updated": false })));
    }

    let sql = format!("UPDATE services SET {} WHERE id = $1", sets.join(", "));

    let mut query = sqlx::query(&sql).bind(id);

    if let Some(v) = &req.name { query = query.bind(v); }
    if let Some(v) = &req.slug { query = query.bind(v); }
    if let Some(v) = &req.domains { query = query.bind(v); }
    if let Some(v) = &req.verified { query = query.bind(v); }
    if let Some(v) = &req.category_id { query = query.bind(v); }
    if let Some(v) = &req.colors { query = query.bind(v); }
    if let Some(v) = &req.ref_link { query = query.bind(v); }

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
    pub title: String,
}

pub async fn create_category(
    State(state): State<AdminState>,
    Json(req): Json<CreateCategory>,
) -> Result<Json<CategoryItem>, AdminError> {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO categories (id, title) VALUES ($1, $2)")
        .bind(id)
        .bind(&req.title)
        .execute(&state.db)
        .await?;

    Ok(Json(CategoryItem { id, title: req.title }))
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategory {
    pub title: String,
}

pub async fn update_category(
    State(state): State<AdminState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCategory>,
) -> Result<Json<serde_json::Value>, AdminError> {
    sqlx::query("UPDATE categories SET title = $1 WHERE id = $2")
        .bind(&req.title)
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "updated": id })))
}

pub async fn delete_category(
    State(state): State<AdminState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AdminError> {
    // Unassign services first
    sqlx::query("UPDATE services SET category_id = NULL WHERE category_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    sqlx::query("DELETE FROM categories WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "deleted": id })))
}
