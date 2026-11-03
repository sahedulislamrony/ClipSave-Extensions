# Install and use ClipSave

ClipSave has two parts, and you need both:

1. **The ClipSave Helper**, a small app on your computer. It does the downloading with
   [yt-dlp](https://github.com/yt-dlp/yt-dlp) and saves the files. Browsers don't let extensions run
   download tools themselves, which is why it's a separate app.
2. **The ClipSave extension** in your browser. It's the button and popup you use.

Supported: **macOS** (Apple silicon and Intel) and **64-bit Linux**, with **Chrome, Edge, Brave and Firefox**.
Windows isn't supported yet.

## Install the helper

Open **Terminal** and run:

```bash
curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh
```

The installer:

- downloads the helper for your system from the latest release and checks it against the published checksum
- puts it in `~/Library/Application Support/ClipSave` (macOS) or `~/.local/share/clipsave` (Linux)
- tells Chrome, Edge, Brave, Chromium and Firefox where to find it

It needs two free tools that it doesn't install for you. It tells you if either is missing.

| Tool | Why | macOS ([Homebrew](https://brew.sh)) | Linux |
|---|---|---|---|
| ffmpeg | Joins video and audio, and makes MP3s | `brew install ffmpeg` | `sudo apt install ffmpeg` |
| deno | Needed for YouTube (Firefox only) | `brew install deno` | see [deno.com](https://deno.com) |

> **Why Terminal and not a download?** The helper isn't signed by Apple yet, so macOS would block a copy you
> download in a browser. Installing from Terminal avoids that.

## Add the extension

### Chrome, Edge or Brave

ClipSave isn't on the Chrome Web Store yet. Until it is:

1. Download `ClipSave-<version>-chrome-unpacked.zip` from the
   [latest release](https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest) and unzip it.
   Keep the folder somewhere permanent, for example in Documents. The browser loads it from there each time.
2. Open the extensions page: `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions`
   (Brave).
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the unzipped folder.
5. Pin ClipSave to the toolbar: click the puzzle-piece icon, then the pin next to ClipSave.

The Chrome version can't save from **YouTube**: the Chrome Web Store doesn't allow it, and this version follows
the same rule. Other sites work.

### Firefox

- **If the release has a `.xpi` file** (`ClipSave-<version>-firefox.xpi`): open it in Firefox and choose **Add**.
- **Otherwise**, until ClipSave is on Firefox Add-ons, load it for the current session:
  1. Download `ClipSave-<version>-firefox.zip` from the
     [latest release](https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest) and unzip it.
  2. Open `about:debugging#/runtime/this-firefox`.
  3. Choose **Load Temporary Add-on** and select `manifest.json` in the unzipped folder.

  Firefox removes temporary add-ons when it closes, so you'll need to repeat this after a restart.

## Use it

- **From a video page:** click the ClipSave button. It reads the page and lists the qualities with their sizes.
  Click one to save it. It usually takes a few seconds to appear.
- **From a link:** paste any video link into the box at the top and press **Find**.
- **Right-click:** on a page or a link, choose **ClipSave → Save video** (best quality) or **Save audio (MP3)**.
- **Downloads tab:** shows progress. Use **✕** to cancel, **↻** to retry a stopped download, and the folder
  icon to show the file. Downloads continue when the popup is closed, and the toolbar button shows how many are
  running.

Files are saved to:

| | macOS | Linux |
|---|---|---|
| Video | `~/Movies/ClipSave` | `~/Videos/ClipSave` (or `~/Movies/ClipSave`) |
| Audio | `~/Music/ClipSave` | `~/Music/ClipSave` |

## Update

- **Helper:** run the install command again. It replaces the helper and its yt-dlp with the newest release.
  Do this first if a site stops working.
- **Extension:** download the new zip, replace the old folder's contents, and click the reload icon on
  ClipSave in the extensions page.

## Remove

```bash
curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh -s -- --uninstall
```

This removes the helper and unregisters it from your browsers. Then remove the extension from the extensions
page. Your saved videos are not touched.

## Troubleshooting

| What you see | What to do |
|---|---|
| **One more step: ClipSave needs a small desktop helper** | The helper isn't installed, or the browser started before it was. Run the install command, then quit and reopen the browser. |
| **Chrome Web Store rules don't allow YouTube downloads** | Expected in Chrome, Edge and Brave. Use Firefox for YouTube. |
| **No video found on this page** | yt-dlp doesn't recognise a video there. Try the video's own page or link rather than a page that embeds it. |
| **This post needs a signed-in account** | Private posts (often Instagram or Facebook) need a login, which this version doesn't support yet. |
| **No connection** | Check your internet connection and try again. |
| **This video has no sound to save** | You picked audio for a video without a sound track. Save the video instead. |
| MP3 or high-quality saves fail | Install ffmpeg (see above). |
| YouTube fails in Firefox | Install deno (see above) and run the install command again to update yt-dlp. |
| A site that used to work fails | Run the install command again to get the newest yt-dlp. If it still fails, check [yt-dlp's issues](https://github.com/yt-dlp/yt-dlp/issues). |

Still stuck? [Open an issue](https://github.com/sahedulislamrony/ClipSave-Extensions/issues/new/choose) with
your browser, system and what the popup says.

## Privacy

ClipSave has no servers and collects nothing. See [PRIVACY.md](../PRIVACY.md).
