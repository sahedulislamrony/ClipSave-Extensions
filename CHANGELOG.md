# Changelog

All notable changes to ClipSave for browsers are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The extension and the helper share one version.

## [Unreleased]

### Security
- **A video's title can no longer put a saved file outside the ClipSave folder.** yt-dlp expands `$VAR`,
  `${VAR}` and a leading `~` in file names, so a title like `${TMPDIR}x` could land somewhere else. Those
  characters are now saved as look-alikes (`＄`, `～`), and the helper refuses any file yt-dlp reports outside
  the folder.
- **The helper no longer accepts the old Firefox add-on ID** `clipsave@clipsave.link`, which belongs to someone
  else on Firefox Add-ons. Only `clipsave@sahedulislamrony.github.io` can talk to it.
- One-click updates download the installer in full before running it, and no download (updates, the
  installer, release builds) follows a redirect off https.
- Thumbnails from sites must be web links. Settings only links to files in ClipSave's own releases.
- Folder and file names that Windows reserves for devices (`CON`, `NUL`, `COM1`…) get a `_`, two downloads
  can't share one job, and the helper no longer falls back to the shared temp folder for its settings,
  partial files or update log.
- "Show in folder" on Windows selects the right file even when its name holds a comma.
- Releases only publish from `main`, through a `release` environment that holds the Firefox Add-ons keys, and
  those keys reach only the step that signs. Actions are pinned to commits (kept current by Dependabot), and
  Rust builds use the committed `Cargo.lock`.
- **The ffmpeg in each release is pinned** to exact builds and SHA-256s in `helper/engine.lock`
  (`node scripts/pin-engines.mjs` moves to newer ones), and **the bundled yt-dlp must carry yt-dlp's GPG
  signature**.
- Every release file comes with a build attestation: `gh attestation verify <file> --repo
  sahedulislamrony/ClipSave-Extensions` shows it was built by this repository's Release workflow.
- CI runs `npm audit` and `cargo audit` on every pull request, and Dependabot opens security updates.

## [1.3.0] - 2026-11-07

### Added
- **The installer asks which browsers you use**, with the ones on your computer already ticked, and connects
  just those. `--browsers chrome,firefox` or `--all` (`-Browsers`, `-All` on Windows) skip the question. It
  remembers the choice for the next run and for one-click updates.
- **A `clipsave-helper` command.** The installer adds it to your `PATH`; `--no-modify-path` (`-NoModifyPath`)
  leaves `PATH` alone. The helper takes `--install --browsers <list>`, `--install --all` and `--help`.

- **Playlists read 100 videos at a time**, so long playlists and endless Mixes show in seconds. **Load next 100**
  (or **Load remaining N**) under the list reads more; new videos start unticked, and files keep the number of
  their place in the whole playlist.

### Changed
- **A video shows straight away.** The popup shows a YouTube video's picture and the tab's title as soon as it
  opens, then the title and channel from YouTube, Vimeo or TikTok, while the qualities load. It no longer waits
  for the helper's version check before reading the page.
- **Cleaner titles and file names.** Facebook's view, reaction and comment counts are left out, and the page name
  after the caption. When a title says nothing ("Video by someone" on Instagram), the caption's first words are
  used, and failing that "Facebook video", "Instagram video" and so on. Long captions are cut after a whole word.
- **A playlist's picture is its first video's**, as in the Android app.
- **The installer shows every step as it goes**, in color, with a progress bar for each download, so it never
  looks stuck. It ends with how to add the extension to each browser you picked, skipping browsers that
  already have it, and copies the extension's folder path for **Load unpacked**.
- On Windows the installer unpacks with Windows' own `tar`, which is much faster than before.

- **Settings → Help and feedback** and the popup's Help link open ClipSave's website (install steps, bug and feature
  forms, privacy policy, release notes) instead of GitHub. **Report a bug** fills in your versions, browser and system.

### Fixed
- Running `clipsave-helper` with no options in a terminal shows its help instead of waiting silently.

## [1.2.1] - 2026-11-04

### Changed
- The install command is shorter: `curl -fsSL https://ext.clipsave.link/install.sh | sh` (macOS, Linux) and
  `irm https://ext.clipsave.link/install.ps1 | iex` (Windows). The site serves the newest release's installer from
  GitHub and counts each run; the GitHub address still works and isn't counted. See PRIVACY.md.
- The popup shows the install command on one line.

## [1.2.0] - 2026-11-04

### Added
- **YouTube in every browser.** Chrome, Edge and Brave now save from YouTube, like Firefox. ClipSave isn't
  published on the Chrome Web Store, so its rule against YouTube downloads no longer applies.
- **Playlist downloads.** A playlist link lists its videos; a video that's part of a playlist offers **Save the
  whole playlist**. Pick a quality and which videos, and each one downloads on its own into a folder named after
  the playlist, with one notification when the playlist is done.
- **Name your files.** A single video's file name starts as its title and can be changed before saving. A
  playlist's folder name can be changed too, and its files numbered **1 → N**, **N → 1** or not at all
  ("07 - Title", padded like the app), with the first file name previewed. Files go to
  `<video or audio folder>/<playlist name>/`. A file is never replaced: a second "Song" becomes "Song (2)".
- **One-click updates.** Settings → Updates downloads the newest release, checks it against its published
  checksums and replaces the helper, its tools and, on Chrome, Edge and Brave, the extension, which restarts by
  itself. The install command now keeps the extension next to the helper for that: load it from there once.
  **Update yt-dlp** brings yt-dlp's newest release between ClipSave releases. Updates wait for running
  downloads.
- **Check for updates automatically**, once a day, as an option in Settings (off until turned on). A new
  version shows in the popup and as one notification.
- Releases are submitted to the Firefox Add-ons listing, so Firefox keeps ClipSave up to date.
- **Settings**, in its own tab (the gear in the popup): check for updates to the extension and the helper, choose
  separate folders for videos and audio, pick the theme, see versions and where the helper's tools are, and
  find help, the privacy policy, bug reports and feature requests.
- **Cancel all** in the Downloads tab.

### Changed
- A new popup design that matches the ClipSave app: a **Video | Audio** switch, quality rows with **HD** and
  **4K** tags and their sizes, a tick on the chosen row, and one **Download** button. Playlists list each video
  with its thumbnail and length, and show an approximate size (≈) for every quality and for the whole selection.
  Downloads show as cards with the video's thumbnail. Corners are softly rounded throughout, never pill-shaped.
- A single video is saved under its title, "Title.mp4", instead of "Title [id].mp4". Right-click saves keep the
  old name.
- The Firefox add-on's ID is now `clipsave@sahedulislamrony.github.io`, because `clipsave@clipsave.link` is
  taken on Firefox Add-ons. The helper accepts both, so earlier Firefox installs keep working; to get updates
  from Firefox Add-ons, install ClipSave from there.
- The install command also installs the extension for Chrome, Edge and Brave next to the helper, and fetches
  yt-dlp's newest release instead of keeping the one the release was built with.

### Fixed
- Adding many downloads at once no longer drops waiting ones from the list: only finished downloads past the
  newest 30 are removed.

## [1.1.0] - 2026-11-04

### Added
- A theme button in the popup steps through **System**, **Light** and **Dark**, and the popup remembers the choice.

### Changed
- New crimson logo and colours in the popup and the extension icon.

### Fixed
- The helper installer no longer fills a narrow terminal with rows of `#` while it downloads, and skips the
  progress bar when there's no terminal.
- Installing the helper no longer stops at a browser it can't register with, which left later browsers (such as
  Brave and Firefox on a Mac without Edge) unregistered. It now registers with the browsers that are set up,
  reports any that fail, and carries on.

## [1.0.0] - 2026-11-03

### Added
- First release: the ClipSave extension for **Chrome, Edge, Brave and Firefox**, built from one codebase, and
  the ClipSave Helper for **macOS, Windows and Linux**.
- One-step setup: when the helper is missing, the popup shows the one command that installs it, with a **Copy**
  button, and carries on by itself as soon as it's installed. No browser restart.
- The popup reads the current page and lists every quality with its file size, plus MP3 and M4A audio.
  Any video link can also be pasted.
- Right-click menu: **ClipSave → Save video** and **Save audio (MP3)** on pages and links.
- Downloads tab with progress, cancel, retry, **Show in folder** and **Clear finished**. Downloads continue
  with the popup closed, and the toolbar button shows how many are running.
- The **ClipSave Helper** runs yt-dlp on your computer and saves to ClipSave folders in your Videos (Movies) and
  Music folders. It brings its own ffmpeg and JavaScript runtime (QuickJS), so there's nothing else to
  install. Installers with checksum verification: `install.sh` (macOS, Linux) and `install.ps1` (Windows).
  `clipsave-helper --version` lists the tools it found.
- The Chrome version doesn't save from YouTube, following the Chrome Web Store rules. The Firefox version does.
