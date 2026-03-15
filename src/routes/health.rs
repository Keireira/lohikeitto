use crate::response::ApiOk;

pub async fn health_check() -> ApiOk<()> {
    ApiOk(())
}
