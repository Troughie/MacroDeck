import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

const execFileAsync = promisify(execFile);
const tmpDir = path.join(os.tmpdir(), 'macrodeck');

function ensureTmpDir() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
}

// ─── AE Path Detection ────────────────────────────────────────────────────────

const AE_DEFAULT_ROOTS = [
  'C:\\Program Files\\Adobe',
  'C:\\Program Files (x86)\\Adobe',
];

const AE_YEARS = ['2024', '2023', '2022', '2021', '2020', '2025', '2026'];

function findAeExeByFilesystem(): string | null {
  for (const root of AE_DEFAULT_ROOTS) {
    for (const year of AE_YEARS) {
      const candidate = path.join(root, `After Effects ${year}`, 'Support Files', 'AfterFX.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findAeExeByRegistry(): string | null {
  // Query HKLM\SOFTWARE\Adobe\After Effects for installed versions
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Adobe\\After Effects" /s /v InstallPath',
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
    const lines = out.split('\n');
    for (const line of lines) {
      const match = line.match(/InstallPath\s+REG_SZ\s+(.+)/i);
      if (match) {
        const installPath = match[1].trim();
        const exe = path.join(installPath, 'Support Files', 'AfterFX.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch {
    // Registry query failed — fall through to filesystem scan
  }
  return null;
}

let cachedAePath: string | null | undefined = undefined; // undefined = not yet searched

export function detectAfterEffects(): { found: boolean; path: string | null } {
  if (cachedAePath !== undefined) {
    return { found: cachedAePath !== null, path: cachedAePath };
  }
  const byRegistry = findAeExeByRegistry();
  const result = byRegistry ?? findAeExeByFilesystem();
  cachedAePath = result;
  return { found: result !== null, path: result };
}

// ─── JSX Script Execution ─────────────────────────────────────────────────────

export async function executeAeScript(jsx: string): Promise<void> {
  const { found, path: aePath } = detectAfterEffects();
  if (!found || !aePath) {
    throw new Error('After Effects not found. Install AE or set the path manually.');
  }

  // Check if AE process is running (avoids spawning a second instance)
  try {
    const result = execSync('tasklist /FI "IMAGENAME eq AfterFX.exe" /NH', {
      encoding: 'utf8', timeout: 3000, windowsHide: true,
    });
    if (!result.toLowerCase().includes('afterfx.exe')) {
      throw new Error('After Effects is not running. Open AE first.');
    }
  } catch (err: any) {
    if (err.message.includes('not running')) throw err;
    // tasklist itself failed — proceed anyway and let afterfx handle it
  }

  ensureTmpDir();
  const scriptPath = path.join(tmpDir, `ae_script_${Date.now()}.jsx`);
  fs.writeFileSync(scriptPath, jsx, 'utf8');

  try {
    await execFileAsync(aePath, ['-r', scriptPath], { timeout: 15000 });
  } finally {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore cleanup errors */ }
  }
}

// ─── IPC Registration ─────────────────────────────────────────────────────────

export function registerAeIpc(): void {
  ipcMain.handle('ae:detect', async (): Promise<{ found: boolean; path: string | null }> => {
    cachedAePath = undefined; // force re-scan on each detect call
    return detectAfterEffects();
  });

  ipcMain.handle('ae:execute', async (_event, jsx: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      await executeAeScript(jsx);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message?.slice(0, 120) };
    }
  });
}
