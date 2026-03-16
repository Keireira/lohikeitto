use std::env;

pub struct Config {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub logo_base_url: String,
    pub brandfetch_client_id: String,
    pub logodev_token: String,
    pub r2_endpoint: String,
    pub r2_access_key: String,
    pub r2_secret_key: String,
    pub r2_bucket: String,
    pub admin_token: String,
    pub cors_origin: String,
}

impl Config {
    pub fn from_env() -> Result<Self, env::VarError> {
        dotenvy::dotenv().ok();

        Ok(Self {
            database_url: env::var("DATABASE_URL")?,
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "3000".into())
                .parse()
                .expect("PORT must be a number"),
            logo_base_url: env::var("LOGO_BASE_URL")?,
            brandfetch_client_id: env::var("BRANDFETCH_CLIENT_ID")?,
            logodev_token: env::var("LOGODEV_TOKEN")?,
            r2_endpoint: env::var("CF_R2_S3_API")?,
            r2_access_key: env::var("CF_R2_ACCOUNT_ACCESS_KEY_ID")?,
            r2_secret_key: env::var("CF_R2_ACCOUNT_SECRET_ACCESS_KEY")?,
            r2_bucket: env::var("CF_R2_BUCKET")?,
            admin_token: env::var("ADMIN_TOKEN")?,
            cors_origin: env::var("CORS_ORIGIN").unwrap_or_else(|_| "*".into()),
        })
    }
}
