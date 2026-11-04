# Installs or updates the ClipSave Helper for the current user on Windows, and registers it with the
# browsers. Everything it needs (yt-dlp, ffmpeg, a JavaScript runtime) comes with it. No administrator
# rights are needed. It also keeps a copy of the extension for Chrome, Edge and Brave next to the helper:
# load that folder once with "Load unpacked", and ClipSave's Settings can update it in one click.
#
#   irm https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.ps1 | iex
#
# To remove it:
#
#   & ([scriptblock]::Create((irm https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.ps1))) -Uninstall
#
# The helper runs it itself for one-click updates, with -FromHelper (quiet), -YtDlpOnly (only replace yt-dlp
# with its newest release) and -Result <file> ("ok <version>" or "failed <reason>" is written there).
param([switch]$Uninstall, [switch]$FromHelper, [switch]$YtDlpOnly, [string]$Result = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'sahedulislamrony/ClipSave-Extensions'
# CLIPSAVE_RELEASE_URL points the installer at another copy of the release files, for testing.
$base = if ($env:CLIPSAVE_RELEASE_URL) { $env:CLIPSAVE_RELEASE_URL } else { "https://github.com/$repo/releases/latest/download" }
$ytdlpBase = if ($env:CLIPSAVE_YTDLP_URL) { $env:CLIPSAVE_YTDLP_URL } else { 'https://github.com/yt-dlp/yt-dlp/releases/latest/download' }
$asset = 'clipsave-helper-windows-x86_64.zip'
$extensionAsset = 'clipsave-extension-chromium.tar.gz'
$dest = Join-Path $env:LOCALAPPDATA 'ClipSave'
$helper = Join-Path $dest 'helper\clipsave-helper.exe'

function Say([string]$text) { if (-not $FromHelper) { Write-Host $text } }
function Report([string]$text) { if ($Result) { Set-Content -LiteralPath $Result -Value $text -Encoding UTF8 } }

# The checksum listed for $name in the file $sums, or nothing.
function Listed([string]$sums, [string]$name) {
  (Get-Content $sums | Where-Object { ($_ -split '\s+')[1] -in @($name, "*$name") } |
    ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1
}
function Verified([string]$file, [string]$sums, [string]$name) {
  $expected = Listed $sums $name
  $expected -and $expected -eq (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
}

# A running helper keeps its files open; one-click updates start this script from it, so it's stopped here.
function Stop-Helper {
  Get-Process clipsave-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

# Replaces the folder $to with $from, keeping the old one until the new one is in place.
function Swap([string]$from, [string]$to) {
  $old = "$to.old"
  Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue
  if (Test-Path $to) { Move-Item $to $old }
  Move-Item $from $to
  Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue
}

if (-not [Environment]::Is64BitOperatingSystem) {
  Report 'failed The ClipSave Helper needs 64-bit Windows.'
  throw 'The ClipSave Helper needs 64-bit Windows.'
}

if ($Uninstall) {
  if (Test-Path $helper) { & $helper --uninstall }
  Stop-Helper
  Remove-Item -Recurse -Force (Join-Path $dest 'helper'), (Join-Path $dest 'extension') -ErrorAction SilentlyContinue
  Remove-Item -Force $dest -ErrorAction SilentlyContinue
  Write-Host 'The ClipSave Helper is removed. Your saved videos are untouched.'
  Write-Host "If you loaded ClipSave from $dest\extension, remove it on your browser's extensions page too."
  return
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("clipsave-" + [Guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
try {
  # Replaces yt-dlp with its newest release; throws, changing nothing, when it can't.
  function Update-YtDlp {
    $vendor = Join-Path $dest 'helper\vendor'
    if (-not (Test-Path $vendor)) { throw "The ClipSave Helper isn't installed here yet." }
    Say 'Downloading the newest yt-dlp...'
    Invoke-WebRequest -UseBasicParsing "$ytdlpBase/SHA2-256SUMS" -OutFile (Join-Path $work 'SHA2-256SUMS')
    Invoke-WebRequest -UseBasicParsing "$ytdlpBase/yt-dlp.exe" -OutFile (Join-Path $work 'yt-dlp.exe')
    if (-not (Verified (Join-Path $work 'yt-dlp.exe') (Join-Path $work 'SHA2-256SUMS') 'yt-dlp.exe')) {
      throw "The yt-dlp download doesn't match its published checksum, so nothing was changed."
    }
    Stop-Helper
    Move-Item -Force (Join-Path $work 'yt-dlp.exe') (Join-Path $vendor 'yt-dlp.exe')
  }

  if ($YtDlpOnly) {
    Update-YtDlp
    $version = (& (Join-Path $dest 'helper\vendor\yt-dlp.exe') --version | Select-Object -First 1)
    Report "ok yt-dlp $version"
    Say "Done. yt-dlp is now $version."
    return
  }

  Say 'Downloading the ClipSave Helper (about 115 MB)...'
  Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile (Join-Path $work $asset)
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS.txt" -OutFile (Join-Path $work 'SHA256SUMS.txt')
  $sums = Join-Path $work 'SHA256SUMS.txt'
  if (-not (Verified (Join-Path $work $asset) $sums $asset)) {
    throw "The download doesn't match its published checksum, so nothing was installed."
  }

  Expand-Archive -Force (Join-Path $work $asset) $work
  New-Item -ItemType Directory -Force $dest | Out-Null
  Stop-Helper
  Swap (Join-Path $work 'helper') (Join-Path $dest 'helper')
  # The release's yt-dlp is as old as the release; sites change faster. Not getting the newest is no reason
  # to stop, since the release's own copy works.
  try { Update-YtDlp } catch { Write-Warning "Kept the release's yt-dlp: the newest couldn't be fetched." }

  # The extension for Chrome, Edge and Brave. Older releases don't have it, which is fine.
  if (Listed $sums $extensionAsset) {
    Say 'Downloading the extension for Chrome, Edge and Brave...'
    $file = Join-Path $work $extensionAsset
    try {
      Invoke-WebRequest -UseBasicParsing "$base/$extensionAsset" -OutFile $file
      if (-not (Verified $file $sums $extensionAsset)) { throw 'checksum' }
      tar -xzf $file -C $work
      if ($LASTEXITCODE -ne 0) { throw 'unpack' }
      # Tells the extension it was loaded from this folder, so Settings can offer one-click updates.
      Set-Content -LiteralPath (Join-Path $work 'extension\managed.json') -Value '{ "managedBy": "clipsave-installer" }' -Encoding ASCII
      Swap (Join-Path $work 'extension') (Join-Path $dest 'extension')
    }
    catch {
      Write-Warning "The extension download didn't check out, so the old copy stays."
    }
  }

  & $helper --install
  if ($LASTEXITCODE -ne 0) { throw 'The helper could not register itself with your browsers.' }
  $version = @(& $helper --version)[0]
  Report "ok $version"
  if (-not $FromHelper) {
    Write-Host ''
    Write-Host "Installed $version in $dest\helper"
    if (Test-Path (Join-Path $dest 'extension')) {
      Write-Host ''
      Write-Host 'Chrome, Edge or Brave: on the extensions page, turn on Developer mode, choose Load unpacked and select'
      Write-Host "  $dest\extension"
      Write-Host "ClipSave's Settings can then update it in one click."
    }
    Write-Host 'Done. Go back to your browser: ClipSave carries on by itself.'
  }
}
catch {
  Report "failed $($_.Exception.Message)"
  throw
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
