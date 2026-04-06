use axum::{
    Json,
    extract::{Path, Query, State},
};
use uuid::Uuid;

use serde::Deserialize;

use crate::app::AppState;
use crate::dto::internal::ErrorResponse;
use crate::dto::service::ServiceResponse;
use crate::error::ApiError;
use crate::services::search as search_service;

#[derive(Debug, Deserialize)]
pub struct ServiceQuery {
    pub source_hint: Option<String>,
    /// Country code, works with source_hint=appstore|playstore (default: US)
    pub country: Option<String>,
    /// Language code (default: en)
    pub language: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct ServiceRow {
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
}

fn service_to_response(row: ServiceRow, s3_base: &str) -> ServiceResponse {
    let logo_url = format!("{}/logos/{}.webp", s3_base, row.slug);

    ServiceResponse {
        id: row.id,
        name: row.name,
        slug: row.slug,
        bundle_id: row.bundle_id,
        description: row.description,
        domains: row.domains,
        alternative_names: row.alternative_names,
        tags: row.tags,
        verified: row.verified,
        colors: row.colors,
        social_links: row.social_links,
        logo_url,
        ref_link: row.ref_link,
        category_slug: row.category_slug,
    }
}

#[utoipa::path(
    get,
    path = "/service/{lookup}",
    tag = "Services",
    summary = "Get a service by ID or domain",
    description = "Look up a service by UUID, domain, or package/bundle ID. If not found locally, searches external sources and adds the result to the approval queue. Without `source_hint`, only brandfetch + logo.dev are searched. Use `source_hint` for App Store (`appstore`), Google Play (`playstore`), or direct web scraping (`web`).",
    params(
        ("lookup" = String, Path, description = "Service UUID, domain name, or bundle ID"),
        ("source_hint" = Option<String>, Query, description = "External source for exact lookup: `appstore`, `playstore`, or `web`"),
        ("country" = Option<String>, Query, description = "Country code, works with source_hint=appstore|playstore (default: US)"),
        ("language" = Option<String>, Query, description = "Language code for store results (default: en)"),
    ),
    responses(
        (status = 200, description = "Service found", body = ServiceResponse),
        (status = 404, description = "Service not found", body = ErrorResponse),
    )
)]
pub async fn get(
    State(state): State<AppState>,
    Path(lookup): Path<String>,
    Query(query): Query<ServiceQuery>,
) -> Result<Json<ServiceResponse>, ApiError> {
    let s3_base = &state.config.s3_base_url;

    // Try as UUID
    if let Ok(id) = lookup.parse::<Uuid>() {
        if let Some(row) = sqlx::query_as::<_, ServiceRow>(
            r#"SELECT id, name, slug, bundle_id, description,
                      domains, alternative_names, tags,
                      verified, colors, social_links, ref_link,
                      category_slug
               FROM services
               WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        {
            return Ok(Json(service_to_response(row, s3_base)));
        }

        return Err(ApiError::NotFound);
    }

    // Treat as slug or domain
    if let Some(row) = sqlx::query_as::<_, ServiceRow>(
        r#"SELECT id, name, slug, bundle_id, description,
                      domains, alternative_names, tags,
                      verified, colors, social_links, ref_link,
                      category_slug
           FROM services
           WHERE slug = $1 OR bundle_id = $1 OR $1 = ANY(domains)
              OR EXISTS (SELECT 1 FROM unnest(alternative_names) a WHERE a ILIKE $1)"#,
    )
    .bind(&lookup)
    .fetch_optional(&state.db)
    .await?
    {
        return Ok(Json(service_to_response(row, s3_base)));
    }

    let domain = &lookup;

    // Search external sources
    let country = query.country.unwrap_or_else(|| "US".into());
    let language = query.language.unwrap_or_default();
    let result = search_service::lookup_external(
        &state.http,
        &state.config,
        domain,
        query.source_hint.as_deref(),
        &country,
        &language,
    )
    .await
    .ok_or(ApiError::NotFound)?;

    // Stash in limbus for admin approval
    let limbus_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO limbus (id, name, domain, logo_url, source, description, bundle_id, category_slug, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (domain) DO NOTHING
           RETURNING id"#,
    )
    .bind(result.id)
    .bind(&result.name)
    .bind(domain)
    .bind(&result.logo_url)
    .bind(&result.source)
    .bind(&result.description)
    .bind(&result.bundle_id)
    .bind(&result.category_slug)
    .bind(result.tags.as_deref().unwrap_or_default())
    .fetch_optional(&state.db)
    .await?
    .unwrap_or(result.id);

    Ok(Json(ServiceResponse {
        id: limbus_id,
        name: result.name,
        slug: String::new(),
        bundle_id: result.bundle_id,
        description: result.description,
        domains: if result.domains.is_empty() {
            vec![domain.clone()]
        } else {
            result.domains
        },
        alternative_names: vec![],
        tags: result.tags.unwrap_or_default(),
        verified: false,
        colors: serde_json::json!({}),
        social_links: serde_json::json!({}),
        logo_url: result.logo_url,
        ref_link: None,
        category_slug: result.category_slug,
    }))
}
