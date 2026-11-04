//! One-click updates. The helper runs the same installer people paste into a terminal, which downloads
//! the newest release, checks it against the published checksums and replaces the helper, its tools and
//! the extension folder for Chrome, Edge and Brave. The installer runs apart from the helper, so it can
//! replace the helper's files, and the browser starts the new helper on its next message.

use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::UNIX_EPOCH;

const RELEASES: &str =
    "https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download";

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateKind {
    /// The helper, its tools and the extension folder, from the newest ClipSave release.
    All,
    /// Only yt-dlp, from yt-dlp's newest release: sites change, and yt-dlp keeps up, between ClipSave releases.
    Ytdlp,
}

fn work_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("ClipSave")
}

/// The installer writes "ok <what>" or "failed <why>" here when it ends.
fn result_file() -> PathBuf {
    work_dir().join("update-result.txt")
}

pub fn log_file() -> PathBuf {
    work_dir().join("update.log")
}

/// How the last update ended, for Settings: `{ ok, message, at }`, `at` in seconds since 1970.
pub fn last_result() -> Option<Value> {
    let file = result_file();
    let text = fs::read_to_string(&file).ok()?;
    let line = text.trim();
    let (status, message) = line.split_once(' ').unwrap_or((line, ""));
    let at = fs::metadata(&file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    Some(json!({ "ok": status == "ok", "message": message, "at": at }))
}

/// The extension folder the installer keeps next to the helper, when there is one.
pub fn extension_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.parent()?.join("extension");
    dir.join("managed.json")
        .is_file()
        .then(|| crate::platform::plain(&dir))
}

fn release_base() -> String {
    std::env::var("CLIPSAVE_RELEASE_URL").unwrap_or_else(|_| RELEASES.to_string())
}

/// Starts the installer and returns once it's running. With `on_finished`, waits for it in the background
/// and calls it when it ends (where the system lets the helper wait for it).
pub fn start(kind: UpdateKind, on_finished: impl FnOnce() + Send + 'static) -> Result<(), String> {
    fs::create_dir_all(work_dir()).map_err(|e| format!("Could not prepare the update: {e}"))?;
    let _ = fs::remove_file(result_file());
    let log =
        fs::File::create(log_file()).map_err(|e| format!("Could not prepare the update: {e}"))?;
    let errors = log.try_clone().map_err(|e| e.to_string())?;

    let mut command = installer(kind);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(errors));
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start the update: {e}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
        on_finished();
    });
    Ok(())
}

#[cfg(unix)]
fn installer(kind: UpdateKind) -> Command {
    let result = result_file();
    let mut args: Vec<String> = vec![
        "--from-helper".into(),
        "--result".into(),
        result.display().to_string(),
    ];
    if kind == UpdateKind::Ytdlp {
        args.push("--ytdlp-only".into());
    }
    // Tests and development run a local installer instead of the published one.
    let mut command = match std::env::var_os("CLIPSAVE_INSTALLER") {
        Some(script) => {
            let mut sh = Command::new("/bin/sh");
            sh.arg(script);
            sh
        }
        None => {
            // The link and the options are arguments, never part of the script text.
            let mut sh = Command::new("/bin/sh");
            sh.args(["-c", r#"curl -fsSL "$0" | sh -s -- "$@""#])
                .arg(format!("{}/install.sh", release_base()));
            sh
        }
    };
    command.args(args);
    // A session of its own: the browser stopping the helper doesn't stop the update.
    use std::os::unix::process::CommandExt;
    unsafe {
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    command
}

/// Windows stops a browser's helper together with everything it started, so the installer is started
/// by Windows itself (WMI) instead, and outlives the helper it's about to replace.
#[cfg(windows)]
fn installer(kind: UpdateKind) -> Command {
    let quote = |text: &str| format!("'{}'", text.replace('\'', "''"));
    let mut script = String::new();
    if let Ok(url) = std::env::var("CLIPSAVE_RELEASE_URL") {
        script.push_str(&format!("$env:CLIPSAVE_RELEASE_URL = {}; ", quote(&url)));
    }
    script.push_str(&format!(
        "& ([scriptblock]::Create((Invoke-RestMethod {}))) -FromHelper -Result {}{} *> {}",
        quote(&format!("{}/install.ps1", release_base())),
        quote(&result_file().display().to_string()),
        if kind == UpdateKind::Ytdlp {
            " -YtDlpOnly"
        } else {
            ""
        },
        quote(&log_file().display().to_string()),
    ));
    // Base64 of UTF-16, so nothing in the script needs quoting on the command line.
    let encoded: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let inner = format!(
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand {}",
        base64(&encoded)
    );
    let mut command = Command::new("powershell");
    command
        .args([
            "-NoProfile",
            "-Command",
            "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:CLIPSAVE_UPDATE_COMMAND } | Out-Null",
        ])
        .env("CLIPSAVE_UPDATE_COMMAND", inner);
    crate::platform::hide_window(&mut command);
    command
}

/// Standard base64, for PowerShell's -EncodedCommand.
#[cfg_attr(not(windows), allow(dead_code))]
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_base64_like_powershell_expects() {
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
        assert_eq!(base64(b""), "");
        // "a" in UTF-16, the way -EncodedCommand reads it.
        assert_eq!(base64(&[0x61, 0x00]), "YQA=");
    }
}
