use axum::{
    Json,
    body::Body,
    extract::State,
    http::{StatusCode, header},
    response::Response,
};
use shared::utils::{sql_escape, sql_opt};
use sqlx::Row;
use std::fmt::Write;

use crate::app::AdminState;
use crate::error::AdminError;

/// Export the entire database as SQL statements.
pub async fn export_sql(State(state): State<AdminState>) -> Result<Response, AdminError> {
    let mut sql = String::new();

    writeln!(sql, "-- Lohikeitto database export").unwrap();
    writeln!(sql, "-- Generated at {}\n", chrono::Utc::now().to_rfc3339()).unwrap();

    // Export categories
    let cats: Vec<(uuid::Uuid, String)> = sqlx::query(
        r#"
        	SELECT id, title
        	FROM categories
        	ORDER BY title
        "#,
    )
    .fetch_all(&state.db)
    .await?
    .iter()
    .map(|r| (r.get("id"), r.get("title")))
    .collect();

    if !cats.is_empty() {
        writeln!(
            sql,
            "-- Categories\nINSERT INTO categories (id, title) VALUES"
        )
        .unwrap();

        let (last_row_id, _) = cats.last().expect("No last row");

        for (id, title) in &cats {
            let is_last_row = last_row_id == id;

            writeln!(
                sql,
                "  ('{id}', '{}'){}",
                sql_escape(title),
                if is_last_row { ";" } else { "," },
            )
            .unwrap();
        }

        sql.push('\n');
    }

    // Export services
    let rows = sqlx::query(
        r#"
        	SELECT id, name, slug, domains, verified, category_id, colors, ref_link
        	FROM services
        	ORDER BY name
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    if !rows.is_empty() {
        writeln!(sql, "-- Services\nINSERT INTO services (id, name, slug, domains, category_id, colors, ref_link) VALUES").unwrap();

        let last_row = rows.last().expect("No last row");
        let last_row_id: uuid::Uuid = last_row.get("id");

        for r in &rows {
            let id: uuid::Uuid = r.get("id");
            let name: String = r.get("name");
            let slug: String = r.get("slug");
            let domains: Vec<String> = r.get("domains");
            let verified: bool = r.get("verified");
            let category_id: Option<uuid::Uuid> = r.get("category_id");
            let colors: serde_json::Value = r.get("colors");
            let ref_link: Option<String> = r.get("ref_link");
            let is_last_row = last_row_id == id;

            let domains_sql = format!(
                "ARRAY[{}]::text[]",
                domains
                    .iter()
                    .map(|d| format!("'{}'", sql_escape(d)))
                    .collect::<Vec<_>>()
                    .join(",")
            );
            let cat_sql = match category_id {
                Some(c) => format!("'{c}'"),
                None => "NULL".into(),
            };
            let ref_sql = sql_opt(&ref_link);

            writeln!(
                sql,
                "  ('{id}', '{}', '{}', {domains_sql}, {verified}, {cat_sql}, '{}', {ref_sql}){}",
                sql_escape(&name),
                sql_escape(&slug),
                sql_escape(&colors.to_string()),
                if is_last_row { ";" } else { "," },
            )
            .unwrap();
        }

        sql.push('\n');
    }

    // Export limbus
    let limbus_rows = sqlx::query(
        r#"
        	SELECT id, name, domain, logo_url, source, created_at
        	FROM limbus
        	ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    if !limbus_rows.is_empty() {
        writeln!(
            sql,
            "-- Limbus\nINSERT INTO limbus (id, name, domain, logo_url, source) VALUES"
        )
        .unwrap();

        let last_row = limbus_rows.last().expect("No last row");
        let last_row_id: uuid::Uuid = last_row.get("id");

        for r in &limbus_rows {
            let id: uuid::Uuid = r.get("id");
            let name: String = r.get("name");
            let domain: String = r.get("domain");
            let logo_url: Option<String> = r.get("logo_url");
            let source: String = r.get("source");
            let is_last_row = last_row_id == id;

            writeln!(
                sql,
                "  ('{id}', '{}', '{}', {}, '{}'){}",
                sql_escape(&name),
                sql_escape(&domain),
                sql_opt(&logo_url),
                sql_escape(&source),
                if is_last_row { ";" } else { "," },
            )
            .unwrap();
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
        .map_err(|e| AdminError::Internal(format!("Failed to build response: {e}")))?;

    Ok(response)
}

/// Drop all data from all tables.
pub async fn drop_all(
    State(state): State<AdminState>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let mut tx = state.db.begin().await?;

    // Order matters due to foreign keys
    sqlx::query("DELETE FROM limbus").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM services")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM categories")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

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

        if lower.contains("into categories") {
            0
        } else if lower.contains("into services") || lower.contains("into limbus") {
            1
        } else {
            2
        }
    });

    let mut executed = 0u32;
    let mut errors = Vec::new();
    let mut tx = state.db.begin().await?;

    for stmt in &statements {
        match sqlx::query(stmt).execute(&mut *tx).await {
            Ok(_) => executed += 1,
            Err(e) => errors.push(format!("{}: {}", &stmt[..stmt.len().min(60)], e)),
        }
    }

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "executed": executed,
        "errors": errors,
        "total": statements.len()
    })))
}
