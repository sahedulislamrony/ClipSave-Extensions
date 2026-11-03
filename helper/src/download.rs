//! Runs one yt-dlp download and reports on it. Mirrors `DownloadWorker` in the Android app.

use crate::engine::{friendly_error, Engine};
use crate::protocol::{Outbox, Quality};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

/// How often the popup hears about a running download.
const REPORT_EVERY: Duration = Duration::from_millis(400);
/// Partial files from jobs nobody came back to are deleted after this long.
const KEEP_PARTIAL: Duration = Duration::from_secs(7 * 24 * 3600);

const START: &str = "[cs-start]";
const PROGRESS: &str = "[cs-progress]";
const POST: &str = "[cs-post]";
const PATH: &str = "[cs-path]";

struct Job {
    pid: i32,
    cancelled: AtomicBool,
}

/// Every running job, so one can be cancelled or all stopped when the browser leaves.
#[derive(Clone, Default)]
pub struct Jobs(Arc<Mutex<HashMap<String, Arc<Job>>>>);

impl Jobs {
    /// Stops a job. With no job running, clears what an earlier run of it left behind.
    pub fn cancel(&self, id: &str) {
        match self.0.lock().unwrap().get(id) {
            Some(job) => {
                job.cancelled.store(true, Ordering::SeqCst);
                terminate(job.pid);
            }
            None => {
                if is_valid_id(id) {
                    let _ = fs::remove_dir_all(partial_root().join(id));
                }
            }
        }
    }

    pub fn stop_all(&self) {
        for job in self.0.lock().unwrap().values() {
            terminate(job.pid);
        }
    }
}

/// yt-dlp starts ffmpeg, so the whole process group has to go.
fn terminate(pid: i32) {
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
}

/// Job IDs become folder names, so they can't be allowed to hold a path.
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn partial_root() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("ClipSave/partial")
}

pub fn video_dir() -> PathBuf {
    dirs::video_dir()
        .unwrap_or_else(|| home().join("Movies"))
        .join("ClipSave")
}

pub fn audio_dir() -> PathBuf {
    dirs::audio_dir()
        .unwrap_or_else(|| home().join("Music"))
        .join("ClipSave")
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(std::env::temp_dir)
}

pub fn clean_old_partials() {
    let Ok(entries) = fs::read_dir(partial_root()) else {
        return;
    };
    let cutoff = SystemTime::now() - KEEP_PARTIAL;
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .is_ok_and(|time| time < cutoff);
        if old {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

pub fn selector(quality: &Quality) -> String {
    match quality {
        Quality::Best => "bv*+ba/b".to_string(),
        Quality::Video { height } => format!("bv*[height<={height}]+ba/b[height<={height}]/b"),
        Quality::Audio { .. } => "ba/b".to_string(),
    }
}

pub fn start(
    engine: Arc<Engine>,
    jobs: Jobs,
    out: Outbox,
    id: String,
    url: String,
    quality: Quality,
) {
    thread::spawn(move || {
        let message = match run(&engine, &jobs, &out, &id, &url, &quality) {
            Ok(Some(path)) => json!({ "id": id, "type": "done", "path": path }),
            Ok(None) => return,
            Err(message) => json!({ "id": id, "type": "failed", "message": message }),
        };
        out.send(message);
    });
}

/// `Ok(None)` means the job was cancelled.
fn run(
    engine: &Engine,
    jobs: &Jobs,
    out: &Outbox,
    id: &str,
    url: &str,
    quality: &Quality,
) -> Result<Option<String>, String> {
    let target = match quality {
        Quality::Audio { .. } => audio_dir(),
        _ => video_dir(),
    };
    let partial = partial_root().join(id);
    fs::create_dir_all(&target)
        .map_err(|e| format!("Could not create {}: {e}", target.display()))?;
    fs::create_dir_all(&partial).map_err(|e| format!("Could not create a work folder: {e}"))?;

    let mut command = engine
        .command()
        .ok_or("yt-dlp is missing from the ClipSave Helper.")?;
    command
        .args(["-f", &selector(quality), "-S", "res,vcodec:h264,acodec:m4a"])
        .args(["--concurrent-fragments", "4", "--no-mtime", "--embed-metadata", "--windows-filenames"])
        .arg("--paths")
        .arg(format!("home:{}", target.display()))
        .arg("--paths")
        .arg(format!("temp:{}", partial.display()))
        .args(["-o", "%(title).100B [%(id)s].%(ext)s"])
        .args(["--progress", "--newline"])
        .args(["--print", &format!("before_dl:{START}%(format_id)s|%(filesize,filesize_approx)s|%(title)s")])
        .args(["--print", &format!("after_move:{PATH}%(filepath)s")])
        .args([
            "--progress-template",
            &format!(
                "download:{PROGRESS}%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s"
            ),
        ])
        .args(["--progress-template", &format!("postprocess:{POST}%(progress.status)s")]);
    match quality {
        Quality::Audio { format } => {
            command.args([
                "-x",
                "--audio-format",
                format.as_str(),
                "--audio-quality",
                "0",
            ]);
        }
        _ => {
            command.args(["--merge-output-format", "mp4"]);
        }
    }
    // stdin is the browser's message pipe, so yt-dlp must not inherit it.
    command
        .args(["--", url])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start yt-dlp: {e}"))?;
    let job = Arc::new(Job {
        pid: child.id() as i32,
        cancelled: AtomicBool::new(false),
    });
    jobs.0.lock().unwrap().insert(id.to_string(), job.clone());

    let mut stderr = child.stderr.take().expect("stderr is piped");
    let errors = thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });

    let mut progress = Progress::default();
    let mut saved = None;
    for line in BufReader::new(child.stdout.take().expect("stdout is piped"))
        .lines()
        .map_while(Result::ok)
    {
        if let Some(path) = line.strip_prefix(PATH) {
            saved = Some(path.to_string());
        } else if let Some(rest) = line.strip_prefix(START) {
            if let Some(title) = progress.begin(rest) {
                out.send(json!({ "id": id, "type": "title", "title": title }));
            }
        } else if let Some(rest) = line.strip_prefix(PROGRESS) {
            if let Some(report) = progress.update(rest) {
                out.send(report.into_event(id));
            }
        } else if line.starts_with(POST) {
            out.send(json!({ "id": id, "type": "progress", "phase": "processing", "percent": null, "speedBytes": null, "etaSec": null }));
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr = errors.join().unwrap_or_default();
    jobs.0.lock().unwrap().remove(id);

    if job.cancelled.load(Ordering::SeqCst) {
        let _ = fs::remove_dir_all(&partial);
        return Ok(None);
    }
    match (status.success(), saved) {
        (true, Some(path)) => {
            let _ = fs::remove_dir_all(&partial);
            Ok(Some(path))
        }
        (true, None) => Err("yt-dlp finished without saving a file.".to_string()),
        // The partial files stay, so a retry carries on from where this stopped.
        (false, _) => Err(friendly_error(&stderr)),
    }
}

#[derive(Debug, PartialEq)]
struct Report {
    percent: Option<f64>,
    speed: Option<f64>,
    eta: Option<f64>,
}

impl Report {
    fn into_event(self, id: &str) -> Value {
        json!({
            "id": id, "type": "progress", "phase": "downloading",
            "percent": self.percent, "speedBytes": self.speed, "etaSec": self.eta,
        })
    }
}

/// yt-dlp reports video and audio streams one after the other, each from zero. This turns that
/// into a single number that only moves forward.
#[derive(Default)]
struct Progress {
    streams: u32,
    finished_streams: u32,
    /// Size of the whole download, when yt-dlp knows it.
    total: Option<f64>,
    finished_bytes: f64,
    highest: f64,
    last_report: Option<Instant>,
}

impl Progress {
    /// Reads `format_id|size|title` and returns the title.
    fn begin(&mut self, line: &str) -> Option<String> {
        let mut parts = line.splitn(3, '|');
        let format = parts.next()?;
        self.streams = format.split('+').count() as u32;
        self.total = number(parts.next()?).filter(|n| *n > 0.0);
        parts.next().map(str::to_string)
    }

    /// Reads `status|downloaded|total|speed|eta`. Returns a report when one is due.
    fn update(&mut self, line: &str) -> Option<Report> {
        let parts: Vec<&str> = line.split('|').collect();
        let [status, downloaded, stream_total, speed, eta] = parts[..] else {
            return None;
        };
        let downloaded = number(downloaded).unwrap_or(0.0);
        let stream_total = number(stream_total);

        let percent = if let Some(total) = self.total {
            Some((self.finished_bytes + downloaded) / total * 100.0)
        } else {
            let streams = self.streams.max(1) as f64;
            stream_total
                .filter(|t| *t > 0.0)
                .map(|t| (self.finished_streams as f64 + downloaded / t) / streams * 100.0)
        };
        let finished = status == "finished";
        if finished {
            self.finished_streams += 1;
            self.finished_bytes += downloaded;
        }
        // A stream's size estimate can shrink mid-download; the bar shouldn't move back for that.
        let percent = percent.map(|p| {
            self.highest = self.highest.max(p.min(99.0));
            self.highest
        });

        let due = self
            .last_report
            .is_none_or(|last| last.elapsed() >= REPORT_EVERY);
        if !due && !finished {
            return None;
        }
        self.last_report = Some(Instant::now());
        Some(Report {
            percent,
            speed: number(speed),
            eta: number(eta),
        })
    }
}

/// yt-dlp prints `NA` for a value it doesn't have.
fn number(text: &str) -> Option<f64> {
    text.trim().parse().ok().filter(|n: &f64| n.is_finite())
}

/// Opens the folder of a file this helper saved. Nothing outside the ClipSave folders can be opened.
pub fn reveal(path: &str) -> Result<(), String> {
    let path = Path::new(path)
        .canonicalize()
        .map_err(|_| "This file was moved or deleted.".to_string())?;
    let allowed = [video_dir(), audio_dir()]
        .iter()
        .filter_map(|dir| dir.canonicalize().ok())
        .any(|dir| path.starts_with(dir));
    if !allowed {
        return Err("This file isn't in a ClipSave folder.".to_string());
    }
    let mut command = if cfg!(target_os = "macos") {
        let mut open = std::process::Command::new("open");
        open.arg("-R").arg(&path);
        open
    } else {
        let mut open = std::process::Command::new("xdg-open");
        open.arg(path.parent().unwrap_or(&path));
        open
    };
    command.status().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reports are throttled, so tests read the state a report would carry.
    fn feed(progress: &mut Progress, line: &str) -> f64 {
        progress.last_report = None;
        progress.update(line).unwrap().percent.unwrap()
    }

    #[test]
    fn job_ids_cannot_hold_a_path() {
        assert!(is_valid_id("7f3c1a2e-0000-4000-8000-000000000000"));
        assert!(!is_valid_id("../../etc"));
        assert!(!is_valid_id("a/b"));
        assert!(!is_valid_id(""));
    }

    #[test]
    fn builds_the_same_selectors_as_the_android_app() {
        assert_eq!(selector(&Quality::Best), "bv*+ba/b");
        assert_eq!(
            selector(&Quality::Video { height: 720 }),
            "bv*[height<=720]+ba/b[height<=720]/b"
        );
    }

    #[test]
    fn reads_the_title_even_when_it_contains_the_separator() {
        let mut progress = Progress::default();
        assert_eq!(
            progress.begin("137+140|5000|A | B").as_deref(),
            Some("A | B")
        );
        assert_eq!(progress.streams, 2);
        assert_eq!(progress.total, Some(5000.0));
    }

    #[test]
    fn counts_two_streams_as_one_download_by_size() {
        let mut progress = Progress::default();
        progress.begin("137+140|1000|T");
        assert_eq!(feed(&mut progress, "downloading|400|800|10|5"), 40.0);
        assert_eq!(feed(&mut progress, "finished|800|800|NA|NA"), 80.0);
        assert_eq!(feed(&mut progress, "downloading|100|200|10|5"), 90.0);
    }

    #[test]
    fn splits_evenly_when_the_total_size_is_unknown() {
        let mut progress = Progress::default();
        progress.begin("137+140|NA|T");
        assert_eq!(feed(&mut progress, "downloading|50|100|NA|NA"), 25.0);
        assert_eq!(feed(&mut progress, "finished|100|100|NA|NA"), 50.0);
        assert_eq!(feed(&mut progress, "downloading|50|100|NA|NA"), 75.0);
    }

    #[test]
    fn never_moves_backwards_or_reaches_done_early() {
        let mut progress = Progress::default();
        progress.begin("18|1000|T");
        assert_eq!(feed(&mut progress, "downloading|900|1000|10|1"), 90.0);
        assert_eq!(feed(&mut progress, "downloading|500|1000|10|1"), 90.0);
        assert_eq!(feed(&mut progress, "downloading|2000|2000|10|1"), 99.0);
    }

    #[test]
    fn throttles_reports_but_never_drops_a_finished_stream() {
        let mut progress = Progress::default();
        progress.begin("18|1000|T");
        assert!(progress.update("downloading|1|1000|1|1").is_some());
        assert!(progress.update("downloading|2|1000|1|1").is_none());
        assert!(progress.update("finished|1000|1000|1|1").is_some());
    }

    #[test]
    fn treats_missing_values_as_unknown() {
        assert_eq!(number("NA"), None);
        assert_eq!(number("12.5"), Some(12.5));
    }
}
