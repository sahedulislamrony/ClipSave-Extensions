# Architecture

```
┌──────────── browser ────────────┐                ┌──────── your computer ────────┐
│ popup  ⇄  background script     │  native        │ ClipSave Helper               │
│            (queue, menus)       │ ═messaging═══► │   ├─ yt-dlp  (reads the page, │
│ storage.local: download list    │  JSON, stdio   │   │           downloads)      │
└─────────────────────────────────┘                │   └─ ffmpeg  (merges, MP3)    │
                                                   └───────────────────────────────┘
```

Extensions can't start programs, and yt-dlp needs Python, ffmpeg and, for YouTube, a JavaScript runtime. So the
extension is only the interface, and the helper runs yt-dlp on the user's computer. That's the same design as the
Android app, where yt-dlp runs on the phone. There is no server.

The helper ships with everything it runs, in a `vendor/` folder next to it: yt-dlp, ffmpeg and ffprobe, and
QuickJS (`qjs`), the JavaScript runtime yt-dlp uses for YouTube. Users install nothing else.

## The extension

One TypeScript codebase built with [WXT](https://wxt.dev) into two outputs:

| | Chrome (`.output/chrome-mv3`) | Firefox (`.output/firefox-mv2`) |
|---|---|---|
| Manifest | V3 | V2 |
| Background | service worker | persistent background page |

- **Firefox uses Manifest V2** so its background page can't be stopped in the middle of a long download.
- **Chrome's service worker** stays alive while the native messaging port is open, and the port stays open while
  anything is downloading. After 30 idle seconds the extension closes the port, and the helper and service
  worker both exit (`src/lib/helper.ts`).
- **Both builds behave the same**, YouTube included. ClipSave isn't published on the Chrome Web Store, whose
  rules don't allow YouTube downloads, so the Chrome build is installed unpacked.
- **Playlists** are read flat (`yt-dlp --flat-playlist`), which lists the videos without opening each one, so
  a long playlist reads in seconds. The popup then queues one download per chosen video, tagged with the
  playlist, so each has its own progress, cancel and retry. They save to a subfolder named after the playlist,
  and one notification covers the whole playlist.
- **The download list** lives in `storage.local` (`src/lib/downloads.ts`). The popup only renders it and
  follows changes, so closing the popup affects nothing. At most three downloads run at once. Unfinished
  downloads always stay in the list, however many a playlist adds; only finished ones past 30 are dropped. When the browser
  starts, anything that was still running is marked **Stopped** so it can be retried.
- **Settings** (`src/entrypoints/options/`) opens as a full tab. It shows versions and system details, runs
  one-click updates, and sets the video and audio folders through the helper.
- **Update checks** (`src/lib/updates.ts`) ask GitHub's releases API for the newest ClipSave and yt-dlp, from
  the background, so the popup, Settings and a notification share one answer (`storage.local`). They run when
  asked, or once a day when **Check automatically** is on, which it isn't until the person turns it on.
  The popup and Settings share their tokens (`src/styles/theme.css`), icons (`src/lib/dom.ts`) and theme choice
  (`src/lib/theme.ts`, kept in `localStorage`).
- **Permissions:** `nativeMessaging`, `activeTab` (read the current tab's address when the button is clicked),
  `contextMenus`, `storage`, `notifications`. No host permissions and no content scripts.

## The helper

A single Rust binary, `helper/`, about 0.5 MB. The browser starts it on demand and talks to it over
stdin/stdout. Run by hand it takes `--install`, `--uninstall` and `--version`.

| File | |
|---|---|
| `protocol.rs` | message framing (32-bit length + JSON) and message types |
| `engine.rs` | finds yt-dlp, ffmpeg and deno; arguments every run shares; link checks; readable errors |
| `inspect.rs` | `yt-dlp -J --flat-playlist`, reduced to what the quality picker or the playlist list shows |
| `download.rs` | runs a download, reports progress, cancels, opens the folder |
| `settings.rs` | the video and audio folders chosen in Settings, in `<config>/ClipSave/settings.json` |
| `install.rs` | writes the host manifests (and on Windows, registry keys) that tell each browser where the helper is |
| `platform.rs` | what differs between macOS, Linux and Windows: program names, stopping processes, showing a file |

Things it does deliberately:

- **Only `http(s)` links reach yt-dlp**, passed after `--` and with `--ignore-config`, so a link can't become
  an option and a local yt-dlp config can't change behaviour.
- **yt-dlp doesn't inherit stdin**, because stdin is the browser's message pipe.
- **Progress across streams:** yt-dlp reports video and audio streams one after the other. The helper turns
  that into one number that only moves forward, weighted by size when yt-dlp knows the total.
- **Partial files** go to `<cache>/ClipSave/partial/<job id>`. A failed or interrupted job keeps them so a retry
  resumes. Cancelling deletes them, and leftovers older than seven days are cleared on start.
- **Cancelling** stops yt-dlp and everything it started, so ffmpeg stops too: a process group signal on macOS
  and Linux, `taskkill /T` on Windows. When the browser closes the pipe, every running job stops. On Windows,
  nothing the helper starts opens a console window.
- **Showing a file** works only for paths inside the ClipSave folders: the chosen ones and the defaults.
- **Chosen folders** must be full paths. The helper creates them and checks it can write there before saving
  the choice. The folder dialog (`osascript`, PowerShell, zenity or kdialog) gets its start folder through an
  environment variable, never inside its script.
- **One-click updates** run the published installer (`install.sh --from-helper`, `install.ps1 -FromHelper`),
  which downloads the release, checks every file against `SHA256SUMS.txt` (yt-dlp against yt-dlp's own
  `SHA2-256SUMS`), swaps folders into place and writes `ok …` or `failed …` to a result file that `hello`
  reports as `lastUpdate`. The installer runs apart from the helper so it can replace it: in its own session on
  macOS and Linux, started through WMI on Windows, where a browser stops everything its helper started. After a
  full update the helper exits, and the browser starts the new one. On macOS the installer clears the
  quarantine mark that files written under a browser get. The installer keeps the Chromium build in
  `<install dir>/extension` with a `managed.json` beside it; an extension that can read its own
  `managed.json` knows updates replace its files, and restarts on them (`runtime.reload()`).
- **`features`** in `hello` lists what a helper can do (`playlists`, `folders`, `pickFolder`), so Settings can tell
  an older helper apart and ask for an update instead of waiting on a reply that won't come.
- **Playlist folders** are one level deep: the helper turns the playlist title into a single folder name, with
  separators, `..` and characters Windows refuses replaced.
- **Finding tools:** it looks in its own `vendor/` folder first. A browser started from the Dock passes a
  minimal `PATH`, so it also looks in `/opt/homebrew/bin` and `/usr/local/bin`. It prefers the bundled QuickJS,
  and uses Deno if that's all it finds.

## Setup without a restart

When the helper is missing, the popup shows the install command for the user's system
(`runtime.getPlatformInfo()`, `src/lib/install.ts`) and asks the helper for a `hello` every two seconds.
Browsers read the host registration each time they connect, so the first `hello` after the installer finishes
succeeds, and the popup carries on reading the current page.

## Messages

Every message is JSON with an `id` and a `type`. Requests get one reply with the same `id`. A download's `id`
is its job ID, and all its events carry it.

| Extension → helper | Reply or events |
|---|---|
| `hello` | `hello` with `helper: { version, ytDlp, ffmpeg, jsRuntime, videoDir, audioDir, defaultVideoDir, defaultAudioDir, path, os, arch, features }` |
| `inspect { url, playlist? }` | `info { media }` for a video, `info { playlist }` for a playlist, or `error { message }` |
| `download { url, quality, folder?, name?, prefix? }` | `title`, then `progress { phase, percent, speedBytes, etaSec }` (at most every 0.4 s), then `done { path }` or `failed { message }` |
| `cancel` | nothing; the job ends quietly |
| `reveal { path }` | `revealed` or `error` |
| `setFolder { kind, path? }` | `folder { kind, path }` with the folder now in use, or `error`. No `path` means the default |
| `update { what }` | `updating { log }` when the installer has started, or `error` (for one, while a download runs). `what` is `all` or `ytdlp` |
| `pickFolder { kind }` | `picked { path }` (null when cancelled), or `error` when the system has no folder dialog |

`quality` is `{ kind: "best" }`, `{ kind: "video", height }` or `{ kind: "audio", format: "mp3" | "m4a" }`.
The helper turns it into the same yt-dlp format selectors the Android app uses.

A link to a playlist itself always reads as the playlist. A video in a playlist (YouTube's `watch?v=…&list=…`)
reads as the one video, unless `playlist: true` asks for the playlist. `playlist` is
`{ url, title, uploader, thumbnail, total, entries: [{ url, title, durationSec }] }`, at most 1000 entries;
`total` is the playlist's full length when the site gives it. `folder` names the playlist's subfolder.

`name` is the file name without its extension (yt-dlp adds that); without it the file is named
`<title> [<id>]`. `prefix` goes in front, for playlist numbers like `07 - `, padded to the playlist's length as
the app does. The helper cleans both of anything that isn't allowed in a file name, writes `%` so yt-dlp reads it
literally, and adds ` (2)`, ` (3)`… instead of replacing a file of the same name. Types are mirrored in
`src/lib/types.ts` and `helper/src/protocol.rs`.

## Registration

Browsers only start a native host they find a manifest for. `clipsave-helper --install` writes
`link.clipsave.helper.json` into each browser's per-user folder on macOS and Linux. On Windows it writes the
manifests next to the helper and points a registry key under `HKEY_CURRENT_USER` at them for each browser, so no
administrator rights are needed.

- **Chromium browsers** allow the extension by ID (`allowed_origins`). The ID of unpacked builds comes from the
  `key` in `wxt.config.ts`. A Chrome Web Store listing gets its own ID, which has to be added to
  `CHROME_IDS` in `helper/src/install.rs`.
- **Firefox** allows it by add-on ID, `clipsave@sahedulislamrony.github.io` (`allowed_extensions`). Builds before 1.2.0 used
  `clipsave@clipsave.link`, which is taken on Firefox Add-ons; the helper allows both.
