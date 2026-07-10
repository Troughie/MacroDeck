import { ipcMain, BrowserWindow } from 'electron';
import { KeyboardDevice, KeyEvent } from '../../src/types/macro.types';
import { listUsbKeyboards } from '../native/usb-enum';
import { parseDeviceKey } from '../native/usb-device-id';
import { openKeyboardReader, KeyboardReader } from '../native/hid-keyboard';

let mainWindowRef: BrowserWindow | null = null;
let selectedDeviceKey = '';
let reader: KeyboardReader | null = null;
let devices: KeyboardDevice[] = [];

const assignedKeyCodes = new Set<string>();

function stopReader(): void {
  if (reader) {
    try { reader.close(); } catch { /* ignore */ }
    reader = null;
  }
}

function startReaderFor(deviceKey: string): void {
  stopReader();
  const ids = parseDeviceKey(deviceKey);
  if (!ids) return;

  try {
    reader = openKeyboardReader(
      ids.vendorId,
      ids.productId,
      (delta) => {
        // Only forward keys assigned to a macro (matches previous behaviour).
        if (!assignedKeyCodes.has(delta.code)) return;
        if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
        mainWindowRef.webContents.send('keyboard:event', {
          code: delta.code,
          keycode: 0,
          state: delta.state,
          deviceId: deviceKey,
          isMacroDevice: true,
        } as KeyEvent);
      },
      (err) => {
        // hid-keyboard already recovers from transient endpoint errors; reaching
        // here means recovery was exhausted. Log it but keep the reader in place —
        // tearing down on every error caused reopen/"Polling is not active" storms.
        // The next keyboard:select will cleanly stop and reopen.
        console.warn('[keyboard.ipc] reader error (recovery exhausted):', err.message);
      },
    );
    console.log('[keyboard.ipc] Reading WinUSB keyboard:', deviceKey);
  } catch (err: any) {
    console.error('[keyboard.ipc] Failed to open keyboard:', err.message);
    reader = null;
  }
}

export function registerKeyboardIpc(mainWindow: BrowserWindow | null): void {
  mainWindowRef = mainWindow;

  ipcMain.handle('keyboard:list', async () => {
    devices = await listUsbKeyboards(selectedDeviceKey);
    return devices;
  });

  ipcMain.handle('keyboard:select', async (_e, deviceId: string) => {
    selectedDeviceKey = deviceId;
    devices = devices.map(device => ({
      ...device,
      isSelected: device.id === selectedDeviceKey,
    }));
    startReaderFor(deviceId);
    console.log('[keyboard.ipc] Selected device:', deviceId);
    return true;
  });

  ipcMain.handle('keyboard:updateMacroKeys', (_e, keyCodes: string[]) => {
    assignedKeyCodes.clear();
    keyCodes.forEach(k => assignedKeyCodes.add(k));
    console.log('[keyboard.ipc] Macro keys updated:', keyCodes.length, 'keys');
    return true;
  });
}

export { selectedDeviceKey as selectedDeviceHandle };
