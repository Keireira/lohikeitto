use axum::{Json, body::Bytes, extract::State, http::header, response::IntoResponse};
use serde::{Deserialize, Serialize};

use crate::app::AdminState;
use crate::error::AdminError;

use vtracer::{ColorImage, ColorMode, Config as VtracerConfig, Hierarchical, convert};

#[derive(Debug, Deserialize)]
pub struct VectorizeRequest {
    pub slug: String,
    pub colors: Option<i32>,
}

/// Download logo from S3, vectorize with vtracer, return SVG.
pub async fn vectorize(
    State(state): State<AdminState>,
    Json(req): Json<VectorizeRequest>,
) -> Result<impl IntoResponse, AdminError> {
    let key = format!("logos/{}.webp", req.slug);
    let response = state
        .bucket
        .get_object(&key)
        .await
        .map_err(|e| AdminError::Internal(format!("S3 get failed: {}", e)))?;

    let bytes = response.bytes();
    let img = image::load_from_memory(bytes)
        .map_err(|e| AdminError::Internal(format!("Image decode failed: {}", e)))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() as usize, rgba.height() as usize);

    let color_img = ColorImage {
        pixels: rgba.into_raw(),
        width: w,
        height: h,
    };

    let colors = req.colors.unwrap_or(4).clamp(2, 32);

    // color_precision: bits of color to keep (1-8). Lower = fewer colors.
    // layer_difference: threshold for separating color layers. Lower = more layers.
    let precision = match colors {
        2..=3 => 4,
        4..=6 => 5,
        7..=12 => 6,
        13..=20 => 7,
        _ => 8,
    };
    let layer_diff = match colors {
        2..=3 => 48,
        4..=6 => 32,
        7..=12 => 24,
        13..=20 => 16,
        _ => 8,
    };

    let config = VtracerConfig {
        color_mode: ColorMode::Color,
        hierarchical: Hierarchical::Stacked,
        filter_speckle: 4,
        color_precision: precision,
        layer_difference: layer_diff,
        corner_threshold: 60,
        length_threshold: 4.0,
        max_iterations: 10,
        splice_threshold: 45,
        path_precision: Some(2),
        ..VtracerConfig::default()
    };

    let svg = convert(color_img, config)
        .map_err(|e| AdminError::Internal(format!("Vectorization failed: {}", e)))?;

    tracing::info!(
        paths = svg.paths.len(),
        w = svg.width,
        h = svg.height,
        "vectorize done"
    );

    // vtracer outputs width/height but no viewBox — add it for proper scaling
    let svg_str = svg.to_string().replacen(
        &format!("width=\"{}\" height=\"{}\"", svg.width, svg.height),
        &format!(
            "width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\"",
            svg.width, svg.height, svg.width, svg.height
        ),
        1,
    );

    Ok(([(header::CONTENT_TYPE, "image/svg+xml")], svg_str))
}

#[derive(Debug, Deserialize)]
pub struct GradientQuery {
    /// Number of color stops (0 = auto, 2-100 = fixed)
    pub stops: Option<usize>,
    /// "linear" or "radial"
    pub mode: Option<String>,
    /// "bg" (background gradient) or "logo" (foreground/icon gradient)
    pub target: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GradientStop {
    pub offset: f64,
    pub color: String,
}

#[derive(Debug, Serialize)]
pub struct GradientResult {
    pub mode: String,
    pub angle_deg: f64,
    pub stops: Vec<GradientStop>,
    pub svg_gradient: String,
    pub css_gradient: String,
}

fn dedup_stops(stops: Vec<GradientStop>) -> Vec<GradientStop> {
    let mut out: Vec<GradientStop> = Vec::new();
    for stop in &stops {
        if out
            .last()
            .is_none_or(|prev: &GradientStop| prev.color != stop.color)
        {
            out.push(GradientStop {
                offset: stop.offset,
                color: stop.color.clone(),
            });
        }
    }
    if let Some(first) = out.first_mut() {
        first.offset = 0.0;
    }
    if let Some(last) = out.last_mut() {
        last.offset = 1.0;
    }
    out
}

/// Accept raw image bytes, extract gradient (linear with angle detection, or radial).
pub async fn extract_gradient(
    axum::extract::Query(query): axum::extract::Query<GradientQuery>,
    body: Bytes,
) -> Result<Json<GradientResult>, AdminError> {
    if body.is_empty() {
        return Err(AdminError::InvalidInput("No image data".into()));
    }

    let img = image::load_from_memory(&body)
        .map_err(|e| AdminError::Internal(format!("Image decode failed: {}", e)))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() as usize, rgba.height() as usize);
    let raw_stops = query.stops.unwrap_or(0);
    let auto_stops = raw_stops == 0;
    let num_stops = if auto_stops {
        64
    } else {
        raw_stops.clamp(2, 100)
    };
    let mode = query.mode.as_deref().unwrap_or("linear");
    let target = query.target.as_deref().unwrap_or("bg");

    // Find dominant color (most frequent quantized)
    let mut color_counts: std::collections::HashMap<(u8, u8, u8), u64> =
        std::collections::HashMap::new();
    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x as u32, y as u32);
            if p[3] < 128 {
                continue;
            }
            let key = (p[0] / 16 * 16, p[1] / 16 * 16, p[2] / 16 * 16);
            *color_counts.entry(key).or_default() += 1;
        }
    }
    let dominant = color_counts
        .iter()
        .max_by_key(|(_, c)| *c)
        .map(|(k, _)| *k)
        .unwrap_or((128, 128, 128));
    let (dom_r, dom_g, dom_b) = (dominant.0 as f64, dominant.1 as f64, dominant.2 as f64);
    let max_dist = 120.0;

    // target=bg: pixels close to dominant (background)
    // target=logo: pixels far from dominant (foreground icon)
    let pixel_ok = |p: &image::Rgba<u8>| -> bool {
        if p[3] < 128 {
            return false;
        }
        let d = ((p[0] as f64 - dom_r).powi(2)
            + (p[1] as f64 - dom_g).powi(2)
            + (p[2] as f64 - dom_b).powi(2))
        .sqrt();
        if target == "logo" {
            d >= max_dist
        } else {
            d < max_dist
        }
    };

    let median_rgb = |pixels: &mut Vec<[u8; 3]>| -> Option<[f64; 3]> {
        if pixels.is_empty() {
            return None;
        }
        pixels.sort_by_key(|p| p[0] as u16 + p[1] as u16 + p[2] as u16);
        let m = pixels.len() / 2;
        Some([
            pixels[m][0] as f64,
            pixels[m][1] as f64,
            pixels[m][2] as f64,
        ])
    };

    if mode == "radial" {
        // Sample concentric rings from center outward
        let cx = w as f64 / 2.0;
        let cy = h as f64 / 2.0;
        let max_r = (cx * cx + cy * cy).sqrt();

        let mut stops: Vec<GradientStop> = Vec::new();
        for i in 0..num_stops {
            let r_lo = max_r * i as f64 / num_stops as f64;
            let r_hi = max_r * (i + 1) as f64 / num_stops as f64;
            let mut pixels: Vec<[u8; 3]> = Vec::new();
            for y in 0..h {
                for x in 0..w {
                    let dx = x as f64 - cx;
                    let dy = y as f64 - cy;
                    let r = (dx * dx + dy * dy).sqrt();
                    if r < r_lo || r >= r_hi {
                        continue;
                    }
                    let p = rgba.get_pixel(x as u32, y as u32);
                    if pixel_ok(p) {
                        pixels.push([p[0], p[1], p[2]]);
                    }
                }
            }
            if let Some(rgb) = median_rgb(&mut pixels) {
                let offset = if num_stops <= 1 {
                    0.0
                } else {
                    i as f64 / (num_stops - 1) as f64
                };
                stops.push(GradientStop {
                    offset,
                    color: format!(
                        "#{:02x}{:02x}{:02x}",
                        rgb[0] as u8, rgb[1] as u8, rgb[2] as u8
                    ),
                });
            }
        }
        stops = dedup_stops(stops);

        let stop_els: String = stops
            .iter()
            .map(|s| {
                format!(
                    r#"<stop offset="{:.1}%" stop-color="{}"/>"#,
                    s.offset * 100.0,
                    s.color
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">
<defs><radialGradient id="g" cx="50%" cy="50%" r="70.7%">
{stop_els}
</radialGradient></defs>
<rect width="{w}" height="{h}" fill="url(#g)"/>
</svg>"#
        );
        let css_stops: String = stops
            .iter()
            .map(|s| format!("{} {:.0}%", s.color, s.offset * 100.0))
            .collect::<Vec<_>>()
            .join(", ");
        let css = format!("radial-gradient(circle, {})", css_stops);

        return Ok(Json(GradientResult {
            mode: "radial".into(),
            angle_deg: 0.0,
            stops,
            svg_gradient: svg,
            css_gradient: css,
        }));
    }

    // Linear: scan multiple angles, pick the one with highest color variance
    let angles_to_test: Vec<f64> = (0..36).map(|i| i as f64 * 5.0).collect();
    let cx = w as f64 / 2.0;
    let cy = h as f64 / 2.0;

    let mut best_angle = 0.0_f64;
    let mut best_var = 0.0_f64;
    let mut best_strips: Vec<[f64; 3]> = Vec::new();

    for &angle_deg in &angles_to_test {
        let angle_rad = angle_deg.to_radians();
        let dir_x = angle_rad.sin();
        let dir_y = -angle_rad.cos();

        // Project all bg pixels onto the gradient axis, find range
        let mut projections: Vec<(f64, [u8; 3])> = Vec::new();
        for y in 0..h {
            for x in 0..w {
                let p = rgba.get_pixel(x as u32, y as u32);
                if !pixel_ok(p) {
                    continue;
                }
                let proj = (x as f64 - cx) * dir_x + (y as f64 - cy) * dir_y;
                projections.push((proj, [p[0], p[1], p[2]]));
            }
        }
        if projections.len() < 100 {
            continue;
        }

        projections.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        let p_min = match projections.first() {
            Some(v) => v.0,
            None => continue,
        };
        let p_max = match projections.last() {
            Some(v) => v.0,
            None => continue,
        };
        let p_range = p_max - p_min;
        if p_range < 1.0 {
            continue;
        }

        // Bucket into num_stops bins, take median
        let mut strips: Vec<[f64; 3]> = Vec::new();
        for i in 0..num_stops {
            let lo = p_min + p_range * i as f64 / num_stops as f64;
            let hi = p_min + p_range * (i + 1) as f64 / num_stops as f64;
            let mut bucket: Vec<[u8; 3]> = projections
                .iter()
                .filter(|(proj, _)| *proj >= lo && *proj < hi)
                .map(|(_, rgb)| *rgb)
                .collect();
            if let Some(rgb) = median_rgb(&mut bucket) {
                strips.push(rgb);
            }
        }
        if strips.len() < 2 {
            continue;
        }

        // Variance of strip colors
        let n = strips.len() as f64;
        let mean = [
            strips.iter().map(|s| s[0]).sum::<f64>() / n,
            strips.iter().map(|s| s[1]).sum::<f64>() / n,
            strips.iter().map(|s| s[2]).sum::<f64>() / n,
        ];
        let var: f64 = strips
            .iter()
            .map(|s| (s[0] - mean[0]).powi(2) + (s[1] - mean[1]).powi(2) + (s[2] - mean[2]).powi(2))
            .sum::<f64>()
            / n;

        if var > best_var {
            best_var = var;
            best_angle = angle_deg;
            best_strips = strips;
        }
    }

    let mut stops: Vec<GradientStop> = best_strips
        .iter()
        .enumerate()
        .map(|(i, rgb)| {
            let offset = if best_strips.len() <= 1 {
                0.0
            } else {
                i as f64 / (best_strips.len() - 1) as f64
            };
            GradientStop {
                offset,
                color: format!(
                    "#{:02x}{:02x}{:02x}",
                    rgb[0] as u8, rgb[1] as u8, rgb[2] as u8
                ),
            }
        })
        .collect();

    stops = dedup_stops(stops);

    // SVG: use angle to compute x1,y1,x2,y2
    let rad = best_angle.to_radians();
    let x1 = 50.0 - rad.sin() * 50.0;
    let y1 = 50.0 + rad.cos() * 50.0;
    let x2 = 50.0 + rad.sin() * 50.0;
    let y2 = 50.0 - rad.cos() * 50.0;

    let stop_els: String = stops
        .iter()
        .map(|s| {
            format!(
                r#"<stop offset="{:.1}%" stop-color="{}"/>"#,
                s.offset * 100.0,
                s.color
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">
<defs><linearGradient id="g" x1="{x1:.1}%" y1="{y1:.1}%" x2="{x2:.1}%" y2="{y2:.1}%">
{stop_els}
</linearGradient></defs>
<rect width="{w}" height="{h}" fill="url(#g)"/>
</svg>"#
    );

    let css_stops: String = stops
        .iter()
        .map(|s| format!("{} {:.0}%", s.color, s.offset * 100.0))
        .collect::<Vec<_>>()
        .join(", ");
    let css = format!("linear-gradient({:.0}deg, {})", best_angle, css_stops);

    Ok(Json(GradientResult {
        mode: "linear".into(),
        angle_deg: best_angle,
        stops,
        svg_gradient: svg,
        css_gradient: css,
    }))
}
