use sqlx::PgPool;
use uuid::Uuid;

use crate::models::service::{SearchRow, ServiceRow};

pub async fn search_services(
    pool: &PgPool,
    query: &str,
    count: i64,
    locale: Option<&str>,
) -> Result<Vec<SearchRow>, sqlx::Error> {
    match locale {
        Some(loc) => {
            sqlx::query_as::<_, SearchRow>(
                "SELECT id, name, slug, colors FROM services \
                 WHERE similarity(name, $1) > 0.1 \
                    OR name ILIKE '%' || $1 || '%' \
                    OR EXISTS ( \
                        SELECT 1 FROM jsonb_array_elements_text(COALESCE(aliases->$3, '[]'::jsonb)) AS alias \
                        WHERE similarity(alias, $1) > 0.1 OR alias ILIKE '%' || $1 || '%' \
                    ) \
                 ORDER BY GREATEST( \
                    similarity(name, $1), \
                    COALESCE((SELECT MAX(similarity(alias, $1)) FROM jsonb_array_elements_text(COALESCE(aliases->$3, '[]'::jsonb)) AS alias), 0) \
                 ) DESC \
                 LIMIT $2",
            )
            .bind(query)
            .bind(count)
            .bind(loc)
            .fetch_all(pool)
            .await
        }
        None => {
            sqlx::query_as::<_, SearchRow>(
                "SELECT id, name, slug, colors FROM services \
                 WHERE similarity(name, $1) > 0.1 \
                    OR name ILIKE '%' || $1 || '%' \
                    OR EXISTS ( \
                        SELECT 1 FROM jsonb_each(aliases) AS e, jsonb_array_elements_text(e.value) AS alias \
                        WHERE similarity(alias, $1) > 0.1 OR alias ILIKE '%' || $1 || '%' \
                    ) \
                 ORDER BY GREATEST( \
                    similarity(name, $1), \
                    COALESCE((SELECT MAX(similarity(alias, $1)) FROM jsonb_each(aliases) AS e, jsonb_array_elements_text(e.value) AS alias), 0) \
                 ) DESC \
                 LIMIT $2",
            )
            .bind(query)
            .bind(count)
            .fetch_all(pool)
            .await
        }
    }
}

pub async fn get_service_by_id(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<ServiceRow>, sqlx::Error> {
    sqlx::query_as::<_, ServiceRow>(
        "SELECT id, name, slug, category, aliases, colors, links, ref_link, created_at \
         FROM services WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}
