import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import type Store from 'electron-store';
import { StoreSchema } from '../../src/types/macro.types';

export function registerSystemIpc(
  store: Store<StoreSchema>,
  mainWindow: BrowserWindow | null,
  updateTrayMenu: () => void
): void {
  ipcMain.handle('system:setStartup', (_event, enabled: boolean): boolean => {
    try {
      // In production: process.execPath = MacroDeck.exe (the installed app)
      // In dev: process.execPath = electron.exe — don't register startup in dev
      const isPackaged = app.isPackaged;

      if (!isPackaged) {
        console.log('[system.ipc] Skipping startup registration in dev mode');
        store.set('settings.runOnStartup' as any, enabled);
        updateTrayMenu();
        return true;
      }

      // Use the actual installed executable path
      const exePath = process.execPath;

      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: store.get('settings.startMinimized' as any, false) as boolean,
        path: exePath,
        args: [],
      });

      store.set('settings.runOnStartup' as any, enabled);
      updateTrayMenu();
      return true;
    } catch (err) {
      console.error('[system.ipc] setStartup failed:', err);
      return false;
    }
  });

  ipcMain.handle('system:getStartup', (): boolean => {
    if (!app.isPackaged) return false;
    const settings = app.getLoginItemSettings({
      path: process.execPath,
      args: [],
    });
    return settings.openAtLogin;
  });

  ipcMain.handle('system:hideWindow', (): void => {
    mainWindow?.hide();
  });

  ipcMain.handle('system:showWindow', (): void => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}
