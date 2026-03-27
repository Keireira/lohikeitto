use axum::{
    Json,
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response, Sse},
};
use chrono::{Datelike, Timelike};
use futures::stream::Stream;
use serde::Deserialize;
use std::io::Write;
use zip::{ZipWriter, write::SimpleFileOptions};

use crate::app::AdminState;
use crate::error::AdminError;

/// Parse S3/RFC3339 date string into zip::DateTime.
fn parse_s3_date(s: &str) -> zip::DateTime {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .and_then(|dt| {
            let u = dt.naive_utc();
            zip::DateTime::from_date_and_time(
                u.year() as u16,
                u.month() as u8,
                u.day() as u8,
                u.hour() as u8,
                u.minute() as u8,
                u.second() as u8,
            )
            .ok()
        })
        .unwrap_or_default()
}

#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub prefix: Option<String>,
}

/// SSE endpoint: fetches files from S3, packages zip, streams progress events.
/// Events: `fetching` (N/total), `packaging`, `ready` (with download token), `error`.
pub async fn archive_stream(
    State(state): State<AdminState>,
    Query(query): Query<DownloadQuery>,
) -> Result<
    Sse<impl Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>,
    AdminError,
> {
    let prefix = query.prefix.unwrap_or_default();

    let results = state
        .bucket
        .list(prefix.clone(), None)
        .await
        .map_err(|e| AdminError::Internal(e.to_string()))?;

    let entries: Vec<(String, String)> = results
        .into_iter()
        .flat_map(|r| r.contents)
        .filter(|o| !o.key.ends_with('/') && o.size > 0)
        .map(|o| (o.key, o.last_modified))
        .collect();

    if entries.is_empty() {
        return Err(AdminError::NotFound);
    }

    let total = entries.len();
    let bucket = state.bucket.clone();
    let cache = state.archive_cache.clone();
    let prefix_clone = prefix.clone();

    let stream = async_stream::stream! {
        use axum::response::sse::Event;

        let mut buf = Vec::new();
        let mut zip = ZipWriter::new(std::io::Cursor::new(&mut buf));

        for (i, (key, modified)) in entries.iter().enumerate() {
            yield Ok(Event::default()
                .event("fetching")
                .data(format!("{}/{}", i + 1, total)));

            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .last_modified_time(parse_s3_date(modified));

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

/// SSE endpoint: archive specific keys (not by prefix).
pub async fn archive_keys_stream(
    State(state): State<AdminState>,
    Json(keys): Json<Vec<String>>,
) -> Result<
    Sse<impl Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>>,
    AdminError,
> {
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

        for (i, key) in keys.iter().enumerate() {
            yield Ok(Event::default()
                .event("fetching")
                .data(format!("{}/{}", i + 1, total)));

            match bucket.get_object(key).await {
                Ok(response) => {
                    let modified = response.headers().get("last-modified")
                        .map(|v| parse_s3_date(v))
                        .unwrap_or_default();
                    let options = SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated)
                        .last_modified_time(modified);
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
