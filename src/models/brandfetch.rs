use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct BrandfetchItem {
    #[allow(dead_code)]
    pub claimed: bool,
    #[serde(rename = "brandId")]
    pub brand_id: String,
    pub name: Option<String>,
    pub domain: String,
    pub icon: Option<String>,
}
