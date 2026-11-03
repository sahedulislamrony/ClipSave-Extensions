//! Tells each browser where the helper is. A browser will only start a host it finds a manifest for.

use serde_json::{json, Value};
use std::fs;
use std::io;
use std::path::PathBuf;

pub const HOST_NAME: &str = "link.clipsave.helper";
const DESCRIPTION: &str = "ClipSave Helper";
const FIREFOX_ID: &str = "clipsave@clipsave.link";

/// Unpacked builds. Add the Chrome Web Store ID here once the listing has one.
const CHROME_IDS: [&str; 1] = ["engejhilbedikenhabjndbpgpdhaedge"];

enum Family {
    Chromium,
    Firefox,
}

/// Each browser's folder for per-user host manifests, relative to the config directory.
#[cfg(target_os = "macos")]
const BROWSERS: [(&str, Family, &str); 6] = [
    (
        "Chrome",
        Family::Chromium,
        "Google/Chrome/NativeMessagingHosts",
    ),
    (
        "Chrome Canary",
        Family::Chromium,
        "Google/Chrome Canary/NativeMessagingHosts",
    ),
    (
        "Chromium",
        Family::Chromium,
        "Chromium/NativeMessagingHosts",
    ),
    (
        "Edge",
        Family::Chromium,
        "Microsoft Edge/NativeMessagingHosts",
    ),
    (
        "Brave",
        Family::Chromium,
        "BraveSoftware/Brave-Browser/NativeMessagingHosts",
    ),
    ("Firefox", Family::Firefox, "Mozilla/NativeMessagingHosts"),
];

#[cfg(target_os = "linux")]
const BROWSERS: [(&str, Family, &str); 4] = [
    (
        "Chrome",
        Family::Chromium,
        "google-chrome/NativeMessagingHosts",
    ),
    (
        "Chromium",
        Family::Chromium,
        "chromium/NativeMessagingHosts",
    ),
    (
        "Edge",
        Family::Chromium,
        "microsoft-edge/NativeMessagingHosts",
    ),
    (
        "Brave",
        Family::Chromium,
        "BraveSoftware/Brave-Browser/NativeMessagingHosts",
    ),
];

fn manifest(family: &Family, path: &str) -> Value {
    let mut manifest =
        json!({ "name": HOST_NAME, "description": DESCRIPTION, "path": path, "type": "stdio" });
    match family {
        Family::Chromium => {
            let origins: Vec<String> = CHROME_IDS
                .iter()
                .map(|id| format!("chrome-extension://{id}/"))
                .collect();
            manifest["allowed_origins"] = json!(origins);
        }
        Family::Firefox => manifest["allowed_extensions"] = json!([FIREFOX_ID]),
    }
    manifest
}

fn manifest_paths() -> io::Result<Vec<(&'static str, &'static Family, PathBuf)>> {
    let config =
        dirs::config_dir().ok_or_else(|| io::Error::other("No config folder on this system"))?;
    let mut paths: Vec<_> = BROWSERS
        .iter()
        .map(|(name, family, dir)| {
            (
                *name,
                family,
                config.join(dir).join(format!("{HOST_NAME}.json")),
            )
        })
        .collect();
    // Firefox keeps Linux manifests in the home folder rather than the config folder.
    if cfg!(target_os = "linux") {
        if let Some(home) = dirs::home_dir() {
            let file = home
                .join(".mozilla/native-messaging-hosts")
                .join(format!("{HOST_NAME}.json"));
            paths.push(("Firefox", &Family::Firefox, file));
        }
    }
    Ok(paths)
}

pub fn install() -> io::Result<()> {
    let exe = std::env::current_exe()?.canonicalize()?;
    let exe = exe.to_string_lossy();
    for (name, family, path) in manifest_paths()? {
        fs::create_dir_all(path.parent().expect("manifest paths have a parent"))?;
        fs::write(&path, serde_json::to_vec_pretty(&manifest(family, &exe))?)?;
        println!("{name}: registered");
    }
    Ok(())
}

pub fn uninstall() -> io::Result<()> {
    for (name, _, path) in manifest_paths()? {
        if path.exists() {
            fs::remove_file(&path)?;
            println!("{name}: removed");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chromium_manifest_allows_only_our_extension() {
        let value = manifest(&Family::Chromium, "/a/helper");
        assert_eq!(value["name"], HOST_NAME);
        assert_eq!(value["type"], "stdio");
        assert_eq!(
            value["allowed_origins"][0],
            format!("chrome-extension://{}/", CHROME_IDS[0])
        );
        assert!(value.get("allowed_extensions").is_none());
    }

    #[test]
    fn firefox_manifest_uses_its_own_key() {
        let value = manifest(&Family::Firefox, "/a/helper");
        assert_eq!(value["allowed_extensions"][0], FIREFOX_ID);
        assert!(value.get("allowed_origins").is_none());
    }
}
