//! Reads a link into the quality picker. Mirrors `Extractor.fetch` in the Android app.

use crate::engine::{friendly_error, is_youtube, Engine};
use crate::protocol::{AudioFormat, FormatOption, MediaInfo, Quality};
use serde_json::Value;
use std::collections::BTreeMap;

pub fn inspect(engine: &Engine, url: &str) -> Result<MediaInfo, String> {
    let info = if is_youtube(url) {
        // Solving YouTube's player challenge is most of a fetch, but the picker only needs heights
        // and sizes, which come without it. Falls back to a full run if that loses the video formats.
        run(engine, url, Some("youtube:player_skip=js;skip=hls"))
            .ok()
            .filter(has_video)
            .map_or_else(|| run(engine, url, None), Ok)?
    } else {
        run(engine, url, None)?
    };
    Ok(parse(url, &info))
}

fn run(engine: &Engine, url: &str, extractor_args: Option<&str>) -> Result<Value, String> {
    let mut command = engine
        .command()
        .ok_or("yt-dlp is missing from the ClipSave Helper.")?;
    command.arg("-J");
    if let Some(args) = extractor_args {
        command.args(["--extractor-args", args]);
    }
    command.args(["--", url]);
    let output = command
        .output()
        .map_err(|e| format!("Could not start yt-dlp: {e}"))?;
    if !output.status.success() {
        return Err(friendly_error(&String::from_utf8_lossy(&output.stderr)));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "Could not read yt-dlp's answer.".to_string())
}

fn has_video(info: &Value) -> bool {
    formats(info).iter().any(is_video)
}

fn formats(info: &Value) -> &[Value] {
    info["formats"].as_array().map_or(&[], Vec::as_slice)
}

fn is_video(format: &Value) -> bool {
    has_codec(format, "vcodec") && height(format).is_some()
}

/// Some extractors leave a codec out entirely, so only a literal "none" counts as absent.
fn has_codec(format: &Value, key: &str) -> bool {
    format[key].as_str().is_some_and(|codec| codec != "none")
}

fn height(format: &Value) -> Option<u32> {
    format["height"]
        .as_u64()
        .filter(|h| *h > 0)
        .map(|h| h as u32)
}

fn size(format: &Value) -> Option<u64> {
    let bytes = |key: &str| format[key].as_f64().filter(|n| *n > 0.0).map(|n| n as u64);
    bytes("filesize").or_else(|| bytes("filesize_approx"))
}

/// Only what the popup shows: yt-dlp's full answer can pass the 1 MB message limit.
fn parse(url: &str, info: &Value) -> MediaInfo {
    let text = |key: &str| {
        info[key]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(str::to_string)
    };
    MediaInfo {
        url: url.to_string(),
        title: text("title").unwrap_or_else(|| "Video".to_string()),
        uploader: text("uploader").or_else(|| text("channel")),
        thumbnail: text("thumbnail"),
        duration_sec: info["duration"]
            .as_f64()
            .filter(|d| *d > 0.0)
            .map(|d| d as u64),
        options: options(formats(info)),
    }
}

fn options(formats: &[Value]) -> Vec<FormatOption> {
    let best_audio = formats
        .iter()
        .filter(|f| !has_codec(f, "vcodec") && has_codec(f, "acodec"))
        .filter_map(size)
        .max();

    let mut by_height: BTreeMap<u32, Vec<&Value>> = BTreeMap::new();
    for format in formats.iter().filter(|f| is_video(f)) {
        by_height
            .entry(height(format).unwrap_or(0))
            .or_default()
            .push(format);
    }

    let mut options: Vec<FormatOption> = by_height
        .iter()
        .rev()
        .map(|(height, group)| {
            let best = group.iter().copied().max_by_key(|f| size(f).unwrap_or(0));
            // Muxed formats already contain audio; separate streams need the audio size added.
            let size_bytes = best.and_then(|format| {
                let audio = if has_codec(format, "acodec") {
                    0
                } else {
                    best_audio.unwrap_or(0)
                };
                size(format).map(|video| video + audio)
            });
            FormatOption {
                key: height.to_string(),
                label: format!("{height}p"),
                size_bytes,
                quality: Quality::Video { height: *height },
            }
        })
        .collect();

    if options.is_empty() {
        options.push(FormatOption {
            key: "best".into(),
            label: "Best quality".into(),
            size_bytes: None,
            quality: Quality::Best,
        });
    }
    for (format, label) in [
        (AudioFormat::Mp3, "MP3 audio"),
        (AudioFormat::M4a, "M4A audio"),
    ] {
        options.push(FormatOption {
            key: format.as_str().into(),
            label: label.into(),
            size_bytes: best_audio,
            quality: Quality::Audio { format },
        });
    }
    options
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn groups_by_height_and_adds_audio_to_silent_streams() {
        let info = json!({
            "title": "Clip", "uploader": "Someone", "duration": 12.7, "thumbnail": "https://a/t.jpg",
            "formats": [
                { "vcodec": "avc1", "acodec": "none", "height": 1080, "filesize": 1000 },
                { "vcodec": "vp9", "acodec": "none", "height": 1080, "filesize": 800 },
                { "vcodec": "avc1", "acodec": "mp4a", "height": 360, "filesize_approx": 300.5 },
                { "vcodec": "none", "acodec": "mp4a", "filesize": 100 },
            ],
        });
        let media = parse("https://a/b", &info);
        assert_eq!(media.duration_sec, Some(12));
        let rows: Vec<_> = media
            .options
            .iter()
            .map(|o| (o.label.as_str(), o.size_bytes))
            .collect();
        assert_eq!(
            rows,
            [
                ("1080p", Some(1100)),
                ("360p", Some(300)),
                ("MP3 audio", Some(100)),
                ("M4A audio", Some(100))
            ]
        );
    }

    #[test]
    fn falls_back_to_best_when_no_format_lists_a_height() {
        let media = parse(
            "https://a/b",
            &json!({ "formats": [{ "url": "https://a/v.mp4" }] }),
        );
        assert_eq!(media.title, "Video");
        assert_eq!(media.options[0].quality, Quality::Best);
        assert_eq!(media.options.len(), 3);
    }
}
