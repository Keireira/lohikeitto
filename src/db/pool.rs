use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tracing::{info, warn};

// Connect to the `postgres` maintenance DB, check if the target DB exists, create if not.
pub async fn ensure_database(url: &str) {
    let parsed = url::Url::parse(url).expect("invalid DATABASE_URL");
    let db_name = parsed.path().trim_start_matches('/');

    if db_name.is_empty() {
        panic!("DATABASE_URL must include a database name");
    }

    let mut maintenance_url = parsed.clone();
    maintenance_url.set_path("/postgres");

    let conn = PgPoolOptions::new()
        .max_connections(1)
        .connect(maintenance_url.as_str())
        .await
        .expect("failed to connect to postgres maintenance database");

    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)")
            .bind(db_name)
            .fetch_one(&conn)
            .await
            .expect("failed to check if database exists");

    if !exists {
        // CREATE DATABASE doesn't support parameters (This is DDL), but db_name is from our own config
        sqlx::query(&format!("CREATE DATABASE \"{db_name}\""))
            .execute(&conn)
            .await
            .expect("failed to create database");

        info!(db = db_name, "database created");
    }

    conn.close().await;
}

pub async fn connect_with_retry(url: &str, max_retries: u32) -> PgPool {
    let mut delay = Duration::from_secs(1);

    for attempt in 1..=max_retries {
        match PgPoolOptions::new()
            .max_connections(8)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(5))
            .idle_timeout(Duration::from_secs(300))
            .max_lifetime(Duration::from_secs(1800))
            .connect(url)
            .await
        {
            Ok(pool) => return pool,
            Err(e) if attempt < max_retries => {
                warn!(
                    attempt,
                    max_retries,
                    error = %e,
                    retry_in_secs = delay.as_secs(),
                    "database connection failed, retrying"
                );

                tokio::time::sleep(delay).await;
                delay *= 2;
            }
            Err(e) => {
                panic!("failed to connect to database after {max_retries} attempts: {e}");
            }
        }
    }
    unreachable!()
}
