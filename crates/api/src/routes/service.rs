use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use crate::app::AppState;
use crate::dto::internal::ErrorResponse;
use crate::dto::service::{CategoryRef, ServiceResponse};
use crate::error::ApiError;
use crate::services::search as search_service;

#[derive(Debug, sqlx::FromRow)]
struct ServiceRow {
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

#[derive(Debug, sqlx::FromRow)]
struct LimbusRow {
    id: Uuid,
    name: String,
    domain: String,
    logo_url: Option<String>,
}

fn service_to_response(row: ServiceRow, s3_base: &str) -> ServiceResponse {
    let logo_url = format!("{}/logos/{}.webp", s3_base, row.slug);
    ServiceResponse {
        id: row.id,
        name: row.name,
        slug: row.slug,
        domains: row.domains,
        verified: row.verified,
        colors: row.colors,
        logo_url,
        ref_link: row.ref_link,
        category: row
            .category_id
            .zip(row.category_title)
            .map(|(id, title)| CategoryRef { id, title }),
    }
}

fn limbus_to_response(row: LimbusRow) -> ServiceResponse {
    ServiceResponse {
        id: row.id,
        name: row.name,
        slug: String::new(),
        domains: vec![row.domain],
        verified: false,
        colors: serde_json::json!({}),
        logo_url: row.logo_url.unwrap_or_default(),
        ref_link: None,
        category: None,
    }
}

#[utoipa::path(
    get,
    path = "/service/{lookup}",
    tag = "Services",
    summary = "Get a service by ID or domain",
    description = "Look up a service by UUID or domain name. If not found locally, searches external sources (Brandfetch, logo.dev) and adds the result to the approval queue.",
    params(
        ("lookup" = String, Path, description = "Service UUID or domain name"),
    ),
    responses(
        (status = 200, description = "Service found", body = ServiceResponse),
        (status = 404, description = "Service not found", body = ErrorResponse),
    )
)]
pub async fn get(
    State(state): State<AppState>,
    Path(lookup): Path<String>,
) -> Result<Json<ServiceResponse>, ApiError> {
    let s3_base = &state.config.s3_base_url;

    // Try as UUID
    if let Ok(id) = lookup.parse::<Uuid>() {
        if let Some(row) = sqlx::query_as::<_, ServiceRow>(
            r#"SELECT s.id, s.name, s.slug, s.domains, s.verified, s.colors, s.ref_link,
                      c.id as category_id, c.title as category_title
               FROM services s
               LEFT JOIN categories c ON s.category_id = c.id
               WHERE s.id = $1"#,
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        {
            return Ok(Json(service_to_response(row, s3_base)));
        }

        if let Some(row) = sqlx::query_as::<_, LimbusRow>(
            "SELECT id, name, domain, logo_url FROM limbus WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        {
            return Ok(Json(limbus_to_response(row)));
        }

        return Err(ApiError::NotFound);
    }

    // Treat as slug or domain
    if let Some(row) = sqlx::query_as::<_, ServiceRow>(
        r#"SELECT s.id, s.name, s.slug, s.domains, s.verified, s.colors, s.ref_link,
                  c.id as category_id, c.title as category_title
           FROM services s
           LEFT JOIN categories c ON s.category_id = c.id
           WHERE s.slug = $1 OR $1 = ANY(s.domains)"#,
    )
    .bind(&lookup)
    .fetch_optional(&state.db)
    .await?
    {
        return Ok(Json(service_to_response(row, s3_base)));
    }

    let domain = &lookup;

    if let Some(row) = sqlx::query_as::<_, LimbusRow>(
        "SELECT id, name, domain, logo_url FROM limbus WHERE domain = $1",
    )
    .bind(domain)
    .fetch_optional(&state.db)
    .await?
    {
        return Ok(Json(limbus_to_response(row)));
    }

    // Search external sources
    let result = search_service::lookup_external(&state.http, &state.config, domain)
        .await
        .ok_or(ApiError::NotFound)?;

    // Stash in limbus for admin approval
    let limbus_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO limbus (id, name, domain, logo_url, source)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (domain) DO NOTHING
           RETURNING id"#,
    )
    .bind(result.id)
    .bind(&result.name)
    .bind(domain)
    .bind(&result.logo_url)
    .bind(&result.source)
    .fetch_optional(&state.db)
    .await?
    .unwrap_or(result.id);

    Ok(Json(ServiceResponse {
        id: limbus_id,
        name: result.name,
        slug: String::new(),
        domains: vec![domain.clone()],
        verified: false,
        colors: serde_json::json!({}),
        logo_url: result.logo_url,
        ref_link: None,
        category: None,
    }))
}
