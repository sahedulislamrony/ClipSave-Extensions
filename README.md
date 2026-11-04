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

- **One click on a video page.** ClipSave reads the page and lists every quality with its file size. Switch
  between Video and Audio, pick one, and click Download.
- **Video or audio.** Save MP4 video, or MP3 / M4A audio.
- **YouTube, in every browser.** Chrome, Edge, Brave and Firefox all save from YouTube.
- **Whole playlists.** Open a playlist, or a video that's part of one, pick a quality and which videos, and
  save them all. Each playlist gets its own folder.
- **Right-click to save.** Right-click a page or link and choose **ClipSave → Save video** or **Save audio**.
- **Keeps working in the background.** Close the popup and the download carries on. Cancel or retry any time.
- **Private.** No account, no analytics, no servers. Everything runs on your computer.

Files go to a **ClipSave** folder in your Videos (Movies on macOS) and Music folders. Works on macOS, Windows and
Linux.

## Install

ClipSave has two parts: the browser extension, and a small **helper** app that does the downloading with
[yt-dlp](https://github.com/yt-dlp/yt-dlp). Browser extensions aren't allowed to run download tools, so the
helper does it for them. It brings everything it needs, so there's nothing else to install.

1. Add the extension to Chrome, Edge, Brave or Firefox.
2. Click its button. It shows one command with a **Copy** button.
3. Paste it into Terminal (macOS, Linux) or PowerShell (Windows). The popup carries on by itself once it's done.

The full guide, with every browser and troubleshooting, is in **[docs/install.md](docs/install.md)**.

<p align="center">
  <img src="docs/images/popup-helper-missing.png" width="300" alt="The ClipSave popup's one-time setup: a single install command with a Copy button">
</p>

| | Chrome, Edge, Brave | Firefox |
|---|---|---|
| YouTube videos and playlists | Supported | Supported |
| Other sites | Supported | Supported |

ClipSave isn't published on the Chrome Web Store, whose rules don't allow YouTube downloads. Install it
unpacked as described in the install guide.

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
