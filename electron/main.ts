import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { StoreSchema, AppSettings } from '../src/types/macro.types';
import { registerKeyboardIpc } from './ipc/keyboard.ipc';
import { registerAppsIpc } from './ipc/apps.ipc';
import { registerAudioIpc } from './ipc/audio.ipc';
import { registerMacroIpc } from './ipc/macro.ipc';
import { registerSystemIpc, setWindowsStartup } from './ipc/system.ipc';
import { registerAeIpc } from './ipc/ae.ipc';
import { writeLibrary, writeExpressions } from './ipc/ae-bridge';
import { compileExpression } from '../src/components/MacroSettings/ae/compileExpression';
import { ensureAppVolumeExe } from './native/appvolume';
import { createNotificationWindow, registerNotificationIpc } from './notification-window';
import { installFileLogger } from './debug-log';

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
    aeScripts: [],
    aeExpressions: [],
  },
});

function getAssetPath(...parts: string[]): string {
  if (app.isPackaged) {
    return path.join(__dirname, '../../../assets', ...parts);
  }
  return path.join(__dirname, '../../../assets', ...parts);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
      // MacroDeck runs in the tray with its window hidden most of the time. By
      // default Chromium throttles hidden/occluded renderers (clamped timers,
      // paused rendering), which would delay the keyboard:event handler that runs
      // macros — the app must stay fully responsive while backgrounded.
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!settings.startMinimized) {
      mainWindow?.show();
    }
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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
      click: async (item) => {
        const result = await setWindowsStartup(item.checked);
        if (result) {
          store.set('settings.runOnStartup', item.checked);
          updateTrayMenu();
        }
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

// Refresh the AE panel's library.json. Wrapped so a write failure (e.g. the
// bridge dir can't be created) is logged but never crashes the caller.
function syncAeLibrary(): void {
  try {
    writeLibrary(store.get('aeScripts', []));
  } catch (e) {
    console.error('[main] writeLibrary failed:', e);
  }
}

// Compile each saved expression to JSX and refresh the panel's expressions.json.
// Wrapped so a write/compile failure is logged but never crashes the caller.
function syncAeExpressions(): void {
  try {
    const exprs = store.get('aeExpressions', []);
    const compiled = exprs.map(e => ({
      id: e.id,
      name: e.name,
      jsx: compileExpression(e.expression, e.target),
    }));
    writeExpressions(compiled);
  } catch (e) {
    console.error('[main] writeExpressions failed:', e);
  }
}

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

  ipcMain.handle('store:saveAeScripts', (_event, scripts) => {
    store.set('aeScripts', scripts);
    syncAeLibrary();
    return true;
  });

  ipcMain.handle('store:loadAeScripts', () => {
    return store.get('aeScripts', []);
  });

  ipcMain.handle('store:saveAeExpressions', (_event, expressions) => {
    store.set('aeExpressions', expressions);
    syncAeExpressions();
    return true;
  });

  ipcMain.handle('store:loadAeExpressions', () => {
    return store.get('aeExpressions', []);
  });
}

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

app.whenReady().then(() => {
  installFileLogger();

  setTimeout(() => {
    // Fire-and-forget async compile; errors are logged, never block startup.
    ensureAppVolumeExe().catch((e) => {
      console.error('[main] AppVolume compile failed:', e);
    });
  }, 2000);

  createWindow();
  createTray();
  createNotificationWindow();

  registerStoreIpc();
  registerWindowIpc();
  registerKeyboardIpc(mainWindow);
  registerAppsIpc();
  registerAudioIpc();
  registerMacroIpc(store, mainWindow);
  registerSystemIpc(store, mainWindow, updateTrayMenu);
  registerAeIpc();
  registerNotificationIpc();

  // Seed the AE panel's library.json so it has data even if the user changes
  // nothing this session (the panel reads the last-written file).
  syncAeLibrary();
  syncAeExpressions();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    return;
  }
});

export { mainWindow, store };
