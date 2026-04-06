use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ITunesSearchResponse {
    pub results: Vec<ITunesApp>,
}

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
    pub genres: Option<Vec<String>>,
    #[serde(rename = "averageUserRating")]
    pub average_user_rating: Option<f64>,
    #[serde(rename = "userRatingCount")]
    pub user_rating_count: Option<u64>,
}

// TODO: migrate local categories to Apple-like genre system entirely.
// Current mapping is a bridge — Apple genres are canonical, local slugs are legacy.
/// Map Apple App Store genre to local category slug.
pub fn map_genre_to_category(genre: &str) -> Option<&'static str> {
    match genre {
        // Direct matches
        "Education" => Some("education"),
        "Shopping" => Some("shopping_and_memberships"),
        "Social Networking" => Some("social"),
        "Productivity" => Some("productivity"),
        "Travel" => Some("travel_and_flights"),
        "Navigation" => Some("transportation"),
        "Health & Fitness" => Some("health_and_fitness"),
        "Finance" => Some("finances_and_insurance"),
        "Food & Drink" => Some("food_and_delivery"),
        "Games" => Some("gaming"),
        "Music" => Some("music_and_audiobooks"),
        "News" => Some("news_and_reading"),
        "Books" => Some("news_and_reading"),
        "Entertainment" => Some("video_streaming"),
        "Photo & Video" => Some("design_and_creative"),
        "Graphics & Design" => Some("design_and_creative"),
        "Developer Tools" => Some("developer_tools"),
        "Utilities" => Some("utilities_and_bills"),
        "Weather" => Some("utilities_and_bills"),
        "Lifestyle" => Some("beauty_care"),
        "Sports" => Some("health_and_fitness"),
        "Business" => Some("productivity"),
        "Reference" => Some("education"),
        "Medical" => Some("health_and_fitness"),
        _ => None,
    }
}

/// Map all Apple genres to (category_slug, tags).
/// First matched genre becomes category, all genres become tags.
pub fn map_genres(genres: &[String]) -> (Option<&'static str>, Vec<String>) {
    let category = genres.iter().find_map(|g| map_genre_to_category(g));
    let tags: Vec<String> = genres
        .iter()
        .map(|g| g.to_lowercase().replace(' ', "-").replace('&', "and"))
        .collect();
    (category, tags)
}
