/// Parsed logo/icon data from a web page via icon discovery, Open Graph, or Twitter Card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebLogo {
    pub name: String,
    pub logo_url: String,
}

/// Parse a web page HTML to extract the best available logo/icon.
/// Priority: apple-touch-icon -> favicon links -> og:image -> twitter:image -> /favicon.ico.
/// Open Graph images are social previews, so they are deliberately ranked below page icons.
pub fn parse_logo(html: &str, base_url: &url::Url) -> Option<WebLogo> {
    let name = extract_meta(html, "og:site_name")
        .or_else(|| extract_meta(html, "og:title"))
        .or_else(|| extract_meta(html, "twitter:title"))
        .or_else(|| extract_title(html))
        .and_then(|value| sanitize_text(&value))
        .unwrap_or_default();

    let logo_url = find_site_icon(html).or_else(|| {
        extract_itemprop_url(html, "image")
            .or_else(|| extract_meta(html, "og:logo"))
            .or_else(|| extract_meta(html, "logo"))
            .or_else(|| extract_meta(html, "og:image"))
            .or_else(|| extract_meta(html, "twitter:image"))
            .or_else(|| extract_meta(html, "twitter:image:src"))
    });

    let logo_url = match logo_url {
        Some(url) => sanitize_logo_url(base_url, &url).or_else(|| fallback_favicon_url(base_url)),
        None => fallback_favicon_url(base_url),
    };
    let logo_url = logo_url?;

    if name.is_empty() && logo_url.is_empty() {
        return None;
    }

    Some(WebLogo { name, logo_url })
}

/// Extract content from `<meta property="..." content="...">` or `<meta name="..." content="...">`.
fn extract_meta(html: &str, property: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut pos = 0;
    while let Some(found) = lower[pos..].find("<meta") {
        let tag_start = pos + found;
        let Some(tag_end) = lower[tag_start..].find('>').map(|end| tag_start + end) else {
            break;
        };
        let attrs = parse_attrs(&html[tag_start..=tag_end]);

        let matches = attrs
            .iter()
            .any(|(key, value)| (key == "property" || key == "name") && value == property);

        if matches
            && let Some((_, content)) = attrs.into_iter().find(|(key, _)| key == "content")
            && !content.is_empty()
        {
            return Some(content);
        }

        pos = tag_end + 1;
    }
    None
}

/// Extract <title>...</title> content.
fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")? + 6;
    let after_tag = &html[start..];
    let content_start = after_tag.find('>')? + 1;
    let content = &after_tag[content_start..];
    let end = lower[start + content_start..].find("</title>")?;
    let title = content[..end].trim();
    if title.is_empty() {
        None
    } else {
        Some(html_unescape(title))
    }
}

fn find_site_icon(html: &str) -> Option<String> {
    let mut candidates = Vec::new();
    let lower = html.to_ascii_lowercase();
    let mut pos = 0;

    while let Some(found) = lower[pos..].find("<link") {
        let tag_start = pos + found;
        let Some(tag_end) = lower[tag_start..].find('>').map(|end| tag_start + end) else {
            break;
        };
        let attrs = parse_attrs(&html[tag_start..=tag_end]);

        if let Some(candidate) = icon_candidate_from_attrs(&attrs, candidates.len()) {
            candidates.push(candidate);
        }

        pos = tag_end + 1;
    }

    candidates.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| b.size.cmp(&a.size))
            .then_with(|| a.index.cmp(&b.index))
    });

    candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.href)
}

#[derive(Debug)]
struct IconCandidate {
    href: String,
    priority: u8,
    size: u32,
    index: usize,
}

fn icon_candidate_from_attrs(attrs: &[(String, String)], index: usize) -> Option<IconCandidate> {
    let rel = attr_value(attrs, "rel")?;
    let href = attr_value(attrs, "href")?;
    if href.is_empty() {
        return None;
    }

    let rel_tokens: Vec<String> = rel
        .split_ascii_whitespace()
        .map(str::to_lowercase)
        .collect();
    let priority = if rel_tokens.iter().any(|token| token == "apple-touch-icon") {
        40
    } else if rel_tokens
        .iter()
        .any(|token| token == "apple-touch-icon-precomposed")
    {
        39
    } else if rel_tokens.iter().any(|token| token == "icon") {
        30
    } else if rel_tokens.iter().any(|token| token == "mask-icon") {
        20
    } else {
        return None;
    };

    Some(IconCandidate {
        href: href.to_string(),
        priority,
        size: attr_value(attrs, "sizes").map_or(0, parse_largest_size),
        index,
    })
}

fn attr_value<'a>(attrs: &'a [(String, String)], name: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find_map(|(key, value)| (key == name).then_some(value.as_str()))
}

fn parse_largest_size(sizes: &str) -> u32 {
    sizes
        .split_ascii_whitespace()
        .filter_map(|size| {
            if size.eq_ignore_ascii_case("any") {
                return Some(u32::MAX);
            }

            let (width, height) = size.split_once('x')?;
            let width = width.parse::<u32>().ok()?;
            let height = height.parse::<u32>().ok()?;
            Some(width.max(height))
        })
        .max()
        .unwrap_or(0)
}

fn extract_itemprop_url(html: &str, itemprop: &str) -> Option<String> {
    let mut pos = 0;
    while let Some(tag_start) = html[pos..].find('<').map(|found| pos + found) {
        if html[tag_start..].starts_with("</") {
            pos = tag_start + 2;
            continue;
        }

        let Some(tag_end) = html[tag_start..].find('>').map(|end| tag_start + end) else {
            break;
        };
        let attrs = parse_attrs(&html[tag_start..=tag_end]);
        let matches_itemprop = attrs
            .iter()
            .any(|(key, value)| key == "itemprop" && value == itemprop);

        if matches_itemprop {
            return attr_value(&attrs, "src")
                .or_else(|| attr_value(&attrs, "content"))
                .or_else(|| attr_value(&attrs, "href"))
                .map(ToString::to_string);
        }

        pos = tag_end + 1;
    }

    None
}

/// Resolve a potentially relative URL against a base URL.
fn sanitize_logo_url(base: &url::Url, url_str: &str) -> Option<String> {
    let url_str = html_unescape(url_str);
    let parsed = if url_str.starts_with("//") {
        url::Url::parse(&format!("{}:{url_str}", base.scheme())).ok()?
    } else {
        base.join(&url_str).ok()?
    };

    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }

    parsed.host_str()?;

    Some(parsed.to_string())
}

fn fallback_favicon_url(base: &url::Url) -> Option<String> {
    sanitize_logo_url(base, "/favicon.ico")
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

fn sanitize_text(value: &str) -> Option<String> {
    let value = strip_tags(&html_unescape(value));
    let value = value
        .chars()
        .filter(|ch| !ch.is_control() || ch.is_whitespace())
        .collect::<String>();
    let value = collapse_whitespace(&value);

    if value.is_empty() { None } else { Some(value) }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn base_url() -> url::Url {
        url::Url::parse("https://uha.app").unwrap()
    }

    #[test]
    fn prefers_site_icon_over_og_image() {
        let html = r#"
            <meta property="og:title" content="UHA">
            <meta property="og:image" content="https://uha.app/og.png">
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.logo_url, "https://uha.app/apple-touch-icon.png");
    }

    #[test]
    fn parses_link_attrs_in_any_order_and_prefers_largest_icon() {
        let html = r#"
            <link href="/favicon-32.png" sizes="32x32" rel="icon">
            <link sizes="192x192" href="/icon-192.png" rel='icon shortcut'>
            <meta content="https://uha.app/preview.png" property="og:image">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.logo_url, "https://uha.app/icon-192.png");
    }

    #[test]
    fn falls_back_to_og_image_when_no_icon_exists() {
        let html = r#"<meta content="https://uha.app/preview.png" property="og:image">"#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.logo_url, "https://uha.app/preview.png");
    }

    #[test]
    fn prefers_itemprop_image_over_og_image() {
        let html = r#"
            <meta property="og:title" content="UHA">
            <meta property="og:image" content="https://uha.app/preview.png">
            <img itemprop="image" src="/site-logo.png">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.logo_url, "https://uha.app/site-logo.png");
    }

    #[test]
    fn uses_og_logo_before_og_image() {
        let html = r#"
            <meta property="og:title" content="UHA">
            <meta property="og:image" content="https://uha.app/preview.png">
            <meta property="og:logo" content="https://uha.app/logo.png">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.logo_url, "https://uha.app/logo.png");
    }

    #[test]
    fn handles_mixed_case_tags() {
        let html = r#"
            <META PROPERTY="og:title" CONTENT="UHA">
            <LINK REL="ICON" HREF="/favicon.svg" SIZES="any">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.name, "UHA");
        assert_eq!(parsed.logo_url, "https://uha.app/favicon.svg");
    }

    #[test]
    fn sanitizes_name_and_rejects_unsafe_logo_url() {
        let html = r#"
            <meta property="og:title" content="&lt;img src=x onerror=alert(1)&gt; UHA&#10;App">
            <link rel="icon" href="javascript:alert(1)">
            <meta property="og:image" content="data:image/svg+xml,&lt;svg onload=alert(1)&gt;">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.name, "UHA App");
        assert_eq!(parsed.logo_url, "https://uha.app/favicon.ico");
    }

    #[test]
    fn allows_http_and_https_logo_urls_only() {
        let html = r#"
            <meta property="og:title" content="UHA">
            <link rel="icon" href="//cdn.uha.app/favicon.png">
        "#;

        let parsed = parse_logo(html, &base_url()).unwrap();

        assert_eq!(parsed.logo_url, "https://cdn.uha.app/favicon.png");
    }

    #[test]
    fn falls_back_when_relative_url_cannot_be_resolved_against_base() {
        let base = url::Url::parse("data:text/html,hello").unwrap();
        let html = r#"
            <meta property="og:title" content="UHA">
            <link rel="icon" href="javascript:alert(1)">
        "#;

        assert!(parse_logo(html, &base).is_none());
    }
}
