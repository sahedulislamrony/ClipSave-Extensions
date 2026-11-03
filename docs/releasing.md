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
| `ClipSave-x.y.z-chrome.zip` | upload to the Chrome Web Store (no development key) |
| `ClipSave-x.y.z-firefox.zip` | upload to Firefox Add-ons, or load temporarily |
| `ClipSave-x.y.z-firefox.xpi` | signed Firefox add-on, only when the AMO secrets are set |
| `ClipSave-x.y.z-sources.zip` | the source code Firefox Add-ons asks for |
| `SHA256SUMS.txt` | checksums of everything above; the installers check the helper against it |

The helper archives have no version in their names, so `releases/latest/download/install.sh` (and `.ps1`)
always install the newest helper. That's also the command the extension shows.

If the Release run fails after the merge, fix the cause and run it again from **Actions → Release → Run
workflow** on `main`. It publishes only if `release.json` states a version newer than the latest release, so
running it by hand can't publish the same version twice. No tag exists until it succeeds.

## Publishing to the stores

Releases on GitHub are automatic. Store listings are done by hand.

- **Chrome Web Store:** upload `ClipSave-x.y.z-chrome.zip`. After the first upload, add the listing's ID to
  `CHROME_IDS` in `helper/src/install.rs` and release a new helper. Without that, the helper refuses the store
  version. Users must still install the helper; link [docs/install.md](install.md#install-the-helper) in the
  listing.
- **Firefox Add-ons:** upload `ClipSave-x.y.z-firefox.zip` and, when asked for source code,
  `ClipSave-x.y.z-sources.zip`. To get a signed `.xpi` on every GitHub release without a public listing, create
  API keys at [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/)
  and add them as the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repository secrets.

Both stores need a privacy policy link: use [PRIVACY.md](../PRIVACY.md).

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
