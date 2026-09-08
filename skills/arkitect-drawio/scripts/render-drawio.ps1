<#
.SYNOPSIS
  Render .drawio pages to local PNG with Draw.io Desktop. Never uses the hosted editor.

.EXAMPLE
  ./render-drawio.ps1 -Path diagram.drawio -OutDir .analysis/renders
  ./render-drawio.ps1 -Path diagram.drawio -PageIndex 0 -Width 2400
  ./render-drawio.ps1 -Path diagram.drawio -All            # every page
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$PageIndex = 0,
  [switch]$All,
  [int]$Width = 2200,
  [string]$OutDir = '.',
  [string]$Format = 'png',
  [string]$DrawioExe = 'C:\Program Files\draw.io\draw.io.exe'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $DrawioExe)) { throw "Draw.io Desktop not found at $DrawioExe" }
if (-not (Test-Path $Path))      { throw "No such diagram: $Path" }
if (-not (Test-Path $OutDir))    { New-Item -ItemType Directory -Force $OutDir | Out-Null }

$src = (Resolve-Path $Path).Path
$base = [IO.Path]::GetFileNameWithoutExtension($src)

# Page count comes from the file itself, so -All needs no external input.
$pageCount = 1
if ($All) {
  $text = Get-Content -Raw -Path $src
  $pageCount = ([regex]::Matches($text, '<diagram\b')).Count
  if ($pageCount -lt 1) { $pageCount = 1 }
}

$indexes = if ($All) { 0..($pageCount - 1) } else { @($PageIndex) }

# draw.io Desktop 29.0.3 (Windows) treats --page-index as 1-based: both 0 and 1
# export the first page, 2 exports the second, and so on. $PageIndex here is
# 0-based to match the order of <diagram> elements and the MCP list_pages
# output, so translate on the way out. Verified against a 3-page file.
foreach ($i in $indexes) {
  $out = Join-Path (Resolve-Path $OutDir).Path "$base.p$i.$Format"
  # draw.io Desktop always writes Chromium cache warnings to stderr. Under
  # Windows PowerShell those surface as NativeCommandError and would abort the
  # run, so the export is invoked with error handling relaxed and success is
  # judged by whether the output file appeared.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $DrawioExe -x -f $Format --page-index ($i + 1) --width $Width -o $out $src 2>&1 | Out-Null
  $ErrorActionPreference = $prev
  if (Test-Path $out) {
    $kb = [math]::Round((Get-Item $out).Length / 1KB)
    Write-Output "rendered page $i -> $out ($kb KB)"
  } else {
    Write-Output "page $i FAILED -> $out"
  }
}
