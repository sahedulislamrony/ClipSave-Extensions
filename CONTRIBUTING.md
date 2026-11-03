# Contributing to ClipSave for browsers

Thanks for helping! ClipSave is small and private, so a few principles guide what gets merged:

* **No ads, analytics, trackers or remote code.** Pull requests that add any of these will be declined.
* **Fewer permissions is better.** New extension permissions need a strong reason.
* **Extractor problems belong upstream.** If a site stopped working, update yt-dlp first (run the installer
  again). If it still fails, report it to [yt-dlp](https://github.com/yt-dlp/yt-dlp/issues). ClipSave only
  wraps yt-dlp.
* **YouTube stays out of the Chrome build.** The Chrome Web Store rejects extensions that download from YouTube,
  and `src/lib/variant.ts` keeps that rule at build time. Changes that weaken it won't be merged.
* **Few words in the UI.** Match the existing popup: short labels, plain sentences.

## Reporting bugs and ideas

Use the [issue templates](../../issues/new/choose). For a bug, include your browser, operating system,
extension and helper versions, the kind of link (not a private link itself) and what the popup showed.
Search existing issues first. Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Development setup

Build, run and test instructions are in [docs/development.md](docs/development.md). Read
[docs/architecture.md](docs/architecture.md) for how the extension and helper fit together. Quick start:

```bash
git clone git@github.com:sahedulislamrony/ClipSave-Extensions.git
cd ClipSave-Extensions
npm install && npm run build
```

## Branches and pull requests

```
<username>/<topic>  ──PR──►  dev  ──PR (maintainer, after testing)──►  main  ──►  automatic release
   your branch            checks run             all checks run again
```

* **`main` is locked.** Nobody pushes to it, including the maintainer. It only changes through a release pull
  request from `dev`, and every merge there publishes a release.
* **`dev` is where work is integrated and tested.** Only the maintainer can push to it directly. Everyone else
  opens a pull request.
* **Your branch** is `<username>/<topic>`, created from `dev`, for example `sahed/fix-cancel` or
  `sahed/feature-windows`. Pull requests from branches named any other way are rejected by the
  **Branch rules** check.

Releases (version bump, changelog, the `dev` → `main` pull request) are described in
[docs/releasing.md](docs/releasing.md).

## Making a change

1. Fork the repo (or, with write access, clone it) and create your branch from `dev`:

   ```bash
   git switch dev && git pull
   git switch -c <username>/<topic>
   ```

2. Keep the change focused. Unrelated cleanups go in their own pull request.
3. Match the surrounding code: its naming, its comment density, and comments that explain *why*, not *what*.
   Rust is formatted with `cargo fmt`. TypeScript follows the existing style (two spaces, single quotes).
4. If behaviour or setup changes, update the docs ([README](README.md), [docs/](docs)) in the same pull request,
   and add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md). Don't touch `release.json` or the
   version; the maintainer does that when releasing.
5. Add or update tests for logic you change, and run them before pushing:

   ```bash
   npm run check && npm test && npm run build && npm run lint:firefox
   (cd helper && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
   ```

   For anything touching downloads, the helper or the popup, also run `npm run e2e`
   (see [docs/development.md](docs/development.md#tests)).
6. Open a pull request **into `dev`** using the template. These checks must pass before it can be merged:

   | Check | What it verifies |
   |---|---|
   | **Extension** | versions agree, type check, unit tests, Chrome and Firefox builds, Firefox add-on lint |
   | **Helper (macOS)**, **Helper (Linux)**, **Helper (Windows)** | `cargo fmt`, `cargo clippy`, unit and protocol tests |
   | **Browser tests (macOS)**, **Browser tests (Windows)** | both builds in real Chrome and Firefox, saving a video through the real helper |
   | **CodeQL** | code scanning for TypeScript, Rust and the workflow files |
   | **Branch rules** | your branch is `<username>/<topic>` and targets `dev` |

   Pull requests into `dev` are squash-merged.

Commit messages: a short imperative summary line (`Fix cancel leaving partial files`), then a body explaining the
why when it isn't obvious.

## Licensing of contributions

ClipSave is licensed under the [GPL-3.0-or-later](LICENSE). By submitting a contribution you agree it is
licensed under the same terms. New dependencies must be GPL-3.0 compatible (Apache-2.0, MIT, BSD, LGPL, GPL-3.0
are fine). Add bundled ones to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
