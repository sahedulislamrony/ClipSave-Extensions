//! ClipSave Helper. The browser starts it and talks to it over stdin and stdout; run by hand it
//! takes `--install`, `--uninstall` and `--version`.

#[cfg(not(unix))]
compile_error!("The ClipSave Helper supports macOS and Linux so far.");

mod download;
mod engine;
mod inspect;
mod install;
mod protocol;

use download::Jobs;
use engine::Engine;
use protocol::{read_message, Outbox, Request};
use serde_json::json;
use std::io;
use std::process::ExitCode;
use std::sync::Arc;
use std::thread;

fn main() -> ExitCode {
    let flag = std::env::args().nth(1);
    let result = match flag.as_deref() {
        Some("--install") => install::install(),
        Some("--uninstall") => install::uninstall(),
        Some("--version") => {
            println!("clipsave-helper {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        // Browsers pass the caller's identity as arguments, and they aren't used.
        _ => serve(),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("clipsave-helper: {e}");
            ExitCode::FAILURE
        }
    }
}

fn serve() -> io::Result<()> {
    let engine = Arc::new(Engine::locate());
    let jobs = Jobs::default();
    let out = Outbox::new();
    download::clean_old_partials();

    let mut stdin = io::stdin().lock();
    while let Some(body) = read_message(&mut stdin)? {
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => handle(request, &engine, &jobs, &out),
            Err(e) => eprintln!("clipsave-helper: bad request: {e}"),
        }
    }
    // The browser left. Downloads stop with it; their partial files stay for a retry.
    jobs.stop_all();
    Ok(())
}

fn handle(request: Request, engine: &Arc<Engine>, jobs: &Jobs, out: &Outbox) {
    match request {
        Request::Hello { id } => {
            let (engine, out) = (engine.clone(), out.clone());
            thread::spawn(move || {
                out.send(json!({
                    "id": id,
                    "type": "hello",
                    "helper": {
                        "version": env!("CARGO_PKG_VERSION"),
                        "ytDlp": engine.yt_dlp_version(),
                        "ffmpeg": engine.has_ffmpeg(),
                        "videoDir": download::video_dir(),
                        "audioDir": download::audio_dir(),
                    },
                }));
            });
        }
        Request::Inspect { id, url } => {
            if !engine::is_allowed_url(&url) {
                return out.error(&id, "This isn't a web link.");
            }
            let (engine, out) = (engine.clone(), out.clone());
            thread::spawn(move || match inspect::inspect(&engine, &url) {
                Ok(media) => out.send(json!({ "id": id, "type": "info", "media": media })),
                Err(message) => out.error(&id, &message),
            });
        }
        Request::Download { id, url, quality } => {
            if !engine::is_allowed_url(&url) || !download::is_valid_id(&id) {
                return out.send(
                    json!({ "id": id, "type": "failed", "message": "This isn't a web link." }),
                );
            }
            download::start(engine.clone(), jobs.clone(), out.clone(), id, url, quality);
        }
        Request::Cancel { id } => jobs.cancel(&id),
        Request::Reveal { id, path } => match download::reveal(&path) {
            Ok(()) => out.send(json!({ "id": id, "type": "revealed" })),
            Err(message) => out.error(&id, &message),
        },
    }
}
