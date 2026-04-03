use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::app::AdminState;
use crate::error::AdminError;

#[derive(Debug, Serialize)]
pub struct LimbusItem {
    pub id: Uuid,
    pub name: String,
    pub domain: String,
    pub logo_url: Option<String>,
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct LimbusWithDate {
    id: Uuid,
    name: String,
    domain: String,
    logo_url: Option<String>,
    source: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

/// List all limbus entries.
pub async fn list(State(state): State<AdminState>) -> Result<Json<Vec<LimbusItem>>, AdminError> {
    let rows = sqlx::query_as::<sqlx::Postgres, LimbusWithDate>(
        "SELECT id, name, domain, logo_url, source, created_at FROM limbus ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let items = rows
        .into_iter()
        .map(|r| LimbusItem {
            id: r.id,
            name: r.name,
            domain: r.domain,
            logo_url: r.logo_url,
            source: r.source,
            created_at: r.created_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(items))
}

/// Create a new limbus entry.
#[derive(Debug, Deserialize)]
pub struct CreateLimbus {
    pub name: String,
    pub domain: String,
    pub logo_url: Option<String>,
    pub source: String,
}

pub async fn create(
    State(state): State<AdminState>,
    Json(req): Json<CreateLimbus>,
) -> Result<Json<LimbusItem>, AdminError> {
    let row = sqlx::query_as::<sqlx::Postgres, LimbusWithDate>(
        r#"
        INSERT INTO limbus (name, domain, logo_url, source)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, domain, logo_url, source, created_at
        "#,
    )
    .bind(&req.name)
    .bind(&req.domain)
    .bind(&req.logo_url)
    .bind(&req.source)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(LimbusItem {
        id: row.id,
        name: row.name,
        domain: row.domain,
        logo_url: row.logo_url,
        source: row.source,
        created_at: row.created_at.to_rfc3339(),
    }))
}

/// Delete a limbus entry (reject it).
pub async fn remove(
    State(state): State<AdminState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AdminError> {
    sqlx::query("DELETE FROM limbus WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "deleted": id })))
}

/// Approve a limbus entry — move it to services.
#[derive(Debug, Deserialize)]
pub struct ApproveRequest {
    pub slug: String,
    pub category_slug: Option<String>,
    pub colors: serde_json::Value,
}

pub async fn approve(
    State(state): State<AdminState>,
    Path(id): Path<Uuid>,
    Json(req): Json<ApproveRequest>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let limbus = sqlx::query_as::<sqlx::Postgres, LimbusWithDate>(
        "SELECT id, name, domain, logo_url, source, created_at FROM limbus WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Insert into services
    sqlx::query(
        r#"
        INSERT INTO services (name, slug, domains, verified, category_slug, colors)
        VALUES ($1, $2, $3, true, $4, $5)
        "#,
    )
    .bind(&limbus.name)
    .bind(&req.slug)
    .bind(std::slice::from_ref(&limbus.domain))
    .bind(&req.category_slug)
    .bind(&req.colors)
    .execute(&state.db)
    .await?;

    // Remove from limbus
    sqlx::query("DELETE FROM limbus WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({
        "approved": id,
        "name": limbus.name,
    })))
}
