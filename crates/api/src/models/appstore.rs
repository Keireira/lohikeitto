use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ITunesSearchResponse {
    pub results: Vec<ITunesApp>,
}

// 6021: 'Magazines & Newspapers';
// 6022: 'Catalogs';
// 6025: 'Stickers';

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ITunesApp {
    #[serde(rename = "trackId")]
    pub track_id: Option<u64>,
    #[serde(rename = "trackName")]
    pub track_name: String,
    #[serde(rename = "bundleId")]
    pub bundle_id: String,
    #[serde(rename = "artworkUrl512")]
    pub artwork_url_512: Option<String>,
    #[serde(rename = "artworkUrl100")]
    pub artwork_url_100: Option<String>,
    #[serde(rename = "sellerUrl")]
    pub seller_url: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "genreIds")]
    pub genre_ids: Option<Vec<String>>,
}

/// Map Apple App Store genre to local category slug.
pub fn map_genre_to_category(genre_ids: &i32) -> Option<&'static str> {
    match genre_ids {
        // Direct matches
        6000 => Some("productivity"),
        6017 => Some("education"),
        6024 => Some("shopping_and_memberships"),
        6005 => Some("social"),
        6007 => Some("productivity"),
        6003 => Some("travel_and_flights"),
        6010 => Some("transportation"),
        6013 => Some("health_and_fitness"),
        6015 => Some("finances_and_insurance"),
        6023 => Some("food_and_delivery"),
        6014 => Some("gaming"),
        6011 => Some("music_and_audiobooks"),
        6009 => Some("news_and_reading"),
        6018 => Some("news_and_reading"),
        6016 => Some("video_streaming"),
        6008 => Some("design_and_creative"),
        6027 => Some("design_and_creative"),
        6026 => Some("developer_tools"),
        6002 => Some("utilities_and_bills"),
        6001 => Some("utilities_and_bills"),
        6012 => Some("beauty_care"),
        6004 => Some("health_and_fitness"),
        6006 => Some("education"),
        6020 => Some("health_and_fitness"),
        _ => None,
    }
}

/// Map all Apple genres to (category_slug, tags).
/// First matched genre becomes category, all genres become tags.
pub fn map_genres(genre_ids: &[String]) -> Option<&'static str> {
    genre_ids
        .iter()
        .filter_map(|g| g.parse::<i32>().ok())
        .find_map(|g| map_genre_to_category(&g))
}
