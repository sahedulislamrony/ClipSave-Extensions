# Privacy policy

*ClipSave for browsers (the browser extension and the ClipSave Helper). Last updated 2026-11-07.*

**The extension and the helper collect no data.** They have no servers, no account, no analytics, no crash reporting
and no ads, and send nothing about you or what you save to the ClipSave project. The one thing counted is a run of
the install command, by the ClipSave website (below).

## What stays on your computer

* **The links you save.** When you click the ClipSave button, the extension reads the address and title of the
  current tab, only then and only for that tab. It passes the address to the ClipSave Helper on your computer,
  and shows the title while the helper reads the page.
* **Your download list** (titles, addresses, thumbnails, status) is kept in the browser's extension storage on
  your computer, newest 30 only. **Clear finished** in the Downloads tab, or removing the extension, deletes it.
* **Your settings:** the theme, whether to check for updates automatically and what the last check found are
  kept in the extension's storage, and the folders you choose in Settings are kept
  by the helper in a small file in your settings folder (`ClipSave/settings.json`).
* **The files you save** go to your Movies and Music folders, or the folders you chose in Settings. Unfinished downloads are kept in your cache folder
  so they can resume, and removed after seven days.

## Who your computer talks to

* **The website of the video you save.** To read and download it, the helper's copy of
  [yt-dlp](https://github.com/yt-dlp/yt-dlp) connects to that site directly, the same way your browser does when
  you watch it. That site's own privacy policy applies.
* **The video's thumbnail**, shown in the popup, loads from the website it belongs to.
* **YouTube, Vimeo and TikTok**, for a link to one of them: the popup asks that site's public oEmbed address for
  the video's title, channel and picture, so it can show them while the helper reads the link. The request
  carries the video's address and no cookies.
* **ext.clipsave.link**, the ClipSave website, when you run the install command the extension shows
  (`ext.clipsave.link/install.sh` or `install.ps1`). The site sends you the newest installer from GitHub and counts
  the run: the file name, and the browser or tool, approximate location and a one-way hash of the IP address that
  asked for it, as its [privacy policy](https://ext.clipsave.link/privacy) describes. Do Not Track and Global
  Privacy Control turn the count off, and the [install guide](docs/install.md#install-the-helper) gives the GitHub
  address of the same script, which isn't counted. The extension and the helper never contact the site themselves.
* **GitHub**, when you run the installer or click **Update** in Settings (to download a release and yt-dlp),
  when you click **Check now** in Settings, and once a day if you turn on **Check automatically** (off until you
  do). A check asks GitHub's public API for the newest ClipSave and yt-dlp version numbers; nothing about you
  or your downloads is sent. The Help links in Settings open GitHub pages only when you click them.
* **Firefox Add-ons**, if you installed ClipSave from there: Firefox checks it for updates, as it does for
  every add-on.

## Permissions the extension asks for

| Permission | Why |
|---|---|
| Communicate with cooperating native applications | Talk to the ClipSave Helper |
| Access the current tab when you click the button (`activeTab`) | Read the address of the video you want to save |
| Context menus | The right-click **ClipSave** menu |
| Storage | Keep your download list |
| Notifications | Tell you when a download finishes or fails |

## Changes

Changes to this policy are listed in [CHANGELOG.md](CHANGELOG.md) and visible in this file's history.

## Contact

Questions: **support@clipsave.link**, or [open an issue](https://github.com/sahedulislamrony/ClipSave-Extensions/issues).
