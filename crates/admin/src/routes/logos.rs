use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};

use crate::app::AdminState;
use crate::error::AdminError;

#[derive(Debug, Deserialize)]
pub struct FetchLogoRequest {
    pub domain: String,
    pub slug: String,
    pub source: String, // "brandfetch", "logodev", "appstore", or "playstore"
    pub logo_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FetchLogoResponse {
    pub url: String,
    pub source: String,
}

/// Fetch a logo URL from brandfetch or logo.dev (does not download yet).
pub async fn fetch_logo(
    State(state): State<AdminState>,
    Json(req): Json<FetchLogoRequest>,
) -> Result<Json<FetchLogoResponse>, AdminError> {
    let url = match req.source.as_str() {
        "brandfetch" => {
            let client_id = state.config.brandfetch_client_id.as_ref().ok_or_else(|| {
                AdminError::Internal("BRANDFETCH_CLIENT_ID not configured".into())
            })?;
            format!(
                "https://cdn.brandfetch.io/domain/{}/w/512/h/512?c={}",
                req.domain, client_id
            )
        }
        "logodev" => {
            let pk = state
                .config
                .logodev_pk
                .as_ref()
                .ok_or_else(|| AdminError::Internal("LOGODEV_PK not configured".into()))?;
            format!(
                "https://img.logo.dev/{}?token={}&size=512&retina=true&format=webp",
                req.domain, pk
            )
        }
        "appstore" | "playstore" => req.logo_url.clone().ok_or_else(|| {
            AdminError::Internal("logo_url is required for appstore/playstore source".into())
        })?,
        _ => {
            return Err(AdminError::Internal(format!(
                "Unknown source: {}",
                req.source
            )));
        }
    };

    Ok(Json(FetchLogoResponse {
        url,
        source: req.source,
    }))
}

/// Download a logo from URL and save to S3 as logos/{slug}.webp
pub async fn save_logo(
    State(state): State<AdminState>,
    Json(req): Json<FetchLogoRequest>,
) -> Result<Json<serde_json::Value>, AdminError> {
    // Build the fetch URL
    let url = match req.source.as_str() {
        "brandfetch" => {
            let client_id = state.config.brandfetch_client_id.as_ref().ok_or_else(|| {
                AdminError::Internal("BRANDFETCH_CLIENT_ID not configured".into())
            })?;

            format!(
                "https://cdn.brandfetch.io/domain/{}/w/512/h/512?c={}",
                req.domain, client_id
            )
        }
        "logodev" => {
            let pk = state
                .config
                .logodev_pk
                .as_ref()
                .ok_or_else(|| AdminError::Internal("LOGODEV_PK not configured".into()))?;

            format!(
                "https://img.logo.dev/{}?token={}&size=1024&format=webp",
                req.domain, pk
            )
        }
        "appstore" | "playstore" => req.logo_url.clone().ok_or_else(|| {
            AdminError::Internal("logo_url is required for appstore/playstore source".into())
        })?,
        _ => {
            return Err(AdminError::Internal(format!(
                "Unknown source: {}",
                req.source
            )));
        }
    };

    // Download the image
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Lohikeitto/1.0)")
        .build()
        .map_err(|e| AdminError::Internal(format!("HTTP client error: {}", e)))?;

    let response = client
        .get(&url)
        .header("Accept", "image/*")
        .send()
        .await
        .map_err(|e| AdminError::Internal(format!("Failed to fetch logo: {}", e)))?;

    if !response.status().is_success() {
        return Err(AdminError::Internal(format!(
            "Logo fetch returned {}",
            response.status()
        )));
    }

    // Verify we got an image
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !content_type.starts_with("image/") {
        return Err(AdminError::Internal(format!(
            "Expected image, got {}",
            content_type
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AdminError::Internal(format!("Failed to read logo bytes: {}", e)))?;

    if bytes.len() < 100 {
        return Err(AdminError::Internal(format!(
            "Response too small ({} bytes), likely not an image",
            bytes.len()
        )));
    }

    // Always save as .webp — the service logo_url expects {slug}.webp
    let key = format!("logos/{}.webp", req.slug);

    state
        .bucket
        .put_object_with_content_type(&key, &bytes, &content_type)
        .await
        .map_err(|e| AdminError::Internal(format!("S3 upload failed: {}", e)))?;

    let logo_url = format!("{}/{}", state.config.s3_base_url, key);

    Ok(Json(serde_json::json!({
        "saved": key,
        "size": bytes.len(),
        "url": logo_url
    })))
}
