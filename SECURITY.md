# Security policy

## Supported versions

Only the latest release receives security fixes. Please update before reporting.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

* Preferred: GitHub's private reporting, **Security → Report a vulnerability** on the
  [repository](https://github.com/sahedulislamrony/ClipSave-Extensions/security/advisories/new).
* Or email **sahedul.dev@gmail.com** with the subject `ClipSave extension security`.

Include what you found, steps to reproduce, the affected version, and the impact you see. You can expect an
acknowledgement within a few days and a fix or a clear answer as soon as it can be assessed. Please give us
reasonable time to release a fix before disclosing publicly; we are happy to credit you.

## Scope

In scope: the extension, the ClipSave Helper, `install.sh`, and the build and release workflows. Of particular
interest:

* anything that lets a web page talk to the extension or the helper
* links or messages that make the helper run something other than yt-dlp with the intended options
* the helper reading, writing or opening files outside the ClipSave folders
* the installer installing something other than the published, checksummed release files

Out of scope: vulnerabilities in [yt-dlp](https://github.com/yt-dlp/yt-dlp), FFmpeg, Deno, the browsers or the
websites ClipSave talks to (report those upstream), and issues that need someone to already control your user
account.

## How it's built to be safe

* The extension has no content scripts and no host permissions, so web pages can't send it messages.
* Only this extension can start the helper: its registration names the extension's ID.
* The helper passes only `http(s)` links to yt-dlp, after `--` and with `--ignore-config`, and doesn't let yt-dlp
  read the browser's message pipe.
* The helper only opens files inside the ClipSave folders.
* `install.sh` checks the helper archive against `SHA256SUMS.txt` from the same release before installing it.

## Verifying a download

Every release has a `SHA256SUMS.txt`. Check the files you downloaded with:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

The helper isn't signed by Apple yet, which is why the macOS install goes through Terminal; see
[docs/install.md](docs/install.md).

## Data handling

ClipSave has no servers and collects nothing; see [PRIVACY.md](PRIVACY.md).
