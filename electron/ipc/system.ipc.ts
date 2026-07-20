import { ipcMain, app, BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type Store from 'electron-store';
import { StoreSchema } from '../../src/types/macro.types';

const execFileAsync = promisify(execFile);

// ─── Exported helpers for direct use ───────────────────────────────────────

export async function setWindowsStartup(enabled: boolean): Promise<boolean> {
  try {
    const appName = 'MacroDeck';
    const exePath = process.execPath;

    if (enabled) {
      // Add to startup using PowerShell registry modification
      const psCommand = `New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Force | Out-Null; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "${appName}" -Value "\\"${exePath}\\"" -Force`;

      try {
        await execFileAsync('powershell.exe', ['-Command', psCommand]);
        console.log('[system] Added to Windows startup');
      } catch (err) {
        console.error('[system] Failed to add startup via registry:', err);
        return false;
      }
    } else {
      // Remove from startup using PowerShell
      const psCommand = `Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "${appName}" -ErrorAction SilentlyContinue`;

      try {
        await execFileAsync('powershell.exe', ['-Command', psCommand]);
        console.log('[system] Removed from Windows startup');
      } catch (err) {
        console.error('[system] Failed to remove startup via registry:', err);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('[system] setWindowsStartup failed:', err);
    return false;
  }
}

export async function getWindowsStartup(): Promise<boolean> {
  try {
    const appName = 'MacroDeck';
    const psCommand = `Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "${appName}" -ErrorAction SilentlyContinue`;

    const { stdout } = await execFileAsync('powershell.exe', ['-Command', psCommand]);
    return stdout.includes(appName);
  } catch (err) {
    console.log('[system] App not in startup');
    return false;
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────

export function registerSystemIpc(
  store: Store<StoreSchema>,
  mainWindow: BrowserWindow | null,
  updateTrayMenu: () => void
): void {
  ipcMain.handle('system:setStartup', async (_event, enabled: boolean): Promise<boolean> => {
    try {
      const isPackaged = app.isPackaged;

      if (!isPackaged) {
        console.log('[system.ipc] Skipping startup registration in dev mode');
        store.set('settings.runOnStartup' as any, enabled);
        updateTrayMenu();
        return true;
      }

      const result = await setWindowsStartup(enabled);
      if (result) {
        store.set('settings.runOnStartup' as any, enabled);
        updateTrayMenu();
      }
      return result;
    } catch (err) {
      console.error('[system.ipc] setStartup failed:', err);
      return false;
    }
  });

  ipcMain.handle('system:getStartup', async (): Promise<boolean> => {
    try {
      if (!app.isPackaged) return false;
      return await getWindowsStartup();
    } catch (err) {
      console.log('[system.ipc] getStartup failed:', err);
      return false;
    }
  });

  ipcMain.handle('system:hideWindow', (): void => {
    mainWindow?.hide();
  });

  ipcMain.handle('system:showWindow', (): void => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}
