use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::app::AppState;
use crate::error::{ApiOk, AppError};
use crate::routes::check_admin;
use crate::services::{imgconv, logo_sync};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/admin/config", get(get_config))
        .route("/admin/services", get(list_services))
        .route("/admin/services/{id}", get(get_service))
        .route("/admin/services/{id}", put(update_service))
        .route("/admin/services/{id}", delete(delete_service))
        .route("/admin/services/{id}/approve", put(approve_service))
        .route("/admin/services/{id}/sync-logos", post(sync_service_logos))
        .route("/admin/services/{id}/save-logo", post(save_single_logo))
        .route("/admin/categories", get(list_categories))
        .route("/admin/export-sql", get(export_sql))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Category {
    pub id: Uuid,
    pub title: String,
}

async fn list_categories(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<ApiOk<Vec<Category>>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;
    let rows: Vec<Category> = sqlx::query_as("SELECT id, title FROM categories ORDER BY title")
        .fetch_all(&state.db)
        .await?;
    Ok(ApiOk(rows))
}

async fn get_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<ApiOk<serde_json::Value>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;
    Ok(ApiOk(serde_json::json!({
        "logo_base_url": state.logo_base_url,
        "brandfetch_client_id": state.brandfetch_client_id,
        "logodev_token": state.logodev_token,
    })))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub filter: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ServiceListItem {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub domain: Option<String>,
    pub verified: bool,
    pub category: Option<String>,
}

async fn list_services(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<ListQuery>,
) -> Result<ApiOk<Vec<ServiceListItem>>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    let filter = params.filter.unwrap_or_else(|| "all".into());
    let rows: Vec<ServiceListItem> = match filter.as_str() {
        "verified" => {
            sqlx::query_as(
                "SELECT s.id, s.name, s.slug, s.domain, s.verified, c.title AS category \
                 FROM services s LEFT JOIN categories c ON c.id = s.category_id \
                 WHERE s.verified = true ORDER BY s.name",
            )
            .fetch_all(&state.db)
            .await?
        }
        "unverified" => {
            sqlx::query_as(
                "SELECT s.id, s.name, s.slug, s.domain, s.verified, c.title AS category \
                 FROM services s LEFT JOIN categories c ON c.id = s.category_id \
                 WHERE s.verified = false ORDER BY s.name",
            )
            .fetch_all(&state.db)
            .await?
        }
        _ => {
            sqlx::query_as(
                "SELECT s.id, s.name, s.slug, s.domain, s.verified, c.title AS category \
                 FROM services s LEFT JOIN categories c ON c.id = s.category_id \
                 ORDER BY s.name",
            )
            .fetch_all(&state.db)
            .await?
        }
    };

    Ok(ApiOk(rows))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ServiceFull {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub domain: Option<String>,
    pub verified: bool,
    pub category_id: Option<Uuid>,
    pub category: Option<String>,
    pub colors: serde_json::Value,
    pub links: serde_json::Value,
    pub countries: serde_json::Value,
    pub ref_link: Option<String>,
}

async fn get_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<ApiOk<ServiceFull>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    let row: Option<ServiceFull> = sqlx::query_as(
        "SELECT s.id, s.name, s.slug, s.domain, s.verified, \
                s.category_id, c.title AS category, \
                s.colors, s.links, s.countries, s.ref_link \
         FROM services s LEFT JOIN categories c ON c.id = s.category_id \
         WHERE s.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    row.map(ApiOk)
        .ok_or_else(|| AppError::NotFound("Service not found".into()))
}

#[derive(Debug, Deserialize)]
pub struct UpdateService {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub domain: Option<String>,
    pub category_id: Option<Uuid>,
    pub colors: Option<serde_json::Value>,
    pub links: Option<serde_json::Value>,
    pub countries: Option<serde_json::Value>,
    pub ref_link: Option<String>,
}

async fn update_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateService>,
) -> Result<ApiOk<&'static str>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    sqlx::query(
        "UPDATE services SET \
            name = COALESCE($2, name), \
            slug = COALESCE($3, slug), \
            domain = COALESCE($4, domain), \
            category_id = COALESCE($5, category_id), \
            colors = COALESCE($6, colors), \
            links = COALESCE($7, links), \
            countries = COALESCE($8, countries), \
            ref_link = COALESCE($9, ref_link) \
         WHERE id = $1",
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.slug)
    .bind(&body.domain)
    .bind(&body.category_id)
    .bind(&body.colors)
    .bind(&body.links)
    .bind(&body.countries)
    .bind(&body.ref_link)
    .execute(&state.db)
    .await?;

    Ok(ApiOk("updated"))
}

async fn delete_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<ApiOk<&'static str>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    sqlx::query("DELETE FROM services WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    tracing::info!(%id, "service deleted");
    Ok(ApiOk("deleted"))
}

async fn approve_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<ApiOk<&'static str>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    sqlx::query("UPDATE services SET verified = true WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(ApiOk("approved"))
}

async fn sync_service_logos(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<ApiOk<logo_sync::SyncResult>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT slug, domain FROM services WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let (slug, domain) = row.ok_or_else(|| AppError::NotFound("Service not found".into()))?;
    let domain = domain.ok_or_else(|| AppError::BadRequest("Service has no domain set".into()))?;

    let result = logo_sync::sync_service(&state, &slug, &domain).await;
    Ok(ApiOk(result))
}

#[derive(Debug, Deserialize)]
pub struct SaveLogoRequest {
    /// "bf_logo", "bf_symbol", or "logodev"
    pub logo_type: String,
}

async fn save_single_logo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<SaveLogoRequest>,
) -> Result<ApiOk<&'static str>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT slug, domain FROM services WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let (slug, domain) = row.ok_or_else(|| AppError::NotFound("Service not found".into()))?;
    let domain = domain.ok_or_else(|| AppError::BadRequest("No domain set".into()))?;

    let (url, key, content_type) = match body.logo_type.as_str() {
        "bf_logo" => (
            format!("https://cdn.brandfetch.io/domain/{domain}/w/400/h/400?c={}", state.brandfetch_client_id),
            format!("bf/logos/{slug}.webp"),
            "image/webp",
        ),
        "bf_symbol" => (
            format!("https://cdn.brandfetch.io/domain/{domain}/w/800/h/800/theme/light/symbol?c={}", state.brandfetch_client_id),
            format!("bf/symbols/{slug}.webp"),
            "image/webp",
        ),
        "logodev" => (
            format!("https://img.logo.dev/{domain}?token={}&size=1024&format=webp&retina=true", state.logodev_token),
            format!("logodev/{slug}.webp"),
            "image/webp",
        ),
        _ => return Err(AppError::BadRequest("Invalid logo_type".into())),
    };

    let resp = state.http.get(&url)
        .header("User-Agent", "Mozilla/5.0 (compatible; Soup/1.0)")
        .header("Accept", "image/webp,image/png,image/jpeg,image/*,*/*")
        .send().await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !resp.status().is_success() {
        return Err(AppError::BadRequest(format!("Source returned {}", resp.status())));
    }

    let bytes = resp.bytes().await
        .map_err(|e| AppError::Internal(e.into()))?;

    if bytes.is_empty() {
        return Err(AppError::BadRequest("Empty response from source".into()));
    }

    let (webp_bytes, src_fmt) = imgconv::to_webp(&bytes)
        .map_err(|e| {
            let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]);
            tracing::warn!(%key, %e, %preview, "image conversion failed");
            AppError::BadRequest(e)
        })?;

    tracing::info!(%key, src_fmt, src_size = bytes.len(), webp_size = webp_bytes.len(), "converted to webp");

    crate::s3::client::upload(&state.bucket, &key, &webp_bytes, content_type).await?;

    tracing::info!(%id, %key, "logo saved to R2");
    Ok(ApiOk("saved"))
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub filter: Option<String>,
    pub ids: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct ExportRow {
    id: Uuid,
    name: String,
    slug: String,
    domain: Option<String>,
    category_id: Option<Uuid>,
    colors: serde_json::Value,
    links: serde_json::Value,
    countries: serde_json::Value,
}

async fn export_sql(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<ExportQuery>,
) -> Result<ApiOk<String>, AppError> {
    check_admin(&state, headers.get("authorization").and_then(|v| v.to_str().ok()))?;

    let rows: Vec<ExportRow> = if let Some(ids_str) = &params.ids {
        let ids: Vec<Uuid> = ids_str
            .split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        if ids.is_empty() {
            return Ok(ApiOk(String::from("-- No services\n")));
        }
        sqlx::query_as(
            "SELECT id, name, slug, domain, category_id, colors, links, countries \
             FROM services WHERE id = ANY($1) ORDER BY name",
        )
        .bind(&ids)
        .fetch_all(&state.db)
        .await?
    } else {
        let filter = params.filter.as_deref().unwrap_or("all");
        let sql = match filter {
            "verified" => {
                "SELECT id, name, slug, domain, category_id, colors, links, countries \
                 FROM services WHERE verified = true ORDER BY name"
            }
            "unverified" => {
                "SELECT id, name, slug, domain, category_id, colors, links, countries \
                 FROM services WHERE verified = false ORDER BY name"
            }
            _ => {
                "SELECT id, name, slug, domain, category_id, colors, links, countries \
                 FROM services ORDER BY name"
            }
        };
        sqlx::query_as(sql).fetch_all(&state.db).await?
    };

    if rows.is_empty() {
        return Ok(ApiOk(String::from("-- No services to export\n")));
    }

    fn sq(s: &str) -> String {
        s.replace('\'', "''")
    }

    let mut out = String::from(
        "INSERT INTO services (id, name, slug, domain, category_id, colors, links, countries) VALUES\n",
    );

    for (i, r) in rows.iter().enumerate() {
        let domain = r
            .domain
            .as_deref()
            .map(|d| format!("'{}'", sq(d)))
            .unwrap_or_else(|| "NULL".into());
        let cat = r
            .category_id
            .map(|c| format!("'{}'", c))
            .unwrap_or_else(|| "NULL".into());
        let comma = if i + 1 < rows.len() { "," } else { ";" };

        out.push_str(&format!(
            "  ('{}', '{}', '{}', {}, {}, '{}', '{}', '{}'){}\n",
            r.id,
            sq(&r.name),
            sq(&r.slug),
            domain,
            cat,
            sq(&r.colors.to_string()),
            sq(&r.links.to_string()),
            sq(&r.countries.to_string()),
            comma,
        ));
    }

    Ok(ApiOk(out))
}
