//! Finds yt-dlp and its tools, and builds the arguments every run shares.

use crate::platform::{exe, hide_window, SYSTEM_DIRS};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct Engine {
    pub yt_dlp: Option<PathBuf>,
    ffmpeg: Option<PathBuf>,
    /// The JavaScript runtime yt-dlp needs for YouTube, as yt-dlp names it, and where it is.
    js_runtime: Option<(&'static str, PathBuf)>,
}

impl Engine {
    pub fn locate() -> Self {
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf));
        let mut dirs: Vec<PathBuf> = Vec::new();
        // Lets tests and development point the helper at another set of tools.
        if let Some(dir) = env::var_os("CLIPSAVE_ENGINE_DIR") {
            dirs.push(PathBuf::from(dir));
        }
        if let Some(dir) = exe_dir {
            dirs.push(dir.join("vendor"));
            // During development the helper sits in target/<profile>, next to ../../vendor.
            dirs.push(dir.join("../../vendor"));
            dirs.push(dir);
        }
        dirs.extend(env::var_os("PATH").iter().flat_map(env::split_paths));
        dirs.extend(SYSTEM_DIRS.iter().map(PathBuf::from));

        // Folders are tried in order, and within a folder the names in order.
        let find = |names: &[String]| {
            dirs.iter().find_map(|dir| {
                names
                    .iter()
                    .map(|name| dir.join(name))
                    .find(|path| path.is_file())
            })
        };
        // The bundled QuickJS comes first; a Deno the user installed works too.
        let js_runtime = find(&[exe("qjs")])
            .map(|path| ("quickjs", path))
            .or_else(|| find(&[exe("deno")]).map(|path| ("deno", path)));
        Engine {
            // The unpacked macOS release first: see fetch-engine.sh for why it has to be that one.
            yt_dlp: find(&["yt-dlp_macos/yt-dlp_macos".to_string(), exe("yt-dlp")]),
            ffmpeg: find(&[exe("ffmpeg")]),
            js_runtime,
        }
    }

    pub fn has_ffmpeg(&self) -> bool {
        self.ffmpeg.is_some()
    }

    /// One line per tool, for `--version` and bug reports.
    pub fn describe(&self) -> String {
        let show = |path: Option<&PathBuf>| {
            path.map_or("not found".to_string(), |p| p.display().to_string())
        };
        let js = self
            .js_runtime
            .as_ref()
            .map(|(name, path)| format!("{name} at {}", path.display()));
        format!(
            "  yt-dlp: {} ({})\n  ffmpeg: {}\n  JavaScript: {}",
            show(self.yt_dlp.as_ref()),
            self.yt_dlp_version()
                .unwrap_or_else(|| "no version".to_string()),
            show(self.ffmpeg.as_ref()),
            js.unwrap_or_else(|| "not found (YouTube won't work)".to_string()),
        )
    }

    pub fn yt_dlp_version(&self) -> Option<String> {
        let output = hide_window(&mut Command::new(self.yt_dlp.as_ref()?))
            .arg("--version")
            .output()
            .ok()?;
        output
            .status
            .success()
            .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Starts a yt-dlp command with the options every run needs.
    pub fn command(&self) -> Option<Command> {
        let mut command = Command::new(self.yt_dlp.as_ref()?);
        hide_window(&mut command);
        // A config file on this computer shouldn't change what the extension asked for.
        command.args([
            "--ignore-config",
            "--no-playlist",
            "--no-warnings",
            "--socket-timeout",
            "20",
        ]);
        if let Some(ffmpeg) = &self.ffmpeg {
            command.arg("--ffmpeg-location").arg(ffmpeg);
        }
        if let Some((name, path)) = &self.js_runtime {
            command
                .arg("--js-runtimes")
                .arg(format!("{name}:{}", path.display()));
        }
        Some(command)
    }
}

/// Links reach yt-dlp as plain arguments, so anything but a clean web address is refused here.
pub fn is_allowed_url(url: &str) -> bool {
    let lower = url.get(..8).unwrap_or(url).to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://"))
        && url.len() <= 4096
        && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

pub fn is_youtube(url: &str) -> bool {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    ["youtube.com", "youtu.be", "youtube-nocookie.com"]
        .iter()
        .any(|known| host == *known || host.ends_with(&format!(".{known}")))
}

/// yt-dlp's last error line, in words a person can act on. Mirrors the Android app's messages.
pub fn friendly_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    let has = |needle: &str| lower.contains(needle);
    if has("unsupported url") {
        "No video found on this page.".into()
    } else if has("unable to obtain file audio codec") {
        "This video has no sound to save.".into()
    } else if has("login")
        || has("cookies")
        || has("rate-limit")
        || (has("not available") && has("private"))
    {
        "This post needs a signed-in account, which this version can't use yet.".into()
    } else if has("http error 404") || has("http error 410") {
        "This video was removed or the link is wrong.".into()
    } else if has("http error 403") || has("http error 401") {
        "Access denied. The video may be private or region-locked.".into()
    } else if has("name or service not known")
        || has("nodename nor servname")
        || has("network is unreachable")
        || has("timed out")
        || has("temporary failure in name resolution")
        || has("connection refused")
    {
        "No connection. Check your internet and try again.".into()
    } else {
        stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .map(|line| {
                line.trim_start_matches("ERROR: ")
                    .chars()
                    .take(200)
                    .collect()
            })
            .unwrap_or_else(|| "Could not read this link.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_clean_web_links_reach_yt_dlp() {
        assert!(is_allowed_url("https://vimeo.com/1"));
        assert!(is_allowed_url("HTTP://vimeo.com/1"));
        assert!(!is_allowed_url("--exec=rm"));
        assert!(!is_allowed_url("file:///etc/passwd"));
        assert!(!is_allowed_url("https://a.com/ --exec"));
        assert!(!is_allowed_url("https://a.com/\nx"));
        assert!(!is_allowed_url("http"));
        assert!(!is_allowed_url(&format!(
            "https://a.com/{}",
            "x".repeat(5000)
        )));
    }

    #[test]
    fn does_not_split_a_multibyte_character() {
        assert!(!is_allowed_url("ééééééé"));
    }

    #[test]
    fn detects_youtube_hosts_only() {
        assert!(is_youtube("https://www.youtube.com/watch?v=a"));
        assert!(is_youtube("https://youtu.be/a"));
        assert!(!is_youtube("https://vimeo.com/?u=youtube.com"));
        assert!(!is_youtube("https://notyoutube.com/"));
        assert!(!is_youtube("https://youtube.com@evil.example/"));
    }

    #[test]
    fn turns_yt_dlp_errors_into_plain_words() {
        assert_eq!(
            friendly_error("ERROR: Unsupported URL: https://a.com"),
            "No video found on this page."
        );
        assert!(friendly_error("ERROR: HTTP Error 403: Forbidden").starts_with("Access denied"));
        assert_eq!(
            friendly_error(
                "ERROR: Postprocessing: WARNING: unable to obtain file audio codec with ffprobe"
            ),
            "This video has no sound to save."
        );
        assert_eq!(
            friendly_error("note\nERROR: Something odd\n"),
            "Something odd"
        );
        assert_eq!(friendly_error(""), "Could not read this link.");
    }
}
