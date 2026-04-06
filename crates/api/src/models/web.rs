/// Parsed logo/icon data from a web page via Open Graph, Twitter Card, or favicon discovery.
pub struct WebLogo {
    pub name: String,
    pub logo_url: String,
}

/// Parse a web page HTML to extract the best available logo/icon.
/// Priority: og:image → twitter:image → apple-touch-icon → favicon links → /favicon.ico
pub fn parse_logo(html: &str, base_url: &url::Url) -> Option<WebLogo> {
    let name = extract_meta(html, "og:site_name")
        .or_else(|| extract_meta(html, "og:title"))
        .or_else(|| extract_meta(html, "twitter:title"))
        .or_else(|| extract_title(html))
        .unwrap_or_default();

    let logo_url = extract_meta(html, "og:image")
        .or_else(|| extract_meta(html, "twitter:image"))
        .or_else(|| extract_meta(html, "twitter:image:src"))
        .or_else(|| find_apple_touch_icon(html))
        .or_else(|| find_favicon_link(html));

    let logo_url = match logo_url {
        Some(url) => resolve_url(base_url, &url),
        None => {
            // Fallback: try common favicon paths
            format!("{}://{}/favicon.ico", base_url.scheme(), base_url.host_str()?)
        }
    };

    if name.is_empty() && logo_url.is_empty() {
        return None;
    }

    Some(WebLogo {
        name,
        logo_url,
    })
}

/// Extract content from `<meta property="..." content="...">` or `<meta name="..." content="...">`.
fn extract_meta(html: &str, property: &str) -> Option<String> {
    for attr in ["property", "name"] {
        let needle = format!(r#"{attr}="{property}""#);
        if let Some(pos) = html.find(&needle) {
            let after = &html[pos + needle.len()..];
            if let Some(content) = extract_content_attr(after) {
                if !content.is_empty() {
                    return Some(html_unescape(&content));
                }
            }
        }
    }
    None
}

/// Extract the content="..." value from a string starting after a meta attribute.
fn extract_content_attr(s: &str) -> Option<String> {
    // Handle both content="..." and content='...'
    let s = s.trim_start();
    let content_marker = "content=";
    let pos = s.find(content_marker)?;
    let after = &s[pos + content_marker.len()..];
    let after = after.trim_start();

    let (quote, start) = if after.starts_with('"') {
        ('"', 1)
    } else if after.starts_with('\'') {
        ('\'', 1)
    } else {
        return None;
    };

    let end = after[start..].find(quote)?;
    Some(after[start..start + end].to_string())
}

/// Extract <title>...</title> content.
fn extract_title(html: &str) -> Option<String> {
    let start = html.find("<title")? + 6;
    let after_tag = &html[start..];
    let content_start = after_tag.find('>')? + 1;
    let content = &after_tag[content_start..];
    let end = content.find("</title>")?;
    let title = content[..end].trim();
    if title.is_empty() {
        None
    } else {
        Some(html_unescape(title))
    }
}

/// Find apple-touch-icon link.
fn find_apple_touch_icon(html: &str) -> Option<String> {
    find_link_by_rel(html, "apple-touch-icon")
        .or_else(|| find_link_by_rel(html, "apple-touch-icon-precomposed"))
}

/// Find favicon from <link rel="icon" ...> or <link rel="shortcut icon" ...>.
fn find_favicon_link(html: &str) -> Option<String> {
    find_link_by_rel(html, "icon")
        .or_else(|| find_link_by_rel(html, "shortcut icon"))
}

/// Find a <link> tag with a specific rel value and extract its href.
fn find_link_by_rel(html: &str, rel: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let needle = format!(r#"rel="{rel}""#);

    let pos = lower.find(&needle)?;
    // Search within the surrounding <link ...> tag
    let tag_start = lower[..pos].rfind('<')?;
    let tag_end = pos + lower[pos..].find('>')?;
    let tag = &html[tag_start..=tag_end];

    // Extract href
    let href_pos = tag.to_ascii_lowercase().find("href=")?;
    let after_href = &tag[href_pos + 5..];
    let after_href = after_href.trim_start();

    let (quote, start) = if after_href.starts_with('"') {
        ('"', 1)
    } else if after_href.starts_with('\'') {
        ('\'', 1)
    } else {
        return None;
    };

    let end = after_href[start..].find(quote)?;
    let href = &after_href[start..start + end];
    if href.is_empty() { None } else { Some(href.to_string()) }
}

/// Resolve a potentially relative URL against a base URL.
fn resolve_url(base: &url::Url, url_str: &str) -> String {
    if url_str.starts_with("http://") || url_str.starts_with("https://") {
        url_str.to_string()
    } else if url_str.starts_with("//") {
        format!("{}:{}", base.scheme(), url_str)
    } else {
        base.join(url_str)
            .map(|u| u.to_string())
            .unwrap_or_else(|_| url_str.to_string())
    }
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
}
