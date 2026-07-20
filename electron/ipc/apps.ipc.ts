import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);
import { InstalledApp } from '../../src/types/macro.types';

// ─── Tmp dir ──────────────────────────────────────────────────────────────────
const tmpDir = path.join(os.tmpdir(), 'macrodeck');
function ensureTmpDir() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
}

// =============================================================================
//  PS_SCRIPT
//
//  Chiến lược: WHITELIST-FIRST (không phải blacklist-only)
//
//  Nguồn 1 — Registry (app cài bằng .exe installer):
//    - Quét 3 hive: HKLM 64bit, HKLM 32bit, HKCU
//    - Chỉ loại những thứ CHẮC CHẮN là rác (runtime, driver, SDK, hotfix…)
//    - Tìm exe theo thứ tự: InstallLocation → DisplayIcon
//    - Verify exe: không phải uninstaller/helper, không nằm System32/Temp
//    - KHÔNG filter theo size (Spotify stub launcher chỉ ~300KB nhưng vẫn hợp lệ)
//
//  Nguồn 2 — Microsoft Store (MSIX/UWP):
//    - Dùng Get-AppxPackage để lấy tất cả app Store của user hiện tại
//    - Bỏ qua các framework package (IsFramework=True)
//    - Tìm exe trong InstallLocation của package
//    - Lấy tên từ DisplayName của package manifest
//
//  Nguồn 3 — Known paths (Discord, app cài vào AppData/LocalAppData):
//    - Quét các thư mục đặc trưng mà app thường cài vào
//
//  Dedup toàn bộ theo exePath (case-insensitive)
// =============================================================================
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'

# ── Chỉ block những thứ CHẮC CHẮN không phải app người dùng ─────────────────
# Runtime/framework/driver/SDK/dev-tool/system tool — KHÔNG block browser, game, media
$badAppPattern = '(?i)(
  ^microsoft visual c\+\+|
  ^microsoft \.net|
  \.net framework \d|
  \.net runtime|
  \.net sdk|
  redistributable|
  (?<!\w)runtime(?!\s+for)|
  directx for managed|
  windows sdk|
  windows software development|
  windows driver kit|
  windows assessment|
  windows kits|
  update for windows|
  security update for|
  hotfix for|
  service pack \d|
  kb\d{6,7}\b|
  ^intel\(r\)|
  ^realtek|
  ^qualcomm|
  ^synaptics|
  ^nvidia|
  nvidia frameview|
  amd chipset|
  amd software|
  microsoft webview2|
  microsoft edge webview|
  windows app runtime|
  windows desktop runtime|
  ^bonjour$|
  ^apple application support|
  ^apple mobile device support|
  ^apple software update|
  easyanticheat|
  ^steam overlay|
  ^discord overlay|
  ^iis \d|
  iis express|
  internet information services|
  ^wampserver|
  ^xampp|
  ^cmake\b|
  ^llvm\b|
  ^clang\b|
  ^mingw|
  ^msys2|
  ^node\.?js|
  ^python( |$|\d)|
  ^pip\b|
  ^git( |$)|
  ^git for windows|
  ^github cli|
  ^go( |$)programming|
  ^golang|
  ^rust\b|
  ^ruby\b|
  ^perl\b|
  ^php\b|
  ^java( |$)|
  ^java\(tm\)|
  ^openjdk|
  jdk\b|
  jre\b|
  ^dotnet|
  ^docker\b|
  ^kubernetes|
  ^terraform|
  ^vagrant|
  ^oracle vm|
  ^windows terminal|
  microsoft office sdx|
  office \d{4} click-to-run|
  ^windows defender$|
  windows defender advanced|
  ^microsoft defender|
  ^windows subsystem for linux|
  ^7-?zip|
  ^winrar|
  ^winzip|
  ^peazip|
  ^bandizip
)' -replace '\s+', ''

# ── Nhà phát hành là Microsoft => app dựng sẵn của Windows (Mail, Photos,
#    Defender, IIS, OneDrive, Edge, Office runtime...). Nguoi dung tu search khi
#    can. GIU LAI mot vai app Microsoft ma nguoi ta THUC SU tai ve de dung.
$microsoftPublisher = '(?i)(microsoft (corp|corporation)|microsoft$)'
# Cac app Microsoft van cho phep hien (nguoi dung chu dong cai):
$msAllowName = '(?i)(visual studio code|visual studio\b|vscode|sql server management|powertoys|teams|to do|onenote|edge$|skype)'


# ── Exe bị cấm dứt khoát (uninstaller, background service, CLI tool thuần) ───
# Lưu ý: KHÔNG block "launcher" vì Steam, Riot, Epic đều là launcher hợp lệ
# KHÔNG block "overlay" ở đây vì Discord.exe không match "overlay"
$badExePattern = '(?i)(
  ^unins\d|^uninst|uninstall|_uninstall|
  ^setup$|^install$|
  crashreport|crashhandler|crashpad|
  ^redist|
  bugreport|
  cef_process|
  ^elevatedinstaller|
  ^presentationhost$|
  ^werfault|
  ^dxsetup$|
  iediagcmd|
  ^wab$|^wmlaunch$|^wmpconfig$|^wmpnetwk$|
  ^wmiadap$|^wbemtest$|^mtstocom$
)' -replace '\s+', ''

# ── Thư mục hệ thống — exe trong đây không phải app người dùng ───────────────
$badDirPattern = '(?i)(
  \\\\Windows\\\\System32|
  \\\\Windows\\\\SysWOW64|
  \\\\Windows\\\\WinSxS|
  \\\\Windows\\\\Installer|
  \\\\AppPatch|
  \\\\Microsoft\.NET\\\\
)' -replace '\s+', ''

# ── Helper: kiểm tra 1 exe path có hợp lệ không ──────────────────────────────
function Test-GoodExe([string]$p) {
  if (-not $p) { return $false }
  if (-not (Test-Path $p -PathType Leaf)) { return $false }
  $name = [IO.Path]::GetFileName($p)
  if ($name -match $badExePattern) { return $false }
  if ($p   -match $badDirPattern)  { return $false }
  return $true
}

# ── Helper: tìm exe tốt nhất trong thư mục (depth <= 2) ─────────────────────
function Get-BestExe([string]$dir) {
  if (-not $dir -or -not (Test-Path $dir)) { return $null }
  # Thử depth=0 trước (thư mục gốc), rồi depth=1
  foreach ($depth in @(0, 1)) {
    $exe = Get-ChildItem -Path $dir -Filter '*.exe' -Depth $depth -File |
      Where-Object {
        $_.Name     -notmatch $badExePattern -and
        $_.FullName -notmatch $badDirPattern
      } |
      Sort-Object Length -Descending |
      Select-Object -First 1
    if ($exe) { return $exe.FullName }
  }
  return $null
}

$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$apps = [Collections.Generic.List[PSCustomObject]]::new()

function Add-App([string]$name, [string]$exePath, [string]$publisher) {
  if (-not $name -or -not $exePath) { return }
  if (-not (Test-GoodExe $exePath))  { return }
  if (-not $seen.Add($exePath))      { return }
  $apps.Add([PSCustomObject]@{
    Name      = $name.Trim()
    ExePath   = $exePath
    Publisher = $publisher.Trim()
  })
}

# ════════════════════════════════════════════════════════════════════════════════
#  NGUỒN 1: Registry
# ════════════════════════════════════════════════════════════════════════════════
$regPaths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)

foreach ($regPath in $regPaths) {
  $items = Get-ItemProperty $regPath
  foreach ($item in $items) {
    if (-not $item.DisplayName)              { continue }
    if ($item.SystemComponent -eq 1)         { continue }
    if (-not $item.UninstallString)          { continue }
    if ($item.DisplayName -match $badAppPattern) { continue }

    # Bo app do Microsoft phat hanh (app Windows dung san / runtime / Office...),
    # TRU cac app Microsoft nguoi dung chu dong tai ve (VS Code, PowerToys...).
    $pub = [string]$item.Publisher
    if ($pub -match $microsoftPublisher -and $item.DisplayName -notmatch $msAllowName) { continue }

    $exePath = $null

    # Ưu tiên 1: InstallLocation
    if ($item.InstallLocation) {
      $exePath = Get-BestExe $item.InstallLocation
    }

    # Ưu tiên 2: DisplayIcon
    if (-not $exePath -and $item.DisplayIcon) {
      $iconExe = ($item.DisplayIcon -replace ',\s*-?\d+\s*$','').Trim('"').Trim()
      if ($iconExe -match '\.exe$') { $exePath = $iconExe }
    }

    Add-App $item.DisplayName $exePath ($item.Publisher ?? '')
  }
}

# ════════════════════════════════════════════════════════════════════════════════
#  NGUỒN 2: Microsoft Store / MSIX (UWP apps)
# ════════════════════════════════════════════════════════════════════════════════
try {
  $packages = Get-AppxPackage -PackageTypeFilter Main |
    Where-Object {
      -not $_.IsFramework -and
      -not $_.IsResourcePackage -and
      $_.SignatureKind -ne 'System' -and
      $_.InstallLocation -and
      (Test-Path $_.InstallLocation)
    }

  foreach ($pkg in $packages) {
    # Đọc DisplayName từ manifest
    $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
    if (-not (Test-Path $manifestPath)) { continue }

    [xml]$manifest = Get-Content $manifestPath -Raw
    $ns  = @{ m = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10' }
    $displayName = $manifest.Package.Properties.DisplayName
    if (-not $displayName -or $displayName -match '^\s*ms-resource') {
      $displayName = $pkg.Name -replace '^.*?\.', '' -replace '_.*$', ''
    }
    if ($displayName -match $badAppPattern) { continue }

    # Bo app Store do Microsoft phat hanh (Mail, Photos, Xbox, Maps, Clipchamp,
    # Solitaire...) — app Windows dung san. Nguoi dung tu search khi can. Giu lai
    # app Microsoft chu dong tai (Teams, To Do...) va MOI app khong phai Microsoft.
    $appxPub = try { [string]$pkg.Publisher } catch { '' }
    if ($appxPub -match '(?i)Microsoft (Corporation|Windows)' -and $displayName -notmatch $msAllowName) { continue }

    # Tìm exe entry point từ manifest
    $exePath = $null
    try {
      $apps2 = $manifest.Package.Applications.Application
      foreach ($a in $apps2) {
        $relExe = $a.Executable
        if ($relExe -and $relExe -match '\.exe$') {
          $full = Join-Path $pkg.InstallLocation $relExe
          if (Test-GoodExe $full) { $exePath = $full; break }
        }
      }
    } catch {}

    # Fallback: tìm exe trong thư mục
    if (-not $exePath) {
      $exePath = Get-BestExe $pkg.InstallLocation
    }

    $publisher = try { $pkg.PublisherDisplayName } catch { '' }
    Add-App $displayName $exePath ($publisher ?? '')
  }
} catch {}

# ════════════════════════════════════════════════════════════════════════════════
#  NGUỒN 3: Known paths — app cài vào AppData (Discord, Zalo, v.v.)
# ════════════════════════════════════════════════════════════════════════════════
$localApp = $env:LOCALAPPDATA
$knownDirs = @(
  (Join-Path $localApp 'Discord'),
  (Join-Path $localApp 'Zalo'),
  (Join-Path $localApp 'Zalo\Zalo'),
  (Join-Path $localApp 'slack'),
  (Join-Path $localApp 'Programs'),
  (Join-Path $env:APPDATA 'Spotify'),
  (Join-Path $env:APPDATA 'Telegram Desktop')
)

foreach ($dir in $knownDirs) {
  if (-not (Test-Path $dir)) { continue }
  $exePath = Get-BestExe $dir
  if (-not $exePath) { continue }
  # Tên = tên thư mục (sạch hơn tên file exe)
  $appName = (Split-Path $dir -Leaf) -replace '_', ' '
  Add-App $appName $exePath ''
}

# ════════════════════════════════════════════════════════════════════════════════
#  Output
# ════════════════════════════════════════════════════════════════════════════════
$apps | Sort-Object Name | ConvertTo-Json -Compress -Depth 2
`;

// =============================================================================
//  JS-side validation — lớp bảo vệ thứ hai sau PS
//  Chỉ block những thứ CHẮC CHẮN sai, không block quá tay
// =============================================================================

/** Tên exe chắc chắn là uninstaller / background process / CLI tool */
const BAD_EXE_RE =
  /^unins\d|^uninst|uninstall|crashreport|crashhandler|crashpad|bugreport|^redist|^werfault|^dxsetup$|^wab$|^wmlaunch$|^wmpconfig$/i;

/** Thư mục hệ thống — không phải app người dùng */
const BAD_DIR_RE =
  /\\Windows\\System32|\\Windows\\SysWOW64|\\Windows\\WinSxS|\\Windows\\Installer/i;

/** Tên app chắc chắn là system component / runtime / môi trường / archiver nền */
const BAD_APP_RE =
  /^microsoft visual c\+\+|redistributable|^microsoft \.net|\.net framework \d|\.net runtime|\.net sdk|security update for|hotfix for|update for windows|^windows defender$|windows defender advanced|^microsoft defender|windows subsystem for linux|windows sdk|windows driver kit|iis express|internet information services|^node\.?js|^python( |$|\d)|^git( |$)|^git for windows|^java( |$)|^java\(tm\)|^openjdk|jdk\b|jre\b|^docker\b|^golang|^rust\b|^llvm\b|^clang\b|^mingw|^msys2|^cmake\b|^7-?zip|^winrar|^winzip|^peazip|^bandizip|^nvidia|amd software/i;

/** App do Microsoft phát hành = app Windows dựng sẵn, TRỪ vài app tự tải về. */
const MS_PUBLISHER_RE = /microsoft (corp|corporation|windows)|^microsoft$/i;
const MS_ALLOW_NAME_RE =
  /visual studio code|visual studio\b|vscode|sql server management|powertoys|teams|to do|onenote|edge$|skype/i;

function isValid(a: InstalledApp): boolean {
  if (!a.name || !a.exePath) return false;

  // File phải tồn tại
  try {
    if (!fs.existsSync(a.exePath)) return false;
  } catch {
    return false;
  }

  const exeName = path.basename(a.exePath);
  if (BAD_EXE_RE.test(exeName)) return false;
  if (BAD_DIR_RE.test(a.exePath)) return false;
  if (BAD_APP_RE.test(a.name)) return false;

  // Bỏ app Microsoft (Windows dựng sẵn) trừ các app người dùng chủ động tải về.
  if (a.publisher && MS_PUBLISHER_RE.test(a.publisher) && !MS_ALLOW_NAME_RE.test(a.name)) {
    return false;
  }

  return true;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
let cache: InstalledApp[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

const iconCache = new Map<string, string>();

async function enrichWithIcons(apps: InstalledApp[]): Promise<InstalledApp[]> {
  return Promise.all(
    apps.map(async (a) => {
      if (!a.exePath) return a;
      if (iconCache.has(a.exePath)) return { ...a, iconDataUrl: iconCache.get(a.exePath) };
      try {
        const icon = await app.getFileIcon(a.exePath, { size: 'normal' });
        const dataUrl = icon.toDataURL();
        iconCache.set(a.exePath, dataUrl);
        return { ...a, iconDataUrl: dataUrl };
      } catch {
        return a;
      }
    }),
  );
}

async function getInstalledApps(): Promise<InstalledApp[]> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

  try {
    ensureTmpDir();
    const scriptPath = path.join(tmpDir, 'get-apps.ps1');
    fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8');

    const { stdout: rawStdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 45_000, maxBuffer: 20 * 1024 * 1024 },
    );
    const stdout = rawStdout.toString().trim();

    if (!stdout) return getFallback();

    const raw = JSON.parse(stdout);
    const items: Array<{ Name: string; ExePath: string; Publisher: string }> = Array.isArray(raw)
      ? raw
      : [raw];

    const apps: InstalledApp[] = items
      .map((i) => ({
        name: (i.Name ?? '').trim(),
        exePath: (i.ExePath ?? '').trim(),
        publisher: (i.Publisher ?? '').trim(),
      }))
      .filter(isValid)
      .sort((a, b) => a.name.localeCompare(b.name));

    cache = apps;
    cacheTime = Date.now();
    return apps;
  } catch (err: any) {
    console.error('[apps.ipc] scan failed:', err.message?.slice(0, 300));
    return getFallback();
  }
}

// ─── Fallback: quét Program Files + AppData khi PS thất bại ──────────────────
const FALLBACK_BAD_EXE =
  /^unins\d|^uninst|uninstall|setup|crashreport|^redist/i;

function getFallback(): InstalledApp[] {
  const apps: InstalledApp[] = [];
  const localApp = process.env['LOCALAPPDATA'] ?? '';
  const dirs = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    path.join(localApp, 'Programs'),
    path.join(localApp, 'Discord'),
    path.join(process.env['APPDATA'] ?? '', 'Spotify'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const sub of entries.slice(0, 60)) {
        try {
          const subPath = path.join(dir, sub.name);
          const exe = fs
            .readdirSync(subPath)
            .filter((f) => f.endsWith('.exe') && !FALLBACK_BAD_EXE.test(f))
            .map((f) => ({ f, size: fs.statSync(path.join(subPath, f)).size }))
            .sort((a, b) => b.size - a.size)[0];

          if (exe && exe.size > 200 * 1024) {
            apps.push({ name: sub.name, exePath: path.join(subPath, exe.f) });
          }
        } catch { }
      }
    } catch { }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
export function registerAppsIpc(): void {
  ipcMain.handle('apps:getInstalled', async () => {
    const apps = await getInstalledApps();
    return enrichWithIcons(apps);
  });

  ipcMain.handle('apps:refreshCache', () => {
    cache = null;
    cacheTime = 0;
    return true;
  });

  ipcMain.handle('apps:browseExe', async (event) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Select Application',
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}