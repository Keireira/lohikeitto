use crate::app::AppState;
use crate::s3::client as s3;
use crate::services::imgconv;

pub async fn sync_service(state: &AppState, slug: &str, domain: &str) -> SyncResult {
    let mut result = SyncResult::default();

    let bf_logo_key = format!("bf/logos/{slug}.webp");
    let bf_symbol_key = format!("bf/symbols/{slug}.webp");
    let logodev_key = format!("logodev/{slug}.webp");

    // Brandfetch logo
    if s3::exists(&state.bucket, &bf_logo_key).await.unwrap_or(false) {
        result.bf_logo_existed = true;
    } else {
        let url = format!(
            "https://cdn.brandfetch.io/domain/{domain}/w/400/h/400?c={}",
            state.brandfetch_client_id
        );
        if let Some(bytes) = fetch_image(&state.http, &url).await {
            if s3::upload(&state.bucket, &bf_logo_key, &bytes, "image/webp").await.is_ok() {
                result.bf_logo = true;
            }
        }
    }

    // Brandfetch symbol
    if s3::exists(&state.bucket, &bf_symbol_key).await.unwrap_or(false) {
        result.bf_symbol_existed = true;
    } else {
        let url = format!(
            "https://cdn.brandfetch.io/domain/{domain}/w/800/h/800/theme/light/symbol?c={}",
            state.brandfetch_client_id
        );
        if let Some(bytes) = fetch_image(&state.http, &url).await {
            if s3::upload(&state.bucket, &bf_symbol_key, &bytes, "image/webp").await.is_ok() {
                result.bf_symbol = true;
            }
        }
    }

    // logo.dev
    if s3::exists(&state.bucket, &logodev_key).await.unwrap_or(false) {
        result.logodev_existed = true;
    } else {
        let url = format!(
            "https://img.logo.dev/{domain}?token={}&size=1024&format=webp&retina=true",
            state.logodev_token
        );
        if let Some(bytes) = fetch_image(&state.http, &url).await {
            if s3::upload(&state.bucket, &logodev_key, &bytes, "image/webp").await.is_ok() {
                result.logodev = true;
            }
        }
    }

    result
}

async fn fetch_image(http: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    match http.get(url)
        .header("User-Agent", "Mozilla/5.0 (compatible; Soup/1.0)")
        .header("Accept", "image/webp,image/png,image/jpeg,image/*,*/*")
        .send().await {
        Ok(resp) if resp.status().is_success() => {
            match resp.bytes().await {
                Ok(b) if !b.is_empty() => {
                    match imgconv::to_webp(&b) {
                        Ok((webp, src)) => {
                            tracing::debug!(url, src, src_size = b.len(), webp_size = webp.len(), "converted");
                            Some(webp)
                        }
                        Err(e) => {
                            tracing::warn!(url, %e, "image conversion failed");
                            None
                        }
                    }
                }
                _ => None,
            }
        }
        Ok(resp) => {
            tracing::warn!(url, status = %resp.status(), "logo fetch failed");
            None
        }
        Err(e) => {
            tracing::warn!(url, %e, "logo fetch error");
            None
        }
    }
}

#[derive(Debug, Default, serde::Serialize)]
pub struct SyncResult {
    pub bf_logo: bool,
    pub bf_symbol: bool,
    pub logodev: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub bf_logo_existed: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub bf_symbol_existed: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub logodev_existed: bool,
}
