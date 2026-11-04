//! The folders a person picked in Settings. The helper keeps them, because it's the one that saves
//! files: downloads, "Show in folder" and its safety check all read the same answer.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FolderKind {
    Video,
    Audio,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    video_dir: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    audio_dir: Option<PathBuf>,
}

fn file() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("ClipSave/settings.json")
}

/// A missing or unreadable file means every folder is the default.
fn load() -> Stored {
    fs::read(file())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(std::env::temp_dir)
}

pub fn default_dir(kind: FolderKind) -> PathBuf {
    match kind {
        FolderKind::Video => dirs::video_dir().unwrap_or_else(|| home().join("Movies")),
        FolderKind::Audio => dirs::audio_dir().unwrap_or_else(|| home().join("Music")),
    }
    .join("ClipSave")
}

/// Where files of this kind go now: the person's choice, else the default.
pub fn dir(kind: FolderKind) -> PathBuf {
    let stored = load();
    match kind {
        FolderKind::Video => stored.video_dir,
        FolderKind::Audio => stored.audio_dir,
    }
    .unwrap_or_else(|| default_dir(kind))
}

/// Saves a folder for `kind`, or goes back to the default with `None`. The folder must be a full
/// path; it's created if needed and checked for writing, so a bad choice fails here and not at the
/// next download. Returns the folder now in use.
pub fn set_dir(kind: FolderKind, path: Option<&str>) -> Result<PathBuf, String> {
    let chosen = match path.map(str::trim).filter(|p| !p.is_empty()) {
        None => None,
        Some(text) => Some(usable(Path::new(text))?),
    };
    let mut stored = load();
    match kind {
        FolderKind::Video => stored.video_dir = chosen,
        FolderKind::Audio => stored.audio_dir = chosen,
    }
    save(&stored)?;
    Ok(dir(kind))
}

fn usable(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Use a full path, like the one Browse picks.".to_string());
    }
    fs::create_dir_all(path).map_err(|e| format!("Could not create {}: {e}", path.display()))?;
    let probe = path.join(".clipsave-write-test");
    fs::write(&probe, b"")
        .map_err(|_| format!("ClipSave can't save files in {}.", path.display()))?;
    let _ = fs::remove_file(probe);
    Ok(crate::platform::plain(
        &path.canonicalize().unwrap_or_else(|_| path.to_path_buf()),
    ))
}

fn save(stored: &Stored) -> Result<(), String> {
    let file = file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Could not save settings: {e}"))?;
    }
    // Written aside and moved into place, so a crash can't leave half a file.
    let partial = file.with_extension("json.part");
    let body = serde_json::to_vec_pretty(stored).map_err(|e| e.to_string())?;
    fs::write(&partial, body)
        .and_then(|()| fs::rename(&partial, &file))
        .map_err(|e| format!("Could not save settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_relative_folder() {
        assert!(usable(Path::new("Videos/ClipSave")).is_err());
    }
}
