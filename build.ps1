# MacroDeck Build Script
# Run as Administrator OR ensure Developer Mode is enabled
# Usage: .\build.ps1

param([string]$Target = "nsis")

$ErrorActionPreference = "Stop"
Write-Host "=== MacroDeck Build ===" -ForegroundColor Cyan

# Set env vars to skip code signing
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""
$env:CSC_LINK = ""

# Pre-download and extract winCodeSign manually (skip symlinks issue)
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$extractDir = "$cacheDir\winCodeSign-2.6.0"
if (-not (Test-Path $extractDir)) {
    Write-Host "Pre-downloading winCodeSign (skip symlinks)..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
    $zipFile = "$cacheDir\winCodeSign-2.6.0.7z"
    if (-not (Test-Path $zipFile)) {
        Invoke-WebRequest -Uri "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" -OutFile $zipFile -UseBasicParsing
    }
    $7za = "node_modules\7zip-bin\win\x64\7za.exe"
    & $7za x -bd -snl $zipFile "-o$extractDir" | Out-Null
    Write-Host "winCodeSign ready" -ForegroundColor Green
}

# Patch getBin to use pre-extracted cache
$binDownload = "node_modules\app-builder-lib\out\binDownload.js"
$bdContent = Get-Content $binDownload -Raw
if (-not $bdContent.Contains("Check if already extracted manually")) {
    Write-Host "Patching electron-builder..." -ForegroundColor Gray
    $old = 'function getBin(name, url, checksum) {'
    $new = 'function getBin(name, url, checksum) {
    const _path = require("path"); const _fs = require("fs"); const _os = require("os");
    const _cb = process.env.ELECTRON_BUILDER_CACHE || _path.join(_os.homedir(), "AppData", "Local", "electron-builder", "Cache");
    const _mp = _path.join(_cb, name);
    if (_fs.existsSync(_mp)) { return Promise.resolve(_mp); }
    // Check if already extracted manually (skip symlink issue)'
    $bdContent = $bdContent.Replace($old, $new)
    Set-Content $binDownload $bdContent -NoNewline
    Write-Host "Patched" -ForegroundColor Green
}

# Build
Write-Host "Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Write-Host "Packaging ($Target)..." -ForegroundColor Cyan
npx electron-builder --win $Target --x64
if ($LASTEXITCODE -ne 0) { throw "Packaging failed" }

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Get-ChildItem "release" -File | Where-Object { $_.Extension -eq ".exe" -and $_.Name -notmatch "blockmap" } | ForEach-Object {
    Write-Host "  $($_.Name) ($([Math]::Round($_.Length/1MB,1)) MB)" -ForegroundColor White
}
