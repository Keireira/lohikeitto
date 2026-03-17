use std::io::Cursor;

/// Detected image format from magic bytes.
#[derive(Debug, Clone, Copy)]
pub enum ImgFormat {
    Webp,
    Png,
    Jpeg,
    Gif,
    Svg,
    Unknown,
}

/// Detect image format from magic bytes.
pub fn detect(data: &[u8]) -> ImgFormat {
    if data.len() < 4 {
        return ImgFormat::Unknown;
    }
    // RIFF....WEBP
    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return ImgFormat::Webp;
    }
    // PNG: 89 50 4E 47
    if &data[0..4] == &[0x89, 0x50, 0x4E, 0x47] {
        return ImgFormat::Png;
    }
    // JPEG: FF D8 FF
    if data.len() >= 3 && &data[0..3] == &[0xFF, 0xD8, 0xFF] {
        return ImgFormat::Jpeg;
    }
    // GIF: GIF8
    if &data[0..4] == b"GIF8" {
        return ImgFormat::Gif;
    }
    // SVG: starts with < (after optional BOM/whitespace)
    let trimmed = std::str::from_utf8(data).unwrap_or("").trim_start();
    if trimmed.starts_with("<?xml") || trimmed.starts_with("<svg") {
        return ImgFormat::Svg;
    }
    ImgFormat::Unknown
}

/// Convert image bytes to WebP. Returns (webp_bytes, source_format_name).
/// If already WebP, returns as-is.
/// SVG and unknown formats return an error.
pub fn to_webp(data: &[u8]) -> Result<(Vec<u8>, &'static str), String> {
    let fmt = detect(data);

    match fmt {
        ImgFormat::Webp => Ok((data.to_vec(), "webp")),
        ImgFormat::Png | ImgFormat::Jpeg | ImgFormat::Gif => {
            let img = image::load_from_memory(data)
                .map_err(|e| format!("decode error: {e}"))?;

            let mut buf = Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::WebP)
                .map_err(|e| format!("webp encode error: {e}"))?;

            let format_name = match fmt {
                ImgFormat::Png => "png",
                ImgFormat::Jpeg => "jpeg",
                ImgFormat::Gif => "gif",
                _ => unreachable!(),
            };

            Ok((buf.into_inner(), format_name))
        }
        ImgFormat::Svg => Err("SVG not supported, convert manually".into()),
        ImgFormat::Unknown => {
            let hex: String = data.iter().take(16).map(|b| format!("{b:02x}")).collect::<Vec<_>>().join(" ");
            Err(format!("Unknown image format (first bytes: {hex})"))
        }
    }
}
