# Architecture

```
┌──────────── browser ────────────┐                ┌──────── your computer ────────┐
│ popup  ⇄  background script     │  native        │ ClipSave Helper               │
│            (queue, menus)       │ ═messaging═══► │   ├─ yt-dlp  (reads the page, │
│ storage.local: download list    │  JSON, stdio   │   │           downloads)      │
└─────────────────────────────────┘                │   └─ ffmpeg  (merges, MP3)    │
                                                   └───────────────────────────────┘
```

Extensions can't start programs, and yt-dlp needs Python, ffmpeg and sometimes a JavaScript runtime. So the
extension is only the interface, and the helper runs yt-dlp on the user's computer. That's the same design as the
Android app, where yt-dlp runs on the phone. There is no server.

## The extension

One TypeScript codebase built with [WXT](https://wxt.dev) into two outputs:

| | Chrome (`.output/chrome-mv3`) | Firefox (`.output/firefox-mv2`) |
|---|---|---|
| Manifest | V3 | V2 |
| Background | service worker | persistent background page |
| YouTube | refused (`src/lib/variant.ts`) | allowed |

- **Firefox uses Manifest V2** so its background page can't be stopped in the middle of a long download.
- **Chrome's service worker** stays alive while the native messaging port is open, and the port stays open while
  anything is downloading. After 30 idle seconds the extension closes the port, and the helper and service
  worker both exit (`src/lib/helper.ts`).
- **The YouTube rule** is fixed at build time from `import.meta.env.CHROME`. It's applied in the background
  script, so both the popup and the right-click menu go through it, and it can't be switched on remotely.
- **The download list** lives in `storage.local` (`src/lib/downloads.ts`). The popup only renders it and
  follows changes, so closing the popup affects nothing. At most three downloads run at once. When the browser
  starts, anything that was still running is marked **Stopped** so it can be retried.
- **Permissions:** `nativeMessaging`, `activeTab` (read the current tab's address when the button is clicked),
  `contextMenus`, `storage`, `notifications`. No host permissions and no content scripts.

## The helper

A single Rust binary, `helper/`, about 0.5 MB. The browser starts it on demand and talks to it over
stdin/stdout. Run by hand it takes `--install`, `--uninstall` and `--version`.

| File | |
|---|---|
| `protocol.rs` | message framing (32-bit length + JSON) and message types |
| `engine.rs` | finds yt-dlp, ffmpeg and deno; arguments every run shares; link checks; readable errors |
| `inspect.rs` | `yt-dlp -J`, reduced to what the quality picker shows |
| `download.rs` | runs a download, reports progress, cancels, opens the folder |
| `install.rs` | writes the host manifests that tell each browser where the helper is |

Things it does deliberately:

- **Only `http(s)` links reach yt-dlp**, passed after `--` and with `--ignore-config`, so a link can't become
  an option and a local yt-dlp config can't change behaviour.
- **yt-dlp doesn't inherit stdin**, because stdin is the browser's message pipe.
- **Progress across streams:** yt-dlp reports video and audio streams one after the other. The helper turns
  that into one number that only moves forward, weighted by size when yt-dlp knows the total.
- **Partial files** go to `<cache>/ClipSave/partial/<job id>`. A failed or interrupted job keeps them so a retry
  resumes. Cancelling deletes them, and leftovers older than seven days are cleared on start.
- **Cancelling** stops yt-dlp's whole process group, so ffmpeg stops too. When the browser closes the pipe,
  every running job stops.
- **Showing a file** works only for paths inside the ClipSave folders.
- **Finding tools:** a browser started from the Dock passes a minimal `PATH`, so the helper also looks in
  `/opt/homebrew/bin`, `/usr/local/bin` and next to itself (`vendor/`).

## Messages

Every message is JSON with an `id` and a `type`. Requests get one reply with the same `id`. A download's `id`
is its job ID, and all its events carry it.

| Extension → helper | Reply or events |
|---|---|
| `hello` | `hello` with `helper: { version, ytDlp, ffmpeg, videoDir, audioDir }` |
| `inspect { url }` | `info { media }` or `error { message }` |
| `download { url, quality }` | `title`, then `progress { phase, percent, speedBytes, etaSec }` (at most every 0.4 s), then `done { path }` or `failed { message }` |
| `cancel` | nothing; the job ends quietly |
| `reveal { path }` | `revealed` or `error` |

`quality` is `{ kind: "best" }`, `{ kind: "video", height }` or `{ kind: "audio", format: "mp3" | "m4a" }`.
The helper turns it into the same yt-dlp format selectors the Android app uses. Types are mirrored in
`src/lib/types.ts` and `helper/src/protocol.rs`.

## Registration

Browsers only start a native host they find a manifest for. `clipsave-helper --install` writes
`link.clipsave.helper.json` into each browser's per-user folder:

- **Chromium browsers** allow the extension by ID (`allowed_origins`). The ID of unpacked builds comes from the
  `key` in `wxt.config.ts`. A Chrome Web Store listing gets its own ID, which has to be added to
  `CHROME_IDS` in `helper/src/install.rs`.
- **Firefox** allows it by add-on ID, `clipsave@clipsave.link` (`allowed_extensions`).
