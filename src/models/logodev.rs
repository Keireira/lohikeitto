use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct LDSearchItem {
    pub name: String,
    pub domain: String,
    pub logo_url: Option<String>,
}
