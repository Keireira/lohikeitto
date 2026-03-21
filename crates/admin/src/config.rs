#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub admin_token: String,
    pub s3_base_url: String,
    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_bucket: String,
    pub brandfetch_client_id: Option<String>,
    pub logodev_pk: Option<String>,
    pub logodev_sk: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("ADMIN_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(1337),
            admin_token: std::env::var("ADMIN_TOKEN").expect("ADMIN_TOKEN must be set"),
            s3_base_url: std::env::var("S3_BASE_URL").expect("S3_BASE_URL must be set"),
            s3_endpoint: std::env::var("CF_R2_S3_API").expect("CF_R2_S3_API must be set"),
            s3_access_key: std::env::var("CF_R2_ACCOUNT_ACCESS_KEY_ID")
                .expect("CF_R2_ACCOUNT_ACCESS_KEY_ID must be set"),
            s3_secret_key: std::env::var("CF_R2_ACCOUNT_SECRET_ACCESS_KEY")
                .expect("CF_R2_ACCOUNT_SECRET_ACCESS_KEY must be set"),
            s3_bucket: std::env::var("CF_R2_BUCKET").expect("CF_R2_BUCKET must be set"),
            brandfetch_client_id: std::env::var("BRANDFETCH_CLIENT_ID").ok(),
            logodev_pk: std::env::var("LOGODEV_PK").ok(),
            logodev_sk: std::env::var("LOGODEV_SK").ok(),
        }
    }
}
