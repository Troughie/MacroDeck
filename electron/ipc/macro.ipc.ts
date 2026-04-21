import { ipcMain, shell } from 'electron';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type Store from 'electron-store';
import { runAppVolume } from '../native/appvolume';
import { sendNotification, updateNotification } from '../notification-window';

function genId() { return `n_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
import {
  MacroConfig,
  AppLaunchSettings,
  WebLinkSettings,
  MultimediaSettings,
  MuteSettings,
  VolumeSettings,
  HotkeySettings,
  ProfileSwitchSettings,
  StoreSchema,
} from '../../src/types/macro.types';

const execAsync = promisify(exec);

// ─── @nut-tree-fork/nut-js (optional — graceful fallback) ────────────────────
let nutKeyboard: any = null;
let nutKey: any = null;
try {
  const nut = require('@nut-tree-fork/nut-js');
  nutKeyboard = nut.keyboard;
  nutKey = nut.Key;
  console.log('[macro.ipc] nut-js keyboard available');
} catch {
  console.warn('[macro.ipc] nut-js not available, using PowerShell fallback');
}

// ─── Media key VK codes ───────────────────────────────────────────────────────
const MEDIA_KEYS: Record<string, number> = {
  PLAY_PAUSE: 0xB3,
  PLAY: 0xB3,
  PAUSE: 0xB3,
  NEXT: 0xB0,
  PREV: 0xB1,
};

// ─── PowerShell helpers ───────────────────────────────────────────────────────

async function execPowerShell(script: string, timeout = 5000): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
      { timeout }
    );
    return stdout.trim();
  } catch (err: any) {
    throw new Error(`PowerShell error: ${err.message}`);
  }
}


const tmpDir = path.join(os.tmpdir(), 'macrodeck');
function ensureTmpDir() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
}

// Pre-compile the key sender script once
let keySenderExe: string | null = null;

function getKeySenderExe(): string | null {
  if (keySenderExe && fs.existsSync(keySenderExe)) return keySenderExe;
  try {
    ensureTmpDir();
    const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (!fs.existsSync(csc)) return null;
    const src = `using System;
using System.Runtime.InteropServices;
class KeySender {
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);
    static void Main(string[] args) {
        if (args.Length == 0) return;
        byte vk = byte.Parse(args[0]);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(30);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
}`;
    const srcPath = path.join(tmpDir, 'KeySender.cs');
    const exePath = path.join(tmpDir, 'KeySender.exe');
    fs.writeFileSync(srcPath, src, 'utf8');
    const { execFileSync } = require('child_process');
    execFileSync(csc, ['/nologo', `/out:${exePath}`, '/r:System.dll', srcPath], { timeout: 15000, stdio: 'pipe' });
    keySenderExe = exePath;
    return exePath;
  } catch {
    return null;
  }
}

async function sendVirtualKey(vkCode: number): Promise<void> {
  const { execFileSync } = require('child_process');

  // Try compiled KeySender.exe first (fastest)
  const exe = getKeySenderExe();
  if (exe) {
    try {
      execFileSync(exe, [String(vkCode)], { timeout: 2000 });
      return;
    } catch {}
  }

  // Fallback: PowerShell via temp file
  try {
    ensureTmpDir();
    const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KS {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);
}
"@
[KS]::keybd_event(${vkCode}, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[KS]::keybd_event(${vkCode}, 0, 2, [UIntPtr]::Zero)
`;
    const scriptPath = path.join(tmpDir, `vk_${vkCode}.ps1`);
    fs.writeFileSync(scriptPath, ps, 'utf8');
    execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    ], { timeout: 3000 });
  } catch (err: any) {
    console.error('[macro.ipc] sendVirtualKey failed:', err.message?.slice(0, 80));
  }
}

// ─── Macro Executors ──────────────────────────────────────────────────────────

async function executeAppLaunch(settings: AppLaunchSettings): Promise<void> {
  if (!settings.exePath) throw new Error('No exe path specified');
  if (!fs.existsSync(settings.exePath)) throw new Error(`App not found: ${settings.exePath}`);

  // Use spawn with detached=true so it works even when app is in background/tray
  const { spawn } = require('child_process');
  const child = spawn(settings.exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: require('path').dirname(settings.exePath),
  });
  child.unref();
}

async function executeWebLink(settings: WebLinkSettings): Promise<void> {
  if (!settings.url) throw new Error('No URL specified');

  const url = settings.url.startsWith('http') ? settings.url : `https://${settings.url}`;

  if (settings.browserExePath && fs.existsSync(settings.browserExePath)) {
    spawn(settings.browserExePath, [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    await shell.openExternal(url);
  }
}

async function executeMultimedia(settings: MultimediaSettings): Promise<void> {
  const vkCode = MEDIA_KEYS[settings.action];
  if (!vkCode) throw new Error(`Unknown media action: ${settings.action}`);

  if (nutKeyboard && nutKey) {
    // nut-js media key mapping
    const nutKeyMap: Record<string, any> = {
      PLAY_PAUSE: nutKey.AudioPlay,
      PLAY: nutKey.AudioPlay,
      PAUSE: nutKey.AudioPause,
      NEXT: nutKey.AudioNext,
      PREV: nutKey.AudioPrev,
    };
    const nk = nutKeyMap[settings.action];
    if (nk !== undefined) {
      await nutKeyboard.pressKey(nk);
      await nutKeyboard.releaseKey(nk);
      return;
    }
  }

  // PowerShell fallback
  await sendVirtualKey(vkCode);
}

async function executeMuteToggle(settings: MuteSettings): Promise<void> {
  try {
    runAppVolume(['toggle-mute', settings.target]);
    return;
  } catch (err: any) {
    console.error('[macro.ipc] AppVolume mute failed:', err.message?.slice(0, 100));
  }

  // Fallback for master: VK_VOLUME_MUTE
  if (settings.target === 'master') {
    await sendVirtualKey(0xAD);
  }
}

async function executeVolumeAdjust(settings: VolumeSettings): Promise<void> {
  try {
    if (settings.mode === 'set' && settings.setValue !== undefined) {
      runAppVolume(['set-volume', settings.target, String(settings.setValue)]);
    } else if (settings.mode === 'increase') {
      runAppVolume(['volume-up', settings.target, String(settings.delta)]);
    } else if (settings.mode === 'decrease') {
      runAppVolume(['volume-down', settings.target, String(settings.delta)]);
    }
    return;
  } catch (err: any) {
    console.error('[macro.ipc] AppVolume volume failed:', err.message?.slice(0, 100));
  }

  // Fallback for master only: VK_VOLUME_UP/DOWN
  if (settings.target === 'master') {
    const steps = Math.max(1, Math.round(settings.delta / 2));
    const vk = settings.mode === 'increase' ? 0xAF : 0xAE;
    for (let i = 0; i < steps; i++) {
      await sendVirtualKey(vk);
      await new Promise(r => setTimeout(r, 20));
    }
  }
}

// ─── KeyboardEvent.code → VK code mapping ────────────────────────────────────

const CODE_TO_VK: Record<string, number> = {
  'Backspace':0x08,'Tab':0x09,'Enter':0x0D,'ShiftLeft':0x10,'ShiftRight':0x10,
  'ControlLeft':0x11,'ControlRight':0x11,'AltLeft':0x12,'AltRight':0x12,
  'Pause':0x13,'CapsLock':0x14,'Escape':0x1B,'Space':0x20,
  'PageUp':0x21,'PageDown':0x22,'End':0x23,'Home':0x24,
  'ArrowLeft':0x25,'ArrowUp':0x26,'ArrowRight':0x27,'ArrowDown':0x28,
  'Insert':0x2D,'Delete':0x2E,
  'Digit0':0x30,'Digit1':0x31,'Digit2':0x32,'Digit3':0x33,'Digit4':0x34,
  'Digit5':0x35,'Digit6':0x36,'Digit7':0x37,'Digit8':0x38,'Digit9':0x39,
  'KeyA':0x41,'KeyB':0x42,'KeyC':0x43,'KeyD':0x44,'KeyE':0x45,'KeyF':0x46,
  'KeyG':0x47,'KeyH':0x48,'KeyI':0x49,'KeyJ':0x4A,'KeyK':0x4B,'KeyL':0x4C,
  'KeyM':0x4D,'KeyN':0x4E,'KeyO':0x4F,'KeyP':0x50,'KeyQ':0x51,'KeyR':0x52,
  'KeyS':0x53,'KeyT':0x54,'KeyU':0x55,'KeyV':0x56,'KeyW':0x57,'KeyX':0x58,
  'KeyY':0x59,'KeyZ':0x5A,
  'MetaLeft':0x5B,'MetaRight':0x5C,'ContextMenu':0x5D,
  'Numpad0':0x60,'Numpad1':0x61,'Numpad2':0x62,'Numpad3':0x63,'Numpad4':0x64,
  'Numpad5':0x65,'Numpad6':0x66,'Numpad7':0x67,'Numpad8':0x68,'Numpad9':0x69,
  'NumpadMultiply':0x6A,'NumpadAdd':0x6B,'NumpadSubtract':0x6D,
  'NumpadDecimal':0x6E,'NumpadDivide':0x6F,
  'F1':0x70,'F2':0x71,'F3':0x72,'F4':0x73,'F5':0x74,'F6':0x75,
  'F7':0x76,'F8':0x77,'F9':0x78,'F10':0x79,'F11':0x7A,'F12':0x7B,
  'F13':0x7C,'F14':0x7D,'F15':0x7E,'F16':0x7F,'F17':0x80,'F18':0x81,
  'F19':0x82,'F20':0x83,'F21':0x84,'F22':0x85,'F23':0x86,'F24':0x87,
  'NumLock':0x90,'ScrollLock':0x91,
  'Semicolon':0xBA,'Equal':0xBB,'Comma':0xBC,'Minus':0xBD,'Period':0xBE,
  'Slash':0xBF,'Backquote':0xC0,'BracketLeft':0xDB,'Backslash':0xDC,
  'BracketRight':0xDD,'Quote':0xDE,
};

// ─── C# HotkeySender — sends key combos via keybd_event ──────────────────────
// More reliable than PowerShell SendKeys for global hotkeys (Soundpad etc.)

const HOTKEY_SENDER_CS = `using System;
using System.Runtime.InteropServices;
using System.Threading;
class HotkeySender {
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    const uint KEYEVENTF_KEYUP = 2;
    static void Main(string[] args) {
        if (args.Length == 0) return;
        byte[] vks = new byte[args.Length];
        for (int i = 0; i < args.Length; i++) vks[i] = byte.Parse(args[i]);
        // Press all keys down
        foreach (byte vk in vks) { keybd_event(vk, 0, 0, UIntPtr.Zero); Thread.Sleep(10); }
        Thread.Sleep(30);
        // Release all keys in reverse
        for (int i = vks.Length - 1; i >= 0; i--) { keybd_event(vks[i], 0, KEYEVENTF_KEYUP, UIntPtr.Zero); Thread.Sleep(10); }
    }
}`;

let hotkeySenderExe: string | null = null;

function getHotkeySenderExe(): string | null {
  if (hotkeySenderExe && fs.existsSync(hotkeySenderExe)) return hotkeySenderExe;
  try {
    ensureTmpDir();
    const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (!fs.existsSync(csc)) return null;
    const srcPath = path.join(tmpDir, 'HotkeySender.cs');
    const exePath = path.join(tmpDir, 'HotkeySender.exe');
    fs.writeFileSync(srcPath, HOTKEY_SENDER_CS, 'utf8');
    const { execFileSync } = require('child_process');
    execFileSync(csc, ['/nologo', `/out:${exePath}`, '/r:System.dll', srcPath],
      { timeout: 15000, stdio: 'pipe' });
    hotkeySenderExe = exePath;
    return exePath;
  } catch {
    return null;
  }
}

async function executeHotkey(settings: HotkeySettings): Promise<void> {
  if (!settings.keys || settings.keys.length === 0) throw new Error('No keys specified');

  // Map codes to VK numbers
  const vkCodes = settings.keys
    .map(code => CODE_TO_VK[code])
    .filter((vk): vk is number => vk !== undefined);

  if (vkCodes.length === 0) throw new Error('No valid VK codes for: ' + settings.keys.join(', '));

  // Try HotkeySender.exe first (most reliable for global hotkeys like Soundpad)
  const exe = getHotkeySenderExe();
  if (exe) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync(exe, vkCodes.map(String), { timeout: 3000 });
      return;
    } catch (err: any) {
      console.error('[macro.ipc] HotkeySender failed:', err.message?.slice(0, 80));
    }
  }

  // Fallback: sendVirtualKey one by one (for single keys)
  if (vkCodes.length === 1) {
    await sendVirtualKey(vkCodes[0]);
    return;
  }

  // Fallback: PowerShell for combos
  ensureTmpDir();
  const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KS2 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint fl, UIntPtr ex);
}
"@
${vkCodes.map(vk => `[KS2]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero)`).join('\n')}
Start-Sleep -Milliseconds 30
${[...vkCodes].reverse().map(vk => `[KS2]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)`).join('\n')}
`;
  const scriptPath = path.join(tmpDir, `hotkey_${vkCodes.join('_')}.ps1`);
  fs.writeFileSync(scriptPath, ps, 'utf8');
  const { execFileSync } = require('child_process');
  execFileSync('powershell', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
  ], { timeout: 5000 });
}

// ─── Main Executor ────────────────────────────────────────────────────────────

export async function executeMacro(macro: MacroConfig): Promise<boolean> {
  const icon = macro.iconEmoji;
  const name = macro.displayName;

  try {
    switch (macro.type) {
      case 'APP_LAUNCH': {
        const s = macro.settings as AppLaunchSettings;
        const id = genId();
        sendNotification({ id, type: 'loading', title: `Opening ${s.appName || name}...`, icon: icon ?? '🚀', duration: 0 });
        try {
          await executeAppLaunch(s);
          updateNotification(id, { type: 'success', title: `${s.appName || name} opened`, duration: 2500 });
        } catch (err: any) {
          updateNotification(id, { type: 'error', title: 'Failed to open app', message: err.message?.slice(0,60), duration: 3000 });
          return false;
        }
        break;
      }

      case 'WEB_LINK': {
        const s = macro.settings as WebLinkSettings;
        const id = genId();
        sendNotification({ id, type: 'loading', title: `Opening link...`, message: s.url, icon: icon ?? '🌐', duration: 0 });
        try {
          await executeWebLink(s);
          updateNotification(id, { type: 'success', title: 'Link opened', message: s.url, duration: 2500 });
        } catch (err: any) {
          updateNotification(id, { type: 'error', title: 'Failed to open link', duration: 3000 });
          return false;
        }
        break;
      }

      case 'MULTIMEDIA': {
        const s = macro.settings as MultimediaSettings;
        const labels: Record<string, string> = {
          PLAY_PAUSE: '⏯️ Play / Pause', PLAY: '▶️ Playing', PAUSE: '⏸️ Paused',
          NEXT: '⏭️ Next track', PREV: '⏮️ Previous track',
        };
        await executeMultimedia(s);
        sendNotification({ id: genId(), type: 'info', title: labels[s.action] ?? name, message: s.targetAppName !== 'System' ? s.targetAppName : undefined, icon, duration: 2000 });
        break;
      }

      case 'MUTE_TOGGLE': {
        const s = macro.settings as MuteSettings;
        await executeMuteToggle(s);
        sendNotification({ id: genId(), type: 'info', title: `🔇 Mute toggled`, message: s.targetName, icon, duration: 2000 });
        break;
      }

      case 'VOLUME_ADJUST': {
        const s = macro.settings as VolumeSettings;
        const modeIcon = s.mode === 'increase' ? '🔊' : s.mode === 'decrease' ? '🔉' : '🔊';
        const modeLabel = s.mode === 'increase' ? `+${s.delta}%` : s.mode === 'decrease' ? `-${s.delta}%` : `${s.setValue ?? 0}%`;
        await executeVolumeAdjust(s);
        sendNotification({ id: genId(), type: 'info', title: `${modeIcon} Volume ${modeLabel}`, message: s.targetName, icon, duration: 2000 });
        break;
      }

      case 'HOTKEY': {
        const s = macro.settings as HotkeySettings;
        const combo = s.keys.map(k => k.replace('Key','').replace('Digit','').replace('Left','').replace('Right','')).join('+');
        await executeHotkey(s);
        sendNotification({ id: genId(), type: 'success', title: name || combo, message: combo !== name ? combo : undefined, icon: icon ?? '⌨️', duration: 1800 });
        break;
      }

      case 'PROFILE_SWITCH':
        await executeProfileSwitch(macro.settings as ProfileSwitchSettings);
        // Profile switch notification is sent after renderer updates
        break;

      default:
        throw new Error(`Unknown macro type: ${(macro as any).type}`);
    }

    console.log(`[macro.ipc] Executed: ${macro.type} - ${name}`);
    return true;
  } catch (err: any) {
    console.error(`[macro.ipc] Execution failed for ${macro.type}:`, err.message);
    sendNotification({ id: genId(), type: 'error', title: `${name} failed`, message: err.message?.slice(0,60), duration: 3000 });
    return false;
  }
}

// ─── IPC Registration ─────────────────────────────────────────────────────────

let mainWindowRef: import('electron').BrowserWindow | null = null;

async function executeProfileSwitch(settings: ProfileSwitchSettings): Promise<void> {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  // Send event to renderer — renderer handles the actual profile switch
  mainWindowRef.webContents.send('profile:switch', {
    mode: settings.mode,
    targetProfileId: settings.targetProfileId,
  });
}

export function registerMacroIpc(_store: Store<StoreSchema>, mainWindow: import('electron').BrowserWindow | null): void {
  mainWindowRef = mainWindow;

  ipcMain.handle('macro:execute', async (_event, macro: MacroConfig): Promise<boolean> => {
    return executeMacro(macro);
  });
}
