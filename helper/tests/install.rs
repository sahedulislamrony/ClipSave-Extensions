//! Runs `clipsave-helper --install` against a throwaway home folder, the way the installer scripts do.
#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

fn home() -> PathBuf {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let home = std::env::temp_dir().join(format!(
        "clipsave-install-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&home);
    std::fs::create_dir_all(&home).unwrap();
    home
}

fn config(home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support")
    } else {
        home.join(".config")
    }
}

fn chrome(home: &Path) -> PathBuf {
    config(home).join(if cfg!(target_os = "macos") {
        "Google/Chrome"
    } else {
        "google-chrome"
    })
}

fn install(home: &Path) -> Output {
    install_with(home, &[])
}

fn install_with(home: &Path, options: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_clipsave-helper"))
        .arg("--install")
        .args(options)
        .env("HOME", home)
        .env_remove("XDG_CONFIG_HOME")
        .output()
        .unwrap()
}

#[test]
fn registers_only_with_browsers_that_are_set_up() {
    let home = home();
    std::fs::create_dir_all(chrome(&home)).unwrap();

    let output = install(&home);
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(output.status.success(), "{stdout}");
    assert_eq!(stdout.trim(), "Chrome: registered");
    assert!(chrome(&home)
        .join("NativeMessagingHosts/link.clipsave.helper.json")
        .is_file());
    // No folders for browsers that aren't there.
    assert!(!config(&home).join("Chromium").exists());
    assert!(!config(&home).join("BraveSoftware").exists());
    std::fs::remove_dir_all(home).unwrap();
}

#[test]
fn keeps_going_when_one_browser_refuses() {
    let home = home();
    let brave = config(&home).join("BraveSoftware/Brave-Browser");
    std::fs::create_dir_all(chrome(&home)).unwrap();
    std::fs::create_dir_all(&brave).unwrap();
    // A file where Chrome's manifest folder should be makes Chrome's registration fail.
    std::fs::write(chrome(&home).join("NativeMessagingHosts"), "").unwrap();

    let output = install(&home);
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(output.status.success(), "{stdout}");
    assert!(stdout.contains("Chrome: couldn't register"), "{stdout}");
    assert!(stdout.contains("Brave: registered"), "{stdout}");
    std::fs::remove_dir_all(home).unwrap();
}

#[test]
fn fails_when_no_browser_is_set_up() {
    let home = home();

    let output = install(&home);

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("Couldn't register with any browser"));
    std::fs::remove_dir_all(home).unwrap();
}

fn firefox_manifest(home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        config(home).join("Mozilla/NativeMessagingHosts/link.clipsave.helper.json")
    } else {
        home.join(".mozilla/native-messaging-hosts/link.clipsave.helper.json")
    }
}

#[test]
fn registers_with_the_chosen_browsers_only() {
    let home = home();
    std::fs::create_dir_all(chrome(&home)).unwrap();
    assert!(install(&home).status.success());

    // Firefox has never run here, and Chrome is left out: Firefox is registered, Chrome removed.
    let output = install_with(&home, &["--browsers", "firefox"]);
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(output.status.success(), "{stdout}");
    assert!(stdout.contains("Firefox: registered"), "{stdout}");
    assert!(stdout.contains("Chrome: removed"), "{stdout}");
    assert!(firefox_manifest(&home).is_file());
    assert!(!chrome(&home)
        .join("NativeMessagingHosts/link.clipsave.helper.json")
        .exists());
    std::fs::remove_dir_all(home).unwrap();
}

#[test]
fn all_registers_with_every_browser() {
    let home = home();

    let output = install_with(&home, &["--all"]);
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(output.status.success(), "{stdout}");
    for browser in ["Chrome", "Edge", "Brave", "Firefox"] {
        assert!(
            stdout.contains(&format!("{browser}: registered")),
            "{stdout}"
        );
    }
    std::fs::remove_dir_all(home).unwrap();
}

#[test]
fn refuses_an_unknown_browser() {
    let home = home();

    let output = install_with(&home, &["--browsers=chrome,netscape"]);

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("netscape"));
    assert!(!chrome(&home).exists());
    std::fs::remove_dir_all(home).unwrap();
}
