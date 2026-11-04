#!/bin/sh
# Builds every extension file a release ships into dist/:
#   ClipSave-<version>-chrome.zip            for the Chrome Web Store (no development key)
#   ClipSave-<version>-chrome-unpacked.zip   for "Load unpacked"; its fixed ID matches the helper
#   ClipSave-<version>-firefox.zip           for addons.mozilla.org
#   ClipSave-<version>-sources.zip           the source code AMO asks for
#   clipsave-extension-chromium.tar.gz       the "Load unpacked" build again, for the installers: they keep
#                                            it next to the helper, where one-click updates replace it
set -eu

cd "$(dirname "$0")/.."
version=$(node scripts/version.mjs)
mkdir -p dist
rm -f dist/ClipSave-*-chrome*.zip dist/ClipSave-*-firefox.zip dist/ClipSave-*-sources.zip dist/clipsave-extension-*

npx wxt zip -b chrome --mode store
mv ".output/ClipSave-$version-chrome.zip" "dist/ClipSave-$version-chrome.zip"

npx wxt build -b chrome
(cd .output/chrome-mv3 && zip -qr "../../dist/ClipSave-$version-chrome-unpacked.zip" .)
# No version in the name, so the installers always fetch the latest release's copy. Unpacks to extension/.
stage=$(mktemp -d)
cp -R .output/chrome-mv3 "$stage/extension"
tar -czf dist/clipsave-extension-chromium.tar.gz -C "$stage" extension
rm -rf "$stage"

npx wxt zip -b firefox
mv ".output/ClipSave-$version-firefox.zip" ".output/ClipSave-$version-sources.zip" dist/

ls -1 dist/ClipSave-* dist/clipsave-extension-*
