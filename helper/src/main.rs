//! ClipSave Helper. The browser starts it and talks to it over stdin and stdout; run by hand it
//! takes `--install [--browsers <list>]`, `--uninstall`, `--version` and `--help`.

mod download;
mod engine;
mod inspect;
mod install;
mod platform;
mod protocol;
mod settings;
mod update;

use download::Jobs;
use engine::Engine;
use inspect::Inspected;
use protocol::{read_message, Outbox, Request};
use serde_json::json;
use settings::FolderKind;
use std::io::{self, IsTerminal};
use std::process::ExitCode;
use std::sync::Arc;
use std::thread;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("--install") => {
            browsers_option(&args[1..]).and_then(|only| install::install(only.as_deref()))
        }
        Some("--uninstall") => install::uninstall(),
        Some("--help" | "-h" | "help") => {
            print!("{}", help());
            Ok(())
        }
        Some("--version") => {
            // A reader that stops early (`| head -1`) closes the pipe; that's fine, not a crash.
            let text = format!(
                "clipsave-helper {}\n{}\n",
                env!("CARGO_PKG_VERSION"),
                Engine::locate().describe()
            );
            let _ = io::Write::write_all(&mut io::stdout(), text.as_bytes());
            Ok(())
        }
        // Run by hand, with no browser on the other end: waiting for messages would look like a hang.
        _ if io::stdin().is_terminal() => {
            print!("{}", help());
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

/// `--browsers chrome,firefox` (or `--browsers=…`, or `--all`) after `--install`; nothing means every
/// browser that's set up.
fn browsers_option(args: &[String]) -> io::Result<Option<Vec<&'static str>>> {
    let mut chosen = None;
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let list = match arg.as_str() {
            "--all" => "all",
            "--browsers" => rest.next().map(String::as_str).unwrap_or(""),
            other => match other.strip_prefix("--browsers=") {
                Some(list) => list,
                None => {
                    return Err(io::Error::other(format!(
                        "Unknown option {other}. See --help."
                    )))
                }
            },
        };
        chosen = Some(install::parse_browsers(list).map_err(io::Error::other)?);
    }
    Ok(chosen)
}

fn help() -> String {
    format!(
        "clipsave-helper {version}
Lets the ClipSave browser extension save videos with yt-dlp. Your browser starts it by itself;
you only run it by hand to connect it to browsers or to see what it uses.

Usage:
  clipsave-helper --install                    connect to every browser that's set up
  clipsave-helper --install --browsers <list>  connect to just these, e.g. chrome,firefox
  clipsave-helper --install --all              connect to every supported browser
  clipsave-helper --uninstall                  disconnect from every browser
  clipsave-helper --version                    show its version and the tools it uses
  clipsave-helper --help                       show this

Browsers here: {browsers}
To update or remove ClipSave, run its install command again. The guide:
  https://github.com/sahedulislamrony/ClipSave-Extensions/blob/main/docs/install.md
",
        version = env!("CARGO_PKG_VERSION"),
        browsers = install::browser_ids().join(", "),
    )
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
                        "jsRuntime": engine.js_runtime_name(),
                        "videoDir": download::video_dir(),
                        "audioDir": download::audio_dir(),
                        "defaultVideoDir": settings::default_dir(FolderKind::Video),
                        "defaultAudioDir": settings::default_dir(FolderKind::Audio),
                        "path": std::env::current_exe().ok().map(|exe| platform::plain(&exe)),
                        "os": std::env::consts::OS,
                        "arch": std::env::consts::ARCH,
                        // What this helper can do, so a newer extension can tell an older helper apart.
                        "features": ["playlists", "folders", "pickFolder", "update"],
                        "lastUpdate": update::last_result(),
                        "updateLog": update::log_file(),
                        "extensionDir": update::extension_dir(),
                    },
                }));
            });
        }
        Request::Inspect { id, url, playlist } => {
            if !engine::is_allowed_url(&url) {
                return out.error(&id, "This isn't a web link.");
            }
            let (engine, out) = (engine.clone(), out.clone());
            thread::spawn(move || match inspect::inspect(&engine, &url, playlist) {
                Ok(Inspected::Media(media)) => {
                    out.send(json!({ "id": id, "type": "info", "media": media }))
                }
                Ok(Inspected::Playlist(playlist)) => {
                    out.send(json!({ "id": id, "type": "info", "playlist": playlist }))
                }
                Err(message) => out.error(&id, &message),
            });
        }
        Request::Download {
            id,
            url,
            quality,
            folder,
            name,
            prefix,
        } => {
            if !engine::is_allowed_url(&url) || !download::is_valid_id(&id) {
                return out.send(
                    json!({ "id": id, "type": "failed", "message": "This isn't a web link." }),
                );
            }
            download::start(
                engine.clone(),
                jobs.clone(),
                out.clone(),
                id,
                url,
                quality,
                download::Naming {
                    folder,
                    name,
                    prefix,
                },
            );
        }
        Request::Cancel { id } => jobs.cancel(&id),
        Request::Reveal { id, path } => match download::reveal(&path) {
            Ok(()) => out.send(json!({ "id": id, "type": "revealed" })),
            Err(message) => out.error(&id, &message),
        },
        Request::SetFolder { id, kind, path } => match settings::set_dir(kind, path.as_deref()) {
            Ok(dir) => out.send(json!({ "id": id, "type": "folder", "kind": kind, "path": dir })),
            Err(message) => out.error(&id, &message),
        },
        Request::Update { id, what } => {
            if !jobs.is_idle() {
                return out.error(&id, "Finish or cancel your downloads first.");
            }
            // After a full update this helper is out of date: it leaves, and the browser starts the new one.
            let leave = what == update::UpdateKind::All;
            match update::start(what, move || {
                if leave {
                    std::process::exit(0);
                }
            }) {
                Ok(()) => {
                    out.send(json!({ "id": id, "type": "updating", "log": update::log_file() }))
                }
                Err(message) => out.error(&id, &message),
            }
        }
        Request::PickFolder { id, kind } => {
            let out = out.clone();
            // The dialog waits for the person, so it can't hold up other messages.
            thread::spawn(move || {
                let title = match kind {
                    FolderKind::Video => "Choose where ClipSave saves videos",
                    FolderKind::Audio => "Choose where ClipSave saves audio",
                };
                let start = settings::dir(kind);
                let start = if start.is_dir() {
                    start
                } else {
                    settings::default_dir(kind)
                };
                match platform::pick_folder(title, &start) {
                    Ok(path) => out.send(json!({ "id": id, "type": "picked", "path": path })),
                    Err(message) => out.error(&id, &message),
                }
            });
        }
    }
}
