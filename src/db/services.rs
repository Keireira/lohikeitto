use sqlx::PgPool;
use uuid::Uuid;

use crate::models::service::{LocalizationEntry, PreloadRow, SearchRow, ServiceRow};

pub async fn search_services(
    pool: &PgPool,
    query: &str,
    count: i64,
    locale: Option<&str>,
) -> Result<Vec<SearchRow>, sqlx::Error> {
    match locale {
        Some(loc) => {
            sqlx::query_as::<_, SearchRow>(
                "SELECT s.id, s.name, s.slug, s.colors FROM services s \
                 WHERE similarity(s.name, $1) > 0.1 \
                    OR s.name ILIKE '%' || $1 || '%' \
                    OR EXISTS ( \
                        SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.aliases->$3, '[]'::jsonb)) AS alias \
                        WHERE similarity(alias, $1) > 0.1 OR alias ILIKE '%' || $1 || '%' \
                    ) \
                    OR EXISTS ( \
                        SELECT 1 FROM service_localizations sl \
                        WHERE sl.service_id = s.id AND sl.locale = $3 \
                          AND (similarity(sl.name, $1) > 0.1 OR sl.name ILIKE '%' || $1 || '%') \
                    ) \
                 ORDER BY GREATEST( \
                    similarity(s.name, $1), \
                    COALESCE((SELECT MAX(similarity(alias, $1)) FROM jsonb_array_elements_text(COALESCE(s.aliases->$3, '[]'::jsonb)) AS alias), 0), \
                    COALESCE((SELECT MAX(similarity(sl.name, $1)) FROM service_localizations sl WHERE sl.service_id = s.id AND sl.locale = $3), 0) \
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
                "SELECT s.id, s.name, s.slug, s.colors FROM services s \
                 WHERE similarity(s.name, $1) > 0.1 \
                    OR s.name ILIKE '%' || $1 || '%' \
                    OR EXISTS ( \
                        SELECT 1 FROM jsonb_each(s.aliases) AS e, jsonb_array_elements_text(e.value) AS alias \
                        WHERE similarity(alias, $1) > 0.1 OR alias ILIKE '%' || $1 || '%' \
                    ) \
                    OR EXISTS ( \
                        SELECT 1 FROM service_localizations sl \
                        WHERE sl.service_id = s.id \
                          AND (similarity(sl.name, $1) > 0.1 OR sl.name ILIKE '%' || $1 || '%') \
                    ) \
                 ORDER BY GREATEST( \
                    similarity(s.name, $1), \
                    COALESCE((SELECT MAX(similarity(alias, $1)) FROM jsonb_each(s.aliases) AS e, jsonb_array_elements_text(e.value) AS alias), 0), \
                    COALESCE((SELECT MAX(similarity(sl.name, $1)) FROM service_localizations sl WHERE sl.service_id = s.id), 0) \
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
        "SELECT id, name, slug, category, aliases, colors, links, locales, ref_link, created_at \
         FROM services WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn get_service_localizations(
    pool: &PgPool,
    service_id: Uuid,
) -> Result<Vec<LocalizationEntry>, sqlx::Error> {
    sqlx::query_as::<_, LocalizationEntry>(
        "SELECT locale, name FROM service_localizations WHERE service_id = $1 ORDER BY locale",
    )
    .bind(service_id)
    .fetch_all(pool)
    .await
}

/// Get services for a given locale, ordered by name, for preloading
pub async fn get_services_by_locale(
    pool: &PgPool,
    locale: &str,
    category: Option<&str>,
) -> Result<Vec<PreloadRow>, sqlx::Error> {
    match category {
        Some(cat) => {
            sqlx::query_as::<_, PreloadRow>(
                "SELECT s.id, s.name, s.slug, s.category, s.colors, sl.name AS localized_name \
                 FROM services s \
                 LEFT JOIN service_localizations sl ON sl.service_id = s.id AND sl.locale = $1 \
                 WHERE s.locales @> $2::jsonb AND s.category = $3 \
                 ORDER BY s.name",
            )
            .bind(locale)
            .bind(format!("[\"{locale}\"]"))
            .bind(cat)
            .fetch_all(pool)
            .await
        }
        None => {
            sqlx::query_as::<_, PreloadRow>(
                "SELECT s.id, s.name, s.slug, s.category, s.colors, sl.name AS localized_name \
                 FROM services s \
                 LEFT JOIN service_localizations sl ON sl.service_id = s.id AND sl.locale = $1 \
                 WHERE s.locales @> $2::jsonb \
                 ORDER BY s.category, s.name",
            )
            .bind(locale)
            .bind(format!("[\"{locale}\"]"))
            .fetch_all(pool)
            .await
        }
    }
}
