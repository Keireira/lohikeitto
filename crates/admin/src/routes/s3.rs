use axum::{
    Json,
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response, Sse},
};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Arc;
use tokio::sync::Mutex;
use zip::{ZipWriter, write::SimpleFileOptions};

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

#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub prefix: Option<String>,
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

/// SSE endpoint: fetches files from S3, packages zip, streams progress events.
/// Events: `fetching` (N/total), `packaging`, `ready` (with download token), `error`.
pub async fn archive_stream(
    State(state): State<AdminState>,
    Query(query): Query<DownloadQuery>,
) -> Result<Sse<impl Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>, AdminError>
{
    let prefix = query.prefix.unwrap_or_default();

    let results = state
        .bucket
        .list(prefix.clone(), None)
        .await
        .map_err(|e| AdminError::Internal(e.to_string()))?;

    let keys: Vec<String> = results
        .into_iter()
        .flat_map(|r| r.contents)
        .filter(|o| !o.key.ends_with('/') && o.size > 0)
        .map(|o| o.key)
        .collect();

    if keys.is_empty() {
        return Err(AdminError::NotFound);
    }

    let total = keys.len();
    let bucket = state.bucket.clone();
    let cache = state.archive_cache.clone();
    let prefix_clone = prefix.clone();

    let stream = async_stream::stream! {
        use axum::response::sse::Event;

        let mut buf = Vec::new();
        let mut zip = ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for (i, key) in keys.iter().enumerate() {
            yield Ok(Event::default()
                .event("fetching")
                .data(format!("{}/{}", i + 1, total)));

            match bucket.get_object(key).await {
                Ok(response) => {
                    let relative = key.strip_prefix(&prefix_clone).unwrap_or(key);
                    if let Err(e) = zip.start_file(relative, options) {
                        yield Ok(Event::default().event("error").data(e.to_string()));
                        return;
                    }
                    if let Err(e) = zip.write_all(response.bytes()) {
                        yield Ok(Event::default().event("error").data(e.to_string()));
                        return;
                    }
                }
                Err(e) => {
                    yield Ok(Event::default().event("error").data(format!("Failed to get {key}: {e}")));
                    return;
                }
            }
        }

        yield Ok(Event::default().event("packaging").data("creating archive"));

        if let Err(e) = zip.finish() {
            yield Ok(Event::default().event("error").data(e.to_string()));
            return;
        }

        // Store in cache with a random token
        let token = uuid::Uuid::new_v4().to_string();
        cache.lock().await.insert(token.clone(), buf);

        yield Ok(Event::default().event("ready").data(token));
    };

    Ok(Sse::new(stream))
}

/// Download a cached archive by token.
pub async fn archive_download(
    State(state): State<AdminState>,
    Path(token): Path<String>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, AdminError> {
    let buf = state
        .archive_cache
        .lock()
        .await
        .remove(&token)
        .ok_or(AdminError::NotFound)?;

    let prefix = query.prefix.unwrap_or_default();
    let filename = if prefix.is_empty() {
        "s3-backup.zip".to_string()
    } else {
        let name = prefix.trim_end_matches('/').replace('/', "-");
        format!("{name}.zip")
    };

    Ok((
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (header::CONTENT_LENGTH, buf.len().to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        buf,
    )
        .into_response())
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
    let filename = key.split('/').last().unwrap_or(&key);
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
        let filename = key.split('/').last().unwrap_or(key);
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
    let filename = key.split('/').last().unwrap_or(&key);
    let content_type = mime_from_ext(filename);

    state
        .bucket
        .put_object_with_content_type(&key, &body, content_type)
        .await
        .map_err(|e| AdminError::Internal(format!("failed to upload {key}: {e}")))?;

    Ok(Json(serde_json::json!({ "uploaded": key, "size": body.len() })))
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

/// SSE endpoint: archive specific keys (not by prefix).
pub async fn archive_keys_stream(
    State(state): State<AdminState>,
    Json(keys): Json<Vec<String>>,
) -> Result<Sse<impl Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>, AdminError>
{
    if keys.is_empty() {
        return Err(AdminError::NotFound);
    }

    let total = keys.len();
    let bucket = state.bucket.clone();
    let cache = state.archive_cache.clone();

    let stream = async_stream::stream! {
        use axum::response::sse::Event;

        let mut buf = Vec::new();
        let mut zip = ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for (i, key) in keys.iter().enumerate() {
            yield Ok(Event::default()
                .event("fetching")
                .data(format!("{}/{}", i + 1, total)));

            match bucket.get_object(key).await {
                Ok(response) => {
                    // Preserve directory structure in zip
                    if let Err(e) = zip.start_file(key.as_str(), options) {
                        yield Ok(Event::default().event("error").data(e.to_string()));
                        return;
                    }
                    if let Err(e) = zip.write_all(response.bytes()) {
                        yield Ok(Event::default().event("error").data(e.to_string()));
                        return;
                    }
                }
                Err(e) => {
                    yield Ok(Event::default().event("error").data(format!("Failed to get {key}: {e}")));
                    return;
                }
            }
        }

        yield Ok(Event::default().event("packaging").data("creating archive"));

        if let Err(e) = zip.finish() {
            yield Ok(Event::default().event("error").data(e.to_string()));
            return;
        }

        let token = uuid::Uuid::new_v4().to_string();
        cache.lock().await.insert(token.clone(), buf);

        yield Ok(Event::default().event("ready").data(token));
    };

    Ok(Sse::new(stream))
}

/// In-memory cache for prepared archives (token → zip bytes).
pub type ArchiveCache = Arc<Mutex<std::collections::HashMap<String, Vec<u8>>>>;

pub fn new_archive_cache() -> ArchiveCache {
    Arc::new(Mutex::new(std::collections::HashMap::new()))
}
