<p align="center">
  <img src="public/icon/128.png" width="88" alt="">
</p>

<h1 align="center">ClipSave for browsers</h1>

<p align="center">
  Save videos and audio from 1000+ sites to your computer, right from Chrome or Firefox.<br>
  Free, open source and private. The desktop sibling of the <a href="https://clipsave.link">ClipSave Android app</a>.
</p>

<p align="center">
  <a href="https://github.com/sahedulislamrony/ClipSave-Extensions/actions/workflows/ci.yml"><img src="https://github.com/sahedulislamrony/ClipSave-Extensions/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest"><img src="https://img.shields.io/github/v/release/sahedulislamrony/ClipSave-Extensions?label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue" alt="License: GPL-3.0-or-later"></a>
</p>

<p align="center">
  <img src="docs/images/popup-picker.png" width="300" alt="The ClipSave popup listing video qualities from 1080p to 360p and two audio formats, each with its file size">
  &nbsp;
  <img src="docs/images/popup-downloads.png" width="300" alt="The Downloads tab with one download in progress, one failed with a retry button, and one saved">
</p>

## What it does

- **One click on a video page.** ClipSave reads the page and lists every quality with its file size.
- **Video or audio.** Save MP4 video, or MP3 / M4A audio.
- **Right-click to save.** Right-click a page or link and choose **ClipSave → Save video** or **Save audio**.
- **Keeps working in the background.** Close the popup and the download carries on. Cancel or retry any time.
- **Private.** No account, no analytics, no servers. Everything runs on your computer.

Files go to **Movies/ClipSave** (video) and **Music/ClipSave** (audio).

## Install

ClipSave has two parts: the browser extension, and a small **helper** app that does the downloading. Browser
extensions aren't allowed to run download tools, so the helper runs [yt-dlp](https://github.com/yt-dlp/yt-dlp)
for them.

1. Install the helper (macOS or Linux):

   ```bash
   curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh
   ```

2. Add the extension to your browser.

The full guide, with every browser and troubleshooting, is in **[docs/install.md](docs/install.md)**.

| | Chrome, Edge, Brave | Firefox |
|---|---|---|
| YouTube | Not supported (Chrome Web Store rule) | Supported |
| Other sites | Supported | Supported |

## Documentation

| | |
|---|---|
| [Install and use](docs/install.md) | For everyone: installing, using, updating, removing, troubleshooting |
| [Development](docs/development.md) | Building, running and testing from source |
| [Architecture](docs/architecture.md) | How the extension and helper fit together, and the message protocol |
| [Branching and releasing](docs/releasing.md) | The `dev` → `main` flow, checks, and how releases are published |
| [Contributing](CONTRIBUTING.md) | How to propose a change |
| [Privacy](PRIVACY.md) · [Security](SECURITY.md) | What ClipSave does with your data, and how to report a vulnerability |

## Please save responsibly

ClipSave is a tool for saving videos you have the right to keep: your own uploads, public-domain and
Creative Commons works, or videos a site lets you download. Respect copyright and each site's terms.

## License

[GPL-3.0-or-later](LICENSE). Third-party components and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
