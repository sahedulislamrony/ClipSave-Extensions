# Development

How to build, run and test ClipSave for browsers from source. Read [architecture.md](architecture.md) for how
the pieces fit together, and [CONTRIBUTING.md](../CONTRIBUTING.md) before opening a pull request.

## Prerequisites

| Tool | Version | Used for |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 or newer (CI uses 24, see `.nvmrc`) | the extension |
| [Rust](https://rustup.rs) | stable | the helper |
| Chrome and Firefox | current | trying it and the browser tests |

yt-dlp, ffmpeg and QuickJS don't need installing: `helper/fetch-engine.sh` downloads them into `helper/vendor`.
Works on macOS, Linux and Windows. On Windows, run the shell scripts from **Git Bash** (comes with
[Git for Windows](https://gitforwindows.org)).

## First setup

```bash
git clone git@github.com:sahedulislamrony/ClipSave-Extensions.git
cd ClipSave-Extensions
npm install
```

```bash
cd helper
./fetch-engine.sh
cargo build --release
./target/release/clipsave-helper --install
cd ..
```

- `fetch-engine.sh` downloads yt-dlp, ffmpeg/ffprobe and QuickJS into `helper/vendor` (about 250 MB unpacked),
  checking each against its published or pinned checksum. Run it again to update them.
  `fetch-engine.sh x86_64` or `fetch-engine.sh arm64` fetches the tools for that processor instead (used when
  packaging releases).
- `--install` registers *this* build of the helper with your browsers (`--browsers chrome,firefox` for just
  those). Run it again if you move the folder. `--uninstall` removes the registration.
- To try the installers without touching your own install, serve a release's files locally and point them at
  it, with a throwaway home folder: `HOME=$(mktemp -d) CLIPSAVE_RELEASE_URL=http://127.0.0.1:8000
  CLIPSAVE_YTDLP_URL=http://127.0.0.1:8000 sh scripts/install.sh --browsers chrome`.

## Run the extension

```bash
npm run build
```

Then load it:

- **Chrome:** `chrome://extensions` → Developer mode → **Load unpacked** → `.output/chrome-mv3`
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `.output/firefox-mv2/manifest.json`

After a change, run `npm run build` again and click reload on the extension. `npm run dev` (Chrome) and
`npm run dev:firefox` rebuild on save and open a browser with the extension loaded.

The Chrome build's ID is fixed (`engejhilbedikenhabjndbpgpdhaedge`) by the public key in `wxt.config.ts`, so
the helper accepts it wherever the folder is. The private key that matches it isn't needed to build.

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | Extension unit tests (vitest + WXT's fake browser): URL rules, formatting, the download queue | nothing |
| `npm run check` | TypeScript | nothing |
| `npm run lint:firefox` | Mozilla's add-on linter on the Firefox build | `npm run build:firefox` |
| `cargo test` (in `helper/`) | Helper unit tests, and protocol tests that run the real binary against a stub yt-dlp (macOS, Linux) | nothing |
| `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` | Rust lint and format | nothing |
| `npm run e2e` | Loads both builds into real Chrome and Firefox and saves a video through the real helper | see below |

The browser tests (`e2e/`) use throwaway browser profiles and a throwaway home folder, so they never touch your
own browsers or your Movies folder. On Windows, browsers find the helper only through the registry and the
helper saves to your real Videos and Music folders, so the tests point the registry at the test helper for the
run, then put back what was there and delete the test clip's files. A small server on your computer serves the test clip in
`e2e/fixtures/clip.mp4`, so they don't need the internet, except one step in each browser that tries YouTube and
accepts either outcome. Before running them:

```bash
npm run build
cargo build --release --manifest-path helper/Cargo.toml
sh helper/fetch-engine.sh
```

Run one browser with `npm run e2e:chrome` or `npm run e2e:firefox`. Set `CHROME_PATH` or `FIREFOX_PATH` if the
browser isn't in the usual place, and `CLIPSAVE_HELPER` to test a different helper binary (for example one
installed by `install.sh`). Screenshots land in `e2e/screenshots/`.

`npm run images` retakes the README pictures in `docs/images` from the real Chrome build and helper (build both
first, as above). It needs the internet: it reads three Blender open movies on YouTube for their titles, sizes and
thumbnails.

## Project layout

```
src/
  entrypoints/background.ts   the background script: queue, helper connection, right-click menu
  entrypoints/popup/          the popup (plain TypeScript and CSS, no framework)
  lib/                        shared code
public/icon/                  extension icons
wxt.config.ts                 per-browser manifest settings and zip names
helper/
  src/                        the helper (Rust): protocol, yt-dlp runs, browser registration
  tests/                      protocol tests and the stub yt-dlp they use
  fetch-engine.sh             downloads verified yt-dlp, ffmpeg and QuickJS into helper/vendor
tests/                        extension unit tests
e2e/                          browser tests and their test clip
scripts/
  version.mjs                 reads or sets the version in every file that holds it
  package-extension.sh        builds the release zips into dist/
  package-helper.sh           packs the helper and yt-dlp into dist/
  install.sh, install.ps1     the end-user installers (macOS/Linux, Windows), attached to every release
.github/                      workflows, rulesets, issue and pull request templates
```

## Useful details

- **Debugging the background script:** Chrome: `chrome://extensions` → ClipSave → **service worker**.
  Firefox: `about:debugging` → ClipSave → **Inspect**.
- **Talking to the helper by hand:** it reads and writes length-prefixed JSON on stdin/stdout (see
  [architecture.md](architecture.md#messages)). The protocol tests in `helper/tests/protocol.rs` show how.
- **Using other tools:** set `CLIPSAVE_ENGINE_DIR` to a folder that holds `yt-dlp` (or
  `yt-dlp_macos/yt-dlp_macos`), `ffmpeg` or `qjs`. The helper checks it before anywhere else.
  `clipsave-helper --version` shows which ones it found.
- **macOS and yt-dlp:** use the unpacked `yt-dlp_macos.zip` release, never the single-file `yt-dlp_macos`.
  Browsers mark files their child processes create as quarantined, and macOS then refuses the Python library the
  single-file build unpacks each time it starts. `fetch-engine.sh` already does the right thing.
- **Versions:** `release.json` holds the version, and `package.json` and `helper/Cargo.toml` must match it.
  `node scripts/version.mjs` prints it and fails if they disagree; `node scripts/version.mjs 1.2.0` sets all of
  them. Changing `release.json` is what publishes a release, see [releasing.md](releasing.md).
