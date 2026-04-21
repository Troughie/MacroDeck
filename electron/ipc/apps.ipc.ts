import { ipcMain } from 'electron';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { InstalledApp } from '../../src/types/macro.types';

// ─── Temp script file (avoid inline PS issues) ───────────────────────────────

const tmpDir = path.join(os.tmpdir(), 'macrodeck');
function ensureTmpDir() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
}

const PS_SCRIPT = `
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)

$apps = @()
foreach ($path in $paths) {
  try {
    $items = Get-ItemProperty $path -ErrorAction SilentlyContinue
    foreach ($item in $items) {
      if (-not $item.DisplayName) { continue }
      $exePath = $null

      if ($item.DisplayIcon) {
        $iconPath = ($item.DisplayIcon -replace ',.*$', '').Trim('"')
        if ($iconPath -match '\\.exe$' -and (Test-Path $iconPath)) {
          $exePath = $iconPath
        }
      }

      if (-not $exePath -and $item.InstallLocation -and (Test-Path $item.InstallLocation)) {
        $exeFiles = Get-ChildItem -Path $item.InstallLocation -Filter '*.exe' -Depth 1 -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -notmatch '(?i)(uninstall|setup|update|crash|helper|service|daemon|redist)' -and $_.Length -gt 102400 } |
          Sort-Object Length -Descending |
          Select-Object -First 1
        if ($exeFiles) { $exePath = $exeFiles.FullName }
      }

      if ($exePath) {
        $apps += [PSCustomObject]@{
          Name = $item.DisplayName
          ExePath = $exePath
          Publisher = if ($item.Publisher) { $item.Publisher } else { '' }
        }
      }
    }
  } catch {}
}

$apps | Sort-Object Name -Unique | ConvertTo-Json -Compress -Depth 2
`;

// ─── Excluded patterns ────────────────────────────────────────────────────────

const EXCLUDED = [
  /runtime/i, /redistributable/i, /visual c\+\+/i, /\.net framework/i,
  /directx/i, /windows sdk/i, /update/i, /driver/i, /uninstall/i,
  /setup/i, /installer/i, /microsoft edge webview/i,
];

function isValid(app: InstalledApp): boolean {
  if (!app.name || !app.exePath) return false;
  if (!fs.existsSync(app.exePath)) return false;
  if (EXCLUDED.some(p => p.test(app.name))) return false;
  return true;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache: InstalledApp[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getInstalledApps(): Promise<InstalledApp[]> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

  try {
    ensureTmpDir();
    const scriptPath = path.join(tmpDir, 'get-apps.ps1');
    fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8');

    const stdout = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }).toString().trim();

    if (!stdout) return getFallback();

    const raw = JSON.parse(stdout);
    const items = Array.isArray(raw) ? raw : [raw];

    const apps: InstalledApp[] = items
      .map((i: any) => ({ name: i.Name || '', exePath: i.ExePath || '', publisher: i.Publisher || '' }))
      .filter(isValid)
      .sort((a: InstalledApp, b: InstalledApp) => a.name.localeCompare(b.name));

    cache = apps;
    cacheTime = Date.now();
    return apps;
  } catch (err: any) {
    console.error('[apps.ipc] scan failed:', err.message?.slice(0, 300));
    return getFallback();
  }
}

function getFallback(): InstalledApp[] {
  const apps: InstalledApp[] = [];
  const dirs = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    path.join(process.env['LOCALAPPDATA'] || '', 'Programs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const subdirs = fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory()).slice(0, 40);
      for (const sub of subdirs) {
        try {
          const subPath = path.join(dir, sub.name);
          const exes = fs.readdirSync(subPath)
            .filter(f => f.endsWith('.exe') && !EXCLUDED.some(p => p.test(f)))
            .slice(0, 2);
          for (const exe of exes) {
            const exePath = path.join(subPath, exe);
            if (fs.statSync(exePath).size > 100 * 1024) {
              apps.push({ name: exe.replace('.exe', ''), exePath });
            }
          }
        } catch {}
      }
    } catch {}
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

export function registerAppsIpc(): void {
  ipcMain.handle('apps:getInstalled', () => getInstalledApps());
  ipcMain.handle('apps:refreshCache', () => { cache = null; cacheTime = 0; return true; });

  // File picker dialog for manual exe selection
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
