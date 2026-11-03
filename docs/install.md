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

Until ClipSave is on the Chrome Web Store:

1. Download `ClipSave-<version>-chrome-unpacked.zip` from the
   [latest release](https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest) and unzip it.
   Keep the folder somewhere permanent, for example in Documents. The browser loads it from there each time.
2. Open `chrome://extensions` (Chrome), `edge://extensions` (Edge) or `brave://extensions` (Brave).
3. Turn on **Developer mode** and choose **Load unpacked**, then select the unzipped folder.
4. Pin ClipSave: click the puzzle-piece icon, then the pin next to ClipSave.

The Chrome version can't save from **YouTube**: the Chrome Web Store doesn't allow it, and this version
follows the same rule. Other sites work. Use Firefox for YouTube.

### Firefox

- **If the release has a `.xpi` file** (`ClipSave-<version>-firefox.xpi`): open it in Firefox and choose **Add**.
- **Otherwise**, until ClipSave is on Firefox Add-ons, load it for the current session: download
  `ClipSave-<version>-firefox.zip` from the [latest release](https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest),
  unzip it, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and select
  `manifest.json`. Firefox removes temporary add-ons when it closes.

## Install the helper

The extension shows this command when it needs the helper, with a **Copy** button. You can also run it
yourself.

**macOS and Linux**, in Terminal:

```bash
curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh
```

**Windows**, in PowerShell (Start menu → type *PowerShell*):

```powershell
irm https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.ps1 | iex
```

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
  Click one to save it.
- **From a link:** paste any video link into the box at the top and press **Find**.
- **Right-click:** on a page or a link, choose **ClipSave → Save video** (best quality) or **Save audio (MP3)**.
- **Downloads tab:** shows progress. Use **✕** to cancel, **↻** to retry a stopped download, and the folder
  icon to show the file. Downloads continue with the popup closed, and the toolbar button shows how many are
  running.

Files are saved to **ClipSave** folders inside your Videos (Movies on macOS) and Music folders.

## Update

- **Helper:** run the install command again. It replaces the helper and its tools with the newest release. Do
  this first if a site stops working.
- **Extension:** download the new zip, replace the old folder's contents, and click the reload icon on ClipSave
  in the extensions page.

## Remove

**macOS, Linux:**

```bash
curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh -s -- --uninstall
```

**Windows (PowerShell):**

```powershell
& ([scriptblock]::Create((irm https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.ps1))) -Uninstall
```

This removes the helper and unregisters it from your browsers. Then remove the extension from the extensions
page. Your saved videos are not touched.

## Troubleshooting

| What you see | What to do |
|---|---|
| **One more step** stays after installing | Check the installer finished with **Done**. If the browser was already open when you installed, close the popup and open it again. |
| **Chrome Web Store rules don't allow YouTube downloads** | Expected in Chrome, Edge and Brave. Use Firefox for YouTube. |
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
