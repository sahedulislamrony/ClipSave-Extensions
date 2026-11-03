#!/bin/sh
# Packs a built helper with its yt-dlp into dist/clipsave-helper-<platform>.tar.gz.
# The file name has no version, so install.sh can always fetch the latest release's copy.
#
#   scripts/package-helper.sh <platform> <helper binary>
#   scripts/package-helper.sh macos helper/target/release/clipsave-helper
#
# Run helper/fetch-engine.sh first, on the same kind of system.
set -eu

platform=$1
binary=$2
cd "$(dirname "$0")/.."

test -x "$binary" || { echo "No helper binary at $binary" >&2; exit 1; }
test -d helper/vendor || { echo "No helper/vendor. Run helper/fetch-engine.sh first." >&2; exit 1; }

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/helper" dist
cp "$binary" "$stage/helper/clipsave-helper"
cp -R helper/vendor "$stage/helper/vendor"
cp LICENSE THIRD_PARTY_NOTICES.md "$stage/helper/"

archive="dist/clipsave-helper-$platform.tar.gz"
tar -czf "$archive" -C "$stage" helper
echo "$archive"
