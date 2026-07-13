import { ipcMain, BrowserWindow } from 'electron';
import { KeyboardDevice, KeyEvent } from '../../src/types/macro.types';
import { listUsbKeyboards } from '../native/usb-enum';
import { parseDeviceKey } from '../native/usb-device-id';
import { openKeyboardReader, KeyboardReader } from '../native/hid-keyboard';
import { isDriverToolAvailable, dedicate, restore } from '../native/winusb-driver';

let mainWindowRef: BrowserWindow | null = null;
let selectedDeviceKey = '';
let reader: KeyboardReader | null = null;
let devices: KeyboardDevice[] = [];

const assignedKeyCodes = new Set<string>();

// A monotonically-increasing token identifying the "current" reader intent. Any
// startReader()/stopReader() bumps it, so an in-flight open-retry loop or a
// scheduled self-heal from an older intent cancels itself instead of leaving a
// stale reader behind.
let readerGeneration = 0;

// The device the reader is currently bound to (or actively opening). Used to make
// keyboard:select idempotent. App.tsx AND KeyboardSelector both call loadDevices()
// on mount, so keyboard:select fires twice in quick succession. findByIds() returns
// a SINGLETON libusb Device per VID/PID, so opening a second reader for the same
// device collides with the first on the shared handle — "Can't close device with a
// pending request" / LIBUSB_ERROR_NOT_FOUND — which kills the poll and looks like a
// stuck key (no more key events until restart). Skipping the redundant open avoids
// it. This race only surfaced in the packaged app, where faster startup fires the
// two selects close enough together to overlap.
let activeDeviceKey: string | null = null;

// After a driver swap (dedicate) Windows re-enumerates the device, which takes a
// few seconds; opening it too early fails or yields an unstable endpoint. We
// retry opening until it settles. findByIds() re-reads the device list on each
// attempt, so it picks up the fresh WinUSB handle once re-enumeration completes.
const OPEN_RETRY_INTERVAL_MS = 500;
const OPEN_MAX_ATTEMPTS = 30; // ~15s
const SELF_HEAL_DELAY_MS = 1000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Serializes every reader open/close so two intents never overlap on the shared
// libusb Device handle. Each queued operation runs to completion before the next
// begins; without this a teardown can cancel transfers out from under a concurrent
// open — the root cause of the stuck-key poll death on the packaged app.
let opChain: Promise<void> = Promise.resolve();
function serialize(op: () => Promise<void>): Promise<void> {
  const run = opChain.then(op, op);
  opChain = run.catch(() => { /* keep the chain alive after a failed op */ });
  return run;
}

// Tells the renderer to clear its "keys currently held" state. Called when a
// reader goes away: the delta-based reader derives key-ups by diffing against the
// previous report, so any key physically held across a teardown never produces an
// up — leaving it stuck-highlighted (and stuck in pressedKeys) until restart.
function flushPressedKeys(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send('keyboard:flush');
}

// Releases the current reader's USB interfaces and WAITS for the handle to close.
// Awaiting matters before opening another reader or a driver swap: if the WinUSB
// handle is still held, the next open races it (pending-request errors).
async function teardownReader(): Promise<void> {
  const current = reader;
  reader = null;
  if (current) {
    flushPressedKeys(); // held keys won't get an 'up' once this reader is gone
    try { await current.close(); } catch { /* ignore */ }
  }
}

// Opens the reader for a device, tearing down any previous reader FIRST so a close
// never races its own open. Retries while Windows finishes re-enumerating a
// just-swapped device. Bails immediately once a newer intent bumps the generation.
async function openReader(deviceKey: string, generation: number): Promise<void> {
  if (generation !== readerGeneration) return;
  await teardownReader();
  const ids = parseDeviceKey(deviceKey);
  if (!ids) return;

  const onDelta = (delta: { code: string; state: 'down' | 'up' }) => {
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
  };

  // Called only when the reader's internal poll recovery is exhausted (a dead
  // endpoint, e.g. on a half-re-enumerated handle). Re-open the device from
  // scratch — serialized and after a full teardown — so it self-heals once the
  // device is stable again instead of leaving one key "stuck" and no further input.
  const onError = (err: Error) => {
    if (generation !== readerGeneration) return; // superseded already
    console.warn('[keyboard.ipc] reader poll died, re-opening:', err.message);
    delay(SELF_HEAL_DELAY_MS).then(() => {
      if (generation !== readerGeneration) return;
      void serialize(() => openReader(deviceKey, generation));
    });
  };

  for (let attempt = 1; attempt <= OPEN_MAX_ATTEMPTS; attempt++) {
    if (generation !== readerGeneration) return; // superseded while waiting
    try {
      const opened = openKeyboardReader(ids.vendorId, ids.productId, onDelta, onError);
      if (generation !== readerGeneration) {
        // A newer select/stop happened while opening — discard this one.
        try { opened.close(); } catch { /* ignore */ }
        return;
      }
      reader = opened;
      console.log(`[keyboard.ipc] Reading WinUSB keyboard: ${deviceKey} (attempt ${attempt})`);
      return;
    } catch (err: any) {
      if (attempt >= OPEN_MAX_ATTEMPTS) {
        console.error('[keyboard.ipc] Could not open keyboard after retries:', err?.message);
        return;
      }
      // Device likely still re-enumerating after the driver swap; wait & retry.
      await delay(OPEN_RETRY_INTERVAL_MS);
    }
  }
}

// Starts reading a device. Idempotent for the SAME device that is already being
// read (the startup double-select case) unless force=true — used after a driver
// swap, where the handle changed and a fresh open is required even for the same id.
function startReader(deviceKey: string, force = false): void {
  if (!force && deviceKey && deviceKey === activeDeviceKey && reader) return;
  readerGeneration++; // supersede any in-flight open / scheduled self-heal
  activeDeviceKey = deviceKey;
  const generation = readerGeneration;
  void serialize(() => openReader(deviceKey, generation));
}

// Stops reading and WAITS for the handle to be released (used before a driver
// swap / device teardown so Windows can re-enumerate without a physical replug).
async function stopReader(): Promise<void> {
  readerGeneration++; // cancel any in-flight open / scheduled self-heal
  activeDeviceKey = null;
  await serialize(() => teardownReader());
}

export function registerKeyboardIpc(mainWindow: BrowserWindow | null): void {
  mainWindowRef = mainWindow;

  // Reading uses libusb's default backend — no global backend switch. A
  // dedicated keyboard is already bound to WinUSB, so node-usb opens it directly.
  console.log('[keyboard.ipc] WinUSB driver tool available:', isDriverToolAvailable());

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
    // Fire-and-forget: the open-retry loop runs in the background so the IPC call
    // returns immediately instead of blocking up to ~15s while the device settles.
    // Idempotent: a repeated select for the device already being read is a no-op,
    // so the startup double-select can't open two colliding readers.
    startReader(deviceId);
    console.log('[keyboard.ipc] Selected device:', deviceId);
    return true;
  });

  ipcMain.handle('keyboard:updateMacroKeys', (_e, keyCodes: string[]) => {
    assignedKeyCodes.clear();
    keyCodes.forEach(k => assignedKeyCodes.add(k));
    console.log('[keyboard.ipc] Macro keys updated:', keyCodes.length, 'keys');
    return true;
  });

  ipcMain.handle('keyboard:driverStatus', () => ({ available: isDriverToolAvailable() }));

  // Swap the selected keyboard to WinUSB via wdi-simple (libwdi). Runs elevated
  // (UAC). Windows re-enumerates the device; once bound it stops typing into
  // Windows and MacroDeck reads it directly. Start the reader on success.
  ipcMain.handle('keyboard:dedicate', async (_e, deviceId: string) => {
    const ids = parseDeviceKey(deviceId);
    if (!ids) return { ok: false, error: 'invalid device id' };
    if (!isDriverToolAvailable()) return { ok: false, error: 'WinUSB driver tool is not available' };

    const result = await dedicate(ids.vendorId, ids.productId);
    if (result.ok) {
      console.log('[keyboard.ipc] Dedicated (WinUSB) device:', deviceId);
      // Fire-and-forget: startReader retries opening while Windows finishes
      // re-enumerating the just-swapped device (returns immediately). force=true
      // because the handle changed — even if this device was already "active",
      // the old reader points at the pre-swap enumeration and must be replaced.
      startReader(deviceId, true);
    } else {
      console.error('[keyboard.ipc] Dedicate failed:', result.error, 'exit', result.exitCode);
      if (result.log) console.error('[keyboard.ipc] wdi-simple log:\n' + result.log);
    }
    return result;
  });

  // Remove the WinUSB driver package and rescan so Windows reinstalls the in-box
  // HID driver. Runs elevated (UAC).
  ipcMain.handle('keyboard:undedicate', async (_e, deviceId: string) => {
    const ids = parseDeviceKey(deviceId);
    if (!ids) return { ok: false, error: 'invalid device id' };
    // Releasing uses pnputil (a built-in Windows command), so it must work even
    // when the wdi-simple dedicate tool is missing — no driver-tool gate here.

    // Wait for the WinUSB handle to be fully released before restoring, otherwise
    // Windows can't tear the device down and the user must physically replug it.
    await stopReader();
    const result = await restore(ids.vendorId, ids.productId);
    if (result.ok) {
      console.log('[keyboard.ipc] Un-dedicated (restored HID) device:', deviceId);
    } else {
      console.error('[keyboard.ipc] Un-dedicate failed:', result.error, 'exit', result.exitCode);
      if (result.log) console.error('[keyboard.ipc] pnputil log:\n' + result.log);
    }
    return result;
  });
}

export { selectedDeviceKey as selectedDeviceHandle };
