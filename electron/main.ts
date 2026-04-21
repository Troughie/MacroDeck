import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { StoreSchema, AppSettings } from '../src/types/macro.types';
import { registerKeyboardIpc } from './ipc/keyboard.ipc';
import { registerAppsIpc } from './ipc/apps.ipc';
import { registerAudioIpc } from './ipc/audio.ipc';
import { registerMacroIpc } from './ipc/macro.ipc';
import { registerSystemIpc } from './ipc/system.ipc';
import { ensureAppVolumeExe } from './native/appvolume';
import { createNotificationWindow, registerNotificationIpc } from './notification-window';

// ─── Store Setup ─────────────────────────────────────────────────────────────

const store = new Store<StoreSchema>({
  name: 'macrodeck-config',
  defaults: {
    selectedDeviceId: '',
    macros: {},
    profiles: [{ id: 'default', name: 'Default', color: '#3b82f6', createdAt: 0 }],
    activeProfileId: 'default',
    settings: {
      runOnStartup: false,
      startMinimized: false,
      theme: 'dark',
    },
  },
});

// ─── Asset path helper ───────────────────────────────────────────────────────
// In dev: assets/ is at project root
// In production: assets/ is bundled into the asar at dist/assets/ or via extraResources

function getAssetPath(...parts: string[]): string {
  if (app.isPackaged) {
    // In packaged app, assets are in resources/app.asar/assets/
    return path.join(__dirname, '../../../assets', ...parts);
  }
  return path.join(__dirname, '../../../assets', ...parts);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  const settings = store.get('settings') as AppSettings;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // __dirname in production = dist/electron/electron/
    // renderer is at dist/renderer/index.html → go up 2 levels
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    if (!settings.startMinimized) {
      mainWindow?.show();
    }
  });

  // Hide to tray on close (don't quit)
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Tray Setup ──────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = getAssetPath('tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  tray.setToolTip('MacroDeck');
  updateTrayMenu();

  tray.on('double-click', () => {
    showWindow();
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const settings = store.get('settings') as AppSettings;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show MacroDeck',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: 'Run on Startup',
      type: 'checkbox',
      checked: settings.runOnStartup,
      click: (item) => {
        if (app.isPackaged) {
          app.setLoginItemSettings({
            openAtLogin: item.checked,
            openAsHidden: settings.startMinimized,
            path: process.execPath,
            args: [],
          });
        }
        store.set('settings.runOnStartup', item.checked);
        updateTrayMenu();
      },
    },
    {
      label: 'Start Minimized',
      type: 'checkbox',
      checked: settings.startMinimized,
      click: (item) => {
        store.set('settings.startMinimized', item.checked);
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit MacroDeck',
      click: () => {
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function showWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ─── IPC: Store ───────────────────────────────────────────────────────────────

function registerStoreIpc(): void {
  ipcMain.handle('store:saveMacros', (_event, macros) => {
    store.set('macros', macros);
    return true;
  });

  ipcMain.handle('store:loadMacros', () => {
    return store.get('macros', {});
  });

  ipcMain.handle('store:saveSettings', (_event, settings: AppSettings) => {
    store.set('settings', settings);
    updateTrayMenu();
    return true;
  });

  ipcMain.handle('store:loadSettings', () => {
    return store.get('settings');
  });

  ipcMain.handle('store:saveDevice', (_event, deviceId: string) => {
    store.set('selectedDeviceId', deviceId);
    return true;
  });

  ipcMain.handle('store:loadDevice', () => {
    return store.get('selectedDeviceId', '');
  });
}

// ─── IPC: Window Controls ─────────────────────────────────────────────────────

function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Pre-compile AppVolume.exe in background
  setTimeout(() => {
    try { ensureAppVolumeExe(); } catch (e) { console.error('[main] AppVolume compile failed:', e); }
  }, 2000);

  createWindow();
  createTray();
  createNotificationWindow();

  // Register all IPC handlers
  registerStoreIpc();
  registerWindowIpc();
  registerKeyboardIpc(mainWindow);
  registerAppsIpc();
  registerAudioIpc();
  registerMacroIpc(store, mainWindow);
  registerSystemIpc(store, mainWindow, updateTrayMenu);
  registerNotificationIpc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
}

app.on('window-all-closed', () => {
  // Don't quit on Windows — stay in tray
  if (process.platform !== 'darwin') {
    // Keep running
  }
});

// Export for IPC modules
export { mainWindow, store };
