use axum::{
    body::Body,
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use sqlx::Row;

use crate::app::AdminState;
use crate::error::AdminError;

/// Export the entire database as SQL statements.
pub async fn export_sql(State(state): State<AdminState>) -> Result<Response, AdminError> {
    let mut sql = String::new();

    sql.push_str("-- Lohikeitto database export\n");
    sql.push_str(&format!(
        "-- Generated at {}\n\n",
        chrono::Utc::now().to_rfc3339()
    ));

    // Export categories
    let cats: Vec<(uuid::Uuid, String)> = sqlx::query("SELECT id, title FROM categories ORDER BY title")
        .fetch_all(&state.db)
        .await?
        .iter()
        .map(|r| (r.get("id"), r.get("title")))
        .collect();

    if !cats.is_empty() {
        sql.push_str("-- Categories\n");
        for (id, title) in &cats {
            sql.push_str(&format!(
                "INSERT INTO categories (id, title) VALUES ('{}', '{}') ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;\n",
                id,
                title.replace('\'', "''")
            ));
        }
        sql.push('\n');
    }

    // Export services
    let rows = sqlx::query(
        "SELECT id, name, slug, domains, verified, category_id, colors, ref_link FROM services ORDER BY name",
    )
    .fetch_all(&state.db)
    .await?;

    if !rows.is_empty() {
        sql.push_str("-- Services\n");
        for r in &rows {
            let id: uuid::Uuid = r.get("id");
            let name: String = r.get("name");
            let slug: String = r.get("slug");
            let domains: Vec<String> = r.get("domains");
            let verified: bool = r.get("verified");
            let category_id: Option<uuid::Uuid> = r.get("category_id");
            let colors: serde_json::Value = r.get("colors");
            let ref_link: Option<String> = r.get("ref_link");

            let domains_sql = format!(
                "ARRAY[{}]::text[]",
                domains
                    .iter()
                    .map(|d| format!("'{}'", d.replace('\'', "''")))
                    .collect::<Vec<_>>()
                    .join(",")
            );
            let cat_sql = match category_id {
                Some(c) => format!("'{}'", c),
                None => "NULL".to_string(),
            };
            let ref_sql = match &ref_link {
                Some(r) => format!("'{}'", r.replace('\'', "''")),
                None => "NULL".to_string(),
            };

            sql.push_str(&format!(
                "INSERT INTO services (id, name, slug, domains, verified, category_id, colors, ref_link) VALUES ('{}', '{}', '{}', {}, {}, {}, '{}', {}) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, domains=EXCLUDED.domains, verified=EXCLUDED.verified, category_id=EXCLUDED.category_id, colors=EXCLUDED.colors, ref_link=EXCLUDED.ref_link;\n",
                id,
                name.replace('\'', "''"),
                slug.replace('\'', "''"),
                domains_sql,
                verified,
                cat_sql,
                colors.to_string().replace('\'', "''"),
                ref_sql,
            ));
        }
        sql.push('\n');
    }

    // Export limbus
    let limbus_rows = sqlx::query(
        "SELECT id, name, domain, logo_url, source, created_at FROM limbus ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    if !limbus_rows.is_empty() {
        sql.push_str("-- Limbus\n");
        for r in &limbus_rows {
            let id: uuid::Uuid = r.get("id");
            let name: String = r.get("name");
            let domain: String = r.get("domain");
            let logo_url: Option<String> = r.get("logo_url");
            let source: String = r.get("source");

            let logo_sql = match &logo_url {
                Some(u) => format!("'{}'", u.replace('\'', "''")),
                None => "NULL".to_string(),
            };

            sql.push_str(&format!(
                "INSERT INTO limbus (id, name, domain, logo_url, source) VALUES ('{}', '{}', '{}', {}, '{}') ON CONFLICT (id) DO NOTHING;\n",
                id,
                name.replace('\'', "''"),
                domain.replace('\'', "''"),
                logo_sql,
                source.replace('\'', "''"),
            ));
        }
    }

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/sql")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"lohikeitto-export.sql\"",
        )
        .body(Body::from(sql))
        .unwrap();

    Ok(response)
}

/// Drop all data from all tables.
pub async fn drop_all(State(state): State<AdminState>) -> Result<Json<serde_json::Value>, AdminError> {
    // Order matters due to foreign keys
    sqlx::query("DELETE FROM limbus").execute(&state.db).await?;
    sqlx::query("DELETE FROM services").execute(&state.db).await?;
    sqlx::query("DELETE FROM categories").execute(&state.db).await?;

    Ok(Json(serde_json::json!({ "dropped": true })))
}

/// Import SQL statements.
pub async fn import_sql(
    State(state): State<AdminState>,
    body: String,
) -> Result<Json<serde_json::Value>, AdminError> {
    let mut statements: Vec<&str> = body
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.starts_with("--"))
        .collect();

    // Sort: categories first, then services/limbus, then everything else (UPDATEs, DELETEs)
    statements.sort_by_key(|s| {
        let lower = s.to_lowercase();
        if lower.contains("into categories") { 0 }
        else if lower.contains("into services") || lower.contains("into limbus") { 1 }
        else { 2 }
    });

    let mut executed = 0u32;
    let mut errors = Vec::new();

    for stmt in &statements {
        match sqlx::query(stmt).execute(&state.db).await {
            Ok(_) => executed += 1,
            Err(e) => errors.push(format!("{}: {}", &stmt[..stmt.len().min(60)], e)),
        }
    }

    Ok(Json(serde_json::json!({
        "executed": executed,
        "errors": errors,
        "total": statements.len()
    })))
}
