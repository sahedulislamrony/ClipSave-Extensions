#!/bin/sh
# Installs or updates the ClipSave Helper for the current user, and registers it with the browsers.
# Everything it needs (yt-dlp, ffmpeg, a JavaScript runtime) comes with it. It also keeps a copy of the
# extension for Chrome, Edge and Brave next to the helper: load that folder once with "Load unpacked", and
# ClipSave's Settings can update it in one click.
#
#   curl -fsSL https://ext.clipsave.link/install.sh | sh
#
# To remove it:
#
#   curl -fsSL https://ext.clipsave.link/install.sh | sh -s -- --uninstall
#
# The helper runs it itself for one-click updates, with:
#   --from-helper     no terminal: quiet, and the result goes to --result
#   --ytdlp-only      only replace yt-dlp with its newest release, which sites change for most often
#   --result <file>   write "ok <version>" or "failed <reason>" there when done
set -eu

REPO=sahedulislamrony/ClipSave-Extensions
# CLIPSAVE_RELEASE_URL points the installer at another copy of the release files, for testing.
BASE=${CLIPSAVE_RELEASE_URL:-https://github.com/$REPO/releases/latest/download}
YTDLP_BASE=${CLIPSAVE_YTDLP_URL:-https://github.com/yt-dlp/yt-dlp/releases/latest/download}

uninstall=false
from_helper=false
ytdlp_only=false
result=""
while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) uninstall=true ;;
    --from-helper) from_helper=true ;;
    --ytdlp-only) ytdlp_only=true ;;
    --result) shift; result=${1:-} ;;
  esac
  shift
done

say() { [ "$from_helper" = true ] || echo "$@"; }
reported=false
report() {
  reported=true
  [ -z "$result" ] || printf '%s\n' "$1" > "$result"
}
# A result left by an earlier run must never be read as this one's.
[ -z "$result" ] || rm -f "$result"
fail() {
  echo "$1" >&2
  report "failed $1"
  exit 1
}

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    asset=clipsave-helper-macos-arm64.tar.gz
    ytdlp=yt-dlp_macos.zip
    dest="$HOME/Library/Application Support/ClipSave"
    ;;
  Darwin-x86_64)
    asset=clipsave-helper-macos-x86_64.tar.gz
    ytdlp=yt-dlp_macos.zip
    dest="$HOME/Library/Application Support/ClipSave"
    ;;
  Linux-x86_64)
    asset=clipsave-helper-linux-x86_64.tar.gz
    ytdlp=yt-dlp_linux
    dest="${XDG_DATA_HOME:-$HOME/.local/share}/clipsave"
    ;;
  *)
    fail "The ClipSave Helper doesn't run on $(uname -s) $(uname -m) yet."
    ;;
esac
helper="$dest/helper/clipsave-helper"

if [ "$uninstall" = true ]; then
  if [ -x "$helper" ]; then
    "$helper" --uninstall
  fi
  rm -rf "$dest/helper" "$dest/extension"
  rmdir "$dest" 2>/dev/null || true
  echo "The ClipSave Helper is removed. Your saved videos are untouched."
  echo "If you loaded ClipSave from $dest/extension, remove it on your browser's extensions page too."
  exit 0
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | awk '{ print $1 }'; }
else
  sha256() { shasum -a 256 "$1" | awk '{ print $1 }'; }
fi
# The line for $2 in the checksum list $1, empty when it isn't listed.
listed() { awk -v name="$2" '$2 == name || $2 == "*" name { print $1 }' "$1"; }
verified() {
  expected=$(listed "$2" "$3")
  [ -n "$expected" ] && [ "$expected" = "$(sha256 "$1")" ]
}

work=$(mktemp -d)
# Whatever stops the script, the helper hears how it ended.
finish() {
  rm -rf "$work"
  [ "$reported" = true ] || report "failed The installer stopped before it finished."
}
trap finish EXIT

# Files written by a program a browser started are marked as downloaded from the internet on macOS, and
# macOS then refuses to run them. One-click updates are started that way, so the mark is taken off.
unquarantine() {
  if [ "$(uname -s)" = Darwin ]; then
    xattr -dr com.apple.quarantine "$1" 2>/dev/null || true
  fi
}

# Replaces the directory $2 with $1, keeping the old one until the new one is in place.
swap() {
  rm -rf "$2.old"
  if [ -e "$2" ]; then mv "$2" "$2.old"; fi
  mv "$1" "$2"
  rm -rf "$2.old"
}

# Replaces yt-dlp with its newest release. Prints why and returns 1 when it can't; nothing changes then.
update_ytdlp() {
  vendor="$dest/helper/vendor"
  [ -d "$vendor" ] || { echo "The ClipSave Helper isn't installed here yet."; return 1; }
  say "Downloading the newest yt-dlp..."
  curl -fsSL --retry 2 -o "$work/SHA2-256SUMS" "$YTDLP_BASE/SHA2-256SUMS" || { echo "Couldn't download yt-dlp's checksums."; return 1; }
  curl -fsSL --retry 2 -o "$work/$ytdlp" "$YTDLP_BASE/$ytdlp" || { echo "Couldn't download yt-dlp."; return 1; }
  verified "$work/$ytdlp" "$work/SHA2-256SUMS" "$ytdlp" ||
    { echo "The yt-dlp download doesn't match its published checksum, so nothing was changed."; return 1; }
  case "$ytdlp" in
    *.zip)
      rm -rf "$work/yt-dlp_macos"
      mkdir "$work/yt-dlp_macos"
      unzip -q -o "$work/$ytdlp" -d "$work/yt-dlp_macos" || { echo "Couldn't unpack yt-dlp."; return 1; }
      chmod +x "$work/yt-dlp_macos/yt-dlp_macos"
      swap "$work/yt-dlp_macos" "$vendor/yt-dlp_macos"
      ;;
    *)
      chmod +x "$work/$ytdlp"
      mv "$work/$ytdlp" "$vendor/yt-dlp.new"
      mv "$vendor/yt-dlp.new" "$vendor/yt-dlp"
      ;;
  esac
  unquarantine "$vendor"
}

if [ "$ytdlp_only" = true ]; then
  why=$(update_ytdlp) || fail "${why##*
}"
  version=$("$helper" --version 2>/dev/null | awk '/yt-dlp:/ { gsub(/[()]/, "", $NF); print $NF }')
  report "ok yt-dlp ${version:-updated}"
  say "Done. yt-dlp is now ${version:-up to date}."
  exit 0
fi

say "Downloading the ClipSave Helper (about 110 MB)..."
# Run as `curl ... | sh`, curl's stdin is the script, so it can't see the terminal's width and draws a
# 79-column bar that wraps into a wall of #s in a narrower window. Tell it the width, or skip the bar.
cols=""
if [ "$from_helper" = false ]; then
  cols=$(stty size 2>/dev/null </dev/tty | awk '{ print $2 }') || true
fi
if [ -n "$cols" ] && [ "$cols" -gt 0 ] 2>/dev/null; then
  COLUMNS=$cols curl -fSL --progress-bar -o "$work/$asset" "$BASE/$asset" || fail "Couldn't download the helper."
else
  curl -fsSL -o "$work/$asset" "$BASE/$asset" || fail "Couldn't download the helper."
fi
curl -fsSL -o "$work/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt" || fail "Couldn't download the checksums."
verified "$work/$asset" "$work/SHA256SUMS.txt" "$asset" ||
  fail "The download doesn't match its published checksum, so nothing was installed."

tar -xzf "$work/$asset" -C "$work"
mkdir -p "$dest"
swap "$work/helper" "$dest/helper"
# The release's yt-dlp is as old as the release; sites change faster. Not getting the newest is no reason
# to stop, since the release's own copy works.
update_ytdlp >/dev/null || echo "Kept the release's yt-dlp: the newest couldn't be fetched." >&2

# The extension for Chrome, Edge and Brave. Older releases don't have it, which is fine.
extension=clipsave-extension-chromium.tar.gz
if [ -n "$(listed "$work/SHA256SUMS.txt" "$extension")" ]; then
  say "Downloading the extension for Chrome, Edge and Brave..."
  if curl -fsSL -o "$work/$extension" "$BASE/$extension" && verified "$work/$extension" "$work/SHA256SUMS.txt" "$extension"; then
    tar -xzf "$work/$extension" -C "$work"
    # Tells the extension it was loaded from this folder, so Settings can offer one-click updates.
    printf '{ "managedBy": "clipsave-installer" }\n' > "$work/extension/managed.json"
    swap "$work/extension" "$dest/extension"
  else
    echo "The extension download didn't check out, so the old copy stays." >&2
  fi
fi

unquarantine "$dest"
"$helper" --install || fail "The helper couldn't register itself with your browsers. Open your browser once, then try again."
version=$("$helper" --version | head -1)
report "ok $version"
if [ "$from_helper" = false ]; then
  echo
  echo "Installed $version in $dest/helper"
  if [ -d "$dest/extension" ]; then
    echo
    echo "Chrome, Edge or Brave: on the extensions page, turn on Developer mode, choose Load unpacked and select"
    echo "  $dest/extension"
    echo "ClipSave's Settings can then update it in one click."
  fi
  echo "Done. Go back to your browser: ClipSave carries on by itself."
fi
