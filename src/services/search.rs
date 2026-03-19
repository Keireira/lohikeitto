use std::collections::HashSet;

use reqwest::Client;
use sqlx::PgPool;
use tracing::warn;
use uuid::Uuid;

use crate::config::Config;

use crate::dto::search::{SearchResult, SearchSource};
use crate::models::brandfetch::BrandfetchItem;
use crate::models::logodev::LogoDevItem;
use crate::models::service::ServiceRow;

pub async fn search(
    pool: &PgPool,
    http: &Client,
    config: &Config,
    q: &str,
    source: &SearchSource,
) -> Vec<SearchResult> {
    let (local, brandfetch, logodev) = match source {
        SearchSource::Local => {
            let local = search_local(pool, &config.s3_base_url, q).await;
            (local, vec![], vec![])
        }

        SearchSource::Brandfetch => {
            let brandfetch = search_brandfetch(http, &config.brandfetch_client_id, q).await;
            (vec![], brandfetch, vec![])
        }

        SearchSource::Logodev => {
            let logodev = search_logodev(http, &config.logodev_pk, &config.logodev_sk, q).await;
            (vec![], vec![], logodev)
        }

        SearchSource::External => {
            let (brandfetch, logodev) = tokio::join!(
                search_brandfetch(http, &config.brandfetch_client_id, q),
                search_logodev(http, &config.logodev_pk, &config.logodev_sk, q),
            );
            (vec![], brandfetch, logodev)
        }

        SearchSource::All => {
            let (local, brandfetch, logodev) = tokio::join!(
                search_local(pool, &config.s3_base_url, q),
                search_brandfetch(http, &config.brandfetch_client_id, q),
                search_logodev(http, &config.logodev_pk, &config.logodev_sk, q),
            );
            (local, brandfetch, logodev)
        }
    };

    deduplicate(local, brandfetch, logodev)
}

async fn search_local(pool: &PgPool, s3_base_url: &str, q: &str) -> Vec<SearchResult> {
    let rows = sqlx::query_as::<sqlx::Postgres, ServiceRow>(
        r#"
        SELECT id, name, slug, domain
        FROM services
        WHERE name ILIKE '%' || $1 || '%'
           OR domain ILIKE '%' || $1 || '%'
        ORDER BY similarity(name, $1) DESC
        LIMIT 10
        "#,
    )
    .bind(q)
    .fetch_all(pool)
    .await
    .unwrap_or_else(|e| {
        warn!(error = %e, "local search failed");
        vec![]
    });

    rows.into_iter()
        .filter_map(|r| {
            let domain = r.domain?;
            Some(SearchResult {
                id: r.id,
                logo_url: format!("{}/logos/{}.webp", s3_base_url, r.slug),
                name: r.name,
                domain,
                source: "local".into(),
            })
        })
        .collect()
}

async fn search_brandfetch(http: &Client, client_id: &str, q: &str) -> Vec<SearchResult> {
    let mut url = match url::Url::parse("https://api.brandfetch.io/v2/search/_") {
        Ok(u) => u,
        Err(_) => return vec![],
    };
    url.path_segments_mut().unwrap().pop().push(q);
    url.query_pairs_mut().append_pair("c", client_id);

    let items: Vec<BrandfetchItem> = match http.get(url.as_str()).send().await {
        Ok(resp) if resp.status().is_success() => resp.json().await.unwrap_or_else(|e| {
            warn!(error = %e, "failed to parse brandfetch response");
            vec![]
        }),
        Ok(resp) => {
            warn!(status = %resp.status(), "brandfetch returned error");
            vec![]
        }
        Err(e) => {
            warn!(error = %e, "brandfetch request failed");
            vec![]
        }
    };

    items
        .into_iter()
        .filter(|item| !item.domain.is_empty())
        .map(|item| {
            let name = item
                .name
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| item.domain.clone());

            SearchResult {
                id: Uuid::new_v5(&Uuid::NAMESPACE_URL, item.domain.as_bytes()),
                logo_url: item.icon.unwrap_or_else(|| {
                    format!(
                        "https://cdn.brandfetch.io/{}/w/160/h/160/fallback/lettermark/icon.webp?c={}",
                        item.brand_id, client_id
                    )
                }),
                name,
                domain: item.domain,
                source: "brandfetch".into(),
            }
        })
        .collect()
}

async fn search_logodev(http: &Client, pk: &str, sk: &str, q: &str) -> Vec<SearchResult> {
    let mut logo_url = url::Url::parse("https://api.logo.dev/search").unwrap();
    logo_url.query_pairs_mut().append_pair("q", q);

    let items: Vec<LogoDevItem> = match http.get(logo_url.as_str()).bearer_auth(sk).send().await {
        Ok(resp) if resp.status().is_success() => resp.json().await.unwrap_or_else(|e| {
            warn!(error = %e, "failed to parse logo.dev response");
            vec![]
        }),
        Ok(resp) => {
            warn!(status = %resp.status(), "logo.dev returned error");
            vec![]
        }
        Err(e) => {
            warn!(error = %e, "logo.dev request failed");
            vec![]
        }
    };

    items
        .into_iter()
        .filter(|item| !item.domain.is_empty())
        .map(|item| SearchResult {
            id: Uuid::new_v5(&Uuid::NAMESPACE_URL, item.domain.as_bytes()),
            logo_url: item.logo_url.unwrap_or_else(|| {
                format!(
                    "https://img.logo.dev/{}?token={}&size=160&retina=true",
                    item.domain, pk
                )
            }),
            name: item.name,
            domain: item.domain,
            source: "logo.dev".into(),
        })
        .collect()
}

// Priority-based deduplication by domain: local > brandfetch > logo.dev
fn deduplicate(
    local: Vec<SearchResult>,
    brandfetch: Vec<SearchResult>,
    logodev: Vec<SearchResult>,
) -> Vec<SearchResult> {
    let mut seen = HashSet::new();
    let mut results = Vec::new();

    for group in [local, brandfetch, logodev] {
        for item in group {
            if seen.insert(item.domain.clone()) {
                results.push(item);
            }
        }
    }

    results
}
