# Changelog

All notable changes to ClipSave for browsers are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The extension and the helper share one version.

## [Unreleased]

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
