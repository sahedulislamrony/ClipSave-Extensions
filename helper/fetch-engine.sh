#!/bin/sh
# Downloads yt-dlp into helper/vendor and checks it against the checksums published with the release.
#
# macOS needs the unpacked release, not the single-file one. Browsers mark every file their child
# processes create as quarantined, so the single-file build's Python library, which it unpacks each
# time it starts, is refused by macOS when a browser is the parent.
set -eu

case "$(uname -s)" in
  Darwin) asset=yt-dlp_macos.zip ;;
  Linux) asset=yt-dlp_linux ;;
  *) echo "Unsupported system: $(uname -s)" >&2; exit 1 ;;
esac

vendor="$(cd "$(dirname "$0")" && pwd)/vendor"
base=https://github.com/yt-dlp/yt-dlp/releases/latest/download
mkdir -p "$vendor"
cd "$vendor"

curl -fsSL -o "$asset.download" "$base/$asset"
curl -fsSL -o SHA2-256SUMS "$base/SHA2-256SUMS"

expected=$(awk -v name="$asset" '$2 == name { print $1 }' SHA2-256SUMS)
actual=$(shasum -a 256 "$asset.download" | awk '{ print $1 }')
rm SHA2-256SUMS

if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  rm "$asset.download"
  echo "Checksum mismatch for $asset, nothing was installed." >&2
  exit 1
fi

rm -rf yt-dlp yt-dlp_macos
case "$asset" in
  *.zip)
    mkdir yt-dlp_macos
    unzip -q "$asset.download" -d yt-dlp_macos
    rm "$asset.download"
    binary=yt-dlp_macos/yt-dlp_macos
    ;;
  *)
    mv "$asset.download" yt-dlp
    binary=yt-dlp
    ;;
esac

chmod +x "$binary"
echo "yt-dlp $("./$binary" --version) verified and ready in $vendor"
