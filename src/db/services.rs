use sqlx::PgPool;
use uuid::Uuid;

use crate::models::service::{SearchRow, ServiceRow};

fn locale_to_column(locale: &str) -> Option<&'static str> {
    match locale.to_lowercase().replace('-', "_").as_str() {
        "bg" => Some("bg"),
        "cs" => Some("cs"),
        "da" => Some("da"),
        "de" => Some("de"),
        "el" => Some("el"),
        "en" => Some("en"),
        "es" => Some("es"),
        "fi" => Some("fi"),
        "fil" => Some("fil"),
        "fr" => Some("fr"),
        "hi" => Some("hi"),
        "hu" => Some("hu"),
        "is" | "is_" => Some("is_"),
        "it" => Some("it"),
        "ja" => Some("ja"),
        "ka" => Some("ka"),
        "kk" => Some("kk"),
        "ko" => Some("ko"),
        "nb" => Some("nb"),
        "nl" => Some("nl"),
        "pl" => Some("pl"),
        "pt_br" => Some("pt_br"),
        "ro" => Some("ro"),
        "ru" => Some("ru"),
        "sk" => Some("sk"),
        "sr" => Some("sr"),
        "sv" => Some("sv"),
        "th" => Some("th"),
        "uk" => Some("uk"),
        "vi" => Some("vi"),
        "zh_hans" => Some("zh_hans"),
        "zh_hant" => Some("zh_hant"),
        _ => None,
    }
}

pub async fn search_services(
    pool: &PgPool,
    query: &str,
    count: i64,
    locales: &[&str],
) -> Result<Vec<SearchRow>, sqlx::Error> {
    let cols: Vec<&str> = locales
        .iter()
        .filter_map(|l| locale_to_column(l))
        .collect();

    if cols.is_empty() {
        sqlx::query_as::<_, SearchRow>(
            "SELECT s.id, s.name, s.slug, s.colors FROM services s \
             WHERE similarity(s.name, $1) > 0.1 \
                OR s.name ILIKE '%' || $1 || '%' \
             ORDER BY similarity(s.name, $1) DESC \
             LIMIT $2",
        )
        .bind(query)
        .bind(count)
        .fetch_all(pool)
        .await
    } else {
        let locale_where: Vec<String> = cols
            .iter()
            .map(|col| {
                format!(
                    "(sl.{col} IS NOT NULL AND (\
                        similarity(sl.{col}, $1) > 0.1 OR sl.{col} ILIKE '%' || $1 || '%'\
                    ))"
                )
            })
            .collect();

        let locale_similarities: Vec<String> = cols
            .iter()
            .map(|col| format!("COALESCE(similarity(sl.{col}, $1), 0)"))
            .collect();

        let sql = format!(
            "SELECT s.id, s.name, s.slug, s.colors FROM services s \
             LEFT JOIN service_localizations sl ON sl.id = s.id \
             WHERE similarity(s.name, $1) > 0.1 \
                OR s.name ILIKE '%' || $1 || '%' \
                OR {} \
             ORDER BY GREATEST(similarity(s.name, $1), {}) DESC \
             LIMIT $2",
            locale_where.join(" OR "),
            locale_similarities.join(", "),
        );

        sqlx::query_as::<_, SearchRow>(&sql)
            .bind(query)
            .bind(count)
            .fetch_all(pool)
            .await
    }
}

pub async fn get_service_by_id(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<ServiceRow>, sqlx::Error> {
    sqlx::query_as::<_, ServiceRow>(
        "SELECT s.id, s.name, s.slug, s.category, s.colors, s.links, \
                s.default_locale, s.ref_link, s.created_at, \
                (SELECT jsonb_strip_nulls(to_jsonb(sl)) - 'id' \
                 FROM service_localizations sl WHERE sl.id = s.id) AS localizations \
         FROM services s WHERE s.id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn get_services_by_locale(
    pool: &PgPool,
    locale: &str,
) -> Result<Vec<ServiceRow>, sqlx::Error> {
    let locale_filter = format!("[\"{locale}\"]");

    sqlx::query_as::<_, ServiceRow>(
        "SELECT s.id, s.name, s.slug, s.category, s.colors, s.links, \
                s.default_locale, s.ref_link, s.created_at, \
                (SELECT jsonb_strip_nulls(to_jsonb(sl)) - 'id' \
                 FROM service_localizations sl WHERE sl.id = s.id) AS localizations \
         FROM services s \
         WHERE s.locales @> $1::jsonb \
         ORDER BY s.category, s.name",
    )
    .bind(&locale_filter)
    .fetch_all(pool)
    .await
}
