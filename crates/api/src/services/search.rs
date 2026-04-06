use std::collections::HashSet;

use reqwest::Client;
use sqlx::PgPool;
use tracing::warn;
use uuid::Uuid;

use crate::config::Config;

use crate::dto::search::{SearchResult, SearchSources, Source};
use crate::models::appstore::{self, ITunesSearchResponse};
use crate::models::brandfetch::BFSearchItem;
use crate::models::logodev::LDSearchItem;
use crate::models::playstore;
use crate::models::web;
use shared::models::service::ServiceRow;

pub async fn search(
    pool: &PgPool,
    http: &Client,
    config: &Config,
    q: &str,
    sources: &SearchSources,
) -> Vec<SearchResult> {
    let inhouse_fut = async {
        if sources.has(Source::Inhouse) {
            search_inhouse(pool, &config.s3_base_url, q).await
        } else {
            vec![]
        }
    };

    let bf_fut = async {
        if sources.has(Source::Brandfetch) {
            search_brandfetch(http, &config.brandfetch_client_id, q).await
        } else {
            vec![]
        }
    };

    let ld_fut = async {
        if sources.has(Source::Logodev) {
            search_logodev(http, &config.logodev_pk, &config.logodev_sk, q).await
        } else {
            vec![]
        }
    };

    let as_fut = async {
        if sources.has(Source::AppStore) {
            search_appstore(http, q).await
        } else {
            vec![]
        }
    };

    let ps_fut = async {
        if sources.has(Source::PlayStore) {
            search_playstore(http, q).await
        } else {
            vec![]
        }
    };

    let web_fut = async {
        if sources.has(Source::Web) {
            search_web(http, q).await
        } else {
            vec![]
        }
    };

    let (inhouse, mut brandfetch, mut logodev, mut appstore, mut playstore, mut web_results) =
        tokio::join!(inhouse_fut, bf_fut, ld_fut, as_fut, ps_fut, web_fut);

    // When 3+ providers returned data, cap external sources to avoid flooding
    let active = [&inhouse, &brandfetch, &logodev, &appstore, &playstore, &web_results]
        .iter()
        .filter(|g| !g.is_empty())
        .count();
    if active >= 3 {
        const CAP: usize = 5;
        brandfetch.truncate(CAP);
        logodev.truncate(CAP);
        appstore.truncate(CAP);
        playstore.truncate(CAP);
        web_results.truncate(CAP);
    }

    deduplicate(inhouse, brandfetch, logodev, appstore, playstore, web_results)
}

async fn search_inhouse(pool: &PgPool, s3_base_url: &str, q: &str) -> Vec<SearchResult> {
    let rows = sqlx::query_as::<sqlx::Postgres, ServiceRow>(
        r#"
        SELECT id, name, slug, domains
        FROM services
        WHERE name ILIKE '%' || $1 || '%'
           OR slug ILIKE '%' || replace($1, ' ', '-') || '%'
           OR EXISTS (SELECT 1 FROM unnest(domains) d WHERE d ILIKE '%' || $1 || '%')
           OR EXISTS (SELECT 1 FROM unnest(alternative_names) a WHERE a ILIKE '%' || $1 || '%')
           OR bundle_id ILIKE '%' || replace($1, ' ', '.') || '%'
        ORDER BY similarity(name, $1) DESC
        LIMIT 10
        "#,
    )
    .bind(q)
    .fetch_all(pool)
    .await
    .unwrap_or_else(|e| {
        warn!(error = %e, "inhouse search failed");
        vec![]
    });

    rows.into_iter()
        .filter(|r| !r.domains.is_empty())
        .map(|r| SearchResult {
            id: r.id,
            logo_url: format!("{}/logos/{}.webp", s3_base_url, r.slug),
            name: r.name,
            domains: r.domains,
            source: "inhouse".into(),
            description: None,
            bundle_id: None,


            category_slug: None,
            tags: None,
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

    let items: Vec<BFSearchItem> = match http.get(url.as_str()).send().await {
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
                domains: vec![item.domain],
                source: "brandfetch".into(),
                description: None,
                bundle_id: None,
    
    
                category_slug: None,
                tags: None,
            }
        })
        .collect()
}

async fn search_logodev(http: &Client, pk: &str, sk: &str, q: &str) -> Vec<SearchResult> {
    let mut logo_url = url::Url::parse("https://api.logo.dev/search").unwrap();
    logo_url.query_pairs_mut().append_pair("q", q);

    let items: Vec<LDSearchItem> = match http.get(logo_url.as_str()).bearer_auth(sk).send().await {
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
            domains: vec![item.domain],
            source: "logo.dev".into(),
            description: None,
            bundle_id: None,


            category_slug: None,
            tags: None,
        })
        .collect()
}

async fn search_appstore(http: &Client, q: &str) -> Vec<SearchResult> {
    let mut url = url::Url::parse("https://itunes.apple.com/search").unwrap();
    url.query_pairs_mut()
        .append_pair("term", q)
        .append_pair("entity", "software")
        .append_pair("limit", "10");

    let resp: ITunesSearchResponse = match http.get(url.as_str()).send().await {
        Ok(resp) if resp.status().is_success() => resp.json().await.unwrap_or_else(|e| {
            warn!(error = %e, "failed to parse appstore response");
            ITunesSearchResponse { results: vec![] }
        }),
        Ok(resp) => {
            warn!(status = %resp.status(), "appstore returned error");
            return vec![];
        }
        Err(e) => {
            warn!(error = %e, "appstore request failed");
            return vec![];
        }
    };

    resp.results
        .into_iter()
        .filter(|app| !app.bundle_id.is_empty())
        .map(itunes_app_to_result)
        .collect()
}

/// Exact lookup by bundle ID via iTunes Lookup API.
async fn lookup_appstore(http: &Client, bundle_id: &str) -> Option<SearchResult> {
    let mut url = url::Url::parse("https://itunes.apple.com/lookup").unwrap();
    url.query_pairs_mut().append_pair("bundleId", bundle_id);

    let resp: ITunesSearchResponse = match http.get(url.as_str()).send().await {
        Ok(resp) if resp.status().is_success() => resp.json().await.ok()?,
        _ => return None,
    };

    resp.results
        .into_iter()
        .next()
        .map(itunes_app_to_result)
}

fn itunes_app_to_result(app: appstore::ITunesApp) -> SearchResult {
    let logo_url = app
        .artwork_url_512
        .or(app.artwork_url_100)
        .unwrap_or_default();

    let (category_slug, tags) = app
        .genres
        .as_deref()
        .map(appstore::map_genres)
        .unwrap_or((None, vec![]));

    let mut domains = Vec::with_capacity(2);
    if let Some(sd) = app.seller_url.as_deref().and_then(|u| {
        url::Url::parse(u)
            .ok()
            .and_then(|parsed| parsed.host_str().map(|h| h.to_string()))
    }) {
        domains.push(sd);
    }
    domains.push(app.bundle_id.clone());

    SearchResult {
        id: Uuid::new_v5(&Uuid::NAMESPACE_URL, app.bundle_id.as_bytes()),
        logo_url,
        name: app.track_name,
        domains,
        source: "appstore".into(),
        description: app.description,
        bundle_id: Some(app.bundle_id),
        category_slug: category_slug.map(Into::into),
        tags: if tags.is_empty() { None } else { Some(tags) },
    }
}

async fn search_playstore(http: &Client, q: &str) -> Vec<SearchResult> {
    let url = format!(
        "https://play.google.com/store/search?q={}&c=apps&hl=en",
        url::form_urlencoded::byte_serialize(q.as_bytes()).collect::<String>()
    );

    let html = match http
        .get(&url)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
        Ok(resp) => {
            warn!(status = %resp.status(), "playstore search returned error");
            return vec![];
        }
        Err(e) => {
            warn!(error = %e, "playstore search request failed");
            return vec![];
        }
    };

    playstore::parse_search_page(&html)
        .into_iter()
        .map(playstore_app_to_result)
        .collect()
}

/// Exact lookup by package name via Google Play details page.
async fn lookup_playstore(http: &Client, package_name: &str) -> Option<SearchResult> {
    let url = format!(
        "https://play.google.com/store/apps/details?id={}&hl=en",
        package_name
    );

    let html = match http
        .get(&url)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp.text().await.ok()?,
        _ => return None,
    };

    playstore::parse_details_page(&html, package_name).map(playstore_app_to_result)
}

fn playstore_app_to_result(app: playstore::PlayStoreApp) -> SearchResult {
    let category_slug = app
        .category
        .as_deref()
        .and_then(playstore::map_category);

    let tags: Vec<String> = app
        .category
        .iter()
        .map(|c| c.to_lowercase().replace(' ', "-").replace('&', "and"))
        .collect();

    SearchResult {
        id: Uuid::new_v5(&Uuid::NAMESPACE_URL, app.package_name.as_bytes()),
        logo_url: app.icon_url,
        name: app.name,
        domains: vec![app.package_name.clone()],
        source: "playstore".into(),
        description: app.description,
        bundle_id: Some(app.package_name),
        category_slug: category_slug.map(Into::into),
        tags: if tags.is_empty() { None } else { Some(tags) },
    }
}

/// Web source: fetch a domain page and extract logo via OG/Twitter/favicon.
async fn search_web(http: &Client, q: &str) -> Vec<SearchResult> {
    // Web source only makes sense for domain-like queries
    if !q.contains('.') {
        return vec![];
    }
    match lookup_web(http, q).await {
        Some(r) => vec![r],
        None => vec![],
    }
}

/// Fetch a domain and extract logo from OG/Twitter Card/favicon.
async fn lookup_web(http: &Client, domain: &str) -> Option<SearchResult> {
    let url_str = format!("https://{domain}");
    let base_url = url::Url::parse(&url_str).ok()?;

    let html = match http
        .get(&url_str)
        .header("Accept", "text/html")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp.text().await.ok()?,
        _ => return None,
    };

    let parsed = web::parse_logo(&html, &base_url)?;
    if parsed.logo_url.is_empty() {
        return None;
    }

    let name = if parsed.name.is_empty() {
        domain.to_string()
    } else {
        parsed.name
    };

    Some(SearchResult {
        id: Uuid::new_v5(&Uuid::NAMESPACE_URL, domain.as_bytes()),
        logo_url: parsed.logo_url,
        name,
        domains: vec![domain.to_string()],
        source: "web".into(),
        description: None,
        bundle_id: None,
        category_slug: None,
        tags: None,
    })
}

/// Search external sources by domain, return first match.
/// When `source_hint` is provided (e.g. "appstore"), uses exact lookup for that source.
/// Without a hint, only searches brandfetch + logo.dev (fast, domain-based sources).
pub async fn lookup_external(
    http: &Client,
    config: &Config,
    domain: &str,
    source_hint: Option<&str>,
) -> Option<SearchResult> {
    match source_hint {
        Some("appstore") => return lookup_appstore(http, domain).await,
        Some("playstore") => return lookup_playstore(http, domain).await,
        Some("web") => return lookup_web(http, domain).await,
        _ => {}
    }

    // Without source_hint: only fast domain-based sources
    let (bf, ld) = tokio::join!(
        search_brandfetch(http, &config.brandfetch_client_id, domain),
        search_logodev(http, &config.logodev_pk, &config.logodev_sk, domain),
    );

    bf.into_iter().chain(ld).next()
}

/// Deduplicate by domain. Local results may have multiple domains — each one
/// blocks external duplicates.
/// Priority: inhouse > appstore > playstore > web > brandfetch > logo.dev.
/// Normalize a domain for dedup comparison: strip `www.` prefix, lowercase.
fn normalize_domain(d: &str) -> String {
    let d = d.to_ascii_lowercase();
    d.strip_prefix("www.").unwrap_or(&d).to_string()
}

fn deduplicate(
    inhouse: Vec<SearchResult>,
    brandfetch: Vec<SearchResult>,
    logodev: Vec<SearchResult>,
    appstore: Vec<SearchResult>,
    playstore: Vec<SearchResult>,
    web: Vec<SearchResult>,
) -> Vec<SearchResult> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut results: Vec<SearchResult> = Vec::new();

    for group in [inhouse, appstore, playstore, web, brandfetch, logodev] {
        for item in group {
            let dominated = item.domains.iter().any(|d| seen.contains(&normalize_domain(d)));
            if !dominated {
                for d in &item.domains {
                    seen.insert(normalize_domain(d));
                }
                results.push(item);
            }
        }
    }

    results
}
