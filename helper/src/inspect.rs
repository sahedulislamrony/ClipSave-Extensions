//! Reads a link into the quality picker, or a playlist into its list of videos. Mirrors
//! `Extractor.fetch` in the Android app.

use crate::engine::{friendly_error, is_allowed_url, is_youtube, Engine};
use crate::protocol::{AudioFormat, FormatOption, MediaInfo, PlaylistEntry, PlaylistInfo, Quality};
use serde_json::Value;
use std::collections::BTreeMap;

/// A playlist answer has to fit in one 1 MB message; this many entries leaves plenty of room.
pub const MAX_ENTRIES: usize = 1000;

/// Titles YouTube gives the videos in a playlist that can't be saved.
const UNAVAILABLE: [&str; 3] = ["[Private video]", "[Deleted video]", "[Unavailable video]"];

pub enum Inspected {
    Media(MediaInfo),
    Playlist(PlaylistInfo),
}

/// With `playlist`, a video link that is part of a playlist (YouTube's `watch?v=…&list=…`) reads
/// as that playlist. Without it, such a link reads as the one video, and only a link to a
/// playlist itself reads as a playlist.
pub fn inspect(engine: &Engine, url: &str, playlist: bool) -> Result<Inspected, String> {
    let info = if is_youtube(url) && !playlist {
        // Solving YouTube's player challenge is most of a fetch, but the picker only needs heights
        // and sizes, which come without it. Falls back to a full run if that loses the video formats.
        run(engine, url, false, Some("youtube:player_skip=js;skip=hls"))
            .ok()
            .filter(|info| is_playlist(info) || has_video(info))
            .map_or_else(|| run(engine, url, false, None), Ok)?
    } else {
        run(engine, url, playlist, None)?
    };
    Ok(if is_playlist(&info) {
        Inspected::Playlist(parse_playlist(url, &info))
    } else {
        Inspected::Media(parse(url, &info))
    })
}

fn run(
    engine: &Engine,
    url: &str,
    playlist: bool,
    extractor_args: Option<&str>,
) -> Result<Value, String> {
    let mut command = engine
        .command()
        .ok_or("yt-dlp is missing from the ClipSave Helper.")?;
    // A flat playlist lists its videos without opening each one, so a long playlist reads in
    // seconds. It changes nothing for a single video.
    command.args(["-J", "--flat-playlist"]);
    command.args(["--playlist-items", &format!("1:{MAX_ENTRIES}")]);
    if playlist {
        // Comes after the shared `--no-playlist`, so it wins.
        command.arg("--yes-playlist");
    }
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

fn is_playlist(info: &Value) -> bool {
    info["_type"] == "playlist" || info["_type"] == "multi_video"
}

fn text(value: &Value, key: &str) -> Option<String> {
    value[key]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn seconds(value: &Value) -> Option<u64> {
    value["duration"]
        .as_f64()
        .filter(|d| *d > 0.0)
        .map(|d| d as u64)
}

/// The best thumbnail yt-dlp lists comes last.
fn thumbnail(value: &Value) -> Option<String> {
    text(value, "thumbnail").or_else(|| {
        value["thumbnails"]
            .as_array()?
            .iter()
            .rev()
            .find_map(|t| text(t, "url").filter(|u| is_allowed_url(u)))
    })
}

fn small_thumbnail(value: &Value) -> Option<String> {
    value["thumbnails"]
        .as_array()?
        .iter()
        .find_map(|t| text(t, "url").filter(|u| is_allowed_url(u)))
        .or_else(|| text(value, "thumbnail").filter(|u| is_allowed_url(u)))
}

fn parse_playlist(url: &str, info: &Value) -> PlaylistInfo {
    let raw = info["entries"].as_array().map_or(&[][..], Vec::as_slice);
    let entries: Vec<PlaylistEntry> = raw
        .iter()
        .filter_map(|entry| {
            // Flat entries carry the video's own page in `url`; some sites only in `webpage_url`.
            let link = [text(entry, "url"), text(entry, "webpage_url")]
                .into_iter()
                .flatten()
                .find(|u| is_allowed_url(u))?;
            let title = text(entry, "title").unwrap_or_else(|| link.clone());
            if UNAVAILABLE.contains(&title.as_str()) {
                return None;
            }
            Some(PlaylistEntry {
                url: link,
                title: title.chars().take(200).collect(),
                duration_sec: seconds(entry),
                // The smallest one: the popup shows it at 64 pixels wide.
                thumbnail: small_thumbnail(entry),
            })
        })
        .take(MAX_ENTRIES)
        .collect();
    PlaylistInfo {
        url: url.to_string(),
        title: text(info, "title").unwrap_or_else(|| "Playlist".to_string()),
        uploader: text(info, "uploader").or_else(|| text(info, "channel")),
        thumbnail: thumbnail(info).or_else(|| raw.first().and_then(thumbnail)),
        total: info["playlist_count"].as_u64().filter(|n| *n > 0),
        entries,
    }
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
    MediaInfo {
        url: url.to_string(),
        title: text(info, "title").unwrap_or_else(|| "Video".to_string()),
        uploader: text(info, "uploader").or_else(|| text(info, "channel")),
        thumbnail: text(info, "thumbnail"),
        duration_sec: seconds(info),
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

    #[test]
    fn lists_a_flat_playlist_and_skips_videos_that_cannot_be_saved() {
        let info = json!({
            "_type": "playlist", "title": "Mix", "channel": "Someone", "playlist_count": 40,
            "thumbnails": [{ "url": "https://a/small.jpg" }, { "url": "https://a/big.jpg" }],
            "entries": [
                { "url": "https://www.youtube.com/watch?v=a", "title": "First", "duration": 61.0,
                  "thumbnails": [{ "url": "https://i/a-small.jpg" }, { "url": "https://i/a-big.jpg" }] },
                { "url": "https://www.youtube.com/watch?v=b", "title": "[Private video]" },
                { "url": "b2", "webpage_url": "https://site.example/v/2" },
                { "url": "not-a-link" },
            ],
        });
        let playlist = parse_playlist("https://a/list", &info);
        assert_eq!(playlist.title, "Mix");
        assert_eq!(playlist.uploader.as_deref(), Some("Someone"));
        assert_eq!(playlist.thumbnail.as_deref(), Some("https://a/big.jpg"));
        assert_eq!(playlist.total, Some(40));
        assert_eq!(
            playlist.entries[0].thumbnail.as_deref(),
            Some("https://i/a-small.jpg")
        );
        assert_eq!(playlist.entries[1].thumbnail, None);
        let rows: Vec<_> = playlist
            .entries
            .iter()
            .map(|e| (e.url.as_str(), e.title.as_str(), e.duration_sec))
            .collect();
        assert_eq!(
            rows,
            [
                ("https://www.youtube.com/watch?v=a", "First", Some(61)),
                ("https://site.example/v/2", "https://site.example/v/2", None),
            ]
        );
    }
}
