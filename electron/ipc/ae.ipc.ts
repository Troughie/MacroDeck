import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);
const tmpDir = path.join(os.tmpdir(), 'macrodeck');

function ensureTmpDir() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
}

// ─── AE Path Detection ────────────────────────────────────────────────────────

const AE_YEARS = ['2025', '2024', '2023', '2022', '2021', '2020', '2026'];

function getSystemDrives(): string[] {
  const drives: string[] = [];
  for (let i = 65; i <= 90; i++) { // A–Z
    const d = `${String.fromCharCode(i)}:\\`;
    try { if (fs.existsSync(d)) drives.push(d); } catch { /* skip */ }
  }
  return drives;
}

function findAeExeByFilesystem(): string | null {
  for (const drive of getSystemDrives()) {
    for (const root of ['Program Files', 'Program Files (x86)']) {
      for (const year of AE_YEARS) {
        const candidate = path.join(drive, root, 'Adobe', `After Effects ${year}`, 'Support Files', 'AfterFX.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

async function findAeExeByRegistry(): Promise<string | null> {
  try {
    const { stdout: stdoutRaw } = await execFileAsync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Adobe\\After Effects', '/s', '/v', 'InstallPath'],
      { timeout: 3000, windowsHide: true } as any
    );
    const stdout = String(stdoutRaw);
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/InstallPath\s+REG_SZ\s+(.+)/i);
      if (match) {
        const installPath = match[1].trim();
        // InstallPath may or may not end with "Support Files\" depending on AE version
        const candidates = [
          path.join(installPath, 'AfterFX.exe'),
          path.join(installPath, 'Support Files', 'AfterFX.exe'),
        ];
        for (const exe of candidates) {
          if (fs.existsSync(exe)) return exe;
        }
      }
    }
  } catch {
    // Registry query failed — fall through to filesystem scan
  }
  return null;
}

let cachedAePath: string | null | undefined = undefined; // undefined = not yet searched

export async function detectAfterEffects(): Promise<{ found: boolean; path: string | null }> {
  if (cachedAePath !== undefined) {
    return { found: cachedAePath !== null, path: cachedAePath };
  }
  const byRegistry = await findAeExeByRegistry();
  const result = byRegistry ?? findAeExeByFilesystem();
  cachedAePath = result;
  return { found: result !== null, path: result };
}

// ─── JSX Script Execution ─────────────────────────────────────────────────────

export async function executeAeScript(jsx: string): Promise<void> {
  const { found, path: aePath } = await detectAfterEffects();
  if (!found || !aePath) {
    throw new Error('After Effects not found. Install AE or set the path manually.');
  }

  // Check if AE process is running (avoids spawning a second instance)
  try {
    const { stdout: tasklistOut } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq AfterFX.exe', '/NH'], { timeout: 3000, windowsHide: true } as any);
    if (!String(tasklistOut).toLowerCase().includes('afterfx.exe')) {
      throw new Error('After Effects is not running. Open AE first.');
    }
  } catch (err: any) {
    if (err?.message?.includes('not running')) throw err;
    // tasklist failed (non-Windows or command error) — proceed
  }

  ensureTmpDir();
  // Fixed filename — AE reads it after the CLI exits, so don't delete it.
  // Overwriting is safe since macros run serially.
  const scriptPath = path.join(tmpDir, 'ae_current_script.jsx');
  fs.writeFileSync(scriptPath, jsx, 'utf8');
  await execFileAsync(aePath, ['-r', scriptPath], { timeout: 15000 });
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
