import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { KeyboardDevice, KeyEvent } from '../../src/types/macro.types';

// ─── State ────────────────────────────────────────────────────────────────────

let selectedDeviceKey = '';
let mainWindowRef: BrowserWindow | null = null;
let ic: any = null;
let listenerActive = false;

const tmpDir = path.join(os.tmpdir(), 'macrodeck');
function ensureTmpDir() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
}

// ─── Scan code → KeyboardEvent.code ──────────────────────────────────────────

const SCAN_TO_CODE: Record<number, string> = {
  1:'Escape',2:'Digit1',3:'Digit2',4:'Digit3',5:'Digit4',6:'Digit5',
  7:'Digit6',8:'Digit7',9:'Digit8',10:'Digit9',11:'Digit0',
  12:'Minus',13:'Equal',14:'Backspace',15:'Tab',
  16:'KeyQ',17:'KeyW',18:'KeyE',19:'KeyR',20:'KeyT',
  21:'KeyY',22:'KeyU',23:'KeyI',24:'KeyO',25:'KeyP',
  26:'BracketLeft',27:'BracketRight',28:'Enter',29:'ControlLeft',
  30:'KeyA',31:'KeyS',32:'KeyD',33:'KeyF',34:'KeyG',
  35:'KeyH',36:'KeyJ',37:'KeyK',38:'KeyL',
  39:'Semicolon',40:'Quote',41:'Backquote',42:'ShiftLeft',43:'Backslash',
  44:'KeyZ',45:'KeyX',46:'KeyC',47:'KeyV',48:'KeyB',
  49:'KeyN',50:'KeyM',51:'Comma',52:'Period',53:'Slash',
  54:'ShiftRight',55:'NumpadMultiply',56:'AltLeft',57:'Space',58:'CapsLock',
  59:'F1',60:'F2',61:'F3',62:'F4',63:'F5',64:'F6',
  65:'F7',66:'F8',67:'F9',68:'F10',69:'NumLock',70:'ScrollLock',
  71:'Numpad7',72:'Numpad8',73:'Numpad9',74:'NumpadSubtract',
  75:'Numpad4',76:'Numpad5',77:'Numpad6',78:'NumpadAdd',
  79:'Numpad1',80:'Numpad2',81:'Numpad3',82:'Numpad0',83:'NumpadDecimal',
  87:'F11',88:'F12',
};

const SCAN_EXT: Record<number, string> = {
  28:'NumpadEnter',29:'ControlRight',53:'NumpadDivide',56:'AltRight',
  71:'Home',72:'ArrowUp',73:'PageUp',75:'ArrowLeft',77:'ArrowRight',
  79:'End',80:'ArrowDown',81:'PageDown',82:'Insert',83:'Delete',
  91:'MetaLeft',92:'MetaRight',93:'ContextMenu',
};

function strokeToCode(stroke: any): string {
  const scanCode: number = stroke.code ?? 0;
  const state: number = stroke.state ?? 0;
  const isExt = (state & 0x02) !== 0;
  if (isExt && SCAN_EXT[scanCode]) return SCAN_EXT[scanCode];
  return SCAN_TO_CODE[scanCode] ?? `SC${scanCode}`;
}

function strokeIsUp(stroke: any): boolean {
  // Interception KeyState: KEY_DOWN=0, KEY_UP=1, KEY_E0=2, KEY_E1=4
  return (stroke.state & 0x01) !== 0;
}

// ─── Enumerate keyboards ──────────────────────────────────────────────────────

function getKeyboards(): KeyboardDevice[] {
  let tempIc: any = null;
  try {
    const { Interception, FilterKeyState } = require('node-interception');
    tempIc = new Interception();
    tempIc.setFilter('keyboard', FilterKeyState.ALL);
    const keyboards: any[] = tempIc.getKeyboards();

    const devices: KeyboardDevice[] = keyboards
      .filter((kb: any) => !kb.isInvalid())
      .map((kb: any) => {
        const hwid: string = kb.getHardwareId() ?? '';
        const vidMatch = hwid.match(/VID_([0-9A-Fa-f]{4})/i);
        const pidMatch = hwid.match(/PID_([0-9A-Fa-f]{4})/i);
        const vid = vidMatch ? parseInt(vidMatch[1], 16) : 0;
        const pid = pidMatch ? parseInt(pidMatch[1], 16) : 0;
        const vidHex = vid.toString(16).toUpperCase().padStart(4, '0');
        const pidHex = pid.toString(16).toUpperCase().padStart(4, '0');
        const deviceKey = `interception:${kb.id}`;
        return {
          id: deviceKey,
          name: `Keyboard ${kb.id} (${vidHex}:${pidHex})`,
          vendorId: vid,
          productId: pid,
          isSelected: deviceKey === selectedDeviceKey,
          isConnected: true,
        };
      });

    // Enrich with PnP friendly names
    try {
      ensureTmpDir();
      const { execFileSync } = require('child_process');
      const ps = `Get-PnpDevice -Class Keyboard -ErrorAction SilentlyContinue | Select-Object FriendlyName,HardwareID | ConvertTo-Json -Compress -Depth 3`;
      const scriptPath = path.join(tmpDir, 'pnp.ps1');
      fs.writeFileSync(scriptPath, ps, 'utf8');
      const out = execFileSync('powershell', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      ], { timeout: 8000 }).toString().trim();
      if (out) {
        const raw = JSON.parse(out);
        const pnpList: any[] = Array.isArray(raw) ? raw : [raw];
        devices.forEach(dev => {
          const vidHex = dev.vendorId.toString(16).toUpperCase().padStart(4, '0');
          const pidHex = dev.productId.toString(16).toUpperCase().padStart(4, '0');
          const match = pnpList.find((p: any) => {
            const hwids: string[] = Array.isArray(p.HardwareID) ? p.HardwareID : [p.HardwareID ?? ''];
            return hwids.some((h: string) =>
              h?.toUpperCase().includes(`VID_${vidHex}`) &&
              h?.toUpperCase().includes(`PID_${pidHex}`)
            );
          });
          if (match?.FriendlyName) dev.name = match.FriendlyName;
        });
      }
    } catch { /* ignore PnP errors */ }

    return devices;
  } catch (err: any) {
    console.error('[keyboard.ipc] getKeyboards failed:', err.message?.slice(0, 100));
    return [];
  } finally {
    try { tempIc?.destroy(); } catch {}
  }
}

// ─── Macro key set (populated from renderer when macros change) ───────────────
// Keys in this set will execute macro; keys NOT in set will be suppressed
// when the macro device is selected

const assignedKeyCodes = new Set<string>(); // e.g. 'KeyA', 'F1', 'Space'

// ─── Interception listener ────────────────────────────────────────────────────
//
// API (from source):
//   ic.wait() → Promise<Device | null>
//   device.receive() → stroke
//   device.send(stroke)   ← pass through (keyboard works normally)
//   NOT calling send()    ← suppress (keystroke is consumed)

function startListener(): void {
  if (listenerActive) return;

  let Interception: any, FilterKeyState: any;
  try {
    const mod = require('node-interception');
    Interception = mod.Interception;
    FilterKeyState = mod.FilterKeyState;
  } catch (err: any) {
    console.error('[keyboard.ipc] node-interception not available:', err.message);
    return;
  }

  try {
    ic = new Interception();
    ic.setFilter('keyboard', FilterKeyState.ALL);
    listenerActive = true;
    console.log('[keyboard.ipc] Interception listener started');
  } catch (err: any) {
    console.error('[keyboard.ipc] Interception init failed:', err.message);
    return;
  }

  function loop() {
    if (!listenerActive || !ic) return;

    ic.wait()
      .then((device: any) => {
        if (!device) { loop(); return; }

        const stroke = device.receive();
        const deviceKey = `interception:${device.id}`;
        const isMacroDevice = selectedDeviceKey !== '' && deviceKey === selectedDeviceKey;

        if (!isMacroDevice) {
          // Not the macro device → always pass through normally
          device.send(stroke);
          loop();
          return;
        }

        // ── This IS the macro device ──────────────────────────────────────────
        const code = strokeToCode(stroke);
        const isUp = strokeIsUp(stroke);

        if (assignedKeyCodes.has(code)) {
          // Key has a macro assigned → suppress keystroke, emit event to renderer
          // Do NOT call device.send(stroke) → keystroke is consumed
          if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            mainWindowRef.webContents.send('keyboard:event', {
              code,
              keycode: stroke.code ?? 0,
              state: isUp ? 'up' : 'down',
              deviceId: deviceKey,
              isMacroDevice: true,
            } as KeyEvent & { isMacroDevice: boolean });
          }
        } else {
          // Key has NO macro → suppress (don't send, don't emit)
          // The key does nothing — it's a dedicated macro keyboard
        }

        loop();
      })
      .catch((err: any) => {
        if (listenerActive) {
          console.error('[keyboard.ipc] wait error:', err.message?.slice(0, 80));
          setTimeout(loop, 500);
        }
      });
  }

  loop();
}

function stopListener(): void {
  listenerActive = false;
  try { ic?.destroy(); } catch {}
  ic = null;
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

export function registerKeyboardIpc(mainWindow: BrowserWindow | null): void {
  mainWindowRef = mainWindow;

  ipcMain.handle('keyboard:list', async () => {
    const devices = getKeyboards();
    if (devices.length > 0) return devices;
    return [{
      id: 'all', name: 'All Keyboards',
      vendorId: 0, productId: 0,
      isSelected: selectedDeviceKey === 'all', isConnected: true,
    }];
  });

  ipcMain.handle('keyboard:select', (_e, deviceId: string) => {
    selectedDeviceKey = deviceId;
    console.log('[keyboard.ipc] Selected:', deviceId);
    return true;
  });

  // Called by renderer whenever macros change
  ipcMain.handle('keyboard:updateMacroKeys', (_e, keyCodes: string[]) => {
    assignedKeyCodes.clear();
    keyCodes.forEach(k => assignedKeyCodes.add(k));
    console.log('[keyboard.ipc] Macro keys updated:', keyCodes.length, 'keys');
    return true;
  });

  startListener();
}

export { selectedDeviceKey as selectedDeviceHandle };
