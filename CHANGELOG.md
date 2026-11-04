# Changelog

All notable changes to ClipSave for browsers are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The extension and the helper share one version.

## [Unreleased]

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
