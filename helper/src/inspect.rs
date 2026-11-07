//! Reads a link into the quality picker, or a playlist into its list of videos. Mirrors
//! `Extractor.fetch` in the Android app.

use crate::engine::{friendly_error, is_allowed_url, is_youtube, Engine};
use crate::naming::{clean_title, video_title};
use crate::protocol::{AudioFormat, FormatOption, MediaInfo, PlaylistEntry, PlaylistInfo, Quality};
use serde_json::Value;
use std::collections::BTreeMap;

/// A playlist is read this many videos at a time, like the Android app: long playlists and endless
/// Mixes would otherwise take minutes before anything shows. yt-dlp stops paging the site once it has
/// the videos asked for, so a page costs about the same in a playlist of 100 or of 3,000.
pub const PAGE_SIZE: u64 = 100;

/// Titles YouTube gives the videos in a playlist that can't be saved.
const UNAVAILABLE: [&str; 3] = ["[Private video]", "[Deleted video]", "[Unavailable video]"];

pub enum Inspected {
    Media(MediaInfo),
    Playlist(PlaylistInfo),
}

/// With `playlist`, a video link that is part of a playlist (YouTube's `watch?v=…&list=…`) reads
/// as that playlist. Without it, such a link reads as the one video, and only a link to a
/// playlist itself reads as a playlist. A playlist's videos are read from `start` (1-based), one page.
pub fn inspect(
    engine: &Engine,
    url: &str,
    playlist: bool,
    start: u64,
) -> Result<Inspected, String> {
    let start = start.max(1);
    let info = if is_youtube(url) && !playlist {
        // Solving YouTube's player challenge is most of a fetch, but the picker only needs heights
        // and sizes, which come without it. The HLS manifest is one more request and a big parse for
        // heights the DASH formats already list. Falls back to a full run if that loses the formats.
        run(
            engine,
            url,
            false,
            start,
            Some("youtube:player_skip=js;skip=hls"),
        )
        .ok()
        .filter(|info| is_playlist(info) || has_video(info))
        .map_or_else(|| run(engine, url, false, start, None), Ok)?
    } else {
        run(engine, url, playlist, start, None)?
    };
    Ok(if is_playlist(&info) {
        Inspected::Playlist(parse_playlist(url, &info, start))
    } else {
        Inspected::Media(parse(url, &info))
    })
}

fn run(
    engine: &Engine,
    url: &str,
    playlist: bool,
    start: u64,
    extractor_args: Option<&str>,
) -> Result<Value, String> {
    let mut command = engine
        .command()
        .ok_or("yt-dlp is missing from the ClipSave Helper.")?;
    // A flat playlist lists its videos without opening each one, so a long playlist reads in
    // seconds. It changes nothing for a single video.
    command.args(["-J", "--flat-playlist"]);
    let end = start + PAGE_SIZE - 1;
    command.args(["--playlist-items", &format!("{start}:{end}")]);
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

/// One page of a playlist, read from the 1-based position `start`.
fn parse_playlist(url: &str, info: &Value, start: u64) -> PlaylistInfo {
    let raw = info["entries"].as_array().map_or(&[][..], Vec::as_slice);
    let entries: Vec<PlaylistEntry> = raw
        .iter()
        .zip(start - 1..)
        .filter_map(|(entry, index)| {
            // Flat entries carry the video's own page in `url`; some sites only in `webpage_url`.
            let link = [text(entry, "url"), text(entry, "webpage_url")]
                .into_iter()
                .flatten()
                .find(|u| is_allowed_url(u))?;
            let title = text(entry, "title");
            if title.as_deref().is_some_and(|t| UNAVAILABLE.contains(&t)) {
                return None;
            }
            // Without a usable title the link stands in, and the file is named by yt-dlp.
            let title = title
                .and_then(|t| clean_title(&t, text(entry, "uploader").as_deref()))
                .unwrap_or_else(|| link.clone());
            Some(PlaylistEntry {
                url: link,
                title,
                duration_sec: seconds(entry),
                // The smallest one: the popup shows it at 64 pixels wide.
                thumbnail: small_thumbnail(entry),
                index,
            })
        })
        .collect();
    let total = info["playlist_count"].as_u64().filter(|n| *n > 0);
    // A short page is the last one; so is reaching the length the site reports.
    let next = start + PAGE_SIZE;
    let next_start =
        (raw.len() as u64 >= PAGE_SIZE && total.is_none_or(|t| next <= t)).then_some(next);
    PlaylistInfo {
        url: url.to_string(),
        title: text(info, "title").unwrap_or_else(|| "Playlist".to_string()),
        uploader: text(info, "uploader").or_else(|| text(info, "channel")),
        // The first video's picture, as the app shows: a playlist's own cover is often a blank or a
        // channel banner. It's the first video of the playlist, not of this page.
        thumbnail: (start == 1)
            .then(|| raw.first().and_then(thumbnail))
            .flatten()
            .or_else(|| thumbnail(info)),
        total,
        entries,
        next_start,
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
    let uploader = text(info, "uploader").or_else(|| text(info, "channel"));
    MediaInfo {
        url: url.to_string(),
        // Also the file name the popup suggests, so no view counts or "Video by someone".
        title: video_title(
            text(info, "title").as_deref(),
            text(info, "description").as_deref(),
            uploader.as_deref(),
            text(info, "webpage_url").as_deref().unwrap_or(url),
        ),
        uploader,
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
        assert_eq!(media.title, "A video");
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
        let playlist = parse_playlist("https://a/list", &info, 1);
        assert_eq!(playlist.title, "Mix");
        assert_eq!(playlist.uploader.as_deref(), Some("Someone"));
        // The first video's own picture, its biggest.
        assert_eq!(playlist.thumbnail.as_deref(), Some("https://i/a-big.jpg"));
        // A short page is the last one.
        assert_eq!(playlist.next_start, None);
        assert_eq!(playlist.total, Some(40));
        assert_eq!(
            playlist.entries[0].thumbnail.as_deref(),
            Some("https://i/a-small.jpg")
        );
        assert_eq!(playlist.entries[1].thumbnail, None);
        let rows: Vec<_> = playlist
            .entries
            .iter()
            .map(|e| (e.url.as_str(), e.title.as_str(), e.duration_sec, e.index))
            .collect();
        assert_eq!(
            rows,
            [
                ("https://www.youtube.com/watch?v=a", "First", Some(61), 0),
                (
                    "https://site.example/v/2",
                    "https://site.example/v/2",
                    None,
                    2
                ),
            ]
        );
    }

    fn page(count: usize) -> Value {
        let entries: Vec<Value> = (0..count)
            .map(|i| json!({ "url": format!("https://www.youtube.com/watch?v={i}"), "title": format!("V{i}") }))
            .collect();
        json!({ "_type": "playlist", "title": "Long", "entries": entries })
    }

    #[test]
    fn pages_through_a_long_playlist() {
        // A full page of an endless Mix: there's more, and positions carry on from `start`.
        let second = parse_playlist("https://a/list", &page(100), 101);
        assert_eq!(second.next_start, Some(201));
        assert_eq!(second.entries[0].index, 100);
        assert_eq!(second.entries[99].index, 199);

        // A full page that reaches the reported length is the last.
        let mut info = page(100);
        info["playlist_count"] = json!(200);
        assert_eq!(
            parse_playlist("https://a/list", &info, 101).next_start,
            None
        );
        info["playlist_count"] = json!(250);
        assert_eq!(
            parse_playlist("https://a/list", &info, 101).next_start,
            Some(201)
        );
    }

    #[test]
    fn titles_a_facebook_video_by_its_caption() {
        let media = parse(
            "https://www.facebook.com/reel/1",
            &json!({
                "title": "2.3K views · 120 reactions | Rainy evening in Dhaka | City Diaries",
                "uploader": "City Diaries",
                "formats": [],
            }),
        );
        assert_eq!(media.title, "Rainy evening in Dhaka");
    }
}
