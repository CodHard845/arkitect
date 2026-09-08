<#
.SYNOPSIS
  Render a .excalidraw scene to PNG locally, so the diagram can be looked at.

.DESCRIPTION
  Two steps: render-excalidraw.mjs writes an SVG, then a headless Chromium
  (Edge or Chrome, both already present on Windows) rasterises it. No npm
  packages, no network, nothing leaves the machine.

  The PNG is a preview, not an export. Excalidraw's hand-drawn fonts are not
  installed outside the app, so text is substituted, and fills are flat. Use it
  to judge layout, spacing, routing and label fit; open the scene in the local
  Excalidraw container when exact appearance matters.

.EXAMPLE
  ./render-excalidraw.ps1 -Path architecture.excalidraw -OutDir .analysis/renders
  ./render-excalidraw.ps1 -Path architecture.excalidraw -Style clean -Width 2400
  ./render-excalidraw.ps1 -Path architecture.excalidraw -KeepSvg
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$OutDir = '.',
  [ValidateSet('rough', 'clean')][string]$Style = 'rough',
  [int]$Width = 2200,
  [int]$Padding = 40,
  [switch]$KeepSvg,
  [string]$BrowserExe = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Path)) { throw "No such scene: $Path" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }

$src = (Resolve-Path $Path).Path
$base = [IO.Path]::GetFileNameWithoutExtension($src)
$outDirFull = (Resolve-Path $OutDir).Path
$svg = Join-Path $outDirFull "$base.svg"
$png = Join-Path $outDirFull "$base.png"

$renderer = Join-Path $PSScriptRoot 'render-excalidraw.mjs'
& node $renderer $src --out $svg --style $Style --padding $Padding | Out-Null
if (-not (Test-Path $svg)) { throw "SVG render failed for $src" }

# The SVG carries its own width/height in px. Scale the browser window to the
# requested width so a wide architecture is legible rather than letterboxed.
$head = Get-Content -Raw -Path $svg
$w = 1600; $h = 1000
if ($head -match 'width="([\d.]+)"\s+height="([\d.]+)"') {
  $w = [math]::Ceiling([double]$Matches[1])
  $h = [math]::Ceiling([double]$Matches[2])
}
$scale = if ($w -gt 0) { [math]::Round($Width / $w, 3) } else { 1 }
if ($scale -le 0) { $scale = 1 }
# --window-size is in CSS pixels and --force-device-scale-factor multiplies on
# the way out, so the window must be the drawing's own CSS size or the
# screenshot is cropped rather than scaled. Chromium refuses windows past
# 16384px, and a PNG that large is not readable anyway.
$viewW = [math]::Min($w, 16000)
$viewH = [math]::Min($h, 16000)
$shotW = [int]($viewW * $scale)
$shotH = [int]($viewH * $scale)

$candidates = @()
if ($BrowserExe) { $candidates += $BrowserExe }
$candidates += @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $browser) {
  Write-Output "no headless Chromium found -> SVG only: $svg"
  Write-Output "pass -BrowserExe <path to msedge.exe or chrome.exe> to also get a PNG"
  exit 0
}

# Chromium applies the default 8px body margin to a bare SVG, which shifts the
# drawing and clips its right and bottom edges. Screenshot a zero-margin HTML
# wrapper instead so the PNG is exactly the SVG's own box.
$wrapper = Join-Path $outDirFull "$base.render.html"
$svgUri = "file:///" + $svg.Replace('\', '/')
@"
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}img{display:block}</style>
<img src="$svgUri" width="$w" height="$h">
"@ | Out-File -FilePath $wrapper -Encoding utf8

$profileDir = Join-Path ([IO.Path]::GetTempPath()) ("arkitect-excalidraw-" + [guid]::NewGuid().ToString('N'))
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $browser --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=$scale `
  --user-data-dir="$profileDir" --window-size="$viewW,$viewH" `
  --screenshot="$png" ("file:///" + $wrapper.Replace('\', '/')) 2>&1 | Out-Null
$ErrorActionPreference = $prev
if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue }
Remove-Item $wrapper -ErrorAction SilentlyContinue

if (Test-Path $png) {
  $kb = [math]::Round((Get-Item $png).Length / 1KB)
  Write-Output "rendered -> $png ($shotW x $shotH, $kb KB)"
  if (-not $KeepSvg) { Remove-Item $svg -ErrorAction SilentlyContinue }
  else { Write-Output "svg kept  -> $svg" }
} else {
  Write-Output "PNG rasterisation FAILED; the SVG is still usable: $svg"
  exit 1
}
