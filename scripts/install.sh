#!/bin/sh
# Installs or updates ClipSave for the current user: the helper app that does the downloading (with yt-dlp,
# ffmpeg and a JavaScript runtime), connected to the browsers you choose, and a copy of the extension for
# Chrome, Edge and Brave to load once with "Load unpacked". ClipSave's Settings then updates both in one click.
#
#   curl -fsSL https://ext.clipsave.link/install.sh | sh
#
# Options go after `sh -s --`, for example:
#
#   curl -fsSL https://ext.clipsave.link/install.sh | sh -s -- --browsers chrome,firefox
#
#   --browsers <list>   connect these browsers without asking: chrome, chrome-canary (macOS), chromium, edge,
#                       brave, firefox, separated by commas
#   --all               connect every supported browser without asking
#   --no-modify-path    don't add the clipsave-helper command to your shell's PATH
#   --uninstall         remove ClipSave's helper, its command and its browser connections
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
GUIDE=https://github.com/$REPO/blob/main/docs/install.md
# Firefox Add-ons finds an add-on by its ID too.
FIREFOX_ADDON=https://addons.mozilla.org/firefox/addon/clipsave@sahedulislamrony.github.io/
CHROME_ID=engejhilbedikenhabjndbpgpdhaedge
FIREFOX_ID=clipsave@sahedulislamrony.github.io

uninstall=false
from_helper=false
ytdlp_only=false
modify_path=true
result=""
browsers=""
while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) uninstall=true ;;
    --from-helper) from_helper=true ;;
    --ytdlp-only) ytdlp_only=true ;;
    --no-modify-path) modify_path=false ;;
    --all) browsers=all ;;
    --browsers) shift; browsers=${1:-} ;;
    --browsers=*) browsers=${1#--browsers=} ;;
    --result) shift; result=${1:-} ;;
    -h | --help)
      cat <<EOF
Installs or updates ClipSave: the helper, connected to the browsers you choose, and the extension.

  curl -fsSL https://ext.clipsave.link/install.sh | sh -s -- [options]

  --browsers <list>   connect these browsers without asking, separated by commas:
                      chrome, chrome-canary (macOS), chromium, edge, brave, firefox
  --all               connect every supported browser without asking
  --no-modify-path    don't add the clipsave-helper command to your shell's PATH
  --uninstall         remove the helper, its command and its browser connections

The guide: $GUIDE
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1. The options are in $GUIDE" >&2
      exit 2
      ;;
  esac
  [ $# -eq 0 ] || shift
done

# ── Looks ───────────────────────────────────────────────────────────────────────────────────────────────
# Colors and animation only for a person at a terminal; plain lines for logs, pipes and one-click updates.
fancy=false
if [ "$from_helper" = false ] && [ -t 1 ] && [ "${TERM:-dumb}" != dumb ]; then
  fancy=true
fi
e=$(printf '\033')
if [ "$fancy" = true ] && [ -z "${NO_COLOR:-}" ]; then
  bold="${e}[1m" dim="${e}[2m" reset="${e}[0m" green="${e}[32m" yellow="${e}[33m" red="${e}[31m" cyan="${e}[36m"
  case "${COLORTERM:-}" in
    truecolor | 24bit) pink="${e}[38;2;255;61;122m" ;;
    *) pink="${e}[35m" ;;
  esac
else
  bold="" dim="" reset="" green="" yellow="" red="" cyan="" pink=""
fi
# The Linux text console has no fonts for these.
if [ "${TERM:-}" = linux ] || [ "$fancy" = false ]; then
  sym_ok="+" sym_fail="x" sym_warn="!" sym_dot="*" sym_on="[x]" sym_off="[ ]" sym_ptr=">"
  # shellcheck disable=SC1003 # a backslash, not an escape
  frames='| / - \'
  bar_full="#" bar_empty="-"
else
  sym_ok="✓" sym_fail="✗" sym_warn="!" sym_dot="◆" sym_on="◉" sym_off="○" sym_ptr="❯"
  frames='⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏'
  bar_full="━" bar_empty="─"
fi
cols=80
if [ "$fancy" = true ]; then
  # Run as `curl ... | sh`, stdin is the script, so the terminal is asked directly.
  cols=$(stty size 2>/dev/null </dev/tty | awk '{ print $2 }') || true
  [ -n "$cols" ] && [ "$cols" -gt 0 ] 2>/dev/null || cols=80
fi

say() { [ "$from_helper" = true ] || printf '%s\n' "$*"; }
# A path as people read it, with ~ for the home folder.
# shellcheck disable=SC2088 # the ~ is shown, not expanded
pretty() { case "$1" in "$HOME"/*) printf '~/%s' "${1#"$HOME"/}" ;; *) printf '%s' "$1" ;; esac; }
ok() { say "  ${green}${sym_ok}${reset} $1${2:+  ${dim}$2${reset}}"; }
warn() { [ "$from_helper" = true ] || printf '  %s\n' "${yellow}${sym_warn}${reset} $1" >&2; }
note() { say "    ${dim}$1${reset}"; }
cursor() { [ "$fancy" = false ] || printf '%s' "${e}[?25$1"; }

reported=false
report() {
  reported=true
  [ -z "$result" ] || printf '%s\n' "$1" >"$result"
}
# A result left by an earlier run must never be read as this one's.
[ -z "$result" ] || rm -f "$result"
fail() {
  if [ "$from_helper" = true ]; then
    echo "$1" >&2
  else
    printf '\n  %s\n' "${red}${sym_fail} $1${reset}" >&2
    if [ -s "${log:-/nonexistent}" ]; then
      printf '%s\n' "${dim}" >&2
      tail -n 8 "$log" | sed 's/^/    /' >&2
      printf '%s' "${reset}" >&2
    fi
    printf '\n    %s\n\n' "${dim}Help: $GUIDE${reset}" >&2
  fi
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
  Linux-aarch64 | Linux-arm64)
    asset=clipsave-helper-linux-arm64.tar.gz
    ytdlp=yt-dlp_linux_aarch64
    dest="${XDG_DATA_HOME:-$HOME/.local/share}/clipsave"
    ;;
  *)
    fail "The ClipSave Helper doesn't run on $(uname -s) $(uname -m) yet."
    ;;
esac
helper="$dest/helper/clipsave-helper"
chosen_file="$dest/browsers"
bin_dir="$HOME/.local/bin"
command_file="$bin_dir/clipsave-helper"
command_mark="Added by the ClipSave installer"

# ── Browsers ────────────────────────────────────────────────────────────────────────────────────────────
# Each browser as "id|name|app or commands|profile folder", the ids the helper's --browsers takes.
if [ "$(uname -s)" = Darwin ]; then
  support="$HOME/Library/Application Support"
  browser_table="chrome|Chrome|Google Chrome.app|$support/Google/Chrome
chrome-canary|Chrome Canary|Google Chrome Canary.app|$support/Google/Chrome Canary
chromium|Chromium|Chromium.app|$support/Chromium
edge|Edge|Microsoft Edge.app|$support/Microsoft Edge
brave|Brave|Brave Browser.app|$support/BraveSoftware/Brave-Browser
firefox|Firefox|Firefox.app Firefox Developer Edition.app Firefox Nightly.app|$support/Firefox"
else
  config="${XDG_CONFIG_HOME:-$HOME/.config}"
  browser_table="chrome|Chrome|google-chrome google-chrome-stable|$config/google-chrome
chromium|Chromium|chromium chromium-browser|$config/chromium
edge|Edge|microsoft-edge microsoft-edge-stable|$config/microsoft-edge
brave|Brave|brave-browser brave|$config/BraveSoftware/Brave-Browser
firefox|Firefox|firefox|$HOME/.mozilla"
fi
browser_ids=$(printf '%s\n' "$browser_table" | cut -d'|' -f1)
field() { printf '%s\n' "$browser_table" | awk -F'|' -v id="$1" -v n="$2" '$1 == id { print $n }'; }
name_of() { field "$1" 2; }
is_chromium() { [ "$1" != firefox ]; }

# Whether the browser is on this computer: its app or command, or a file it makes on its first run. (Not just
# its folder: connecting a browser makes that.)
found() {
  profile=$(field "$1" 4)
  for file in "Local State" profiles.ini firefox/profiles.ini; do
    [ -f "$profile/$file" ] && return 0
  done
  apps=$(field "$1" 3)
  if [ "$(uname -s)" = Darwin ]; then
    for app in "/Applications/" "$HOME/Applications/"; do
      case "$apps" in *"Firefox.app"*) set -- "${app}Firefox.app" "${app}Firefox Developer Edition.app" "${app}Firefox Nightly.app" ;;
        *) set -- "$app$apps" ;; esac
      for path in "$@"; do [ -d "$path" ] && return 0; done
    done
    return 1
  fi
  for cmd in $apps; do command -v "$cmd" >/dev/null 2>&1 && return 0; done
  return 1
}

# Whether the browser already has the extension, from what it keeps about its extensions.
has_extension() {
  profile=$(field "$1" 4)
  if [ "$1" = firefox ]; then
    [ "$(uname -s)" = Darwin ] && profile="$profile/Profiles" || profile="$profile/firefox"
    grep -qs "$FIREFOX_ID" "$profile"/*/extensions.json
  else
    grep -qs "$CHROME_ID" "$profile"/*/"Secure Preferences" "$profile"/*/Preferences
  fi
}

list_names() {
  out=""
  for id in $(printf '%s' "$1" | tr ',' ' '); do out="${out:+$out, }$(name_of "$id")"; done
  printf '%s' "$out"
}

# Checks a --browsers list, and turns "all" into every browser.
normalize_browsers() {
  out=""
  for id in $(printf '%s' "$1" | tr ',A-Z' ' a-z'); do
    [ "$id" = all ] && { printf '%s' "$browser_ids" | tr '\n' ','; return 0; }
    printf '%s\n' "$browser_ids" | grep -qx "$id" ||
      fail "There's no browser called \"$id\" here. Choose from: $(printf '%s' "$browser_ids" | tr '\n' ',' | sed 's/,/, /g')."
    case ",$out," in *",$id,"*) ;; *) out="${out:+$out,}$id" ;; esac
  done
  [ -n "$out" ] || fail "Name at least one browser after --browsers."
  printf '%s' "$out"
}

tty_ok() { [ "$fancy" = true ] && (: </dev/tty) 2>/dev/null && stty -g </dev/tty >/dev/null 2>&1; }
read_key() { dd bs=1 count=1 2>/dev/null </dev/tty; }

# A checklist: arrows (or j and k) move, space or the number ticks, a ticks all, Return carries on.
pick_browsers() {
  preset=$1
  # Chrome Canary and Chromium only when they're here, to keep the list short.
  items=""
  for id in $browser_ids; do
    case "$id" in chrome-canary | chromium) found "$id" || continue ;; esac
    items="$items $id"
  done
  # shellcheck disable=SC2086 # the ids are words
  set -- $items
  count=$#
  here=""
  for id in $items; do found "$id" && here="$here $id"; done
  selected=""
  for id in $items; do
    case ",$preset," in *",$id,"*) selected="$selected $id" ;; esac
  done
  at=1
  say "  ${bold}Which browsers should ClipSave work with?${reset}"
  say "  ${dim}↑/↓ move · space select · a all · enter continue${reset}"
  say ""
  cursor l
  saved_stty=$(stty -g </dev/tty)
  stty -icanon -echo min 1 time 0 </dev/tty
  drawn=false
  message=""
  while :; do
    [ "$drawn" = false ] || printf '%s' "${e}[$((count + 1))A"
    drawn=true
    n=0
    for id in $items; do
      n=$((n + 1))
      case " $selected " in *" $id "*) mark="${pink}${sym_on}${reset}" ;; *) mark="${dim}${sym_off}${reset}" ;; esac
      label=$(printf '%-15s' "$(name_of "$id")")
      if [ "$n" -eq "$at" ]; then ptr="${pink}${sym_ptr}${reset}" label="${bold}$label${reset}"; else ptr=" "; fi
      case " $here " in *" $id "*) hint="${dim}found on this computer${reset}" ;; *) hint="" ;; esac
      printf '\r%s  %s %s %s %s%s\n' "${e}[2K" "$ptr" "$mark" "${dim}$n${reset}" "$label" "$hint"
    done
    printf '\r%s  %s\n' "${e}[2K" "$message"
    message=""
    key=$(read_key)
    if [ "$key" = "$e" ]; then
      stty min 0 time 1 </dev/tty
      key="$e$(dd bs=2 count=1 2>/dev/null </dev/tty)"
      stty min 1 time 0 </dev/tty
    fi
    case "$key" in
      "${e}[A" | k | K) [ "$at" -le 1 ] && at=$count || at=$((at - 1)) ;;
      "${e}[B" | j | J) [ "$at" -ge "$count" ] && at=1 || at=$((at + 1)) ;;
      " " | x | [1-9])
        n=$at
        case "$key" in [1-9]) n=$key ;; esac
        [ "$n" -le "$count" ] || continue
        eval "id=\${$n}"
        case " $selected " in
          *" $id "*) selected=$(printf '%s' " $selected " | sed "s/ $id / /; s/^ *//; s/ *$//") ;;
          *) selected="$selected $id" ;;
        esac
        ;;
      a | A) selected=$items ;;
      "")
        [ -n "$(printf '%s' "$selected" | tr -d ' ')" ] && break
        message="${yellow}Pick at least one browser.${reset}"
        ;;
    esac
  done
  stty "$saved_stty" </dev/tty
  saved_stty=""
  cursor h
  # The checklist folds into one line with the answer.
  printf '%s' "${e}[$((count + 4))A"
  printf '\r%s' "${e}[J"
  picked=""
  for id in $items; do
    case " $selected " in *" $id "*) picked="${picked:+$picked,}$id" ;; esac
  done
  ok "Browsers" "$(list_names "$picked")"
}

# ── Steps ───────────────────────────────────────────────────────────────────────────────────────────────
work=$(mktemp -d)
log="$work/step.log"
bg=""
saved_stty=""
# Whatever stops the script, the helper hears how it ended, and the terminal is left as it was.
finish() {
  [ -z "$bg" ] || kill "$bg" 2>/dev/null || true
  [ -z "$saved_stty" ] || stty "$saved_stty" </dev/tty 2>/dev/null || true
  cursor h
  rm -rf "$work"
  [ "$reported" = true ] || report "failed The installer stopped before it finished."
}
trap finish EXIT
trap 'printf "\n"; exit 130' INT TERM

# Runs a command with a spinner beside $1, so nothing ever sits silent. With $2 a file being downloaded,
# the spinner shows how much of it has come. The command's output goes to $log; its status is returned.
run() {
  label=$1 watch=$2
  shift 2
  : >"$log"
  if [ "$fancy" = false ]; then
    say "  $label..."
    "$@" >>"$log" 2>&1
    return
  fi
  "$@" >>"$log" 2>&1 &
  bg=$!
  cursor l
  i=0
  while kill -0 "$bg" 2>/dev/null; do
    # shellcheck disable=SC2086 # one frame per word
    set -- $frames
    shift $((i % $#))
    frame=$1
    i=$((i + 1))
    detail=""
    if [ -n "$watch" ] && [ -f "$watch" ]; then
      have=$(wc -c <"$watch" | tr -d ' ')
      # curl writes each response's headers as it gets them; the last length is the file's.
      total=$(awk 'tolower($1) == "content-length:" { n = $2 } END { gsub(/\r/, "", n); print n + 0 }' "$watch.headers" 2>/dev/null || echo 0)
      detail=$(awk -v have="$have" -v total="$total" -v width=$((cols - ${#label} - 30)) -v full="$bar_full" -v empty="$bar_empty" -v dim="$dim" -v pink="$pink" -v reset="$reset" 'BEGIN {
        mb = have / 1048576
        if (total <= 0) { printf "%s%.0f MB%s", dim, mb, reset; exit }
        f = have / total; if (f > 1) f = 1
        if (width > 24) width = 24
        bar = ""
        if (width >= 8) {
          n = int(f * width + 0.5)
          for (j = 0; j < width; j++) bar = bar (j < n ? full : "")
          rest = ""; for (j = n; j < width; j++) rest = rest empty
          bar = pink bar reset dim rest reset "  "
        }
        printf "%s%s%3d%%  %.0f / %.0f MB%s", bar, dim, f * 100, mb, total / 1048576, reset
      }')
    fi
    printf '\r%s  %s %s  %s' "${e}[2K" "${pink}${frame}${reset}" "$label" "$detail"
    sleep 0.1
  done
  code=0
  wait "$bg" || code=$?
  bg=""
  printf '\r%s' "${e}[2K"
  cursor h
  return $code
}

# Downloads $1 to $2, showing how far it's got.
fetch() { curl -fSL --proto-redir =https --retry 2 -s -D "$2.headers" -o "$2" "$1"; }

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

# ── The clipsave-helper command ─────────────────────────────────────────────────────────────────────────
shell_profile() {
  case "$(basename "${SHELL:-sh}")" in
    zsh) echo "${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash) [ "$(uname -s)" = Darwin ] && echo "$HOME/.bash_profile" || echo "$HOME/.bashrc" ;;
    fish) echo "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/clipsave.fish" ;;
    *) echo "$HOME/.profile" ;;
  esac
}
# Every profile the installer may have written to, for --uninstall.
all_profiles() {
  printf '%s\n' "${ZDOTDIR:-$HOME}/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/clipsave.fish"
}

# Puts a small `clipsave-helper` command in ~/.local/bin that runs the helper where it's installed, and
# adds that folder to the shell's PATH when it isn't there yet. Prints what it changed.
add_command() {
  if [ -e "$command_file" ] && ! grep -q "$command_mark" "$command_file" 2>/dev/null; then
    echo "kept"
    return 0
  fi
  mkdir -p "$bin_dir"
  quoted=$(printf '%s' "$helper" | sed "s/'/'\\\\''/g")
  printf '#!/bin/sh\n# %s. Runs the ClipSave Helper.\nexec '\''%s'\'' "$@"\n' "$command_mark" "$quoted" >"$command_file"
  chmod +x "$command_file"
  case ":$PATH:" in *":$bin_dir:"*) echo "ready"; return 0 ;; esac
  if [ "$modify_path" = false ]; then
    echo "not-on-path"
    return 0
  fi
  profile=$(shell_profile)
  if grep -qs "$command_mark" "$profile"; then
    echo "profile-kept $profile"
    return 0
  fi
  mkdir -p "$(dirname "$profile")"
  # shellcheck disable=SC2016 # the PATH lines are written as is, for the shell to expand later
  case "$profile" in
    *.fish) printf '# %s: the clipsave-helper command.\ncontains $HOME/.local/bin $PATH; or set -gx PATH $HOME/.local/bin $PATH\n' "$command_mark" >>"$profile" ;;
    *) printf '\n# %s: the clipsave-helper command.\ncase ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac\n' "$command_mark" >>"$profile" ;;
  esac
  echo "profile $profile"
}

remove_command() {
  if grep -qs "$command_mark" "$command_file"; then rm -f "$command_file"; fi
  all_profiles | while IFS= read -r profile; do
    grep -qs "$command_mark" "$profile" || continue
    case "$profile" in
      *clipsave.fish) rm -f "$profile" ;;
      *)
        # The marker line and the line after it.
        awk -v mark="$command_mark" 'index($0, mark) { skip = 2 } skip > 0 { skip--; next } { print }' "$profile" >"$profile.clipsave" &&
          cat "$profile.clipsave" >"$profile" && rm -f "$profile.clipsave"
        ;;
    esac
  done
}

# ── Remove ──────────────────────────────────────────────────────────────────────────────────────────────
if [ "$uninstall" = true ]; then
  say ""
  say "  ${pink}${sym_dot}${reset} ${bold}ClipSave${reset}  ${dim}uninstall${reset}"
  say ""
  if [ -x "$helper" ]; then
    "$helper" --uninstall >/dev/null 2>&1 || true
    ok "Disconnected from your browsers"
  fi
  rm -rf "$dest/helper" "$dest/extension" "$dest/browsers"
  rmdir "$dest" 2>/dev/null || true
  ok "Removed the helper" "$(pretty "$dest")"
  remove_command
  ok "Removed the clipsave-helper command"
  say ""
  say "  Your saved videos are untouched."
  say "  ${dim}If you loaded ClipSave from $(pretty "$dest/extension"), remove it on your browser's extensions page too.${reset}"
  say ""
  report "ok removed"
  exit 0
fi

# ── yt-dlp ──────────────────────────────────────────────────────────────────────────────────────────────
# Replaces yt-dlp with its newest release. Prints why and returns 1 when it can't; nothing changes then.
update_ytdlp() {
  vendor="$dest/helper/vendor"
  [ -d "$vendor" ] || { why="The ClipSave Helper isn't installed here yet."; return 1; }
  run "Getting yt-dlp's checksums" "" curl -fsSL --proto-redir =https --retry 2 -o "$work/SHA2-256SUMS" "$YTDLP_BASE/SHA2-256SUMS" ||
    { why="Couldn't download yt-dlp's checksums."; return 1; }
  run "Downloading the newest yt-dlp" "$work/$ytdlp" fetch "$YTDLP_BASE/$ytdlp" "$work/$ytdlp" ||
    { why="Couldn't download yt-dlp."; return 1; }
  verified "$work/$ytdlp" "$work/SHA2-256SUMS" "$ytdlp" ||
    { why="The yt-dlp download doesn't match its published checksum, so nothing was changed."; return 1; }
  case "$ytdlp" in
    *.zip)
      rm -rf "$work/yt-dlp_macos"
      mkdir "$work/yt-dlp_macos"
      run "Unpacking yt-dlp" "" unzip -q -o "$work/$ytdlp" -d "$work/yt-dlp_macos" || { why="Couldn't unpack yt-dlp."; return 1; }
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
ytdlp_version() { "$helper" --version 2>/dev/null | awk '/yt-dlp:/ { gsub(/[()]/, "", $NF); print $NF }'; }

if [ "$ytdlp_only" = true ]; then
  update_ytdlp || fail "$why"
  version=$(ytdlp_version)
  report "ok yt-dlp ${version:-updated}"
  ok "yt-dlp is up to date" "${version:-}"
  exit 0
fi

# ── Install ─────────────────────────────────────────────────────────────────────────────────────────────
say ""
say "  ${pink}${sym_dot}${reset} ${bold}ClipSave${reset}  ${dim}save videos and audio from your browser${reset}"
say ""

# Which browsers: from the options, else asked, else the earlier choice, else the ones on this computer.
saved=""
[ ! -f "$chosen_file" ] || saved=$(tr -d ' \n' <"$chosen_file")
if [ -n "$browsers" ]; then
  browsers=$(normalize_browsers "$browsers")
  ok "Browsers" "$(list_names "$browsers")"
elif [ "$from_helper" = true ]; then
  # Installs from before the choice existed connect to every browser that's set up, as they did.
  browsers=$saved
else
  preset=$saved
  if [ -z "$preset" ]; then
    for id in $browser_ids; do found "$id" && preset="${preset:+$preset,}$id"; done
  fi
  if tty_ok; then
    pick_browsers "${preset:-chrome}"
    browsers=$picked
  elif [ -n "$preset" ]; then
    browsers=$preset
    ok "Browsers" "$(list_names "$browsers")"
  else
    fail "No browser found. Choose some with --browsers, for example: sh -s -- --browsers chrome,firefox"
  fi
fi

wants_extension=false
if [ -z "$browsers" ] || [ -d "$dest/extension" ]; then
  wants_extension=true
else
  for id in $(printf '%s' "$browsers" | tr ',' ' '); do is_chromium "$id" && wants_extension=true; done
fi

run "Downloading the ClipSave Helper" "$work/$asset" fetch "$BASE/$asset" "$work/$asset" ||
  fail "Couldn't download the helper. Check your internet connection and try again."
size=$(wc -c <"$work/$asset" | awk '{ printf "%.0f MB", $1 / 1048576 }')
run "Checking it" "" curl -fsSL --proto-redir =https --retry 2 -o "$work/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt" ||
  fail "Couldn't download the checksums."
verified "$work/$asset" "$work/SHA256SUMS.txt" "$asset" ||
  fail "The download doesn't match its published checksum, so nothing was installed."
ok "Downloaded the helper" "$size, checksum verified"

run "Unpacking" "" tar -xzf "$work/$asset" -C "$work" || fail "Couldn't unpack the helper."
mkdir -p "$dest"
swap "$work/helper" "$dest/helper"
ok "Installed it" "$(pretty "$dest/helper")"

# The release's yt-dlp is as old as the release; sites change faster. Not getting the newest is no reason
# to stop, since the release's own copy works.
if update_ytdlp; then
  ok "Got the newest yt-dlp"
else
  warn "Kept the release's yt-dlp: $why"
fi

# The extension for Chrome, Edge and Brave. Older releases don't have it, which is fine.
extension=clipsave-extension-chromium.tar.gz
if [ "$wants_extension" = true ] && [ -n "$(listed "$work/SHA256SUMS.txt" "$extension")" ]; then
  if run "Downloading the extension" "$work/$extension" fetch "$BASE/$extension" "$work/$extension" &&
    verified "$work/$extension" "$work/SHA256SUMS.txt" "$extension" &&
    tar -xzf "$work/$extension" -C "$work"; then
    # Tells the extension it was loaded from this folder, so Settings can offer one-click updates.
    printf '{ "managedBy": "clipsave-installer" }\n' >"$work/extension/managed.json"
    swap "$work/extension" "$dest/extension"
    ok "Downloaded the extension for Chrome, Edge and Brave"
  else
    warn "The extension download didn't check out, so the old copy stays."
  fi
fi

unquarantine "$dest"
# macOS checks a new app the first time it runs, which can take a few seconds.
if [ -n "$browsers" ]; then
  run "Connecting to $(list_names "$browsers")" "" "$helper" --install --browsers "$browsers" ||
    fail "The helper couldn't connect to your browsers."
  printf '%s\n' "$browsers" >"$chosen_file"
else
  run "Connecting to your browsers" "" "$helper" --install ||
    fail "The helper couldn't connect to your browsers. Open your browser once, then try again."
fi
connected=$(awk -F': ' '$2 == "registered" { printf "%s%s", sep, $1; sep = ", " }' "$log")
ok "Connected" "${connected:-your browsers}"
# One browser can refuse while the rest work (macOS can block a folder).
grep "couldn't register" "$log" | while IFS= read -r line; do warn "$line"; done

version=$("$helper" --version | head -1)
report "ok $version"

if [ "$from_helper" = true ]; then
  exit 0
fi

command_state=$(add_command) || command_state=failed
case "$command_state" in
  failed) warn "Couldn't add the clipsave-helper command. The helper itself is installed and works." ;;
  kept) note "Left your own $(pretty "$command_file") as it is." ;;
  ready) ok "Added the clipsave-helper command" ;;
  not-on-path) ok "Added the clipsave-helper command" "in $(pretty "$bin_dir"), which isn't on your PATH" ;;
  profile-kept*) ok "The clipsave-helper command is ready" "in new terminal windows" ;;
  profile*) ok "Added the clipsave-helper command" "to your PATH in $(pretty "${command_state#profile }")" ;;
esac

# ── What's left: adding the extension ───────────────────────────────────────────────────────────────────
say ""
say "  ${green}${bold}${sym_ok} ClipSave ${version#clipsave-helper } is installed.${reset}"

todo_chromium=""
todo_firefox=false
done_names=""
for id in $(printf '%s' "${browsers:-$browser_ids}" | tr ',' ' '); do
  if [ -z "$browsers" ] && ! found "$id"; then continue; fi
  if has_extension "$id"; then
    done_names="${done_names:+$done_names, }$(name_of "$id")"
  elif is_chromium "$id"; then
    todo_chromium="${todo_chromium:+$todo_chromium,}$id"
  else
    todo_firefox=true
  fi
done
[ -z "$done_names" ] || note "$done_names already $( [ "${done_names#*,}" = "$done_names" ] && echo has || echo have) the extension: you're all set there."

step=0
if [ -n "$todo_chromium" ] && [ -d "$dest/extension" ]; then
  pages=""
  for id in $(printf '%s' "$todo_chromium" | tr ',' ' '); do
    case "$id" in edge) page="edge://extensions" ;; brave) page="brave://extensions" ;; *) page="chrome://extensions" ;; esac
    case ", $pages, " in *", $page, "*) ;; *) pages="${pages:+$pages, }$page" ;; esac
  done
  copied=""
  if [ "$fancy" = false ]; then
    :
  elif [ "$(uname -s)" = Darwin ]; then
    printf '%s' "$dest/extension" | pbcopy 2>/dev/null && copied=true
  else
    for clip in "wl-copy" "xclip -selection clipboard" "xsel --clipboard --input"; do
      command -v "${clip%% *}" >/dev/null 2>&1 || continue
      printf '%s' "$dest/extension" | $clip 2>/dev/null && copied=true && break
    done
  fi
  say ""
  say "  ${bold}Add the extension to $(list_names "$todo_chromium")${reset}  ${dim}(once)${reset}"
  say "    ${cyan}1${reset}  Go to ${bold}$pages${reset}"
  say "    ${cyan}2${reset}  Turn on ${bold}Developer mode${reset}, top right"
  say "    ${cyan}3${reset}  Click ${bold}Load unpacked${reset} and choose this folder:"
  say "       ${pink}$(pretty "$dest/extension")${reset}"
  if [ -n "$copied" ]; then
    if [ "$(uname -s)" = Darwin ]; then
      note "   The path is copied: in the folder window, press ⌘⇧G, paste it and press Return."
    else
      note "   The path is copied: in the folder window, press Ctrl+L, paste it and press Return."
    fi
  fi
  note "   Settings keeps it up to date from then on."
  step=1
fi
if [ "$todo_firefox" = true ]; then
  say ""
  say "  ${bold}Add the extension to Firefox${reset}"
  say "    Open ${pink}$FIREFOX_ADDON${reset}"
  say "    and click ${bold}Add to Firefox${reset}. Firefox keeps it up to date."
  step=1
fi
say ""
if [ "$step" = 1 ]; then
  say "  ${dim}Pictures of each step: $GUIDE${reset}"
fi
case "$command_state" in
  "profile "*) say "  ${dim}Open a new terminal window to use the clipsave-helper command.${reset}" ;;
esac
say ""
