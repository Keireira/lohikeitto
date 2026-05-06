use scraper::{ElementRef, Html, Selector};

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
    let document = Html::parse_document(html);

    let name = extract_meta(&document, "og:site_name")
        .or_else(|| extract_meta(&document, "og:title"))
        .or_else(|| extract_meta(&document, "twitter:title"))
        .or_else(|| extract_title(&document))
        .and_then(|value| sanitize_text(&value))
        .unwrap_or_default();

    let logo_url = find_site_icon(&document).or_else(|| {
        extract_itemprop_url(&document, "image")
            .or_else(|| extract_meta(&document, "og:logo"))
            .or_else(|| extract_meta(&document, "logo"))
            .or_else(|| extract_meta(&document, "og:image"))
            .or_else(|| extract_meta(&document, "twitter:image"))
            .or_else(|| extract_meta(&document, "twitter:image:src"))
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
fn extract_meta(document: &Html, property: &str) -> Option<String> {
    let selector = Selector::parse("meta").ok()?;

    document.select(&selector).find_map(|element| {
        let value = element
            .value()
            .attr("property")
            .or_else(|| element.value().attr("name"))?;

        if value.eq_ignore_ascii_case(property) {
            element
                .value()
                .attr("content")
                .filter(|content| !content.is_empty())
                .map(ToString::to_string)
        } else {
            None
        }
    })
}

/// Extract <title>...</title> content.
fn extract_title(document: &Html) -> Option<String> {
    let selector = Selector::parse("title").ok()?;
    let title = document
        .select(&selector)
        .next()?
        .text()
        .collect::<Vec<_>>()
        .join(" ");
    let title = title.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn find_site_icon(document: &Html) -> Option<String> {
    let mut candidates = Vec::new();
    let selector = Selector::parse("link").ok()?;

    for element in document.select(&selector) {
        if let Some(candidate) = icon_candidate_from_element(element, candidates.len()) {
            candidates.push(candidate);
        }
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

fn icon_candidate_from_element(element: ElementRef<'_>, index: usize) -> Option<IconCandidate> {
    let rel = element.value().attr("rel")?;
    let href = element.value().attr("href")?;
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
        size: element.value().attr("sizes").map_or(0, parse_largest_size),
        index,
    })
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

fn extract_itemprop_url(document: &Html, itemprop: &str) -> Option<String> {
    let selector = Selector::parse("[itemprop]").ok()?;

    document.select(&selector).find_map(|element| {
        let matches_itemprop = element
            .value()
            .attr("itemprop")
            .is_some_and(|value| value.eq_ignore_ascii_case(itemprop));

        if matches_itemprop {
            element
                .value()
                .attr("src")
                .or_else(|| element.value().attr("content"))
                .or_else(|| element.value().attr("href"))
                .map(ToString::to_string)
        } else {
            None
        }
    })
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
