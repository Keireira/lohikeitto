/// Parsed app data from Google Play Store HTML page.
pub struct PlayStoreApp {
    pub package_name: String,
    pub name: String,
    pub icon_url: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Extract content from `<meta property="..." content="...">` or `<meta name="..." content="...">`.
fn extract_meta<'a>(html: &'a str, property: &str) -> Option<&'a str> {
    // Match both property="X" and name="X"
    for attr in ["property", "name"] {
        let needle = format!(r#"{attr}="{property}""#);
        if let Some(pos) = html.find(&needle) {
            let after = &html[pos + needle.len()..];
            if let Some(start) = after.find("content=\"") {
                let content_start = start + 9; // len of `content="`
                if let Some(end) = after[content_start..].find('"') {
                    return Some(&after[content_start..content_start + end]);
                }
            }
        }
    }
    None
}

/// Extract text between two markers in HTML.
fn extract_between<'a>(html: &'a str, before: &str, after: &str) -> Option<&'a str> {
    let start = html.find(before)? + before.len();
    let end = start + html[start..].find(after)?;
    Some(&html[start..end])
}

/// Parse a Google Play app details page into structured data.
pub fn parse_details_page(html: &str, package_name: &str) -> Option<PlayStoreApp> {
    let name = extract_meta(html, "og:title")?;
    let icon_url = extract_meta(html, "og:image").unwrap_or_default();
    let description = extract_meta(html, "og:description");

    // Category from the page (often in breadcrumb or JSON-LD)
    let category = extract_between(html, r#""genre":""#, r#"""#)
        .or_else(|| extract_between(html, r#""applicationCategory":""#, r#"""#));

    Some(PlayStoreApp {
        package_name: package_name.to_string(),
        name: html_unescape(name),
        icon_url: resize_play_icon(icon_url, 512),
        description: description.map(html_unescape),
        category: category.map(html_unescape),
    })
}

/// Parse Google Play search results page, extracting package IDs, names, and icons.
pub fn parse_search_page(html: &str) -> Vec<PlayStoreApp> {
    let mut results = Vec::new();
    let mut search_pos = 0;

    // Search results have links like: href="/store/apps/details?id=com.example.app"
    let link_prefix = "/store/apps/details?id=";
    while let Some(pos) = html[search_pos..].find(link_prefix) {
        let abs_pos = search_pos + pos + link_prefix.len();
        let remaining = &html[abs_pos..];

        // Extract package name (ends at " or &)
        let pkg_end = remaining
            .find(['"', '&'])
            .unwrap_or(remaining.len().min(256));
        let package_name = &remaining[..pkg_end];

        if package_name.is_empty()
            || package_name.len() > 256
            || results
                .iter()
                .any(|r: &PlayStoreApp| r.package_name == package_name)
        {
            search_pos = abs_pos;
            continue;
        }

        // The <a> tag containing this link has the structure:
        //   <a href="...?id=PKG">
        //     <div><img src="...=w416-h235" ...></div>   ← screenshot (skip)
        //     <div><img src="...=s64" ...></div>          ← icon (want this)
        //     <div><div><span>App Name</span></div>       ← name
        //   </a>
        // Look from the link forward to the closing </a>
        let ahead = &html[abs_pos..html.len().min(abs_pos + 3000)];
        let a_end = ahead.find("</a>").unwrap_or(ahead.len());
        let card = &ahead[..a_end];

        // Icon: find the img with =s64 or =s128 (thumbnail, not screenshot)
        let icon_url = find_thumbnail_icon(card)
            .map(|u| resize_play_icon(&u, 512))
            .unwrap_or_default();

        // Name: first <span> text that isn't a number or rating
        let name = find_app_name(card).unwrap_or_else(|| package_name.to_string());

        if !name.is_empty() {
            results.push(PlayStoreApp {
                package_name: package_name.to_string(),
                name: html_unescape(&name),
                icon_url,
                description: None,
                category: None,
            });
        }

        search_pos = abs_pos + pkg_end;
        if results.len() >= 10 {
            break;
        }
    }

    results
}

/// Find the thumbnail icon (=s64 or =s128) in a card, skipping screenshot images (=w...-h...).
fn find_thumbnail_icon(card: &str) -> Option<String> {
    let marker = "play-lh.googleusercontent.com/";
    let mut pos = 0;
    while let Some(found) = card[pos..].find(marker) {
        let abs = pos + found;
        // Walk backwards to find URL start
        let before = &card[..abs];
        let url_start = before.rfind("https://").unwrap_or(abs);
        let from_start = &card[url_start..];
        let url_end = from_start
            .find(['"', '\'', ' '])
            .unwrap_or(from_start.len());
        let url = &card[url_start..url_start + url_end];

        // Skip screenshots (contain =w...-h...), want thumbnails (=s64, =s128)
        if !url.contains("=w") {
            return Some(url.to_string());
        }
        pos = abs + marker.len();
    }
    None
}

/// Find the app name: first <span> text that looks like an app name (not a rating or number).
fn find_app_name(card: &str) -> Option<String> {
    let mut search_pos = 0;
    while let Some(span_start) = card[search_pos..].find("<span") {
        let abs = search_pos + span_start;
        let after_tag = &card[abs..];
        let content_start = after_tag.find('>')? + 1;
        let content = &after_tag[content_start..];
        let end = content.find("</span>")?;
        let text = content[..end].trim();

        // Skip empty, HTML tags (inline SVG etc.), numeric-only (ratings), star labels
        if !text.is_empty()
            && !text.starts_with('<')
            && !text.starts_with("star")
            && text.parse::<f64>().is_err()
            && !text.contains("Rated ")
        {
            return Some(html_unescape(text));
        }
        search_pos = abs + content_start + end;
    }
    None
}

/// Request a specific size from play-lh.googleusercontent.com by appending `=s{size}`.
fn resize_play_icon(url: &str, size: u32) -> String {
    if url.contains("play-lh.googleusercontent.com") {
        // Strip any existing size param (=s64, =w240-h480, etc.)
        let base = url.split('=').next().unwrap_or(url);
        format!("{base}=s{size}")
    } else {
        url.to_string()
    }
}

/// Basic HTML entity unescaping.
fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
}

// TODO: migrate local categories to a unified app-store-like genre system.
// Current mapping bridges Google Play categories to local slugs.
/// Map Google Play category to local category slug.
pub fn map_category(category: &str) -> Option<&'static str> {
    match category {
        "Education" | "Education;Education" => Some("education"),
        "Shopping" => Some("shopping_and_memberships"),
        "Social" | "Social Networking" => Some("social"),
        "Productivity" => Some("productivity"),
        "Travel & Local" | "Travel" => Some("travel_and_flights"),
        "Health & Fitness" => Some("health_and_fitness"),
        "Finance" => Some("finances_and_insurance"),
        "Food & Drink" => Some("food_and_delivery"),
        "Music & Audio" | "Music" => Some("music_and_audiobooks"),
        "News & Magazines" | "News" => Some("news_and_reading"),
        "Books & Reference" | "Books" | "Reference" => Some("news_and_reading"),
        "Entertainment" => Some("video_streaming"),
        "Photography" | "Art & Design" => Some("design_and_creative"),
        "Developer Tools" => Some("developer_tools"),
        "Tools" | "Utilities" => Some("utilities_and_bills"),
        "Weather" => Some("utilities_and_bills"),
        "Lifestyle" | "Beauty" => Some("beauty_care"),
        "Sports" => Some("health_and_fitness"),
        "Business" => Some("productivity"),
        "Medical" => Some("health_and_fitness"),
        "Dating" => Some("datings"),
        "Auto & Vehicles" => Some("automotive"),
        "House & Home" => Some("smart_home_and_iot"),
        "Maps & Navigation" => Some("transportation"),
        "Video Players & Editors" => Some("video_streaming"),
        "Communication" => Some("social"),
        _ if category.starts_with("Game") => Some("gaming"),
        _ => None,
    }
}
