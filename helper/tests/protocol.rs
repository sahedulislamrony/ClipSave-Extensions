//! Runs the built helper the way a browser does, over stdin and stdout, with `tests/stub/yt-dlp`
//! standing in for yt-dlp and a throwaway home folder. The stub is a shell script, so these run on macOS
//! and Linux; on Windows the browser tests cover the same ground.
#![cfg(unix)]

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

struct Helper {
    child: Child,
    stdin: ChildStdin,
    messages: Receiver<Value>,
    home: PathBuf,
}

impl Helper {
    fn start() -> Helper {
        // Tests run in parallel, and macOS's clock only counts microseconds, so the time alone can repeat;
        // two tests sharing a home folder delete each other's files when they finish.
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home = std::env::temp_dir().join(format!(
            "clipsave-test-{}-{unique}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&home).unwrap();
        Helper::start_in(home)
    }

    /// Another helper on the same home folder, as when the browser starts a new one.
    fn start_in(home: PathBuf) -> Helper {
        let stub = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/stub");
        let mut child = Command::new(env!("CARGO_BIN_EXE_clipsave-helper"))
            .arg("chrome-extension://test/")
            .env("HOME", &home)
            .env("XDG_CACHE_HOME", home.join(".cache"))
            .env("CLIPSAVE_ENGINE_DIR", &stub)
            .env("CLIPSAVE_INSTALLER", stub.join("installer"))
            .env("PATH", "/usr/bin:/bin")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (sender, messages) = channel();
        thread::spawn(move || read_all(stdout, sender));
        Helper {
            child,
            stdin,
            messages,
            home,
        }
    }

    fn send(&mut self, message: Value) {
        let body = serde_json::to_vec(&message).unwrap();
        self.stdin
            .write_all(&(body.len() as u32).to_ne_bytes())
            .unwrap();
        self.stdin.write_all(&body).unwrap();
        self.stdin.flush().unwrap();
    }

    /// The next message for `id`, skipping others.
    fn next(&self, id: &str) -> Value {
        loop {
            let message = self
                .messages
                .recv_timeout(Duration::from_secs(20))
                .expect("helper went quiet");
            if message["id"] == id {
                return message;
            }
        }
    }

    /// Every message for `id` up to and including one of type `last`.
    fn until(&self, id: &str, last: &str) -> Vec<Value> {
        let mut seen = Vec::new();
        loop {
            let message = self.next(id);
            let done = message["type"] == last;
            seen.push(message);
            if done {
                return seen;
            }
        }
    }

    fn finish(mut self) -> i32 {
        drop(self.stdin);
        let code = self.child.wait().unwrap().code().unwrap_or(-1);
        let _ = std::fs::remove_dir_all(&self.home);
        code
    }
}

fn read_all(mut stdout: ChildStdout, sender: std::sync::mpsc::Sender<Value>) {
    loop {
        let mut length = [0u8; 4];
        if stdout.read_exact(&mut length).is_err() {
            return;
        }
        let mut body = vec![0u8; u32::from_ne_bytes(length) as usize];
        stdout.read_exact(&mut body).unwrap();
        if sender.send(serde_json::from_slice(&body).unwrap()).is_err() {
            return;
        }
    }
}

#[test]
fn says_hello_with_the_engine_version() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "h", "type": "hello" }));
    let reply = helper.next("h");
    assert_eq!(reply["type"], "hello");
    assert_eq!(reply["helper"]["ytDlp"], "2099.01.01");
    assert_eq!(reply["helper"]["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(helper.finish(), 0);
}

#[test]
fn reads_qualities_for_the_picker() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "i", "type": "inspect", "url": "https://example.com/video" }));
    let reply = helper.next("i");
    assert_eq!(reply["type"], "info");
    let media = &reply["media"];
    assert_eq!(media["title"], "Stub clip");
    assert_eq!(media["durationSec"], 61);
    let labels: Vec<&str> = media["options"]
        .as_array()
        .unwrap()
        .iter()
        .map(|o| o["label"].as_str().unwrap())
        .collect();
    assert_eq!(labels, ["720p", "360p", "MP3 audio", "M4A audio"]);
    assert_eq!(media["options"][0]["sizeBytes"], 3500);
    helper.finish();
}

#[test]
fn reads_a_playlist_link_as_a_list_of_videos() {
    let mut helper = Helper::start();
    helper.send(
        json!({ "id": "p", "type": "inspect", "url": "https://example.com/playlist?list=x" }),
    );
    let reply = helper.next("p");
    assert_eq!(reply["type"], "info");
    let playlist = &reply["playlist"];
    assert_eq!(playlist["title"], "Stub list");
    assert_eq!(playlist["total"], 3);
    let titles: Vec<&str> = playlist["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, ["One", "Three"]);
    assert_eq!(playlist["entries"][0]["durationSec"], 30);
    helper.finish();
}

#[test]
fn reads_the_playlist_a_video_belongs_to_only_when_asked() {
    let mut helper = Helper::start();
    let url = "https://example.com/video?list=x";
    helper.send(json!({ "id": "v", "type": "inspect", "url": url }));
    assert!(helper.next("v")["media"].is_object());
    helper.send(json!({ "id": "l", "type": "inspect", "url": url, "playlist": true }));
    assert_eq!(helper.next("l")["playlist"]["title"], "Stub list");
    helper.finish();
}

#[test]
fn saves_playlist_videos_into_their_own_folder() {
    let mut helper = Helper::start();
    helper.send(json!({
        "id": "job-list", "type": "download", "url": "https://example.com/video?n=1",
        "quality": { "kind": "best" }, "folder": "../Stub: list",
    }));
    let path = helper.until("job-list", "done").last().unwrap()["path"]
        .as_str()
        .unwrap()
        .to_string();
    helper.send(json!({ "id": "h", "type": "hello" }));
    let video_dir = helper.next("h")["helper"]["videoDir"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        Path::new(&path).parent().unwrap(),
        Path::new(&video_dir).join("_Stub_ list")
    );
    helper.finish();
}

#[test]
fn says_what_it_can_do_and_where_it_saves() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "h", "type": "hello" }));
    let info = &helper.next("h")["helper"];
    let features: Vec<&str> = info["features"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f.as_str().unwrap())
        .collect();
    assert!(features.contains(&"folders"), "{features:?}");
    assert_eq!(info["videoDir"], info["defaultVideoDir"]);
    assert!(info["path"].as_str().unwrap().contains("clipsave-helper"));
    helper.finish();
}

#[test]
fn saves_into_the_folder_chosen_in_settings_until_it_is_reset() {
    let mut helper = Helper::start();
    let chosen = helper.home.join("Chosen videos");

    helper
        .send(json!({ "id": "bad", "type": "setFolder", "kind": "video", "path": "relative/dir" }));
    assert_eq!(helper.next("bad")["type"], "error");

    helper.send(json!({ "id": "s", "type": "setFolder", "kind": "video", "path": chosen }));
    let reply = helper.next("s");
    assert_eq!(reply["type"], "folder");
    let saved_dir = PathBuf::from(reply["path"].as_str().unwrap());
    assert!(saved_dir.is_dir());

    helper.send(json!({ "id": "job-c", "type": "download", "url": "https://example.com/video", "quality": { "kind": "best" } }));
    let path = helper.until("job-c", "done").last().unwrap()["path"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(Path::new(&path).parent().unwrap(), saved_dir);

    // Files outside the ClipSave folders still cannot be shown.
    helper.send(json!({ "id": "r", "type": "reveal", "path": "/etc/hosts" }));
    assert_eq!(helper.next("r")["type"], "error");

    helper.send(json!({ "id": "reset", "type": "setFolder", "kind": "video", "path": null }));
    let reset = helper.next("reset")["path"].as_str().unwrap().to_string();
    helper.send(json!({ "id": "h", "type": "hello" }));
    let info = helper.next("h")["helper"].clone();
    assert_eq!(info["videoDir"], reset.as_str());
    assert_eq!(info["videoDir"], info["defaultVideoDir"]);
    helper.finish();
}

#[test]
fn names_files_as_asked_and_never_overwrites_one() {
    let mut helper = Helper::start();
    let save = |helper: &mut Helper, id: &str, naming: Value| {
        let mut request = json!({ "id": id, "type": "download", "url": "https://example.com/video", "quality": { "kind": "best" } });
        request
            .as_object_mut()
            .unwrap()
            .extend(naming.as_object().unwrap().clone());
        helper.send(request);
        let path = helper.until(id, "done").last().unwrap()["path"]
            .as_str()
            .unwrap()
            .to_string();
        Path::new(&path)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string()
    };
    assert_eq!(
        save(&mut helper, "job-n1", json!({ "name": "My 100% clip" })),
        "My 100% clip.mp4"
    );
    assert_eq!(
        save(&mut helper, "job-n2", json!({ "name": "My 100% clip" })),
        "My 100% clip (2).mp4"
    );
    assert_eq!(
        save(
            &mut helper,
            "job-n3",
            json!({ "name": "Track", "prefix": "07 - ", "folder": "Mix" })
        ),
        "07 - Track.mp4"
    );
    assert_eq!(
        save(&mut helper, "job-n4", json!({ "prefix": "08 - " })),
        "08 - Stub clip [stub].mp4"
    );
    assert_eq!(
        save(&mut helper, "job-n5", json!({})),
        "Stub clip [stub].mp4"
    );
    helper.finish();
}

#[test]
fn a_full_update_runs_the_installer_then_leaves_for_the_new_helper() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "u", "type": "update", "what": "all" }));
    assert_eq!(helper.next("u")["type"], "updating");
    // The helper exits once the installer is done, so the browser starts the new one.
    let started = std::time::Instant::now();
    while helper.child.try_wait().unwrap().is_none() {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "the helper didn't leave"
        );
        thread::sleep(Duration::from_millis(100));
    }

    // The next helper says how the update ended.
    let home = helper.home.clone();
    let mut next = Helper::start_in(home);
    next.send(json!({ "id": "h", "type": "hello" }));
    let info = next.next("h")["helper"].clone();
    assert_eq!(info["lastUpdate"]["ok"], true);
    assert_eq!(info["lastUpdate"]["message"], "clipsave-helper 9.9.9");
    next.finish();
}

#[test]
fn a_yt_dlp_update_keeps_the_helper_running() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "u", "type": "update", "what": "ytdlp" }));
    assert_eq!(helper.next("u")["type"], "updating");
    thread::sleep(Duration::from_millis(900));
    helper.send(json!({ "id": "h", "type": "hello" }));
    assert_eq!(
        helper.next("h")["helper"]["lastUpdate"]["message"],
        "yt-dlp 2099.02.02"
    );
    helper.finish();
}

#[test]
fn will_not_update_in_the_middle_of_a_download() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "job-busy", "type": "download", "url": "https://example.com/slow", "quality": { "kind": "best" } }));
    assert_eq!(helper.next("job-busy")["type"], "title");
    helper.send(json!({ "id": "u", "type": "update", "what": "all" }));
    let reply = helper.next("u");
    assert_eq!(reply["type"], "error");
    assert_eq!(reply["message"], "Finish or cancel your downloads first.");
    helper.finish();
}

#[test]
fn refuses_links_that_are_not_web_addresses() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "a", "type": "inspect", "url": "--exec=touch /tmp/pwned" }));
    assert_eq!(helper.next("a")["message"], "This isn't a web link.");
    helper.send(json!({ "id": "../../x", "type": "download", "url": "https://example.com/v", "quality": { "kind": "best" } }));
    assert_eq!(helper.next("../../x")["type"], "failed");
    helper.finish();
}

#[test]
fn explains_yt_dlp_errors_in_plain_words() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "u", "type": "inspect", "url": "https://example.com/unsupported" }));
    assert_eq!(helper.next("u")["message"], "No video found on this page.");
    helper.send(json!({ "id": "job-broken", "type": "download", "url": "https://example.com/broken", "quality": { "kind": "best" } }));
    let events = helper.until("job-broken", "failed");
    assert_eq!(
        events.last().unwrap()["message"],
        "This video was removed or the link is wrong."
    );
    helper.finish();
}

#[test]
fn downloads_and_reports_progress_that_only_moves_forward() {
    let mut helper = Helper::start();
    helper.send(json!({
        "id": "job-1", "type": "download", "url": "https://example.com/video",
        "quality": { "kind": "video", "height": 720 },
    }));
    let events = helper.until("job-1", "done");
    assert_eq!(events[0]["type"], "title");
    assert_eq!(events[0]["title"], "Stub clip | with a pipe");

    let percents: Vec<f64> = events
        .iter()
        .filter(|e| e["type"] == "progress" && e["phase"] == "downloading")
        .filter_map(|e| e["percent"].as_f64())
        .collect();
    assert!(!percents.is_empty());
    assert!(
        percents.windows(2).all(|pair| pair[0] <= pair[1]),
        "{percents:?}"
    );
    assert!(events.iter().any(|e| e["phase"] == "processing"));

    // Where videos go depends on the system, so ask the helper.
    helper.send(json!({ "id": "h", "type": "hello" }));
    let video_dir = helper.next("h")["helper"]["videoDir"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(
        video_dir.starts_with(helper.home.to_str().unwrap()),
        "{video_dir}"
    );

    let path = events.last().unwrap()["path"].as_str().unwrap().to_string();
    assert!(Path::new(&path).starts_with(&video_dir), "{path}");
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "fake video\n");

    helper.send(json!({ "id": "r", "type": "reveal", "path": "/etc/hosts" }));
    assert_eq!(
        helper.next("r")["message"],
        "This file isn't in a ClipSave folder."
    );
    helper.finish();
}

#[test]
fn cancelling_stops_yt_dlp_and_removes_partial_files() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "job-slow", "type": "download", "url": "https://example.com/slow", "quality": { "kind": "best" } }));
    assert_eq!(helper.next("job-slow")["type"], "title");
    helper.send(json!({ "id": "job-slow", "type": "cancel" }));

    // A cancelled job ends quietly: no done or failed message follows.
    thread::sleep(Duration::from_millis(800));
    let late: Vec<Value> = helper
        .messages
        .try_iter()
        .filter(|m| m["id"] == "job-slow" && m["type"] != "progress")
        .collect();
    assert!(late.is_empty(), "{late:?}");

    let partial = helper
        .home
        .join(if cfg!(target_os = "macos") {
            "Library/Caches"
        } else {
            ".cache"
        })
        .join("ClipSave/partial/job-slow");
    assert!(
        !partial.exists(),
        "partial files left in {}",
        partial.display()
    );
    assert_eq!(helper.finish(), 0);
}

#[test]
fn closing_the_pipe_stops_running_downloads() {
    let mut helper = Helper::start();
    helper.send(json!({ "id": "job-orphan", "type": "download", "url": "https://example.com/slow", "quality": { "kind": "best" } }));
    assert_eq!(helper.next("job-orphan")["type"], "title");
    let started = std::time::Instant::now();
    assert_eq!(helper.finish(), 0);
    assert!(started.elapsed() < Duration::from_secs(5));
}
