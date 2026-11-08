#!/bin/sh
# Downloads everything the helper runs into helper/vendor, so users install nothing else. Each file is checked
# before it's kept:
#
#   yt-dlp            newest official release           its SHA2-256SUMS, which must carry yt-dlp's GPG signature
#                                                       (key in yt-dlp-public.key; needs gpg, required in CI)
#   ffmpeg, ffprobe   macOS, Linux: ffmpeg.martin-riedl.de   pinned builds and SHA-256s in engine.lock, which
#                     Windows: yt-dlp/FFmpeg-Builds          `node scripts/pin-engines.mjs` updates
#   qjs               QuickJS-ng, the JavaScript runtime yt-dlp needs for YouTube; pinned below
#
#   helper/fetch-engine.sh             for this computer
#   helper/fetch-engine.sh x86_64      macOS only: for the other kind of Mac (arm64 or x86_64)
#
# macOS gets the unpacked yt-dlp release, not the single-file one. Browsers mark every file their child
# processes create as quarantined, so the single-file build's Python library, which it unpacks each time it
# starts, is refused by macOS when a browser is the parent.
set -eu

# yt-dlp's signing key (Simon Sawicki, yt-dlp signing key), as in yt-dlp-public.key.
YTDLP_KEY=AC0CBBE6848D6A873464AF4E57CF65933B5A7581

QJS_VERSION=v0.18.0
qjs_sha256() {
  case "$1" in
    qjs-darwin-arm64) echo 91fe89916d3b0a6c01c4dc8382a99c3c1fd91ecfc214aa81ca051902bcce590d ;;
    qjs-darwin-x86_64) echo fa2c5dc78095daff566b32fab995ced12927875253b84216b91b834af2ef2b74 ;;
    qjs-linux-x86_64) echo 85ded23b9fabe8c1644fc40a8d2bbdd71157affcbd807359c618cc717ee24d7d ;;
    qjs-windows-x86_64.exe) echo ff03398d74ea6e6bd3a8e58058f7003225abcac229d7d57775b7aaae812a49c7 ;;
  esac
}

host=$(uname -m)
case "$(uname -s)" in
  Darwin) os=macos ;;
  Linux) os=linux ;;
  MINGW* | MSYS* | CYGWIN*) os=windows ;;
  *) echo "Unsupported system: $(uname -s)" >&2; exit 1 ;;
esac
case "${1:-$host}" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x86_64 ;;
  *) echo "Unsupported architecture: ${1:-$host}" >&2; exit 1 ;;
esac
if [ "$os" != macos ] && [ "$arch" != x86_64 ]; then
  echo "On $os only x86_64 is supported so far." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | awk '{ print $1 }'; }
else
  sha256() { shasum -a 256 "$1" | awk '{ print $1 }'; }
fi
# https only, redirects included, so nothing on the way can swap a file and its checksum together.
fetch() { curl -fsSL --proto =https --proto-redir =https --retry 3 -o "$2" "$1"; }
verify() {
  if [ -z "$2" ] || [ "$2" != "$(sha256 "$1")" ]; then
    echo "Checksum mismatch for $(basename "$1"), nothing was installed." >&2
    exit 1
  fi
}
unpack() {
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$1" -d "$2"
  else
    powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '$(cygpath -w "$1")' -DestinationPath '$(cygpath -w "$2")'"
  fi
}

here=$(cd "$(dirname "$0")" && pwd)
vendor="$here/vendor"
lock="$here/engine.lock"

# The pinned link or SHA-256 ($2 = 2 or 3) of one build in engine.lock.
pinned() { awk -v name="$1" -v field="$2" '$1 == name { print $field }' "$lock"; }
# Downloads the build engine.lock pins as $1 to $2, and checks it.
fetch_pinned() {
  url=$(pinned "$1" 2)
  [ -n "$url" ] || { echo "engine.lock pins no $1 build." >&2; exit 1; }
  fetch "$url" "$2" || {
    echo "The pinned $1 build is gone. Run 'node scripts/pin-engines.mjs' to pin a newer one." >&2
    exit 1
  }
  verify "$2" "$(pinned "$1" 3)"
}
# Checks that $1 carries yt-dlp's own signature $2.
verify_signed() {
  if ! command -v gpg >/dev/null 2>&1; then
    if [ -n "${CI:-}" ]; then
      echo "gpg is needed to check yt-dlp's signature." >&2
      exit 1
    fi
    echo "  gpg isn't installed, so yt-dlp's signature wasn't checked." >&2
    return 0
  fi
  mkdir -m 700 "$work/gnupg"
  gpg --batch --quiet --homedir "$work/gnupg" --import "$here/yt-dlp-public.key" 2>/dev/null
  if ! gpg --batch --homedir "$work/gnupg" --status-fd 1 --verify "$2" "$1" 2>/dev/null |
    grep -q "^\[GNUPG:\] VALIDSIG $YTDLP_KEY "; then
    echo "yt-dlp's checksums don't carry yt-dlp's signature, nothing was installed." >&2
    exit 1
  fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rm -rf "$vendor"
mkdir -p "$vendor"

echo "Fetching yt-dlp..."
base=https://github.com/yt-dlp/yt-dlp/releases/latest/download
fetch "$base/SHA2-256SUMS" "$work/SHA2-256SUMS"
fetch "$base/SHA2-256SUMS.sig" "$work/SHA2-256SUMS.sig"
verify_signed "$work/SHA2-256SUMS" "$work/SHA2-256SUMS.sig"
case $os in
  macos) asset=yt-dlp_macos.zip ;;
  linux) asset=yt-dlp_linux ;;
  windows) asset=yt-dlp.exe ;;
esac
fetch "$base/$asset" "$work/$asset"
verify "$work/$asset" "$(awk -v name="$asset" '$2 == name { print $1 }' "$work/SHA2-256SUMS")"
case $os in
  macos) mkdir "$vendor/yt-dlp_macos" && unpack "$work/$asset" "$vendor/yt-dlp_macos" ;;
  linux) mv "$work/$asset" "$vendor/yt-dlp" ;;
  windows) mv "$work/$asset" "$vendor/yt-dlp.exe" ;;
esac

echo "Fetching ffmpeg..."
if [ $os = windows ]; then
  fetch_pinned ffmpeg-windows-x86_64 "$work/ffmpeg.zip"
  unpack "$work/ffmpeg.zip" "$work/ffmpeg"
  cp "$work"/ffmpeg/*/bin/ffmpeg.exe "$work"/ffmpeg/*/bin/ffprobe.exe "$work"/ffmpeg/*/bin/*.dll "$vendor/"
else
  for tool in ffmpeg ffprobe; do
    fetch_pinned "$tool-$os-$arch" "$work/$tool.zip"
    unpack "$work/$tool.zip" "$vendor"
    chmod +x "$vendor/$tool"
  done
fi

echo "Fetching QuickJS..."
case $os in
  macos) [ $arch = x86_64 ] && asset=qjs-darwin-x86_64 || asset=qjs-darwin-arm64 ;;
  linux) asset=qjs-linux-x86_64 ;;
  windows) asset=qjs-windows-x86_64.exe ;;
esac
fetch "https://github.com/quickjs-ng/quickjs/releases/download/$QJS_VERSION/$asset" "$work/$asset"
verify "$work/$asset" "$(qjs_sha256 "$asset")"
[ $os = windows ] && qjs=qjs.exe || qjs=qjs
mv "$work/$asset" "$vendor/$qjs"
chmod +x "$vendor/$qjs"

echo "Ready in $vendor:"
ls "$vendor"
