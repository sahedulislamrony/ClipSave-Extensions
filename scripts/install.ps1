# Installs or updates ClipSave for the current user on Windows: the helper app that does the downloading (with
# yt-dlp, ffmpeg and a JavaScript runtime), connected to the browsers you choose, and a copy of the extension
# for Chrome, Edge and Brave to load once with "Load unpacked". ClipSave's Settings then updates both in one
# click. No administrator rights are needed.
#
#   irm https://ext.clipsave.link/install.ps1 | iex
#
# With options:
#
#   & ([scriptblock]::Create((irm https://ext.clipsave.link/install.ps1))) -Browsers chrome,firefox
#
#   -Browsers <list>   connect these browsers without asking: chrome, chromium, edge, brave, firefox
#   -All               connect every supported browser without asking
#   -NoModifyPath      don't add the clipsave-helper command to your PATH
#   -Uninstall         remove ClipSave's helper, its command and its browser connections
#
# The helper runs it itself for one-click updates, with -FromHelper (quiet), -YtDlpOnly (only replace yt-dlp
# with its newest release) and -Result <file> ("ok <version>" or "failed <reason>" is written there).
param(
  [switch]$Uninstall,
  [switch]$FromHelper,
  [switch]$YtDlpOnly,
  [string]$Result = '',
  [string[]]$Browsers = @(),
  [switch]$All,
  [switch]$NoModifyPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Windows PowerShell 5.1 may not offer TLS 1.2 by itself, and GitHub needs it.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$repo = 'sahedulislamrony/ClipSave-Extensions'
# CLIPSAVE_RELEASE_URL points the installer at another copy of the release files, for testing.
$base = if ($env:CLIPSAVE_RELEASE_URL) { $env:CLIPSAVE_RELEASE_URL } else { "https://github.com/$repo/releases/latest/download" }
$ytdlpBase = if ($env:CLIPSAVE_YTDLP_URL) { $env:CLIPSAVE_YTDLP_URL } else { 'https://github.com/yt-dlp/yt-dlp/releases/latest/download' }
$guide = "https://github.com/$repo/blob/main/docs/install.md"
# Firefox Add-ons finds an add-on by its ID too.
$firefoxAddon = 'https://addons.mozilla.org/firefox/addon/clipsave@sahedulislamrony.github.io/'
$chromeId = 'engejhilbedikenhabjndbpgpdhaedge'
$firefoxId = 'clipsave@sahedulislamrony.github.io'
# The computer's processor, not this PowerShell's: on a Windows on Arm PC an x64 PowerShell runs emulated and
# reports AMD64, but the system's own setting says ARM64.
$machineArch = $null
try {
  $machineArch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -Name PROCESSOR_ARCHITECTURE -ErrorAction Stop).PROCESSOR_ARCHITECTURE
}
catch { }
if (-not $machineArch) { $machineArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE } }
if ($machineArch -eq 'ARM64') {
  $asset = 'clipsave-helper-windows-arm64.zip'
  $ytdlpAsset = 'yt-dlp_arm64.exe'
}
else {
  $asset = 'clipsave-helper-windows-x86_64.zip'
  $ytdlpAsset = 'yt-dlp.exe'
}
$extensionAsset = 'clipsave-extension-chromium.tar.gz'
$dest = Join-Path $env:LOCALAPPDATA 'ClipSave'
$helperDir = Join-Path $dest 'helper'
$helper = Join-Path $helperDir 'clipsave-helper.exe'
$chosenFile = Join-Path $dest 'browsers'

# -- Looks ---------------------------------------------------------------------------------------------------
# Colors and animation only for a person at a console; plain lines for logs and one-click updates.
$fancy = (-not $FromHelper) -and ($Host.Name -eq 'ConsoleHost') -and (-not [Console]::IsOutputRedirected)
# The classic console's fonts lack these; Windows Terminal and VS Code have them. They're made from character
# codes because this file must stay plain ASCII: Windows PowerShell may read it as Windows-1252, where UTF-8
# punctuation can turn into quote marks.
if ($fancy -and ($env:WT_SESSION -or $env:TERM_PROGRAM)) {
  $sym = @{ ok = [string][char]0x2713; fail = [string][char]0x2717; dot = [string][char]0x25C6; on = [string][char]0x25C9; off = [string][char]0x25CB; ptr = [string][char]0x276F; full = [char]0x2501; empty = [char]0x2500 }
  $frames = @(0x280B, 0x2819, 0x2839, 0x2838, 0x283C, 0x2834, 0x2826, 0x2827, 0x2807, 0x280F) | ForEach-Object { [string][char]$_ }
}
else {
  $sym = @{ ok = '+'; fail = 'x'; dot = '*'; on = '[x]'; off = '[ ]'; ptr = '>'; full = '#'; empty = '-' }
  $frames = @('|', '/', '-', '\')
}
$width = 80
if ($fancy) { try { $width = [Math]::Max(40, [Console]::WindowWidth) } catch { } }

function Say([string]$text = '') { if (-not $FromHelper) { Write-Host $text } }
function Ok([string]$text, [string]$detail = '') {
  if ($FromHelper) { return }
  Write-Host "  $($sym.ok) " -ForegroundColor Green -NoNewline
  if ($detail) { Write-Host "$text  " -NoNewline; Write-Host $detail -ForegroundColor DarkGray } else { Write-Host $text }
}
# Warnings also reach the log of a one-click update.
function Warn([string]$text) { Write-Host "  ! $text" -ForegroundColor Yellow }
function Note([string]$text) { if (-not $FromHelper) { Write-Host "    $text" -ForegroundColor DarkGray } }
function Clear-Line { if ($fancy) { Write-Host -NoNewline ("`r" + (' ' * ($width - 1)) + "`r") } }
function Report([string]$text) { if ($Result) { Set-Content -LiteralPath $Result -Value $text -Encoding UTF8 } }

# One frame of a step that's under way: a spinner, the label, and how far a download has got.
function Show-Step([string]$label, [int]$frame, [long]$have = -1, [long]$total = 0) {
  Write-Host -NoNewline ("`r" + (' ' * ($width - 1)) + "`r")
  Write-Host "  $($frames[$frame % $frames.Count]) " -ForegroundColor Magenta -NoNewline
  Write-Host "$label  " -NoNewline
  if ($have -lt 0) { return }
  $mb = '{0:N0}' -f ($have / 1MB)
  if ($total -le 0) { Write-Host "$mb MB" -ForegroundColor DarkGray -NoNewline; return }
  $part = [Math]::Min(1.0, $have / $total)
  $barWidth = [Math]::Min(24, $width - $label.Length - 32)
  if ($barWidth -ge 8) {
    $n = [int][Math]::Round($part * $barWidth)
    Write-Host ([string]$sym.full * $n) -ForegroundColor Magenta -NoNewline
    Write-Host (([string]$sym.empty * ($barWidth - $n)) + '  ') -ForegroundColor DarkGray -NoNewline
  }
  Write-Host ('{0,3}%  {1} / {2:N0} MB' -f [int]($part * 100), $mb, ($total / 1MB)) -ForegroundColor DarkGray -NoNewline
}

# -- Steps ---------------------------------------------------------------------------------------------------
Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromMinutes(30)

# Downloads $url to $out, showing how much of it has come.
function Get-File([string]$url, [string]$out, [string]$label) {
  if (-not $fancy) {
    Say "  $label..."
    Invoke-WebRequest -UseBasicParsing $url -OutFile $out
    return
  }
  Show-Step $label 0
  $response = $http.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  try {
    if (-not $response.IsSuccessStatusCode) { throw "$url answered $([int]$response.StatusCode)" }
    $total = 0
    if ($response.Content.Headers.ContentLength) { $total = [long]$response.Content.Headers.ContentLength }
    $in = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $file = [IO.File]::Create($out)
    try {
      $buffer = New-Object byte[] 262144
      $have = [long]0
      $frame = 0
      $shown = [DateTime]::MinValue
      while (($n = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $file.Write($buffer, 0, $n)
        $have += $n
        if (([DateTime]::UtcNow - $shown).TotalMilliseconds -ge 100) {
          $shown = [DateTime]::UtcNow
          Show-Step $label ($frame++) $have $total
        }
      }
    }
    finally { $file.Dispose(); $in.Dispose() }
  }
  finally { $response.Dispose(); Clear-Line }
}

# Runs a program with a spinner beside $label, so nothing ever sits silent. Its output goes to $log; its exit
# code is returned.
$log = ''
function Invoke-Step([string]$label, [string]$program, [string[]]$arguments) {
  $quoted = ($arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $errors = "$log.err"
  if (-not $fancy) { Say "  $label..." }
  $process = Start-Process -FilePath $program -ArgumentList $quoted -NoNewWindow -PassThru `
    -RedirectStandardOutput $log -RedirectStandardError $errors
  # Windows PowerShell only keeps the exit code when the handle was read while it ran.
  $null = $process.Handle
  $frame = 0
  while (-not $process.WaitForExit(100)) {
    if ($fancy) { Show-Step $label ($frame++) }
  }
  Clear-Line
  Get-Content $errors -ErrorAction SilentlyContinue | Add-Content $log
  $process.ExitCode
}

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

# Unpacks an archive with Windows' own tar, which is much faster than Expand-Archive on a large zip.
function Expand-Release([string]$archive, [string]$to, [string]$label) {
  if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
    if ((Invoke-Step $label 'tar.exe' @('-xf', $archive, '-C', $to)) -eq 0) { return }
  }
  if ($archive -notlike '*.zip') { throw "Couldn't unpack $archive." }
  if ($fancy) { Show-Step $label 0 }
  Expand-Archive -Force $archive $to
  Clear-Line
}

# -- Browsers ------------------------------------------------------------------------------------------------
# Each browser: the id the helper's -Browsers takes, its name, the programs and first-run files that show it's
# here, and where it keeps what it knows about its extensions.
$programFiles = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs')) | Where-Object { $_ }
function In-Programs([string]$rest) { $programFiles | ForEach-Object { Join-Path $_ $rest } }
$browserTable = @(
  @{ id = 'chrome'; name = 'Chrome'; profile = "$env:LOCALAPPDATA\Google\Chrome\User Data"
     signs = @("$env:LOCALAPPDATA\Google\Chrome\User Data\Local State", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") + (In-Programs 'Google\Chrome\Application\chrome.exe') }
  @{ id = 'chromium'; name = 'Chromium'; profile = "$env:LOCALAPPDATA\Chromium\User Data"
     signs = @("$env:LOCALAPPDATA\Chromium\User Data\Local State", "$env:LOCALAPPDATA\Chromium\Application\chrome.exe") }
  # Every Windows has Edge, so it counts as here only once it's been used.
  @{ id = 'edge'; name = 'Edge'; profile = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
     signs = @("$env:LOCALAPPDATA\Microsoft\Edge\User Data\Local State") }
  @{ id = 'brave'; name = 'Brave'; profile = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data"
     signs = @("$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Local State") + (In-Programs 'BraveSoftware\Brave-Browser\Application\brave.exe') }
  @{ id = 'firefox'; name = 'Firefox'; profile = "$env:APPDATA\Mozilla\Firefox\Profiles"
     signs = @("$env:APPDATA\Mozilla\Firefox\profiles.ini") + (In-Programs 'Mozilla Firefox\firefox.exe') }
)
$browserIds = $browserTable | ForEach-Object { $_.id }
function Browser([string]$id) { $browserTable | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
function Name-List([string[]]$ids) { ($ids | ForEach-Object { (Browser $_).name }) -join ', ' }
function Is-Found([string]$id) { [bool]((Browser $id).signs | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1) }
function Has-Extension([string]$id) {
  $b = Browser $id
  if (-not (Test-Path -LiteralPath $b.profile)) { return $false }
  $files = if ($id -eq 'firefox') {
    Get-ChildItem -LiteralPath $b.profile -Directory | ForEach-Object { Join-Path $_.FullName 'extensions.json' }
  }
  else {
    Get-ChildItem -LiteralPath $b.profile -Directory | ForEach-Object { Join-Path $_.FullName 'Secure Preferences'; Join-Path $_.FullName 'Preferences' }
  }
  $mark = if ($id -eq 'firefox') { $firefoxId } else { $chromeId }
  [bool]($files | Where-Object { Test-Path -LiteralPath $_ } | Where-Object { Select-String -LiteralPath $_ -SimpleMatch $mark -Quiet } | Select-Object -First 1)
}

# Checks a -Browsers list, and turns "all" into every browser.
function Resolve-Browsers([string[]]$names) {
  $chosen = @()
  foreach ($name in ($names -join ',') -split '[,\s]+' | Where-Object { $_ }) {
    $name = $name.ToLower()
    if ($name -eq 'all') { return $browserIds }
    if ($browserIds -notcontains $name) {
      throw "There's no browser called `"$name`" here. Choose from: $($browserIds -join ', '), or all."
    }
    if ($chosen -notcontains $name) { $chosen += $name }
  }
  if (-not $chosen) { throw 'Name at least one browser after -Browsers.' }
  $chosen
}

# A checklist: arrows move, space or the number ticks, A ticks all, Enter carries on.
function Select-Browsers([string[]]$preset) {
  # Chromium only when it's here, to keep the list short.
  $items = @($browserIds | Where-Object { $_ -ne 'chromium' -or (Is-Found $_) })
  $here = @($items | Where-Object { Is-Found $_ })
  $selected = @($items | Where-Object { $preset -contains $_ })
  $at = 0
  $message = ''
  Write-Host '  Which browsers should ClipSave work with?' -ForegroundColor White
  Write-Host '  Up/Down move, Space select, A all, Enter continue' -ForegroundColor DarkGray
  Write-Host ''
  # Room for the list first, so drawing it never scrolls the window and moves it.
  $rows = $items.Count + 1
  1..$rows | ForEach-Object { Write-Host '' }
  $top = [Console]::CursorTop - $rows
  [Console]::CursorVisible = $false
  try {
    while ($true) {
      [Console]::SetCursorPosition(0, $top)
      for ($i = 0; $i -lt $items.Count; $i++) {
        $id = $items[$i]
        Write-Host (' ' * ($width - 1)) -NoNewline; Write-Host "`r" -NoNewline
        $pointer = if ($i -eq $at) { $sym.ptr } else { ' ' }
        Write-Host "  $pointer " -ForegroundColor Magenta -NoNewline
        if ($selected -contains $id) { Write-Host $sym.on -ForegroundColor Magenta -NoNewline } else { Write-Host $sym.off -ForegroundColor DarkGray -NoNewline }
        Write-Host " $($i + 1) " -ForegroundColor DarkGray -NoNewline
        $name = '{0,-15}' -f (Browser $id).name
        if ($i -eq $at) { Write-Host $name -ForegroundColor White -NoNewline } else { Write-Host $name -NoNewline }
        if ($here -contains $id) { Write-Host 'found on this computer' -ForegroundColor DarkGray } else { Write-Host '' }
      }
      Write-Host (' ' * ($width - 1)) -NoNewline; Write-Host "`r  $message" -ForegroundColor Yellow
      $message = ''
      $key = [Console]::ReadKey($true)
      $toggle = -1
      switch ($key.Key) {
        'UpArrow' { $at = ($at - 1 + $items.Count) % $items.Count }
        'DownArrow' { $at = ($at + 1) % $items.Count }
        'K' { $at = ($at - 1 + $items.Count) % $items.Count }
        'J' { $at = ($at + 1) % $items.Count }
        'Spacebar' { $toggle = $at }
        'X' { $toggle = $at }
        'A' { $selected = @($items) }
        'Enter' { if ($selected.Count) { return @($items | Where-Object { $selected -contains $_ }) } else { $message = 'Pick at least one browser.' } }
        default { if ($key.KeyChar -match '^[1-9]$' -and [int]"$($key.KeyChar)" -le $items.Count) { $toggle = [int]"$($key.KeyChar)" - 1 } }
      }
      if ($toggle -ge 0) {
        $id = $items[$toggle]
        if ($selected -contains $id) { $selected = @($selected | Where-Object { $_ -ne $id }) } else { $selected += $id }
      }
    }
  }
  finally {
    [Console]::CursorVisible = $true
    # The checklist folds into the one line Ok writes after it.
    $start = $top - 3
    [Console]::SetCursorPosition(0, $start)
    for ($i = 0; $i -lt $rows + 3; $i++) { Write-Host (' ' * ($width - 1)) }
    [Console]::SetCursorPosition(0, $start)
  }
}

# -- The clipsave-helper command -----------------------------------------------------------------------------
# The helper's folder on the user's PATH. Read and written as stored, so entries like %USERPROFILE%\bin keep
# their variables.
function Set-UserPath([scriptblock]$change) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  try {
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $parts = @($raw -split ';' | Where-Object { $_ })
    $new = @(& $change $parts)
    if (($new -join ';') -eq ($parts -join ';')) { return $false }
    $key.SetValue('Path', ($new -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)
  }
  finally { $key.Close() }
  # Tells open programs, Explorer among them, that the environment changed.
  [Environment]::SetEnvironmentVariable('CLIPSAVE_PATH_CHANGED', '1', 'User')
  [Environment]::SetEnvironmentVariable('CLIPSAVE_PATH_CHANGED', $null, 'User')
  $true
}

# -- Remove --------------------------------------------------------------------------------------------------
if (-not [Environment]::Is64BitOperatingSystem) {
  Report 'failed The ClipSave Helper needs 64-bit Windows.'
  throw 'The ClipSave Helper needs 64-bit Windows.'
}

if ($Uninstall) {
  Say ''
  Write-Host "  $($sym.dot) " -ForegroundColor Magenta -NoNewline; Write-Host 'ClipSave  ' -NoNewline; Write-Host 'uninstall' -ForegroundColor DarkGray
  Say ''
  if (Test-Path $helper) { & $helper --uninstall | Out-Null; Ok 'Disconnected from your browsers' }
  Stop-Helper
  Remove-Item -Recurse -Force $helperDir, (Join-Path $dest 'extension'), $chosenFile -ErrorAction SilentlyContinue
  Remove-Item -Force $dest -ErrorAction SilentlyContinue
  Ok 'Removed the helper' $dest
  if (Set-UserPath { param($parts) $parts | Where-Object { $_ -ne $helperDir } }) { Ok 'Removed the clipsave-helper command' }
  Say ''
  Say '  Your saved videos are untouched.'
  Note "If you loaded ClipSave from $dest\extension, remove it on your browser's extensions page too."
  Say ''
  Report 'ok removed'
  return
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("clipsave-" + [Guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
$log = Join-Path $work 'step.log'
try {
  # -- yt-dlp --------------------------------------------------------------------------------------------------
  # Replaces yt-dlp with its newest release; throws, changing nothing, when it can't.
  function Update-YtDlp {
    $vendor = Join-Path $helperDir 'vendor'
    if (-not (Test-Path $vendor)) { throw "The ClipSave Helper isn't installed here yet." }
    Get-File "$ytdlpBase/SHA2-256SUMS" (Join-Path $work 'SHA2-256SUMS') "Getting yt-dlp's checksums"
    Get-File "$ytdlpBase/$ytdlpAsset" (Join-Path $work 'yt-dlp.exe') 'Downloading the newest yt-dlp'
    if (-not (Verified (Join-Path $work 'yt-dlp.exe') (Join-Path $work 'SHA2-256SUMS') $ytdlpAsset)) {
      throw "The yt-dlp download doesn't match its published checksum, so nothing was changed."
    }
    Stop-Helper
    Move-Item -Force (Join-Path $work 'yt-dlp.exe') (Join-Path $vendor 'yt-dlp.exe')
  }

  if ($YtDlpOnly) {
    Update-YtDlp
    $version = (& (Join-Path $helperDir 'vendor\yt-dlp.exe') --version | Select-Object -First 1)
    Report "ok yt-dlp $version"
    Ok 'yt-dlp is up to date' $version
    return
  }

  # -- Install -------------------------------------------------------------------------------------------------
  Say ''
  if (-not $FromHelper) {
    Write-Host "  $($sym.dot) " -ForegroundColor Magenta -NoNewline; Write-Host 'ClipSave  ' -NoNewline
    Write-Host 'save videos and audio from your browser' -ForegroundColor DarkGray
  }
  Say ''

  # Which browsers: from the options, else asked, else the earlier choice, else the ones on this computer.
  $saved = @()
  if (Test-Path $chosenFile) { $saved = @((Get-Content $chosenFile -Raw).Trim() -split ',' | Where-Object { $browserIds -contains $_ }) }
  if ($All) { $Browsers = @('all') }
  if ($Browsers.Count) {
    $chosen = @(Resolve-Browsers $Browsers)
    Ok 'Browsers' (Name-List $chosen)
  }
  elseif ($FromHelper) {
    # Installs from before the choice existed connect to every browser that's set up, as they did.
    $chosen = $saved
  }
  else {
    $preset = if ($saved.Count) { $saved } else { @($browserIds | Where-Object { Is-Found $_ }) }
    $canAsk = $fancy
    if ($canAsk) { try { $null = [Console]::KeyAvailable } catch { $canAsk = $false } }
    if ($canAsk) {
      $chosen = @(Select-Browsers $(if ($preset.Count) { $preset } else { @('chrome') }))
      Ok 'Browsers' (Name-List $chosen)
    }
    elseif ($preset.Count) {
      $chosen = $preset
      Ok 'Browsers' (Name-List $chosen)
    }
    else {
      throw 'No browser found. Choose some with -Browsers, for example: -Browsers chrome,firefox'
    }
  }
  $wantsExtension = (-not $chosen.Count) -or (Test-Path (Join-Path $dest 'extension')) -or [bool]($chosen | Where-Object { $_ -ne 'firefox' })

  $archive = Join-Path $work $asset
  $sums = Join-Path $work 'SHA256SUMS.txt'
  try {
    Get-File "$base/$asset" $archive 'Downloading the ClipSave Helper'
    Get-File "$base/SHA256SUMS.txt" $sums 'Checking it'
  }
  catch { throw "Couldn't download the helper ($($_.Exception.Message)). Check your internet connection and try again." }
  if (-not (Verified $archive $sums $asset)) {
    throw "The download doesn't match its published checksum, so nothing was installed."
  }
  Ok 'Downloaded the helper' ('{0:N0} MB, checksum verified' -f ((Get-Item $archive).Length / 1MB))

  Expand-Release $archive $work 'Unpacking'
  New-Item -ItemType Directory -Force $dest | Out-Null
  Stop-Helper
  Swap (Join-Path $work 'helper') $helperDir
  Ok 'Installed it' $helperDir

  # The release's yt-dlp is as old as the release; sites change faster. Not getting the newest is no reason
  # to stop, since the release's own copy works.
  try { Update-YtDlp; Ok 'Got the newest yt-dlp' }
  catch { Clear-Line; Warn "Kept the release's yt-dlp: the newest couldn't be fetched." }

  # The extension for Chrome, Edge and Brave. Older releases don't have it, which is fine.
  if ($wantsExtension -and (Listed $sums $extensionAsset)) {
    $file = Join-Path $work $extensionAsset
    try {
      Get-File "$base/$extensionAsset" $file 'Downloading the extension'
      if (-not (Verified $file $sums $extensionAsset)) { throw 'checksum' }
      Expand-Release $file $work 'Unpacking the extension'
      # Tells the extension it was loaded from this folder, so Settings can offer one-click updates.
      Set-Content -LiteralPath (Join-Path $work 'extension\managed.json') -Value '{ "managedBy": "clipsave-installer" }' -Encoding ASCII
      Swap (Join-Path $work 'extension') (Join-Path $dest 'extension')
      Ok 'Downloaded the extension for Chrome, Edge and Brave'
    }
    catch {
      Clear-Line
      Warn "The extension download didn't check out, so the old copy stays."
    }
  }

  if ($chosen.Count) {
    $code = Invoke-Step "Connecting to $(Name-List $chosen)" $helper @('--install', '--browsers', ($chosen -join ','))
    if ($code -ne 0) { throw 'The helper could not connect to your browsers.' }
    Set-Content -LiteralPath $chosenFile -Value ($chosen -join ',') -Encoding ASCII
  }
  else {
    $code = Invoke-Step 'Connecting to your browsers' $helper @('--install')
    if ($code -ne 0) { throw 'The helper could not connect to your browsers.' }
  }
  $lines = @(Get-Content $log -ErrorAction SilentlyContinue)
  $connected = ($lines | Where-Object { $_ -match ': registered$' } | ForEach-Object { ($_ -split ':')[0] }) -join ', '
  Ok 'Connected' $(if ($connected) { $connected } else { 'your browsers' })
  $lines | Where-Object { $_ -match "couldn't register" } | ForEach-Object { Warn $_ }

  $version = @(& $helper --version)[0]
  Report "ok $version"
  if ($FromHelper) { return }

  if (-not $NoModifyPath) {
    try {
      $added = Set-UserPath { param($parts) if ($parts -contains $helperDir) { $parts } else { @($parts) + $helperDir } }
      # This window too, so the command works right away.
      if (($env:Path -split ';') -notcontains $helperDir) { $env:Path = "$env:Path;$helperDir" }
      if ($added) { Ok 'Added the clipsave-helper command' 'to your PATH' } else { Ok 'The clipsave-helper command is ready' }
    }
    catch { Warn "Couldn't add the clipsave-helper command. The helper itself is installed and works." }
  }

  # -- What's left: adding the extension -----------------------------------------------------------------------
  Say ''
  Write-Host "  $($sym.ok) ClipSave $($version -replace '^clipsave-helper ', '') is installed." -ForegroundColor Green
  $consider = if ($chosen.Count) { $chosen } else { @($browserIds | Where-Object { Is-Found $_ }) }
  $ready = @($consider | Where-Object { Has-Extension $_ })
  $todoChromium = @($consider | Where-Object { $_ -ne 'firefox' -and $ready -notcontains $_ })
  $todoFirefox = ($consider -contains 'firefox') -and ($ready -notcontains 'firefox')
  if ($ready.Count) { Note "$(Name-List $ready) already $(if ($ready.Count -eq 1) { 'has' } else { 'have' }) the extension: you're all set there." }

  $extensionDir = Join-Path $dest 'extension'
  if ($todoChromium.Count -and (Test-Path $extensionDir)) {
    $pages = ($todoChromium | ForEach-Object { switch ($_) { 'edge' { 'edge://extensions' } 'brave' { 'brave://extensions' } default { 'chrome://extensions' } } } | Select-Object -Unique) -join ', '
    $copied = $false
    if ($fancy) { try { Set-Clipboard -Value $extensionDir; $copied = $true } catch { } }
    Say ''
    Write-Host "  Add the extension to $(Name-List $todoChromium)  " -ForegroundColor White -NoNewline; Write-Host '(once)' -ForegroundColor DarkGray
    Write-Host '    1  ' -ForegroundColor Cyan -NoNewline; Write-Host "Go to $pages"
    Write-Host '    2  ' -ForegroundColor Cyan -NoNewline; Write-Host 'Turn on Developer mode'
    Write-Host '    3  ' -ForegroundColor Cyan -NoNewline; Write-Host 'Click Load unpacked and choose this folder:'
    Write-Host "       $extensionDir" -ForegroundColor Magenta
    if ($copied) { Note '   The path is copied: in the folder window, click the address bar, paste it and press Enter.' }
    Note '   Settings keeps it up to date from then on.'
  }
  if ($todoFirefox) {
    Say ''
    Write-Host '  Add the extension to Firefox' -ForegroundColor White
    Write-Host '    Open ' -NoNewline; Write-Host $firefoxAddon -ForegroundColor Magenta
    Say '    and click Add to Firefox. Firefox keeps it up to date.'
  }
  Say ''
  if ($todoChromium.Count -or $todoFirefox) { Note "Pictures of each step: $guide"; Say '' }
}
catch {
  Clear-Line
  Report "failed $($_.Exception.Message)"
  if ($FromHelper) { throw }
  Write-Host ''
  Write-Host "  $($sym.fail) $($_.Exception.Message)" -ForegroundColor Red
  if ($log -and (Test-Path $log)) { Get-Content $log -Tail 8 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
  Write-Host ''
  Write-Host "    Help: $guide" -ForegroundColor DarkGray
  Write-Host ''
}
finally {
  if ($fancy) { try { [Console]::CursorVisible = $true } catch { } }
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
