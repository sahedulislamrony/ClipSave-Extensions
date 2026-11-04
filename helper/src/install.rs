//! Tells each browser where the helper is. A browser will only start a host it finds a manifest for: on
//! macOS and Linux a JSON file in a known folder, on Windows a registry key that points at the JSON file.

use crate::platform::plain;
use serde_json::{json, Value};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const HOST_NAME: &str = "link.clipsave.helper";
const DESCRIPTION: &str = "ClipSave Helper";
/// The Firefox add-on's ID, the one on Firefox Add-ons. Builds before 1.2.0 used the second, which is
/// taken on Firefox Add-ons; it stays allowed so those installs keep working until they update.
const FIREFOX_IDS: &[&str] = &[
    "clipsave@sahedulislamrony.github.io",
    "clipsave@clipsave.link",
];

/// Unpacked builds. Add the Chrome Web Store ID here once the listing has one.
const CHROME_IDS: [&str; 1] = ["engejhilbedikenhabjndbpgpdhaedge"];

#[derive(Clone, Copy, PartialEq, Debug)]
enum Family {
    Chromium,
    Firefox,
}

#[cfg(windows)]
impl Family {
    fn key(self) -> &'static str {
        match self {
            Family::Chromium => "chromium",
            Family::Firefox => "firefox",
        }
    }
}

/// Where each browser looks: a folder relative to the config folder (macOS, Linux), or a registry key
/// under HKEY_CURRENT_USER (Windows).
#[cfg(target_os = "macos")]
const BROWSERS: &[(&str, Family, &str)] = &[
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
const BROWSERS: &[(&str, Family, &str)] = &[
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
    // Firefox keeps its folder in the home folder rather than the config folder: see `manifest_file`.
    ("Firefox", Family::Firefox, ""),
];

#[cfg(windows)]
const BROWSERS: &[(&str, Family, &str)] = &[
    (
        "Chrome",
        Family::Chromium,
        r"Software\Google\Chrome\NativeMessagingHosts",
    ),
    (
        "Chromium",
        Family::Chromium,
        r"Software\Chromium\NativeMessagingHosts",
    ),
    (
        "Edge",
        Family::Chromium,
        r"Software\Microsoft\Edge\NativeMessagingHosts",
    ),
    (
        "Brave",
        Family::Chromium,
        r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts",
    ),
    (
        "Firefox",
        Family::Firefox,
        r"Software\Mozilla\NativeMessagingHosts",
    ),
];

fn manifest(family: Family, path: &str) -> Value {
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
        Family::Firefox => manifest["allowed_extensions"] = json!(FIREFOX_IDS),
    }
    manifest
}

fn helper_path() -> io::Result<PathBuf> {
    Ok(plain(&std::env::current_exe()?.canonicalize()?))
}

/// Registers with every browser that's set up on this computer. One browser refusing (macOS can block a
/// folder) doesn't stop the others; it only fails when no browser could be registered at all.
pub fn install() -> io::Result<()> {
    let exe = helper_path()?;
    let mut registered = 0;
    for &(name, family, place) in targets() {
        if !installed(family, place)? {
            continue;
        }
        match register(family, place, &exe) {
            Ok(()) => {
                registered += 1;
                println!("{name}: registered");
            }
            Err(e) => println!("{name}: couldn't register ({e})"),
        }
    }
    if registered == 0 {
        return Err(io::Error::other(
            "Couldn't register with any browser. Open your browser once, then run the installer again.",
        ));
    }
    Ok(())
}

pub fn uninstall() -> io::Result<()> {
    for &(name, family, place) in targets() {
        if unregister(family, place)? {
            println!("{name}: removed");
        }
    }
    Ok(())
}

fn targets() -> &'static [(&'static str, Family, &'static str)] {
    BROWSERS
}

#[cfg(unix)]
fn manifest_file(family: Family, place: &str) -> io::Result<PathBuf> {
    let file = format!("{HOST_NAME}.json");
    if cfg!(target_os = "linux") && family == Family::Firefox {
        let home = dirs::home_dir().ok_or_else(|| io::Error::other("No home folder"))?;
        return Ok(home.join(".mozilla/native-messaging-hosts").join(file));
    }
    let config =
        dirs::config_dir().ok_or_else(|| io::Error::other("No config folder on this system"))?;
    Ok(config.join(place).join(file))
}

/// Whether the browser has its own folder yet, which it makes the first time it runs. Without this the
/// helper would make folders for browsers that aren't there.
#[cfg(unix)]
fn installed(family: Family, place: &str) -> io::Result<bool> {
    let config =
        dirs::config_dir().ok_or_else(|| io::Error::other("No config folder on this system"))?;
    let home = dirs::home_dir().ok_or_else(|| io::Error::other("No home folder"))?;
    let folders = match family {
        Family::Chromium => vec![Path::new(place)
            .parent()
            .map(|browser| config.join(browser))
            .unwrap_or_else(|| config.clone())],
        // Firefox keeps its profiles apart from where it looks for manifests.
        Family::Firefox if cfg!(target_os = "macos") => vec![config.join("Firefox")],
        Family::Firefox => vec![home.join(".mozilla"), config.join("mozilla")],
    };
    Ok(folders.iter().any(|folder| folder.is_dir()))
}

/// Registry keys are cheap to write and harmless when the browser is missing, so Windows registers with all.
#[cfg(windows)]
fn installed(_family: Family, _place: &str) -> io::Result<bool> {
    Ok(true)
}

#[cfg(unix)]
fn register(family: Family, place: &str, exe: &Path) -> io::Result<()> {
    let path = manifest_file(family, place)?;
    fs::create_dir_all(path.parent().expect("manifest paths have a parent"))?;
    fs::write(
        &path,
        serde_json::to_vec_pretty(&manifest(family, &exe.to_string_lossy()))?,
    )
}

#[cfg(unix)]
fn unregister(family: Family, place: &str) -> io::Result<bool> {
    let path = manifest_file(family, place)?;
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_file(path)?;
    Ok(true)
}

/// On Windows the manifests sit next to the helper, one per kind of browser.
#[cfg(windows)]
fn manifest_file(family: Family) -> io::Result<PathBuf> {
    let exe = helper_path()?;
    let dir = exe.parent().expect("the helper is in a folder");
    Ok(dir.join(format!("{HOST_NAME}.{}.json", family.key())))
}

#[cfg(windows)]
fn reg(args: &[&str]) -> io::Result<bool> {
    let status = crate::platform::hide_window(&mut std::process::Command::new("reg"))
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()?;
    Ok(status.success())
}

#[cfg(windows)]
fn register(family: Family, place: &str, exe: &Path) -> io::Result<()> {
    let path = manifest_file(family)?;
    fs::write(
        &path,
        serde_json::to_vec_pretty(&manifest(family, &exe.to_string_lossy()))?,
    )?;
    let key = format!(r"HKCU\{place}\{HOST_NAME}");
    let value = path.to_string_lossy();
    if !reg(&["add", &key, "/ve", "/t", "REG_SZ", "/d", &value, "/f"])? {
        return Err(io::Error::other(format!(
            "Couldn't write the registry key {key}"
        )));
    }
    Ok(())
}

#[cfg(windows)]
fn unregister(family: Family, place: &str) -> io::Result<bool> {
    let removed = reg(&["delete", &format!(r"HKCU\{place}\{HOST_NAME}"), "/f"])?;
    let _ = fs::remove_file(manifest_file(family)?);
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chromium_manifest_allows_only_our_extension() {
        let value = manifest(Family::Chromium, "/a/helper");
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
        let value = manifest(Family::Firefox, "/a/helper");
        assert_eq!(
            value["allowed_extensions"][0],
            "clipsave@sahedulislamrony.github.io"
        );
        assert_eq!(value["allowed_extensions"][1], "clipsave@clipsave.link");
        assert!(value.get("allowed_origins").is_none());
    }

    #[test]
    fn registers_with_every_supported_browser() {
        let names: Vec<&str> = targets().iter().map(|(name, ..)| *name).collect();
        for browser in ["Chrome", "Edge", "Brave", "Firefox"] {
            assert!(names.contains(&browser), "{browser} missing from {names:?}");
        }
    }
}
