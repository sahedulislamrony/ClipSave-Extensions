#!/bin/sh
# Installs or updates the ClipSave Helper for the current user, and registers it with the browsers.
# Everything it needs (yt-dlp, ffmpeg, a JavaScript runtime) comes with it.
#
#   curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh
#
# To remove it:
#
#   curl -fsSL https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.sh | sh -s -- --uninstall
set -eu

REPO=sahedulislamrony/ClipSave-Extensions
# CLIPSAVE_RELEASE_URL points the installer at another copy of the release files, for testing.
BASE=${CLIPSAVE_RELEASE_URL:-https://github.com/$REPO/releases/latest/download}

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    asset=clipsave-helper-macos-arm64.tar.gz
    dest="$HOME/Library/Application Support/ClipSave"
    ;;
  Darwin-x86_64)
    asset=clipsave-helper-macos-x86_64.tar.gz
    dest="$HOME/Library/Application Support/ClipSave"
    ;;
  Linux-x86_64)
    asset=clipsave-helper-linux-x86_64.tar.gz
    dest="${XDG_DATA_HOME:-$HOME/.local/share}/clipsave"
    ;;
  *)
    echo "The ClipSave Helper doesn't run on $(uname -s) $(uname -m) yet." >&2
    exit 1
    ;;
esac
helper="$dest/helper/clipsave-helper"

if [ "${1:-}" = "--uninstall" ]; then
  if [ -x "$helper" ]; then
    "$helper" --uninstall
  fi
  rm -rf "$dest/helper"
  rmdir "$dest" 2>/dev/null || true
  echo "The ClipSave Helper is removed. Your saved videos are untouched."
  exit 0
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | awk '{ print $1 }'; }
else
  sha256() { shasum -a 256 "$1" | awk '{ print $1 }'; }
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "Downloading the ClipSave Helper (about 110 MB)..."
# Run as `curl ... | sh`, curl's stdin is the script, so it can't see the terminal's width and draws a
# 79-column bar that wraps into a wall of #s in a narrower window. Tell it the width, or skip the bar.
cols=$(stty size 2>/dev/null </dev/tty | awk '{ print $2 }') || true
if [ -n "$cols" ] && [ "$cols" -gt 0 ] 2>/dev/null; then
  COLUMNS=$cols curl -fSL --progress-bar -o "$work/$asset" "$BASE/$asset"
else
  curl -fsSL -o "$work/$asset" "$BASE/$asset"
fi
curl -fsSL -o "$work/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt"

expected=$(awk -v name="$asset" '$2 == name { print $1 }' "$work/SHA256SUMS.txt")
if [ -z "$expected" ] || [ "$expected" != "$(sha256 "$work/$asset")" ]; then
  echo "The download doesn't match its published checksum, so nothing was installed." >&2
  exit 1
fi

tar -xzf "$work/$asset" -C "$work"
mkdir -p "$dest"
rm -rf "$dest/helper"
mv "$work/helper" "$dest/helper"
"$helper" --install
echo
version=$("$helper" --version)
echo "Installed $(printf '%s\n' "$version" | head -1) in $dest/helper"
echo "Done. Go back to your browser: ClipSave carries on by itself."
