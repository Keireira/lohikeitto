/// Parsed app data from Google Play Store HTML page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayStoreApp {
    pub package_name: String,
    pub name: String,
    pub icon_url: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Extract content from `<meta property="..." content="...">` or `<meta name="..." content="...">`.
fn extract_meta(html: &str, property: &str) -> Option<String> {
    let mut pos = 0;

    while let Some(found) = html[pos..].find("<meta") {
        let tag_start = pos + found;
        let Some(tag_end) = html[tag_start..].find('>').map(|end| tag_start + end) else {
            break;
        };
        let attrs = parse_attrs(&html[tag_start..=tag_end]);

        let matches = attrs
            .iter()
            .any(|(key, value)| (key == "property" || key == "name") && value == property);

        if matches {
            if let Some((_, content)) = attrs.into_iter().find(|(key, _)| key == "content") {
                return Some(content);
            }
        }

        pos = tag_end + 1;
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
    if !is_valid_package_name(package_name) {
        return None;
    }

    let json_ld = extract_json_ld(html);

    let name = extract_meta(html, "og:title").or_else(|| {
        json_ld
            .as_ref()
            .and_then(|value| json_string(value, "name"))
    })?;

    let icon_url = extract_meta(html, "og:image")
        .or_else(|| {
            json_ld
                .as_ref()
                .and_then(|value| json_string(value, "image"))
        })
        .unwrap_or_default();

    let description = extract_meta(html, "og:description").or_else(|| {
        json_ld
            .as_ref()
            .and_then(|value| json_string(value, "description"))
    });

    // Category from the page (often in breadcrumb or JSON-LD)
    let category = extract_between(html, r#""genre":""#, r#"""#)
        .or_else(|| extract_between(html, r#""applicationCategory":""#, r#"""#))
        .map(html_unescape)
        .or_else(|| {
            json_ld
                .as_ref()
                .and_then(|value| json_string(value, "applicationCategory"))
        });

    Some(PlayStoreApp {
        package_name: package_name.to_string(),
        name: sanitize_text(&cleanup_app_name(&html_unescape(&name)))?,
        icon_url: sanitize_play_image_url(&icon_url)
            .map(|url| resize_play_icon(&url, 512))
            .unwrap_or_default(),
        description: description.and_then(|value| sanitize_text(&value)),
        category: category.and_then(|value| sanitize_text(&value)),
    })
}

/// Parse Google Play search results page, extracting package IDs, names, and icons.
pub fn parse_search_page(html: &str) -> Vec<PlayStoreApp> {
    let mut results = Vec::new();
    let normalized = normalize_google_markup(html);

    for occurrence in find_package_occurrences(&normalized) {
        if results
            .iter()
            .any(|r: &PlayStoreApp| r.package_name == occurrence.package_name)
        {
            continue;
        }

        let card = extract_result_card(&normalized, occurrence.position);

        // Icon: find the img with =s64 or =s128 (thumbnail, not screenshot)
        let icon_url = find_thumbnail_icon(&card)
            .map(|u| resize_play_icon(&u, 512))
            .unwrap_or_default();

        let name = find_app_name(&card).unwrap_or_else(|| occurrence.package_name.clone());

        if !name.is_empty() {
            let Some(name) = sanitize_text(&name) else {
                continue;
            };

            results.push(PlayStoreApp {
                package_name: occurrence.package_name,
                name,
                icon_url: sanitize_play_image_url(&icon_url)
                    .map(|url| resize_play_icon(&url, 512))
                    .unwrap_or_default(),
                description: None,
                category: None,
            });
        }

        if results.len() >= 10 {
            break;
        }
    }

    results
}

pub fn parse_search_package_names(html: &str) -> Vec<String> {
    let normalized = normalize_google_markup(html);
    let mut package_names = Vec::new();

    for occurrence in find_package_occurrences(&normalized) {
        if !package_names.contains(&occurrence.package_name) {
            package_names.push(occurrence.package_name);
        }

        if package_names.len() >= 10 {
            break;
        }
    }

    package_names
}

#[derive(Debug)]
struct PackageOccurrence {
    package_name: String,
    position: usize,
}

fn find_package_occurrences(html: &str) -> Vec<PackageOccurrence> {
    const NEEDLES: [&str; 4] = [
        "/store/apps/details?id=",
        "/store/apps/details?hl=",
        "play.google.com/store/apps/details?id=",
        "play.google.com/store/apps/details?hl=",
    ];

    let mut occurrences = Vec::new();
    for needle in NEEDLES {
        let mut pos = 0;
        while let Some(found) = html[pos..].find(needle) {
            let link_start = pos + found;
            if let Some(package_name) = extract_package_name(&html[link_start..]) {
                occurrences.push(PackageOccurrence {
                    package_name,
                    position: link_start,
                });
            }
            pos = link_start + needle.len();
        }
    }

    occurrences.sort_by_key(|occ| occ.position);
    occurrences
}

fn extract_package_name(link: &str) -> Option<String> {
    let id_pos = link.find("id=")? + 3;
    let rest = &link[id_pos..];
    let end = rest
        .find(|ch: char| {
            matches!(
                ch,
                '"' | '\'' | '&' | '<' | '>' | '\\' | ',' | ')' | ']' | '}' | ' '
            )
        })
        .unwrap_or(rest.len().min(256));
    let package_name = url_decode(&html_unescape(&rest[..end]));

    if is_valid_package_name(&package_name) {
        Some(package_name)
    } else {
        None
    }
}

pub fn is_valid_package_name(package_name: &str) -> bool {
    package_name.len() <= 256
        && package_name.contains('.')
        && package_name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.'))
        && package_name
            .split('.')
            .all(|part| !part.is_empty() && !part.starts_with('_'))
}

fn extract_result_card(html: &str, link_pos: usize) -> String {
    let before = &html[..link_pos];
    let start = before
        .rfind("<a")
        .unwrap_or_else(|| link_pos.saturating_sub(1000));
    let ahead = &html[link_pos..html.len().min(link_pos + 5000)];
    let end = ahead.find("</a>").map_or(ahead.len(), |pos| pos + 4);

    html[start..link_pos + end].to_string()
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
            .find(['"', '\'', ' ', '\\', '<'])
            .unwrap_or(from_start.len());
        let url = html_unescape(&card[url_start..url_start + url_end]);

        // Skip screenshots (contain =w...-h...), want thumbnails (=s64, =s128)
        if !url.contains("=w") && !url.contains("-h") && sanitize_play_image_url(&url).is_some() {
            return Some(url);
        }
        pos = abs + marker.len();
    }
    None
}

/// Find the app name: first <span> text that looks like an app name (not a rating or number).
fn find_app_name(card: &str) -> Option<String> {
    for attr in ["aria-label", "title", "alt"] {
        for (_, value) in parse_attrs(card).into_iter().filter(|(key, _)| key == attr) {
            let candidate = cleanup_app_name(&html_unescape(&value));
            if is_plausible_app_name(&candidate) {
                return Some(candidate);
            }
        }
    }

    let mut search_pos = 0;
    while let Some(span_start) = card[search_pos..].find("<span") {
        let abs = search_pos + span_start;
        let after_tag = &card[abs..];
        let Some(content_start) = after_tag.find('>').map(|pos| pos + 1) else {
            break;
        };
        let content = &after_tag[content_start..];
        let Some(end) = content.find("</span>") else {
            break;
        };
        let text = cleanup_app_name(&strip_tags(&content[..end]));

        if is_plausible_app_name(&text) {
            return Some(html_unescape(&text));
        }
        search_pos = abs + content_start + end;
    }
    None
}

fn is_plausible_app_name(text: &str) -> bool {
    let normalized = text.trim().to_ascii_lowercase();

    !text.is_empty()
        && !text.starts_with('<')
        && normalized != "install"
        && normalized != "screenshot image"
        && normalized != "image"
        && !normalized.starts_with("screenshot")
        && !normalized.starts_with("star")
        && !normalized.contains("rated ")
        && text.parse::<f64>().is_err()
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

fn sanitize_text(value: &str) -> Option<String> {
    let value = strip_tags(&html_unescape(value));
    let value = value
        .chars()
        .filter(|ch| !ch.is_control() || ch.is_whitespace())
        .collect::<String>();
    let value = collapse_whitespace(&value);

    if value.is_empty() { None } else { Some(value) }
}

fn collapse_whitespace(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut previous_was_whitespace = false;

    for ch in value.trim().chars() {
        if ch.is_whitespace() {
            if !previous_was_whitespace {
                out.push(' ');
            }
            previous_was_whitespace = true;
        } else {
            out.push(ch);
            previous_was_whitespace = false;
        }
    }

    out
}

fn sanitize_play_image_url(value: &str) -> Option<String> {
    let value = html_unescape(value);
    let parsed = url::Url::parse(&value).ok()?;

    if parsed.scheme() != "https" {
        return None;
    }

    let host = parsed.host_str()?;
    if !matches!(
        host,
        "play-lh.googleusercontent.com" | "lh3.googleusercontent.com"
    ) {
        return None;
    }

    Some(parsed.to_string())
}

fn extract_json_ld(html: &str) -> Option<serde_json::Value> {
    let mut pos = 0;
    while let Some(found) = html[pos..].find("<script") {
        let tag_start = pos + found;
        let Some(tag_end) = html[tag_start..].find('>').map(|end| tag_start + end) else {
            break;
        };
        let attrs = parse_attrs(&html[tag_start..=tag_end]);
        let is_json_ld = attrs
            .iter()
            .any(|(key, value)| key == "type" && value == "application/ld+json");

        if is_json_ld {
            let content_start = tag_end + 1;
            if let Some(end) = html[content_start..].find("</script>") {
                let content = &html[content_start..content_start + end];
                if let Ok(value) = serde_json::from_str(&html_unescape(content)) {
                    return Some(value);
                }
            }
        }

        pos = tag_end + 1;
    }

    None
}

fn json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key)?.as_str().map(ToString::to_string)
}

fn parse_attrs(fragment: &str) -> Vec<(String, String)> {
    let mut attrs = Vec::new();
    let bytes = fragment.as_bytes();
    let mut pos = 0;

    while pos < bytes.len() {
        while pos < bytes.len() && !is_attr_name_char(bytes[pos]) {
            pos += 1;
        }
        let key_start = pos;
        while pos < bytes.len() && is_attr_name_char(bytes[pos]) {
            pos += 1;
        }
        if key_start == pos {
            continue;
        }
        let key = fragment[key_start..pos].to_ascii_lowercase();

        while pos < bytes.len() && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }
        if pos >= bytes.len() || bytes[pos] != b'=' {
            continue;
        }
        pos += 1;
        while pos < bytes.len() && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }
        if pos >= bytes.len() {
            break;
        }

        let quote = bytes[pos];
        let value = if quote == b'"' || quote == b'\'' {
            pos += 1;
            let value_start = pos;
            while pos < bytes.len() && bytes[pos] != quote {
                pos += 1;
            }
            let value = fragment[value_start..pos].to_string();
            pos += usize::from(pos < bytes.len());
            value
        } else {
            let value_start = pos;
            while pos < bytes.len()
                && !bytes[pos].is_ascii_whitespace()
                && !matches!(bytes[pos], b'>' | b'/')
            {
                pos += 1;
            }
            fragment[value_start..pos].to_string()
        };

        attrs.push((key, html_unescape(&value)));
    }

    attrs
}

fn is_attr_name_char(ch: u8) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, b'-' | b':' | b'_')
}

fn normalize_google_markup(html: &str) -> String {
    html.replace("\\u003d", "=")
        .replace("\\u0026", "&")
        .replace("\\u003c", "<")
        .replace("\\u003e", ">")
        .replace("\\/", "/")
}

fn cleanup_app_name(name: &str) -> String {
    let cleaned = strip_tags(name).trim().to_string();
    cleaned
        .strip_suffix(" - Apps on Google Play")
        .or_else(|| cleaned.strip_suffix(" - Google Play"))
        .unwrap_or(&cleaned)
        .trim()
        .to_string()
}

fn strip_tags(html: &str) -> String {
    let mut text = String::with_capacity(html.len());
    let mut in_tag = false;

    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }

    html_unescape(text.trim())
}

fn url_decode(value: &str) -> String {
    let mut decoded = String::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut pos = 0;

    while pos < bytes.len() {
        if bytes[pos] == b'%' && pos + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&value[pos + 1..pos + 3], 16) {
                decoded.push(hex as char);
                pos += 3;
                continue;
            }
        }

        decoded.push(bytes[pos] as char);
        pos += 1;
    }

    decoded
}

/// Basic HTML entity unescaping.
fn html_unescape(s: &str) -> String {
    decode_numeric_entities(
        &s.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&#x27;", "'")
            .replace("&apos;", "'"),
    )
}

fn decode_numeric_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;

    while let Some(start) = rest.find("&#") {
        out.push_str(&rest[..start]);
        let entity = &rest[start + 2..];
        let Some(end) = entity.find(';') else {
            out.push_str(&rest[start..]);
            return out;
        };

        let raw_number = &entity[..end];
        let parsed = raw_number
            .strip_prefix(['x', 'X'])
            .and_then(|hex| u32::from_str_radix(hex, 16).ok())
            .or_else(|| raw_number.parse::<u32>().ok());

        if let Some(ch) = parsed.and_then(char::from_u32) {
            out.push(ch);
        } else {
            out.push_str(&rest[start..start + end + 3]);
        }

        rest = &entity[end + 1..];
    }

    out.push_str(rest);
    out
}

// TODO: migrate local categories to a unified app-store-like genre system.
// Current mapping bridges Google Play categories to local slugs.
/// Map Google Play category to local category slug.
pub fn map_category(category: &str) -> Option<&'static str> {
    let category = category
        .trim()
        .to_ascii_lowercase()
        .replace('&', "and")
        .replace(';', " ")
        .replace('_', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    match category.as_str() {
        "education" | "education education" => Some("education"),
        "shopping" => Some("shopping_and_memberships"),
        "social" | "social networking" | "communication" | "communications" => Some("social"),
        "productivity" | "business" => Some("productivity"),
        "travel and local" | "travel" => Some("travel_and_flights"),
        "health and fitness" | "sports" | "medical" => Some("health_and_fitness"),
        "finance" => Some("finances_and_insurance"),
        "food and drink" => Some("food_and_delivery"),
        "music and audio" | "music" => Some("music_and_audiobooks"),
        "news and magazines" | "news" | "books and reference" | "books" | "reference" => {
            Some("news_and_reading")
        }
        "entertainment" => Some("video_streaming"),
        "photography" | "art and design" => Some("design_and_creative"),
        "developer tools" => Some("developer_tools"),
        "tools" | "utilities" | "weather" => Some("utilities_and_bills"),
        "lifestyle" | "beauty" => Some("beauty_care"),
        "dating" => Some("datings"),
        "auto and vehicles" => Some("automotive"),
        "house and home" => Some("smart_home_and_iot"),
        "maps and navigation" => Some("transportation"),
        "video players and editors" => Some("video_streaming"),
        _ if category.starts_with("game") => Some("gaming"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_search_card_with_attributes_before_href() {
        let html = r#"
            <a aria-label="Spotify: Music and Podcasts" href="/store/apps/details?id=com.spotify.music&amp;hl=en">
                <img src="https://play-lh.googleusercontent.com/screenshot=w526-h296">
                <img alt="Spotify: Music and Podcasts" src="https://play-lh.googleusercontent.com/icon=s64">
                <span>4.3</span>
            </a>
        "#;

        let apps = parse_search_page(html);

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].package_name, "com.spotify.music");
        assert_eq!(apps[0].name, "Spotify: Music and Podcasts");
        assert_eq!(
            apps[0].icon_url,
            "https://play-lh.googleusercontent.com/icon=s512"
        );
    }

    #[test]
    fn parses_escaped_search_links_from_script_data() {
        let html = r#"
            AF_initDataCallback({data: "<a href=\"\/store\/apps\/details?id=com.example.app\u0026hl=en\"><img src=\"https://play-lh.googleusercontent.com/example=s128\"><span>Example App<\/span><\/a>"});
        "#;

        let apps = parse_search_page(html);

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].package_name, "com.example.app");
        assert_eq!(apps[0].name, "Example App");
    }

    #[test]
    fn ignores_screenshot_alt_text_as_app_name() {
        let html = r#"
            <a href="/store/apps/details?id=com.vk.vkvideo">
                <img alt="Screenshot image" src="https://play-lh.googleusercontent.com/screenshot=w526-h296">
                <span>Screenshot image</span>
                <span>VK Video</span>
            </a>
        "#;

        let apps = parse_search_page(html);

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].package_name, "com.vk.vkvideo");
        assert_eq!(apps[0].name, "VK Video");
        assert!(apps[0].icon_url.is_empty());
    }

    #[test]
    fn extracts_search_package_names_without_card_data() {
        let html = r#"
            AF_initDataCallback({data: "[\"/store/apps/details?id=com.vkontakte.android\u0026hl=en\",\"/store/apps/details?id=com.vk.vkvideo\u0026hl=en\"]"});
        "#;

        assert_eq!(
            parse_search_package_names(html),
            vec!["com.vkontakte.android", "com.vk.vkvideo"]
        );
    }

    #[test]
    fn parses_details_meta_regardless_of_attribute_order() {
        let html = r#"
            <meta content="Example App - Apps on Google Play" property="og:title">
            <meta content="https://play-lh.googleusercontent.com/example=s96" property="og:image">
            <meta content="A &amp; B" name="og:description">
            <script type="application/ld+json">{"applicationCategory":"Tools"}</script>
        "#;

        let app = parse_details_page(html, "com.example.app").unwrap();

        assert_eq!(app.name, "Example App");
        assert_eq!(
            app.icon_url,
            "https://play-lh.googleusercontent.com/example=s512"
        );
        assert_eq!(app.description.as_deref(), Some("A & B"));
        assert_eq!(app.category.as_deref(), Some("Tools"));
    }

    #[test]
    fn sanitizes_details_text_and_rejects_unsafe_icon_urls() {
        let html = r#"
            <meta property="og:title" content="&lt;img src=x onerror=alert(1)&gt; Evil App - Apps on Google Play">
            <meta property="og:image" content="javascript:alert(1)">
            <meta property="og:description" content="&lt;script&gt;alert(1)&lt;/script&gt; Safe text&#10;next line">
            <script type="application/ld+json">{"applicationCategory":"<b>Tools</b>"}</script>
        "#;

        let app = parse_details_page(html, "com.example.app").unwrap();

        assert_eq!(app.name, "Evil App");
        assert_eq!(app.icon_url, "");
        assert_eq!(
            app.description.as_deref(),
            Some("alert(1) Safe text next line")
        );
        assert_eq!(app.category.as_deref(), Some("Tools"));
    }

    #[test]
    fn rejects_invalid_details_package_name() {
        let html = r#"<meta property="og:title" content="Example App">"#;

        assert!(parse_details_page(html, "javascript:alert(1)").is_none());
    }

    #[test]
    fn rejects_non_google_search_icon_urls() {
        let html = r#"
            <a aria-label="Example App" href="/store/apps/details?id=com.example.app">
                <img alt="Example App" src="https://evil.example/icon=s64">
            </a>
        "#;

        let apps = parse_search_page(html);

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].name, "Example App");
        assert_eq!(apps[0].icon_url, "");
    }

    #[test]
    fn maps_play_categories_to_existing_category_slugs() {
        assert_eq!(map_category("Communication"), Some("social"));
        assert_eq!(map_category("COMMUNICATION"), Some("social"));
        assert_eq!(map_category("communication"), Some("social"));
        assert_eq!(
            map_category("MUSIC_AND_AUDIO"),
            Some("music_and_audiobooks")
        );
        assert_eq!(
            map_category(" Music & Audio "),
            Some("music_and_audiobooks")
        );
        assert_eq!(map_category("Education;Education"), Some("education"));
        assert_eq!(map_category("Game Puzzle"), Some("gaming"));
    }
}
