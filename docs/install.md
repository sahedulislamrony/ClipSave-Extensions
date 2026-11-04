# Install and use ClipSave

ClipSave has two parts:

1. **The ClipSave extension** in your browser: the button and popup you use.
2. **The ClipSave Helper**, a small app that does the downloading. Browsers don't let extensions run download
   tools, so the helper does it for them. It comes with everything it needs ([yt-dlp](https://github.com/yt-dlp/yt-dlp),
   ffmpeg and a JavaScript runtime), so there's nothing else to install.

Works on **macOS** (Apple silicon and Intel), **Windows 10 and 11** (64-bit) and **64-bit Linux**, with
**Chrome, Edge, Brave and Firefox**.

## In short

1. [Add the extension](#add-the-extension) to your browser.
2. Click the **ClipSave** button. It shows one command; click **Copy**.
3. Paste it into **Terminal** (macOS, Linux) or **PowerShell** (Windows) and press Return.

That's all. The popup notices the helper as soon as it's installed and carries on, with no browser restart.

## Add the extension

### Chrome, Edge or Brave

ClipSave is installed unpacked. The easiest way also gives you one-click updates:

1. Run the [install command](#install-the-helper) first. Besides the helper, it puts the extension in a
   folder next to it and prints where:
   - macOS: `~/Library/Application Support/ClipSave/extension`
   - Linux: `~/.local/share/clipsave/extension`
   - Windows: `%LOCALAPPDATA%\ClipSave\extension`
2. Open `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions` (Brave).
3. Turn on **Developer mode** and choose **Load unpacked**, then select that folder.
4. Pin ClipSave: click the puzzle-piece icon, then the pin next to ClipSave.

Loaded from that folder, ClipSave updates in one click from **Settings → Updates**. (You can also load
`ClipSave-<version>-chrome-unpacked.zip` from the [latest release](https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest),
unzipped into a permanent folder; Settings then shows how to switch to the self-updating folder, keeping your
downloads and settings.)

ClipSave isn't on the Chrome Web Store, whose rules don't allow YouTube downloads, so loading it unpacked
is the way to install it. Every browser saves from YouTube, videos and playlists alike.

### Firefox

- **From Firefox Add-ons:** add ClipSave from its Firefox Add-ons page. Firefox keeps it up to date by itself.
- **For testing**, load a build for the current session: download
  `ClipSave-<version>-firefox.zip` from the [latest release](https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest),
  unzip it, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and select
  `manifest.json`. Firefox removes temporary add-ons when it closes.

## Install the helper

The extension shows this command when it needs the helper, with a **Copy** button. You can also run it
yourself.

**macOS and Linux**, in Terminal:

```bash
curl -fsSL https://ext.clipsave.link/install.sh | sh
```

**Windows**, in PowerShell (Start menu → type *PowerShell*):

```powershell
irm https://ext.clipsave.link/install.ps1 | iex
```

`ext.clipsave.link/install.sh` and `install.ps1` serve the newest release's script straight from GitHub, and the
site counts each run (see [PRIVACY.md](../PRIVACY.md)). To skip the count, use the same script from the release
itself: `https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh` (or
`install.ps1`).

The installer downloads about 110 MB, checks it against the release's published checksums, installs it for
your user only (no administrator password) and tells your browsers where it is:

| | Installed in |
|---|---|
| macOS | `~/Library/Application Support/ClipSave` |
| Linux | `~/.local/share/clipsave` |
| Windows | `%LOCALAPPDATA%\ClipSave` |

> **Why a command and not a download?** The helper isn't signed by Apple or Microsoft yet, so a copy
> downloaded in a browser would be blocked or warned about. Installing from Terminal or PowerShell avoids that.

## Use it

- **From a video page:** click the ClipSave button. It reads the page and lists the qualities with their sizes.
  Change the **File name** if you like (it starts as the video's title), switch between **Video** and **Audio**,
  pick a quality (1080p and up are tagged **HD**, 2160p **4K**) and click **Download**. ClipSave never replaces a
  file: a second "Song" is saved as "Song (2)".
- **From a link:** paste any video link into the box at the top and press **Find**.
- **Playlists:** open a playlist page (or paste its link) and ClipSave lists its videos. On a video that's part
  of a playlist, choose **Save the whole playlist**. Rename the **Folder name** if you like, choose how files are
  numbered (**1 → N** puts "01 - " in front of the first video, **N → 1** counts down, **None** leaves names
  as they are), pick Video or Audio and a quality, untick any videos you don't want, and click **Download**. Sizes there are estimates (marked ≈) from each video's length. Each video downloads on its own, three at a time, into a folder named after the playlist. Very long
  playlists show their first 1000 videos.
- **Right-click:** on a page or a link, choose **ClipSave → Save video** (best quality) or **Save audio (MP3)**.
- **Downloads tab:** shows progress. Use **✕** to cancel, **↻** to retry a stopped download, and the folder
  icon to show the file. **Cancel all** stops everything still waiting or running. Downloads continue with the popup closed, and the toolbar button shows how many are
  running.

Files are saved to **ClipSave** folders inside your Videos (Movies on macOS) and Music folders, or the folders
you choose in Settings. Playlist videos go into a folder of their own inside it:
`<video or audio folder>/<playlist name>/07 - <video title>.mp4`.

## Settings

Click the gear in the popup, or **Extension options** on the extensions page. Settings opens in its own tab:

- **Updates:** **Check for updates** compares your extension and helper with the newest release and shows how
  to update either one.
- **Save folders:** choose separate folders for videos and audio with **Browse…**, or type a full path and press
  Return. **Use default** goes back to the ClipSave folders.
- **Appearance:** System, Light or Dark, for the popup too.
- **About:** versions, where the helper and its tools are, and **Copy details** for bug reports.
- **Help and feedback:** this guide, bug reports (with your versions filled in), feature requests, the privacy
  policy, release notes and the source code.

## Update

**Settings → Updates** shows whether anything is out of date. Turn on **Check automatically** to have
ClipSave look once a day and tell you (in the popup, and once per version as a notification); it's off until
you turn it on.

- **One click:** **Update ClipSave** downloads the newest release, checks it against its published checksums,
  and replaces the helper, its tools and, on Chrome, Edge and Brave loaded from the helper's folder, the
  extension, which then restarts by itself. **Update yt-dlp** replaces only yt-dlp, which sites change for
  most often, from yt-dlp's own newest release. Updates wait until no download is running.
- **Firefox** updates the extension from Firefox Add-ons by itself, usually within a day.
- **By hand**, any time: run the install command again. It does the same as **Update ClipSave**.

## Remove

**macOS, Linux:**

```bash
curl -fsSL https://ext.clipsave.link/install.sh | sh -s -- --uninstall
```

**Windows (PowerShell):**

```powershell
& ([scriptblock]::Create((irm https://ext.clipsave.link/install.ps1))) -Uninstall
```

This removes the helper and unregisters it from your browsers. Then remove the extension from the extensions
page. Your saved videos are not touched.

## Troubleshooting

| What you see | What to do |
|---|---|
| **One more step** stays after installing | Check the installer finished with **Done**. If the browser was already open when you installed, close the popup and open it again. |
| **No video found on this page** | yt-dlp doesn't recognise a video there. Try the video's own page or link rather than a page that embeds it. |
| **This post needs a signed-in account** | Private posts (often Instagram or Facebook) need a login, which this version doesn't support yet. |
| **No connection** | Check your internet connection and try again. |
| **This video has no sound to save** | You picked audio for a video without a sound track. Save the video instead. |
| A site that used to work fails | Run the install command again to get the newest yt-dlp. If it still fails, check [yt-dlp's issues](https://github.com/yt-dlp/yt-dlp/issues). |
| Windows: "running scripts is disabled" | Use the `irm … \| iex` command exactly as shown; it doesn't need script permissions. |

To see what the helper found, run `clipsave-helper --version` from its folder. It lists the yt-dlp, ffmpeg
and JavaScript runtime it uses. Still stuck? [Open an issue](https://github.com/sahedulislamrony/ClipSave-Extensions/issues/new/choose)
with your browser, system, that output and what the popup says.

## Privacy

ClipSave has no servers and collects nothing. See [PRIVACY.md](../PRIVACY.md).
