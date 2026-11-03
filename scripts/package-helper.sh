#!/bin/sh
# Packs a built helper with everything in helper/vendor into dist/clipsave-helper-<platform>.tar.gz (or .zip
# on Windows). The file name has no version, so the installers always fetch the latest release's copy.
#
#   scripts/package-helper.sh <platform> <helper binary>
#   scripts/package-helper.sh macos-arm64 helper/target/release/clipsave-helper
#
# Platforms: macos-arm64, macos-x86_64, linux-x86_64, windows-x86_64. Run helper/fetch-engine.sh for the same
# platform first.
set -eu

platform=$1
binary=$2
cd "$(dirname "$0")/.."

test -f "$binary" || { echo "No helper binary at $binary" >&2; exit 1; }
test -d helper/vendor || { echo "No helper/vendor. Run helper/fetch-engine.sh first." >&2; exit 1; }

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/helper" dist
case $platform in
  windows-*) cp "$binary" "$stage/helper/clipsave-helper.exe" ;;
  *) cp "$binary" "$stage/helper/clipsave-helper" ;;
esac
cp -R helper/vendor "$stage/helper/vendor"
cp LICENSE THIRD_PARTY_NOTICES.md "$stage/helper/"

case $platform in
  windows-*)
    archive="dist/clipsave-helper-$platform.zip"
    rm -f "$archive"
    powershell -NoProfile -Command "Compress-Archive -Path '$(cygpath -w "$stage/helper")' -DestinationPath '$(cygpath -w "$PWD/$archive")'"
    ;;
  *)
    archive="dist/clipsave-helper-$platform.tar.gz"
    tar -czf "$archive" -C "$stage" helper
    ;;
esac
echo "$archive"
