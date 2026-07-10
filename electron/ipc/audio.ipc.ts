import { ipcMain } from 'electron';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import { execFileSync } from 'child_process';
import { AudioSession } from '../../src/types/macro.types';
import { runAppVolume, ensureAppVolumeExe } from '../native/appvolume';

const execAsync = promisify(exec);

// ─── Get audio sessions via AppVolume.exe ────────────────────────────────────

// ─── PowerShell fallback for audio ───────────────────────────────────────────

const GET_AUDIO_SESSIONS_PS = `
$sessions = @()
try {
  $sessions += [PSCustomObject]@{
    ProcessName = 'master'
    ProcessId = 0
    DisplayName = 'Master Volume'
    Volume = 50
    IsMuted = $false
  }
  $audioProcesses = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 20
  foreach ($proc in $audioProcesses) {
    $sessions += [PSCustomObject]@{
      ProcessName = $proc.ProcessName
      ProcessId = $proc.Id
      DisplayName = if ($proc.MainWindowTitle) { $proc.MainWindowTitle } else { $proc.ProcessName }
      Volume = 75
      IsMuted = $false
    }
  }
} catch {}
$sessions | ConvertTo-Json -Compress
`;

const SET_VOLUME_PS = (target: string, volume: number) => `
Add-Type -AssemblyName System.Runtime.InteropServices
# Set volume for ${target} to ${volume}%
$vol = ${volume} / 100.0
if ('${target}' -eq 'master') {
  $wshShell = New-Object -ComObject WScript.Shell
  # Use nircmd or PowerShell audio API
  $code = @"
  using System.Runtime.InteropServices;
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    int j();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
    int GetMute(out bool pbMute);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorClass {}
"@
  Add-Type -TypeDefinition $code
}
Write-Output "OK"
`;

// ─── AudioSessions.exe wrapper (legacy, kept for compatibility) ───────────────

async function runAudioExe(_args: string[]): Promise<string> {
  throw new Error('AudioSessions.exe not used — using AppVolume.exe');
}

// ─── Get audio sessions ───────────────────────────────────────────────────────

const iconCache = new Map<string, string>();

async function getExePathsByPids(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) return result;

  try {
    const pidList = pids.join(',');
    const out = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-Process -Id ${pidList} -ErrorAction SilentlyContinue | Select-Object Id,Path | ConvertTo-Json -Compress`
    ], { timeout: 3000 }).toString().trim();

    if (!out) return result;

    const raw = JSON.parse(out);
    const items = Array.isArray(raw) ? raw : [raw];
    items.forEach((item: any) => {
      if (item.Id && item.Path) result.set(item.Id, item.Path);
    });
  } catch { }

  return result;
}

async function enrichWithIcons(sessions: AudioSession[]): Promise<AudioSession[]> {
  // Lấy tất cả PID cần query (bỏ master)
  const pids = sessions
    .filter(s => s.processId > 0)
    .map(s => s.processId);

  // Batch query 1 lần
  const exeMap = await getExePathsByPids(pids);

  return Promise.all(sessions.map(async (session) => {
    if (session.processId === 0) return session;

    const exePath = exeMap.get(session.processId);
    if (!exePath) return session;

    if (iconCache.has(exePath)) {
      return { ...session, iconPath: exePath, iconDataUrl: iconCache.get(exePath) };
    }

    try {
      const icon = await app.getFileIcon(exePath, { size: 'normal' });
      const iconDataUrl = icon.toDataURL();
      iconCache.set(exePath, iconDataUrl);
      return { ...session, iconPath: exePath, iconDataUrl };
    } catch {
      return session;
    }
  }));
}
async function getAudioSessions(): Promise<AudioSession[]> {
  try {
    const out = runAppVolume(['list']);
    const raw = JSON.parse(out);
    const items = Array.isArray(raw) ? raw : [raw];
    return items.map((item: any) => ({
      processName: item.processName || 'unknown',
      processId: item.processId || 0,
      displayName: item.displayName || item.processName || 'Unknown',
      volume: Math.round(item.volume || 0),
      isMuted: item.isMuted || false,
      iconPath: item.iconPath || undefined,
    }));
  } catch (err: any) {
    console.error('[audio.ipc] getAudioSessions failed:', err.message?.slice(0, 100));
    return getDefaultSessions();
  }
}

function getDefaultSessions(): AudioSession[] {
  return [
    {
      processName: 'master',
      processId: 0,
      displayName: 'Master Volume',
      volume: 50,
      isMuted: false,
    },
  ];
}

// ─── Volume result type ───────────────────────────────────────────────────────

interface VolumeResult {
  ok: boolean;
  previousValue: number;
  currentValue: number;
}

interface MuteResult {
  ok: boolean;
  isMuted: boolean;
  volume: number;
}

// ─── Set volume ───────────────────────────────────────────────────────────────

async function setVolume(target: string, volume: number): Promise<VolumeResult | null> {
  try {
    const out = runAppVolume(['set-volume', target, String(Math.max(0, Math.min(100, volume)))]);
    return JSON.parse(out) as VolumeResult;
  } catch (err: any) {
    console.error('[audio.ipc] setVolume failed:', err.message?.slice(0, 80));
    return null;
  }
}

async function adjustVolume(target: string, delta: number, mode: 'increase' | 'decrease'): Promise<VolumeResult | null> {
  try {
    const cmd = mode === 'increase' ? 'volume-up' : 'volume-down';
    const out = runAppVolume([cmd, target, String(delta)]);
    return JSON.parse(out) as VolumeResult;
  } catch (err: any) {
    console.error('[audio.ipc] adjustVolume failed:', err.message?.slice(0, 80));
    return null;
  }
}

// ─── Toggle mute ──────────────────────────────────────────────────────────────

async function toggleMute(target: string): Promise<MuteResult | null> {
  try {
    const out = runAppVolume(['toggle-mute', target]);
    return JSON.parse(out) as MuteResult;
  } catch (err: any) {
    console.error('[audio.ipc] toggleMute failed:', err.message?.slice(0, 80));
    return null;
  }
}

// ─── IPC Registration ─────────────────────────────────────────────────────────

export function registerAudioIpc(): void {
  ipcMain.handle('audio:getSessions', async (): Promise<AudioSession[]> => {
    const sessions = await getAudioSessions();
    return enrichWithIcons(sessions);
  });

  ipcMain.handle('audio:setVolume', async (_event, target: string, volume: number) => {
    return setVolume(target, volume);
  });

  ipcMain.handle('audio:adjustVolume', async (_event, target: string, delta: number, mode: 'increase' | 'decrease') => {
    return adjustVolume(target, delta, mode);
  });

  ipcMain.handle('audio:toggleMute', async (_event, target: string) => {
    return toggleMute(target);
  });
}