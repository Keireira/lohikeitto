use axum::Router;

use crate::app::AppState;
use crate::error::AppError;

mod admin;
mod health;
mod init;
mod search;
mod services;

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .merge(health::routes())
        .merge(search::routes())
        .merge(services::routes())
        .merge(init::routes())
}

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .merge(admin::routes())
}

pub fn check_admin(state: &AppState, auth_header: Option<&str>) -> Result<(), AppError> {
    use subtle::ConstantTimeEq;

    let token = auth_header
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    if token.as_bytes().ct_eq(state.admin_token.as_bytes()).into() {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}
