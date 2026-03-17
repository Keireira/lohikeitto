use sqlx::PgPool;
use uuid::Uuid;

use crate::models::service::{SearchRow, ServiceRow};

pub async fn search_services(
    pool: &PgPool,
    query: &str,
    count: i64,
) -> Result<Vec<SearchRow>, sqlx::Error> {
    sqlx::query_as::<_, SearchRow>(
        "SELECT s.id, s.name, s.slug FROM services s \
         WHERE similarity(s.name, $1) > 0.1 \
            OR s.name ILIKE '%' || $1 || '%' \
         ORDER BY similarity(s.name, $1) DESC \
         LIMIT $2",
    )
    .bind(query)
    .bind(count)
    .fetch_all(pool)
    .await
}

pub async fn get_service_by_id(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<ServiceRow>, sqlx::Error> {
    sqlx::query_as::<_, ServiceRow>(
        "SELECT s.id, s.name, s.slug, s.category_id, c.title AS category, \
                s.colors, s.links, s.ref_link \
         FROM services s \
         LEFT JOIN categories c ON c.id = s.category_id \
         WHERE s.id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn get_services_by_country(
    pool: &PgPool,
    country: &str,
) -> Result<Vec<ServiceRow>, sqlx::Error> {
    sqlx::query_as::<_, ServiceRow>(
        "SELECT id, name, slug, category_id, category, colors, links, ref_link FROM ( \
             SELECT s.id, s.name, s.slug, s.category_id, c.title AS category, \
                    s.colors, s.links, s.ref_link, \
                    ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY s.name) AS rn \
             FROM services s \
             LEFT JOIN categories c ON c.id = s.category_id \
             WHERE s.countries ? $1 \
         ) sub WHERE rn <= 20 \
         ORDER BY category, name",
    )
    .bind(country)
    .fetch_all(pool)
    .await
}
