#!/bin/sh
# Builds every extension file a release ships into dist/:
#   ClipSave-<version>-chrome.zip            for the Chrome Web Store (no development key)
#   ClipSave-<version>-chrome-unpacked.zip   for "Load unpacked"; its fixed ID matches the helper
#   ClipSave-<version>-firefox.zip           for addons.mozilla.org
#   ClipSave-<version>-sources.zip           the source code AMO asks for
set -eu

cd "$(dirname "$0")/.."
version=$(node scripts/version.mjs)
mkdir -p dist
rm -f dist/ClipSave-*-chrome*.zip dist/ClipSave-*-firefox.zip dist/ClipSave-*-sources.zip

npx wxt zip -b chrome --mode store
mv ".output/ClipSave-$version-chrome.zip" "dist/ClipSave-$version-chrome.zip"

npx wxt build -b chrome
(cd .output/chrome-mv3 && zip -qr "../../dist/ClipSave-$version-chrome-unpacked.zip" .)

npx wxt zip -b firefox
mv ".output/ClipSave-$version-firefox.zip" ".output/ClipSave-$version-sources.zip" dist/

ls -1 dist/ClipSave-*
