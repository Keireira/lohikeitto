use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ITunesSearchResponse {
    pub results: Vec<ITunesApp>,
}

#[derive(Debug, Deserialize)]
pub struct ITunesApp {
    #[serde(rename = "trackName")]
    pub track_name: String,
    #[serde(rename = "bundleId")]
    pub bundle_id: String,
    #[serde(rename = "artworkUrl512")]
    pub artwork_url_512: Option<String>,
    #[serde(rename = "artworkUrl100")]
    pub artwork_url_100: Option<String>,
}
