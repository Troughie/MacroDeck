import { ipcMain, BrowserWindow } from 'electron';
import { ChildProcessWithoutNullStreams, execFile } from 'child_process';
import { promisify } from 'util';
import { KeyboardDevice, KeyEvent } from '../../src/types/macro.types';
import { RawInputHostMessage, startRawInputHost } from '../native/rawinput';

const execFileAsync = promisify(execFile);

let selectedDeviceKey = '';
let mainWindowRef: BrowserWindow | null = null;
let rawInputHost: ChildProcessWithoutNullStreams | null = null;
let rawInputStarting = false;
let hookInstalled = false;
let rawDevices: KeyboardDevice[] = [];
let devices: KeyboardDevice[] = [];

const assignedKeyCodes = new Set<string>();
const pendingDeviceResolvers = new Set<() => void>();

interface PnpDeviceInfo {
  name: string;
  instanceId: string;
  hardwareIds: string[];
  className: string;
}

let pnpCache: { loadedAt: number; devices: PnpDeviceInfo[] } | null = null;
const registryNameCache = new Map<string, string | null>();

function resolveDeviceWaiters(): void {
  pendingDeviceResolvers.forEach(resolve => resolve());
  pendingDeviceResolvers.clear();
}

function normalizeDevices(rawDevices: any[] = []): KeyboardDevice[] {
  return rawDevices.map((device: any) => ({
    id: String(device.id ?? ''),
    name: String(device.name ?? 'Input Device'),
    deviceType: (device.deviceType === 'mouse' ? 'mouse' : 'keyboard') as 'keyboard' | 'mouse',
    vendorId: Number(device.vendorId ?? 0),
    productId: Number(device.productId ?? 0),
    interfaceNumber: Number(device.interfaceNumber ?? -1),
    hwid: String(device.hwid ?? ''),
    rawDeviceHandle: device.rawDeviceHandle ? String(device.rawDeviceHandle) : undefined,
    isKeyboard: device.deviceType === 'mouse' ? false : device.isKeyboard !== false,
    isConnected: device.isConnected !== false,
    isSelected: String(device.id ?? '') === selectedDeviceKey,
  })).filter(device => device.id.length > 0);
}

function normalizeInstanceId(value: string): string {
  return value.replace(/^\\\\\?\\/, '').replace(/#\{[^}]+\}$/i, '').replace(/#/g, '\\').toUpperCase();
}

function isGenericDeviceName(name: string): boolean {
  return /^(hid keyboard device|hid-compliant mouse|usb input device|keyboard device|usb composite device)$/i.test(name.trim());
}

function formatVidPid(device: KeyboardDevice): string {
  const vid = device.vendorId.toString(16).padStart(4, '0').toUpperCase();
  const pid = device.productId.toString(16).padStart(4, '0').toUpperCase();
  return `${vid}:${pid}`;
}

function stripInterfaceSuffix(name: string): string {
  return name.replace(/\s+\[Interface\s+\d+\]$/i, '').trim();
}

function physicalGroupKey(device: KeyboardDevice): string {
  if (device.vendorId > 0 && device.productId > 0) {
    return `${device.vendorId.toString(16).padStart(4, '0').toUpperCase()}:${
      device.productId.toString(16).padStart(4, '0').toUpperCase()
    }`;
  }

  const normalized = (device.hwid ?? '')
    .replace(/^\\\\\?\\/, '')
    .replace(/#\{[^}]+\}$/i, '');
  const parts = normalized.split('#');
  if (parts.length >= 2) return `${parts[0]}#${parts[1]}`.toUpperCase();
  return device.id;
}

function endpointScore(device: KeyboardDevice): number {
  let score = device.deviceType === 'keyboard' ? 1000 : 100;
  const iface = device.interfaceNumber ?? -1;
  if (iface === 0) score += 100;
  else if (iface < 0) score += 80;
  else score -= iface;

  const hwid = (device.hwid ?? '').toUpperCase();
  if (hwid.includes('&COL01')) score += 20;
  if (/&COL0[3-9]/.test(hwid)) score -= 30;
  return score;
}

function groupInputDevices(inputDevices: KeyboardDevice[]): KeyboardDevice[] {
  const groups = new Map<string, KeyboardDevice[]>();
  for (const device of inputDevices) {
    const key = physicalGroupKey(device);
    const group = groups.get(key) ?? [];
    group.push(device);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map(group => {
    const keyboardEndpoints = group
      .filter(device => device.deviceType === 'keyboard' && device.isKeyboard !== false)
      .sort((a, b) => endpointScore(b) - endpointScore(a));
    const mouseEndpoints = group
      .filter(device => device.deviceType === 'mouse')
      .sort((a, b) => endpointScore(b) - endpointScore(a));
    const selectedEndpoint = keyboardEndpoints[0] ?? mouseEndpoints[0] ?? group[0];
    const hasKeyboard = keyboardEndpoints.length > 0;
    const hasMouse = mouseEndpoints.length > 0;
    const tags = [
      ...(hasKeyboard ? ['keyboard' as const] : []),
      ...(hasMouse ? ['mouse' as const] : []),
    ];

    return {
      ...selectedEndpoint,
      name: stripInterfaceSuffix(selectedEndpoint.name),
      deviceType: hasKeyboard ? 'keyboard' : 'mouse',
      inputTags: tags,
      isKeyboard: hasKeyboard,
      interfaceNumber: undefined,
      isSelected: selectedEndpoint.id === selectedDeviceKey,
    } as KeyboardDevice;
  }).sort((a, b) => {
    const aKeyboard = a.isKeyboard !== false ? 0 : 1;
    const bKeyboard = b.isKeyboard !== false ? 0 : 1;
    if (aKeyboard !== bKeyboard) return aKeyboard - bKeyboard;
    return a.name.localeCompare(b.name);
  });
}

async function loadPnpDevices(force = false): Promise<PnpDeviceInfo[]> {
  const now = Date.now();
  if (!force && pnpCache && now - pnpCache.loadedAt < 10000) return pnpCache.devices;

  const script = `
$result = @()
$classes = @('HIDClass', 'Keyboard', 'Mouse')
foreach ($class in $classes) {
  $items = Get-PnpDevice -Class $class -ErrorAction SilentlyContinue
  foreach ($d in $items) {
    $busName = (Get-PnpDeviceProperty -InputObject $d -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc' -ErrorAction SilentlyContinue).Data
    $friendlyName = $d.FriendlyName
    $hardwareIds = (Get-PnpDeviceProperty -InputObject $d -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue).Data
    $result += [PSCustomObject]@{
      Name = if ($busName) { $busName } elseif ($friendlyName) { $friendlyName } else { $d.Name }
      InstanceId = $d.InstanceId
      HardwareIds = @($hardwareIds)
      ClassName = $class
    }
  }
}
$result | ConvertTo-Json -Compress -Depth 4
`.trim();

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], { timeout: 12000, windowsHide: true, maxBuffer: 1024 * 1024 });

    const text = stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const mapped = rows.map((row: any) => ({
      name: String(row.Name ?? ''),
      instanceId: String(row.InstanceId ?? '').toUpperCase(),
      hardwareIds: (Array.isArray(row.HardwareIds) ? row.HardwareIds : [row.HardwareIds])
        .filter(Boolean)
        .map((id: any) => String(id).toUpperCase()),
      className: String(row.ClassName ?? ''),
    })).filter((row: PnpDeviceInfo) => row.instanceId.length > 0);
    pnpCache = { loadedAt: now, devices: mapped };
    return mapped;
  } catch (err: any) {
    console.warn('[keyboard.ipc] PnP device name lookup failed:', err.message?.slice(0, 100));
    return pnpCache?.devices ?? [];
  }
}

function findPnpMatch(device: KeyboardDevice, pnpDevices: PnpDeviceInfo[]): PnpDeviceInfo | undefined {
  const instanceId = normalizeInstanceId(device.hwid ?? '');
  if (instanceId) {
    const exact = pnpDevices.find(pnp => pnp.instanceId === instanceId);
    if (exact) return exact;
  }

  const vid = device.vendorId > 0 ? `VID_${device.vendorId.toString(16).padStart(4, '0').toUpperCase()}` : '';
  const pid = device.productId > 0 ? `PID_${device.productId.toString(16).padStart(4, '0').toUpperCase()}` : '';
  const mi = (device.interfaceNumber ?? -1) >= 0
    ? `MI_${(device.interfaceNumber ?? -1).toString(16).padStart(2, '0').toUpperCase()}`
    : '';

  if (!vid || !pid) return undefined;

  const matchesIdentity = (value: string) =>
    value.includes(vid) && value.includes(pid) && (!mi || value.includes(mi));

  return pnpDevices.find(pnp =>
    matchesIdentity(pnp.instanceId) || pnp.hardwareIds.some(matchesIdentity)
  );
}

function cleanWindowsDeviceName(value: string): string {
  const trimmed = value.trim();
  const semicolon = trimmed.lastIndexOf(';');
  return semicolon >= 0 ? trimmed.slice(semicolon + 1).trim() : trimmed;
}

function enumRegistryKeyFromRawHwid(hwid: string): string | null {
  const normalized = hwid
    .replace(/^\\\\\?\\/, '')
    .replace(/#\{[^}]+\}$/i, '');
  const parts = normalized.split('#');
  if (parts.length < 3) return null;
  return `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${parts[0]}\\${parts[1]}\\${parts[2]}`;
}

async function lookupRegistryDeviceName(hwid: string): Promise<string | null> {
  const key = enumRegistryKeyFromRawHwid(hwid);
  if (!key) return null;
  if (registryNameCache.has(key)) return registryNameCache.get(key) ?? null;

  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key], {
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 128 * 1024,
    });
    const lines = stdout.split(/\r?\n/);
    const values: Record<string, string> = {};
    for (const line of lines) {
      const match = line.match(/^\s+(\S+)\s+REG_\S+\s+(.+)$/);
      if (match) values[match[1]] = cleanWindowsDeviceName(match[2]);
    }

    const name = values.FriendlyName || values.DeviceDesc || values.Mfg || null;
    const usableName = name && !isGenericDeviceName(name) ? name : null;
    registryNameCache.set(key, usableName);
    return usableName;
  } catch {
    registryNameCache.set(key, null);
    return null;
  }
}

async function enrichDeviceNames(inputDevices: KeyboardDevice[]): Promise<KeyboardDevice[]> {
  const pnpDevices = await loadPnpDevices();
  return Promise.all(inputDevices.map(async device => {
    const match = findPnpMatch(device, pnpDevices);
    const registryName = await lookupRegistryDeviceName(device.hwid ?? '');
    const typeLabel = device.deviceType === 'mouse' ? 'Mouse' : 'Keyboard';
    const matchedName = match?.name?.trim();
    let baseName = `${typeLabel} ${formatVidPid(device)}`;
    if (matchedName && !isGenericDeviceName(matchedName)) {
      baseName = matchedName;
    } else if (registryName) {
      baseName = registryName;
    }
    const name = (device.interfaceNumber ?? -1) > 0
      ? `${baseName} [Interface ${device.interfaceNumber}]`
      : baseName;

    return {
      ...device,
      name,
    };
  }));
}

function sendHostCommand(command: Record<string, unknown>): void {
  if (!rawInputHost || rawInputHost.killed || !rawInputHost.stdin.writable) return;
  rawInputHost.stdin.write(`${JSON.stringify(command)}\n`);
}

function handleHostMessage(message: RawInputHostMessage): void {
  if (message.type === 'ready' || message.type === 'device-list') {
    rawDevices = normalizeDevices(message.devices ?? []);
    hookInstalled = message.hookInstalled ?? hookInstalled;
    if (selectedDeviceKey && !rawDevices.some(device => device.id === selectedDeviceKey)) {
      selectedDeviceKey = '';
      sendHostCommand({ cmd: 'select', deviceId: '' });
    }
    rawDevices = rawDevices.map(device => ({
      ...device,
      isSelected: device.id === selectedDeviceKey,
    }));
    devices = groupInputDevices(rawDevices);
    resolveDeviceWaiters();
    return;
  }

  if (message.type === 'hook') {
    hookInstalled = message.installed ?? hookInstalled;
    console.log('[keyboard.ipc] Low-level keyboard hook installed:', hookInstalled);
    return;
  }

  if (message.type === 'error') {
    console.error('[keyboard.ipc] Raw Input host error:', message.message);
    return;
  }

  if (message.type !== 'key') return;
  if (!message.code || !message.state || !message.deviceId) return;
  if (message.deviceId !== selectedDeviceKey) return;
  if (!assignedKeyCodes.has(message.code)) return;
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;

  mainWindowRef.webContents.send('keyboard:event', {
    code: message.code,
    keycode: message.keycode ?? 0,
    scanCode: message.scanCode,
    extended: message.extended,
    state: message.state,
    deviceId: message.deviceId,
    isMacroDevice: true,
  } as KeyEvent);
}

function ensureRawInputStarted(): void {
  if (rawInputHost || rawInputStarting) return;
  rawInputStarting = true;

  try {
    rawInputHost = startRawInputHost(handleHostMessage, (code) => {
      console.error('[keyboard.ipc] Raw Input host exited:', code);
      rawInputHost = null;
      rawInputStarting = false;
      hookInstalled = false;
      resolveDeviceWaiters();
    });
    rawInputStarting = false;
    console.log('[keyboard.ipc] Raw Input host started');
  } catch (err: any) {
    rawInputStarting = false;
    console.error('[keyboard.ipc] Raw Input host unavailable:', err.message);
    resolveDeviceWaiters();
  }
}

function waitForDevices(timeoutMs = 1500): Promise<void> {
  if (rawDevices.length > 0) return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      pendingDeviceResolvers.delete(done);
      resolve();
    }, timeoutMs);

    const done = () => {
      clearTimeout(timeout);
      resolve();
    };

    pendingDeviceResolvers.add(done);
  });
}

async function listKeyboards(): Promise<KeyboardDevice[]> {
  ensureRawInputStarted();
  sendHostCommand({ cmd: 'list' });
  await waitForDevices();
  const enrichedDevices = await enrichDeviceNames(rawDevices);
  rawDevices = enrichedDevices.map(device => ({
    ...device,
    isSelected: device.id === selectedDeviceKey,
  }));
  devices = groupInputDevices(rawDevices);
  return devices;
}

export function registerKeyboardIpc(mainWindow: BrowserWindow | null): void {
  mainWindowRef = mainWindow;

  ipcMain.handle('keyboard:list', async () => listKeyboards());

  ipcMain.handle('keyboard:select', async (_e, deviceId: string) => {
    ensureRawInputStarted();
    selectedDeviceKey = deviceId;
    rawDevices = rawDevices.map(device => ({
      ...device,
      isSelected: device.id === selectedDeviceKey,
    }));
    devices = devices.map(device => ({
      ...device,
      isSelected: device.id === selectedDeviceKey,
    }));
    sendHostCommand({ cmd: 'select', deviceId });
    sendHostCommand({ cmd: 'setBlock', enabled: true });
    console.log('[keyboard.ipc] Selected Raw Input device:', deviceId);
    return true;
  });

  ipcMain.handle('keyboard:updateMacroKeys', (_e, keyCodes: string[]) => {
    assignedKeyCodes.clear();
    keyCodes.forEach(k => assignedKeyCodes.add(k));
    console.log('[keyboard.ipc] Macro keys updated:', keyCodes.length, 'keys');
    return true;
  });

  ensureRawInputStarted();
}

export { selectedDeviceKey as selectedDeviceHandle };
