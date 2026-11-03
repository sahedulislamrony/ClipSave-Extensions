<!-- Release pull request: dev → main. Open it with ?template=release.md on the compare URL. -->

## Release

Version: **x.y.z**

## Before merging

- [ ] `dev` was tried in Chrome and Firefox with a real download (`npm run e2e` passes locally)
- [ ] `release.json` says the new version: `node scripts/version.mjs x.y.z` (also updates package.json and helper/Cargo.toml)
- [ ] `CHANGELOG.md`: **Unreleased** moved under `## [x.y.z] - YYYY-MM-DD`
- [ ] All checks pass: Extension, Helper (macOS/Linux/Windows), Browser tests (macOS/Windows), Branch rules, Release readiness, CodeQL

## After merging

Because `release.json` changed, the **Release** workflow runs every check again, then publishes `vx.y.z` with the
extension zips, the helper for every system and both installers. Check the release page and install it once on a clean profile. Merge with a **merge commit** (not
squash), so `dev` and `main` stay in step.
