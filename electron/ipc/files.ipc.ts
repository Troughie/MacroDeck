import { ipcMain, app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

export interface ResolvedFile {
  ok: boolean;
  fileType: 'exe' | 'lnk' | 'folder';
  exePath: string;
  appName: string;
  iconDataUrl: string | null;
  error?: string;
}

async function extractIcon(targetPath: string): Promise<string | null> {
  try {
    const icon = await app.getFileIcon(targetPath, { size: 'large' });
    return icon.toDataURL();
  } catch {
    return null;
  }
}

async function resolveLnk(lnkPath: string): Promise<{ targetPath: string; appName: string } | null> {
  const script = `
$sh = New-Object -ComObject WScript.Shell
$sc = $sh.CreateShortcut('${lnkPath.replace(/'/g, "''")}')
Write-Output $sc.TargetPath
`;
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true } as any
    );
    const targetPath = String(stdout).trim();
    if (!targetPath) return null;
    const appName = path.basename(lnkPath, '.lnk');
    return { targetPath, appName };
  } catch {
    return null;
  }
}

export async function resolveDroppedFile(filePath: string): Promise<ResolvedFile> {
  const ext = path.extname(filePath).toLowerCase();
  const stat = (() => { try { return fs.statSync(filePath); } catch { return null; } })();

  // Folder
  if (stat?.isDirectory()) {
    const appName = path.basename(filePath);
    const exePath = `explorer.exe`;
    const iconDataUrl = await extractIcon(filePath);
    return { ok: true, fileType: 'folder', exePath, appName, iconDataUrl };
  }

  // .exe
  if (ext === '.exe') {
    if (!stat) return { ok: false, fileType: 'exe', exePath: filePath, appName: '', iconDataUrl: null, error: 'File not found' };
    const appName = path.basename(filePath, '.exe');
    const iconDataUrl = await extractIcon(filePath);
    return { ok: true, fileType: 'exe', exePath: filePath, appName, iconDataUrl };
  }

  // .lnk
  if (ext === '.lnk') {
    const resolved = await resolveLnk(filePath);
    if (!resolved || !resolved.targetPath) {
      // Fallback: open .lnk via explorer
      const appName = path.basename(filePath, '.lnk');
      const iconDataUrl = await extractIcon(filePath);
      return { ok: true, fileType: 'lnk', exePath: filePath, appName, iconDataUrl };
    }
    const iconDataUrl = await extractIcon(resolved.targetPath);
    return { ok: true, fileType: 'lnk', exePath: resolved.targetPath, appName: resolved.appName, iconDataUrl };
  }

  return { ok: false, fileType: 'exe', exePath: '', appName: '', iconDataUrl: null, error: `Unsupported file type: ${ext || '(no extension)'}` };
}

export function registerFilesIpc(): void {
  ipcMain.handle('files:resolveDropped', async (_event, filePath: string): Promise<ResolvedFile> => {
    return resolveDroppedFile(filePath);
  });
}
