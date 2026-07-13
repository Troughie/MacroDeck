import { contextBridge, ipcRenderer } from 'electron';
import type {
  MacroConfig,
  AppSettings,
  KeyEvent,
  InstalledApp,
  AudioSession,
  KeyboardDevice,
} from '../src/types/macro.types';

// ─── Type-safe IPC Bridge ─────────────────────────────────────────────────────

const electronAPI = {
  // ── Keyboard ──────────────────────────────────────────────────────────────
  keyboard: {
    list: (): Promise<KeyboardDevice[]> =>
      ipcRenderer.invoke('keyboard:list'),
    select: (deviceId: string): Promise<boolean> =>
      ipcRenderer.invoke('keyboard:select', deviceId),
    updateMacroKeys: (keyCodes: string[]): Promise<boolean> =>
      ipcRenderer.invoke('keyboard:updateMacroKeys', keyCodes),
    driverStatus: (): Promise<{ available: boolean }> =>
      ipcRenderer.invoke('keyboard:driverStatus'),
    dedicate: (deviceId: string): Promise<{ ok: boolean; exitCode?: number | null; error?: string; log?: string }> =>
      ipcRenderer.invoke('keyboard:dedicate', deviceId),
    undedicate: (deviceId: string): Promise<{ ok: boolean; exitCode?: number | null; error?: string; log?: string }> =>
      ipcRenderer.invoke('keyboard:undedicate', deviceId),
    onKeyEvent: (callback: (event: KeyEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: KeyEvent) => callback(event);
      ipcRenderer.on('keyboard:event', handler);
      return () => ipcRenderer.removeListener('keyboard:event', handler);
    },
    // Fired when the main-process reader is torn down / replaced, so the renderer
    // can clear any keys it still thinks are held (their key-up was lost with the
    // old reader). Prevents a stuck-highlighted key on the visualizer.
    onFlush: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('keyboard:flush', handler);
      return () => ipcRenderer.removeListener('keyboard:flush', handler);
    },
  },

  // ── Apps ──────────────────────────────────────────────────────────────────
  apps: {
    getInstalled: (): Promise<InstalledApp[]> =>
      ipcRenderer.invoke('apps:getInstalled'),
    browseExe: (): Promise<string | null> =>
      ipcRenderer.invoke('apps:browseExe'),
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  audio: {
    getSessions: (): Promise<AudioSession[]> =>
      ipcRenderer.invoke('audio:getSessions'),
    setVolume: (target: string, volume: number): Promise<boolean> =>
      ipcRenderer.invoke('audio:setVolume', target, volume),
    toggleMute: (target: string): Promise<boolean> =>
      ipcRenderer.invoke('audio:toggleMute', target),
  },

  // ── Macro ─────────────────────────────────────────────────────────────────
  macro: {
    execute: (macro: MacroConfig): Promise<boolean> =>
      ipcRenderer.invoke('macro:execute', macro),
  },

  // ── Store ─────────────────────────────────────────────────────────────────
  store: {
    saveMacros: (macros: Record<string, MacroConfig>): Promise<boolean> =>
      ipcRenderer.invoke('store:saveMacros', macros),
    loadMacros: (): Promise<Record<string, MacroConfig>> =>
      ipcRenderer.invoke('store:loadMacros'),
    saveSettings: (settings: AppSettings): Promise<boolean> =>
      ipcRenderer.invoke('store:saveSettings', settings),
    loadSettings: (): Promise<AppSettings> =>
      ipcRenderer.invoke('store:loadSettings'),
    saveDevice: (deviceId: string): Promise<boolean> =>
      ipcRenderer.invoke('store:saveDevice', deviceId),
    loadDevice: (): Promise<string> =>
      ipcRenderer.invoke('store:loadDevice'),
  },

  // ── System ────────────────────────────────────────────────────────────────
  system: {
    setStartup: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('system:setStartup', enabled),
    getStartup: (): Promise<boolean> =>
      ipcRenderer.invoke('system:getStartup'),
    hideWindow: (): Promise<void> =>
      ipcRenderer.invoke('system:hideWindow'),
    showWindow: (): Promise<void> =>
      ipcRenderer.invoke('system:showWindow'),
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  profile: {
    onSwitch: (callback: (data: { mode: string; targetProfileId?: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('profile:switch', handler);
      return () => ipcRenderer.removeListener('profile:switch', handler);
    },
  },

  // ── Notifications (for overlay window) ───────────────────────────────────
  notif: {
    onShow: (callback: (data: any) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('notif:show', handler);
      return () => ipcRenderer.removeListener('notif:show', handler);
    },
    onDismiss: (callback: (id: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, id: string) => callback(id);
      ipcRenderer.on('notif:dismiss', handler);
      return () => ipcRenderer.removeListener('notif:dismiss', handler);
    },
    onUpdate: (callback: (data: any) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('notif:update', handler);
      return () => ipcRenderer.removeListener('notif:update', handler);
    },
  },

  // ── Internal IPC (for notification window mouse events) ──────────────────
  _ipc: {
    send: (channel: string, ...args: any[]) => {
      const allowed = ['notif:set-interactive'];
      if (allowed.includes(channel)) ipcRenderer.send(channel, ...args);
    },
  },

  // ── Window Controls ───────────────────────────────────────────────────────
  window: {    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
      const handler = (_: Electron.IpcRendererEvent, val: boolean) => callback(val);
      ipcRenderer.on('window:maximizeChange', handler);
      return () => ipcRenderer.removeListener('window:maximizeChange', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ─── Type Declaration ─────────────────────────────────────────────────────────
export type ElectronAPI = typeof electronAPI;
