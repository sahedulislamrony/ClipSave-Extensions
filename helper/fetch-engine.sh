#!/bin/sh
# Downloads everything the helper runs into helper/vendor, so users install nothing else. Each file is checked
# against a checksum before it's kept:
#
#   yt-dlp            official release                  checked against its SHA2-256SUMS
#   ffmpeg, ffprobe   macOS, Linux: ffmpeg.martin-riedl.de   checked against the .sha256 beside each file
#                     Windows: yt-dlp/FFmpeg-Builds     checked against its checksums.sha256
#   qjs               QuickJS-ng, the JavaScript runtime yt-dlp needs for YouTube; pinned below
#
#   helper/fetch-engine.sh             for this computer
#   helper/fetch-engine.sh x86_64      macOS only: for the other kind of Mac (arm64 or x86_64)
#
# macOS gets the unpacked yt-dlp release, not the single-file one. Browsers mark every file their child
# processes create as quarantined, so the single-file build's Python library, which it unpacks each time it
# starts, is refused by macOS when a browser is the parent.
set -eu

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
fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
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

vendor="$(cd "$(dirname "$0")" && pwd)/vendor"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rm -rf "$vendor"
mkdir -p "$vendor"

echo "Fetching yt-dlp..."
base=https://github.com/yt-dlp/yt-dlp/releases/latest/download
fetch "$base/SHA2-256SUMS" "$work/SHA2-256SUMS"
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
  builds=https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest
  asset=ffmpeg-master-latest-win64-gpl-shared.zip
  fetch "$builds/checksums.sha256" "$work/checksums.sha256"
  fetch "$builds/$asset" "$work/$asset"
  verify "$work/$asset" "$(awk -v name="$asset" '$2 == name { print $1 }' "$work/checksums.sha256")"
  unpack "$work/$asset" "$work/ffmpeg"
  cp "$work"/ffmpeg/*/bin/ffmpeg.exe "$work"/ffmpeg/*/bin/ffprobe.exe "$work"/ffmpeg/*/bin/*.dll "$vendor/"
else
  [ $arch = x86_64 ] && riedl_arch=amd64 || riedl_arch=arm64
  for tool in ffmpeg ffprobe; do
    # The permanent link redirects to a versioned file, and the checksum sits beside that file.
    url=$(curl -fsS -o /dev/null -w '%{redirect_url}' "https://ffmpeg.martin-riedl.de/redirect/latest/$os/$riedl_arch/release/$tool.zip")
    [ -n "$url" ] || { echo "Couldn't find the latest $tool build." >&2; exit 1; }
    fetch "$url" "$work/$tool.zip"
    fetch "$url.sha256" "$work/$tool.zip.sha256"
    verify "$work/$tool.zip" "$(awk '{ print $1 }' "$work/$tool.zip.sha256")"
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
