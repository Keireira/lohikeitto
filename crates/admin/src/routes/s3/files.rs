use axum::{
    Json,
    extract::{Path, State},
    http::header,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

use crate::app::AdminState;
use crate::error::AdminError;

#[derive(Debug, Serialize)]
pub struct S3Object {
    pub key: String,
    pub size: u64,
    pub last_modified: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct S3Info {
    pub bucket: String,
    pub endpoint: String,
    pub base_url: String,
}

/// Bucket metadata.
pub async fn info(State(state): State<AdminState>) -> Json<S3Info> {
    Json(S3Info {
        bucket: state.config.s3_bucket.clone(),
        endpoint: state.config.s3_endpoint.clone(),
        base_url: state.config.s3_base_url.clone(),
    })
}

/// List all objects in the bucket.
pub async fn list(State(state): State<AdminState>) -> Result<Json<Vec<S3Object>>, AdminError> {
    let results = state
        .bucket
        .list("".to_string(), None)
        .await
        .map_err(|e| AdminError::Internal(e.to_string()))?;

    let objects: Vec<S3Object> = results
        .into_iter()
        .flat_map(|r| r.contents)
        .map(|o| S3Object {
            key: o.key,
            size: o.size,
            last_modified: Some(o.last_modified),
        })
        .collect();

    Ok(Json(objects))
}

/// Download a single file by key.
pub async fn download_file(
    State(state): State<AdminState>,
    Path(key): Path<String>,
) -> Result<Response, AdminError> {
    let response = state
        .bucket
        .get_object(&key)
        .await
        .map_err(|e| AdminError::Internal(format!("failed to get {key}: {e}")))?;

    let bytes = response.bytes().to_vec();
    let filename = key.split('/').next_back().unwrap_or(&key);
    let content_type = mime_from_ext(filename);

    Ok((
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_LENGTH, bytes.len().to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        bytes,
    )
        .into_response())
}

/// Delete objects by keys.
pub async fn delete_objects(
    State(state): State<AdminState>,
    Json(keys): Json<Vec<String>>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let mut deleted = 0u64;
    for key in &keys {
        state
            .bucket
            .delete_object(key)
            .await
            .map_err(|e| AdminError::Internal(format!("failed to delete {key}: {e}")))?;
        deleted += 1;
    }

    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

/// Copy or move objects to a new prefix.
#[derive(Debug, Deserialize)]
pub struct CopyMoveRequest {
    pub keys: Vec<String>,
    pub destination: String,
    #[serde(default)]
    pub delete_source: bool,
}

pub async fn copy_move(
    State(state): State<AdminState>,
    Json(req): Json<CopyMoveRequest>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let dest = if req.destination.ends_with('/') {
        req.destination.clone()
    } else {
        format!("{}/", req.destination)
    };

    let mut count = 0u64;
    for key in &req.keys {
        let filename = key.split('/').next_back().unwrap_or(key);
        let new_key = format!("{dest}{filename}");

        // S3 has no native copy — download then upload
        let response = state
            .bucket
            .get_object(key)
            .await
            .map_err(|e| AdminError::Internal(format!("failed to get {key}: {e}")))?;

        let content_type = mime_from_ext(filename);
        state
            .bucket
            .put_object_with_content_type(&new_key, response.bytes(), content_type)
            .await
            .map_err(|e| AdminError::Internal(format!("failed to put {new_key}: {e}")))?;

        if req.delete_source {
            state
                .bucket
                .delete_object(key)
                .await
                .map_err(|e| AdminError::Internal(format!("failed to delete {key}: {e}")))?;
        }

        count += 1;
    }

    let op = if req.delete_source { "moved" } else { "copied" };
    Ok(Json(serde_json::json!({ op: count })))
}

/// Create an empty directory (placeholder object).
#[derive(Debug, Deserialize)]
pub struct MkdirRequest {
    pub path: String,
}

pub async fn mkdir(
    State(state): State<AdminState>,
    Json(req): Json<MkdirRequest>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let key = if req.path.ends_with('/') {
        req.path
    } else {
        format!("{}/", req.path)
    };

    state
        .bucket
        .put_object_with_content_type(&key, &[], "application/x-directory")
        .await
        .map_err(|e| AdminError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "created": key })))
}

/// Upload a file.
pub async fn upload(
    State(state): State<AdminState>,
    Path(key): Path<String>,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, AdminError> {
    let filename = key.split('/').next_back().unwrap_or(&key);
    let content_type = mime_from_ext(filename);

    state
        .bucket
        .put_object_with_content_type(&key, &body, content_type)
        .await
        .map_err(|e| AdminError::Internal(format!("failed to upload {key}: {e}")))?;

    Ok(Json(
        serde_json::json!({ "uploaded": key, "size": body.len() }),
    ))
}

/// Rename a file in S3 (copy + delete old).
#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub from: String,
    pub to: String,
}

pub async fn rename(
    State(state): State<AdminState>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<serde_json::Value>, AdminError> {
    let data = state
        .bucket
        .get_object(&req.from)
        .await
        .map_err(|e| AdminError::Internal(format!("get {}: {}", req.from, e)))?;

    let ct = mime_from_ext(req.to.rsplit('/').next().unwrap_or(&req.to));
    state
        .bucket
        .put_object_with_content_type(&req.to, data.bytes(), ct)
        .await
        .map_err(|e| AdminError::Internal(format!("put {}: {}", req.to, e)))?;

    state
        .bucket
        .delete_object(&req.from)
        .await
        .map_err(|e| AdminError::Internal(format!("delete {}: {}", req.from, e)))?;

    Ok(Json(serde_json::json!({ "from": req.from, "to": req.to })))
}

fn mime_from_ext(filename: &str) -> &str {
    match filename.rsplit('.').next().unwrap_or("") {
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "json" => "application/json",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}
