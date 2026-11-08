#!/bin/sh
# Unpacks a packaged helper and checks that the helper and every tool it carries start on this computer, so a
# release can't ship a build for the wrong processor or a tool that won't run. Run it on the kind of machine
# the archive is for.
#
#   scripts/check-helper.sh dist/clipsave-helper-linux-arm64.tar.gz
set -eu

archive=$1
test -f "$archive" || { echo "No archive at $archive" >&2; exit 1; }

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
case $archive in
  *.zip)
    if command -v cygpath >/dev/null 2>&1; then
      # Windows (Git Bash): unpacked the way install.ps1 does, with Windows' own tar, else Expand-Archive.
      # Git Bash's unzip warns about the backslashes Compress-Archive writes into the zip, and exits 1.
      wintar="$(cygpath -u "${SYSTEMROOT:-C:/Windows}")/System32/tar.exe"
      if [ -x "$wintar" ]; then
        "$wintar" -xf "$(cygpath -w "$archive")" -C "$(cygpath -w "$dir")"
      else
        powershell -NoProfile -Command "Expand-Archive -LiteralPath '$(cygpath -w "$archive")' -DestinationPath '$(cygpath -w "$dir")'"
      fi
    else
      unzip -q "$archive" -d "$dir"
    fi
    ;;
  *) tar -xzf "$archive" -C "$dir" ;;
esac

helper="$dir/helper/clipsave-helper"
vendor="$dir/helper/vendor"
ext=
[ -f "$helper.exe" ] && ext=.exe

fail() { echo "$1" >&2; exit 1; }

# Lists the tools it finds. The helper falls back to tools installed on the computer, so each bundled one is
# also run directly below.
out=$("$helper$ext" --version) || fail "The helper doesn't start."
echo "$out"
case $out in
  *"not found"* | *"no version"*) fail "The helper is missing a tool, or one doesn't start." ;;
esac

if [ -d "$vendor/yt-dlp_macos" ]; then ytdlp="$vendor/yt-dlp_macos/yt-dlp_macos"; else ytdlp="$vendor/yt-dlp$ext"; fi
version=$("$ytdlp" --version) || fail "The bundled yt-dlp doesn't start."
echo "yt-dlp $version runs."
for tool in ffmpeg ffprobe; do
  "$vendor/$tool$ext" -version >/dev/null || fail "The bundled $tool doesn't start."
  echo "$tool runs."
done
[ "$("$vendor/qjs$ext" -e 'print(6 * 7)' | tr -d '\r')" = 42 ] || fail "The bundled QuickJS doesn't start."
echo "QuickJS runs."
