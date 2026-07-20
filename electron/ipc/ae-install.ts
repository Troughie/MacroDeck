import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { isPanelAlive, readHeartbeat } from './ae-bridge';

const execFileAsync = promisify(execFile);

export const EXTENSION_ID = 'com.macrodeck.panel';

// %APPDATA%\Adobe\CEP\extensions\com.macrodeck.panel
export function panelDestDir(appData: string | undefined = process.env.APPDATA): string {
  return path.join(appData || '', 'Adobe', 'CEP', 'extensions', EXTENSION_ID);
}

export interface SourceEnv {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string; // repo root in dev (process.cwd())
}

// dev  -> <repo>/ae-panel ; prod -> <resourcesPath>/ae-panel (from extraResources)
export function panelSourceDir(env: SourceEnv): string {
  const base = env.isPackaged ? env.resourcesPath : env.appPath;
  return path.join(base, 'ae-panel');
}

export function isInstalled(appData?: string): boolean {
  return fs.existsSync(panelDestDir(appData));
}

export interface PanelStatus {
  installed: boolean;
  alive: boolean;
  aeVersion?: string;
}

export function panelStatus(now: number = Date.now(), appData?: string): PanelStatus {
  const installed = isInstalled(appData);
  const alive = isPanelAlive(now);
  const hb = alive ? readHeartbeat() : null;
  return { installed, alive, aeVersion: hb?.aeVersion };
}

// ─── Install / uninstall (covered by manual checklist) ─────────────────────────

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

export async function install(source: SourceEnv): Promise<{ ok: boolean; error?: string }> {
  try {
    // ① Enable unsigned panels for CEP 11 (AE 2024) and CEP 12 (AE 2025+).
    //    HKCU only — no admin rights needed.
    for (const csxs of ['CSXS.11', 'CSXS.12']) {
      await execFileAsync('reg', [
        'add', `HKCU\\Software\\Adobe\\${csxs}`,
        '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f',
      ], { timeout: 5000, windowsHide: true } as any);
    }
    // ② Copy panel into the CEP extensions folder (overwrite to support upgrades).
    const src = panelSourceDir(source);
    if (!fs.existsSync(src)) return { ok: false, error: `Panel source not found: ${src}` };
    const dest = panelDestDir();
    fs.rmSync(dest, { recursive: true, force: true });
    copyDirRecursive(src, dest);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message?.slice(0, 200) ?? 'Install failed' };
  }
}

export async function uninstall(): Promise<{ ok: boolean; error?: string }> {
  try {
    fs.rmSync(panelDestDir(), { recursive: true, force: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message?.slice(0, 200) ?? 'Uninstall failed' };
  }
}
