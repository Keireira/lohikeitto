mod archive;
mod files;

pub use archive::{archive_download, archive_keys_stream, archive_stream};
pub use files::{copy_move, delete_objects, download_file, info, list, mkdir, rename, upload};

use std::sync::Arc;
use tokio::sync::Mutex;

/// In-memory cache for prepared archives (token -> zip bytes).
pub type ArchiveCache = Arc<Mutex<std::collections::HashMap<String, Vec<u8>>>>;

pub fn new_archive_cache() -> ArchiveCache {
    Arc::new(Mutex::new(std::collections::HashMap::new()))
}
