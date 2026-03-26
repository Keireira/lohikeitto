use axum::{Json, extract::State, http::header, response::IntoResponse};
use serde::{Deserialize, Serialize};

use crate::app::AdminState;
use crate::error::AdminError;

use vtracer::{ColorImage, ColorMode, Config as VtracerConfig, Hierarchical, convert};

#[derive(Debug, Deserialize)]
pub struct FetchLogoRequest {
    pub domain: String,
    pub slug: String,
    pub source: String, // "brandfetch" or "logodev"
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
                "https://img.logo.dev/{}?token={}&size=512&retina=true&format=webp",
                req.domain, pk
            )
        }
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

#[derive(Debug, Deserialize)]
pub struct VectorizeRequest {
    pub slug: String,
    pub colors: Option<i32>,
}

/// Download logo from S3, vectorize with vtracer, return SVG.
pub async fn vectorize(
    State(state): State<AdminState>,
    Json(req): Json<VectorizeRequest>,
) -> Result<impl IntoResponse, AdminError> {
    let key = format!("logos/{}.webp", req.slug);
    let response = state
        .bucket
        .get_object(&key)
        .await
        .map_err(|e| AdminError::Internal(format!("S3 get failed: {}", e)))?;

    let bytes = response.bytes();
    let img = image::load_from_memory(bytes)
        .map_err(|e| AdminError::Internal(format!("Image decode failed: {}", e)))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() as usize, rgba.height() as usize);

    let color_img = ColorImage {
        pixels: rgba.into_raw(),
        width: w,
        height: h,
    };

    let colors = req.colors.unwrap_or(4).clamp(2, 32);

    // color_precision: bits of color to keep (1-8). Lower = fewer colors.
    // layer_difference: threshold for separating color layers. Lower = more layers.
    let precision = match colors {
        2..=3 => 4,
        4..=6 => 5,
        7..=12 => 6,
        13..=20 => 7,
        _ => 8,
    };
    let layer_diff = match colors {
        2..=3 => 48,
        4..=6 => 32,
        7..=12 => 24,
        13..=20 => 16,
        _ => 8,
    };

    let config = VtracerConfig {
        color_mode: ColorMode::Color,
        hierarchical: Hierarchical::Stacked,
        filter_speckle: 4,
        color_precision: precision,
        layer_difference: layer_diff,
        corner_threshold: 60,
        length_threshold: 4.0,
        max_iterations: 10,
        splice_threshold: 45,
        path_precision: Some(2),
        ..VtracerConfig::default()
    };

    let svg = convert(color_img, config)
        .map_err(|e| AdminError::Internal(format!("Vectorization failed: {}", e)))?;

    tracing::info!(paths = svg.paths.len(), w = svg.width, h = svg.height, "vectorize done");

    // vtracer outputs width/height but no viewBox — add it for proper scaling
    let svg_str = svg.to_string().replacen(
        &format!("width=\"{}\" height=\"{}\"", svg.width, svg.height),
        &format!("width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\"", svg.width, svg.height, svg.width, svg.height),
        1,
    );

    Ok((
        [(header::CONTENT_TYPE, "image/svg+xml")],
        svg_str,
    ))
}
