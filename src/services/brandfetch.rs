use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct BrandfetchEntry {
    pub name: String,
    pub domain: String,
    pub icon: String,
}

pub async fn search(
    http: &reqwest::Client,
    client_id: &str,
    query: &str,
) -> Result<Vec<BrandfetchEntry>, reqwest::Error> {
    let url = format!(
        "https://api.brandfetch.io/v2/search/{}?c={}",
        urlencoding::encode(query),
        urlencoding::encode(client_id),
    );

    http.get(&url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}
