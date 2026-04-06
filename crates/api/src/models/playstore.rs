/// Parsed app data from Google Play Store HTML page.
pub struct PlayStoreApp {
    pub package_name: String,
    pub name: String,
    pub icon_url: String,
    pub description: Option<String>,
    pub developer: Option<String>,
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

    // Developer name: often in <a> with "developer" in href, or from JSON-LD
    let developer = extract_between(html, r#""developer":""#, r#"""#)
        .or_else(|| extract_between(html, r#","author":{"name":""#, r#"""#));

    // Category from the page (often in breadcrumb or JSON-LD)
    let category = extract_between(html, r#""genre":""#, r#"""#)
        .or_else(|| extract_between(html, r#""applicationCategory":""#, r#"""#));

    Some(PlayStoreApp {
        package_name: package_name.to_string(),
        name: html_unescape(name),
        icon_url: resize_play_icon(icon_url, 512),
        description: description.map(|d| html_unescape(d)),
        developer: developer.map(|d| html_unescape(d)),
        category: category.map(|c| html_unescape(c)),
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
            .find(|c: char| c == '"' || c == '&')
            .unwrap_or(remaining.len().min(256));
        let package_name = &remaining[..pkg_end];

        if package_name.is_empty() || package_name.len() > 256 || results.iter().any(|r: &PlayStoreApp| r.package_name == package_name) {
            search_pos = abs_pos;
            continue;
        }

        // Look ahead for app name in nearby <span> or <div> with the title
        // The title is usually in an aria-label or alt attribute on the same <a> tag
        let context_start = html[..search_pos + pos].rfind('<').unwrap_or(0);
        let context = &html[context_start..html.len().min(abs_pos + 2000)];

        let name = extract_attr(context, "aria-label")
            .or_else(|| extract_attr(context, "title"))
            .unwrap_or_else(|| package_name.to_string());

        // Look for icon URL (play-lh.googleusercontent.com) near this result
        let icon_url = find_nearby_icon(context)
            .map(|u| resize_play_icon(&u, 512))
            .unwrap_or_default();

        if !name.is_empty() {
            results.push(PlayStoreApp {
                package_name: package_name.to_string(),
                name: html_unescape(&name),
                icon_url,
                description: None,
                developer: None,
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

fn extract_attr(html: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let pos = html.find(&needle)?;
    let start = pos + needle.len();
    let end = start + html[start..].find('"')?;
    let val = &html[start..end];
    if val.is_empty() { None } else { Some(val.to_string()) }
}

fn find_nearby_icon(context: &str) -> Option<String> {
    let marker = "play-lh.googleusercontent.com/";
    let pos = context.find(marker)?;
    // Walk backwards to find the start of the URL (after src=" or srcset=")
    let before = &context[..pos];
    let url_start = before.rfind("https://").unwrap_or(pos);
    // Walk forward to find the end of the URL
    let from_start = &context[url_start..];
    let url_end = from_start.find(|c: char| c == '"' || c == '\'' || c == ' ').unwrap_or(from_start.len());
    Some(context[url_start..url_start + url_end].to_string())
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
