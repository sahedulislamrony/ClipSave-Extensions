<!-- Release pull request: dev → main. Open it with ?template=release.md on the compare URL. -->

## Release

Version: **x.y.z**

## Before merging

- [ ] `dev` was tried in Chrome and Firefox with a real download (`npm run e2e` passes locally)
- [ ] Version bumped with `node scripts/version.mjs x.y.z` (package.json and helper/Cargo.toml)
- [ ] `CHANGELOG.md`: **Unreleased** moved under `## [x.y.z] - YYYY-MM-DD`
- [ ] All checks pass: Extension, Helper (macOS), Helper (Linux), Browser tests, Branch rules, Release readiness, CodeQL

## After merging

The **Release** workflow runs every check again, then publishes `vx.y.z` with the extension zips, the helper and
`install.sh`. Check the release page and install it once on a clean profile. Merge with a **merge commit** (not
squash), so `dev` and `main` stay in step.
