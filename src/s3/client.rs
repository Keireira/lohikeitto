use s3::creds::Credentials;
use s3::{Bucket, Region};

use crate::config::Config;
use crate::error::AppError;

pub fn create_bucket(config: &Config) -> Result<Box<Bucket>, AppError> {
    let region = Region::Custom {
        region: "auto".to_owned(),
        endpoint: config.r2_endpoint.clone(),
    };

    let credentials = Credentials::new(
        Some(&config.r2_access_key),
        Some(&config.r2_secret_key),
        None,
        None,
        None,
    )
    .map_err(|e| AppError::S3(e.to_string()))?;

    let bucket = Bucket::new(&config.r2_bucket, region, credentials)
        .map_err(|e| AppError::S3(e.to_string()))?
        .with_path_style();

    Ok(bucket)
}

pub async fn exists(bucket: &Bucket, key: &str) -> bool {
    bucket.head_object(key).await.is_ok()
}

pub async fn upload(bucket: &Bucket, key: &str, bytes: &[u8], content_type: &str) -> bool {
    match bucket
        .put_object_with_content_type(key, bytes, content_type)
        .await
    {
        Ok(_) => true,
        Err(e) => {
            tracing::error!(key, %e, "R2 upload failed");
            false
        }
    }
}
