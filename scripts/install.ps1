# Installs or updates the ClipSave Helper for the current user on Windows, and registers it with the
# browsers. Everything it needs (yt-dlp, ffmpeg, a JavaScript runtime) comes with it. No administrator
# rights are needed.
#
#   irm https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.ps1 | iex
#
# To remove it:
#
#   & ([scriptblock]::Create((irm https://github.com/sahedulislamrony/ClipSave-Extensions/releases/latest/download/install.ps1))) -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'sahedulislamrony/ClipSave-Extensions'
# CLIPSAVE_RELEASE_URL points the installer at another copy of the release files, for testing.
$base = if ($env:CLIPSAVE_RELEASE_URL) { $env:CLIPSAVE_RELEASE_URL } else { "https://github.com/$repo/releases/latest/download" }
$asset = 'clipsave-helper-windows-x86_64.zip'
$dest = Join-Path $env:LOCALAPPDATA 'ClipSave'
$helper = Join-Path $dest 'helper\clipsave-helper.exe'

if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'The ClipSave Helper needs 64-bit Windows.'
}

if ($Uninstall) {
  if (Test-Path $helper) { & $helper --uninstall }
  Remove-Item -Recurse -Force (Join-Path $dest 'helper') -ErrorAction SilentlyContinue
  Remove-Item -Force $dest -ErrorAction SilentlyContinue
  Write-Host 'The ClipSave Helper is removed. Your saved videos are untouched.'
  return
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("clipsave-" + [Guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
try {
  Write-Host 'Downloading the ClipSave Helper (about 115 MB)...'
  Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile (Join-Path $work $asset)
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS.txt" -OutFile (Join-Path $work 'SHA256SUMS.txt')

  $expected = (Get-Content (Join-Path $work 'SHA256SUMS.txt') |
    Where-Object { ($_ -split '\s+')[1] -eq $asset } |
    ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $work $asset)).Hash.ToLower()
  if (-not $expected -or $expected -ne $actual) {
    throw "The download doesn't match its published checksum, so nothing was installed."
  }

  Expand-Archive -Force (Join-Path $work $asset) $work
  New-Item -ItemType Directory -Force $dest | Out-Null
  # A running helper keeps its files open; it stops on its own once the browser is idle.
  Get-Process clipsave-helper -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force (Join-Path $dest 'helper') -ErrorAction SilentlyContinue
  Move-Item (Join-Path $work 'helper') (Join-Path $dest 'helper')
  & $helper --install
  if ($LASTEXITCODE -ne 0) { throw 'The helper could not register itself with your browsers.' }
  Write-Host ''
  $version = @(& $helper --version)
  Write-Host "Installed $($version[0]) in $dest\helper"
  Write-Host 'Done. Go back to your browser: ClipSave carries on by itself.'
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
