# Branching and releasing

```
<username>/<topic> ──PR──► dev ──PR (maintainer)──► main ──(release.json changed?)──► Release workflow ──► GitHub Release
```

**`release.json` decides releases.** It holds one thing, the version:

```json
{ "version": "1.2.0" }
```

A merge into `main` publishes a release only when it changes `release.json`, the version it states is newer than
the latest release (by [semantic versioning](https://semver.org), so `1.0.0-rc.1` < `1.0.0`), and every check
passes. Merges that don't touch it, like docs or fixes waiting for the next release, publish nothing.

| Branch | Who can change it | How |
|---|---|---|
| `main` | nobody directly | pull request from `dev` only, merged with a **merge commit**; every merge can publish a release |
| `dev` | maintainer directly; everyone else by pull request | contributors' pull requests from `<username>/<topic>`, squash-merged |
| `<username>/<topic>` | its author | day-to-day work |

**Checks run on pull requests, not on the maintainer's direct pushes to `dev`.** A push straight to `dev` skips
every check, and the ruleset lets repository admins push there, which keeps day-to-day work fast. Everyone else
goes through a pull request, where the checks are required, and the release pull request into `main` runs them
all again.

The rules are enforced by two GitHub rulesets ([`.github/rulesets`](../.github/rulesets)) and these workflows:

| Workflow | When | Check name(s) |
|---|---|---|
| `ci.yml` | pull requests into `dev`/`main`, pushes to `main` | **Extension**, **Helper (macOS)**, **Helper (Linux)**, **Helper (Windows)**, **Browser tests (macOS)**, **Browser tests (Windows)** |
| `codeql.yml` | pull requests into `dev`/`main`, pushes to `main`, weekly | **Analyze (javascript-typescript)**, **Analyze (rust)**, **Analyze (actions)** |
| `branch-rules.yml` | pull requests into `dev`/`main` | **Branch rules**: `<username>/<topic>` → `dev`, only `dev` → `main` |
| `release-check.yml` | pull requests into `main` | **Release readiness**: if `release.json` changed, a newer version, a changelog entry and release zips that build; otherwise passes and says nothing will be released |
| `release.yml` | push to `main` that changes `release.json`, or by hand | runs CI again, builds everything, publishes the GitHub Release if the version is new |

What the checks run:

- **Extension:** versions agree, type check, unit tests, both builds, Firefox add-on lint.
- **Helper (macOS / Linux / Windows):** `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` (unit
  tests everywhere, protocol tests on macOS and Linux).
- **Browser tests (macOS / Windows):** builds everything with the same bundled tools a release has and runs
  `npm run e2e` against real Chrome and Firefox.

## Releasing a version

1. On `dev`, with everything for the release merged and tried in both browsers:
   - set the version: `node scripts/version.mjs x.y.z`. This writes `release.json`, which is what makes the
     merge publish, and keeps `package.json`, `package-lock.json`, `helper/Cargo.toml` and `helper/Cargo.lock`
     in step;
   - in `CHANGELOG.md`, move **Unreleased** under `## [x.y.z] - YYYY-MM-DD` and start a fresh **Unreleased**;
   - commit and push to `dev`.
2. Open the release pull request with the release template:

   ```bash
   gh pr create --base main --head dev --title "Release x.y.z" --body-file .github/PULL_REQUEST_TEMPLATE/release.md
   ```

3. Wait for every check: Extension, Helper (macOS, Linux, Windows), Browser tests (macOS, Windows), Branch rules,
   **Release readiness** (its summary says *Merging releases x.y.z*), CodeQL.
4. Merge with a **merge commit**.
5. Because `release.json` changed, the **Release** workflow starts. It runs every check again and, if they all
   pass, publishes `vx.y.z` with the `## [x.y.z]` changelog section as the notes.

To merge `dev` into `main` without releasing, leave `release.json` alone: Release readiness passes with *No
release*, and the Release workflow doesn't start.

### What a release contains

| File | For |
|---|---|
| `install.sh` | the helper installer for macOS and Linux (`curl … \| sh`) |
| `install.ps1` | the helper installer for Windows (`irm … \| iex`) |
| `clipsave-helper-macos-arm64.tar.gz` | the helper for Apple silicon Macs, with yt-dlp, ffmpeg and QuickJS |
| `clipsave-helper-macos-x86_64.tar.gz` | the helper for Intel Macs, with its tools |
| `clipsave-helper-linux-x86_64.tar.gz` | the helper for 64-bit Linux, with its tools |
| `clipsave-helper-windows-x86_64.zip` | the helper for 64-bit Windows, with its tools |
| `ClipSave-x.y.z-chrome-unpacked.zip` | Chrome, Edge, Brave: **Load unpacked** (fixed ID that matches the helper) |
| `ClipSave-x.y.z-chrome.zip` | the Chrome build without the development key; not published, since the Chrome Web Store doesn't allow YouTube downloads |
| `ClipSave-x.y.z-firefox.zip` | upload to Firefox Add-ons, or load temporarily |
| `ClipSave-x.y.z-firefox.xpi` | signed Firefox add-on, only with `AMO_CHANNEL` set to `unlisted` |
| `clipsave-extension-chromium.tar.gz` | the unpacked Chrome build again, for the installers: they keep it next to the helper, where one-click updates replace it |
| `ClipSave-x.y.z-sources.zip` | the source code Firefox Add-ons asks for |
| `SHA256SUMS.txt` | checksums of everything above; the installers check the helper against it |

The helper archives have no version in their names, so `releases/latest/download/install.sh` (and `.ps1`)
always install the newest helper. The command the extension shows, `ext.clipsave.link/install.sh` (and `.ps1`),
serves the newest release's installer from there.

If the Release run fails after the merge, fix the cause and run it again from **Actions → Release → Run
workflow** on `main`. It publishes only if `release.json` states a version newer than the latest release, so
running it by hand can't publish the same version twice. No tag exists until it succeeds.

## Publishing to the stores

Releases on GitHub are automatic. Store listings are done by hand.

- **Chrome Web Store:** not used. Every build saves from YouTube, which the store's rules don't allow, so
  Chrome, Edge and Brave users load `ClipSave-x.y.z-chrome-unpacked.zip`.
- **Firefox Add-ons**, the one store ClipSave is on. Firefox updates everyone who installed it there by
  itself, once Mozilla approves each version.
  1. **Once, by hand:** submit `ClipSave-x.y.z-firefox.zip` at
     [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) as a listed add-on, with
     `ClipSave-x.y.z-sources.zip` when asked for source code, and fill in the listing (description,
     screenshots, the privacy policy).
  2. **Then every release does it:** create API keys at
     [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/) and
     add them as the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repository secrets. The Release workflow submits
     each new version to the listing with its source code. It doesn't wait for the review.
  - The version must be new each time; AMO refuses one it has seen.
  - To sign without a public listing instead (a `.xpi` attached to each GitHub release, which doesn't update
    itself), set the repository variable `AMO_CHANNEL` to `unlisted`.
- **Chrome, Edge, Brave:** no store. The installers keep the extension next to the helper, and Settings
  updates it in one click; see [install.md](install.md#chrome-edge-or-brave).
- **yt-dlp** doesn't need a ClipSave release to stay current: one-click updates and the installers fetch
  yt-dlp's newest release, checked against its published checksums.

The Firefox listing needs a privacy policy link: use [PRIVACY.md](../PRIVACY.md).

## One-time repository setup

1. **Branches:** push `main` and `dev`, and keep `main` as the default branch.
2. **Rulesets:** import [`main.json`](../.github/rulesets/main.json) and [`dev.json`](../.github/rulesets/dev.json)
   under Settings → Rules → Rulesets → New ruleset → Import a ruleset, or with the GitHub CLI:

   ```bash
   gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/dev.json
   gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/main.json
   # update an existing one: gh api repos/OWNER/REPO/rulesets/ID --method PUT --input .github/rulesets/main.json
   ```

   - `main`: no bypass; pull request required; signed commits; the checks above; code scanning; merge commits only.
   - `dev`: pull request required for everyone except repository **admins** (the maintainer), who may push
     directly; the checks above (except Release readiness) and code scanning also apply to pull requests.
3. **Merge settings** (Settings → General → Pull Requests): allow merge commits and squash merging, and enable
   "Automatically delete head branches".
4. **Private vulnerability reporting** (Settings → Code security): on, so [SECURITY.md](../SECURITY.md) works.
5. **Optional secrets:** `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` for a signed Firefox add-on.
6. Dependency updates are done by hand; Dependabot version updates are off (no `.github/dependabot.yml`).

The **Chrome development key** (`keys/chrome.pem`, not in git) only matters if you ever need to sign a `.crx`
yourself. Builds use the public key in `wxt.config.ts`. Back the private key up anyway.

## Checking a release

```bash
shasum -a 256 -c SHA256SUMS.txt
```
