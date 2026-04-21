import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';

let notifWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;

export function createNotificationWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  notifWindow = new BrowserWindow({
    width: 380,
    height: 600,
    x: width - 390,
    y: height - 610,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // focusable: false so it never steals focus or brings main window up
    focusable: false,
    show: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Default: click-through everywhere, NO forward (forward causes main window to show)
  notifWindow.setIgnoreMouseEvents(true, { forward: false });

  if (isDev) {
    notifWindow.loadURL('http://localhost:5173/notification.html');
  } else {
    notifWindow.loadFile(path.join(__dirname, '../../renderer/notification.html'));
  }

  notifWindow.once('ready-to-show', () => {
    notifWindow?.show();
  });

  notifWindow.on('closed', () => {
    notifWindow = null;
  });

  return notifWindow;
}

export function getNotificationWindow(): BrowserWindow | null {
  return notifWindow;
}

export function registerNotificationIpc(): void {
  // When hovering over a notification card:
  // - Enable mouse events on notification window ONLY (no forward to other windows)
  // - This lets user click X to dismiss without triggering main window
  ipcMain.on('notif:set-interactive', (_e, interactive: boolean) => {
    if (!notifWindow) return;
    if (interactive) {
      // Enable clicks on notification window, but DO NOT forward to windows below
      notifWindow.setIgnoreMouseEvents(false);
    } else {
      // Back to click-through, no forward
      notifWindow.setIgnoreMouseEvents(true, { forward: false });
    }
  });
}

export function sendNotification(data: {
  id: string;
  type: 'success' | 'loading' | 'error' | 'info';
  title: string;
  message?: string;
  icon?: string;
  duration?: number;
}): void {
  notifWindow?.webContents.send('notif:show', data);
}

export function dismissNotification(id: string): void {
  notifWindow?.webContents.send('notif:dismiss', id);
}

export function updateNotification(id: string, updates: object): void {
  notifWindow?.webContents.send('notif:update', { id, ...updates });
}
