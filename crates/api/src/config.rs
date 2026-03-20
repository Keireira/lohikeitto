#[derive(Clone)]
#[allow(dead_code)]
pub struct Config {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub allowed_origins: Vec<String>,

    pub brandfetch_client_id: String,
    pub brandfetch_secret: String,
    pub logodev_pk: String,
    pub logodev_sk: String,

    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_bucket: String,
    pub s3_base_url: String,

    pub admin_token: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            // Server-related
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            allowed_origins: std::env::var("ALLOWED_ORIGINS")
                .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
                .unwrap_or_default(),

            // External brandfetchers
            brandfetch_client_id: std::env::var("BRANDFETCH_CLIENT_ID")
                .expect("BRANDFETCH_CLIENT_ID must be set"),
            brandfetch_secret: std::env::var("BRANDFETCH_SECRET")
                .expect("BRANDFETCH_SECRET must be set"),
            logodev_pk: std::env::var("LOGODEV_PK").expect("LOGODEV_PK must be set"),
            logodev_sk: std::env::var("LOGODEV_SK").expect("LOGODEV_SK must be set"),

            // S3-related (local logos)
            s3_endpoint: std::env::var("CF_R2_S3_API").expect("CF_R2_S3_API must be set"),
            s3_access_key: std::env::var("CF_R2_ACCOUNT_ACCESS_KEY_ID")
                .expect("CF_R2_ACCOUNT_ACCESS_KEY_ID must be set"),
            s3_secret_key: std::env::var("CF_R2_ACCOUNT_SECRET_ACCESS_KEY")
                .expect("CF_R2_ACCOUNT_SECRET_ACCESS_KEY must be set"),
            s3_bucket: std::env::var("CF_R2_BUCKET").expect("CF_R2_BUCKET must be set"),
            s3_base_url: std::env::var("S3_BASE_URL").expect("S3_BASE_URL must be set"),

            // Admin
            admin_token: std::env::var("ADMIN_TOKEN").ok(),
        }
    }
}
