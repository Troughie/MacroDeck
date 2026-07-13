import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface PnpDeviceInfo {
  name: string;
  instanceId: string;
  hardwareIds: string[];
  // True for the USB composite/root node (InstanceId `USB\VID_..&PID_..` with no
  // `&MI_`). Its BusReportedDeviceDesc is the device's iProduct string — the same
  // product name Windows shows in Settings > Devices (e.g. "Keychron K6"), and it
  // comes from the hardware descriptor so it survives a WinUSB driver swap.
  isUsbRoot: boolean;
}

let pnpCache: { loadedAt: number; devices: PnpDeviceInfo[] } | null = null;

export function isGenericDeviceName(name: string): boolean {
  return /^(hid keyboard device|hid-compliant mouse|usb input device|keyboard device|usb composite device)$/i
    .test(name.trim());
}

function vidPidTokens(vendorId: number, productId: number): { vid: string; pid: string } {
  return {
    vid: `VID_${vendorId.toString(16).padStart(4, '0').toUpperCase()}`,
    pid: `PID_${productId.toString(16).padStart(4, '0').toUpperCase()}`,
  };
}

export function findPnpNameByVidPid(
  vendorId: number,
  productId: number,
  pnpDevices: PnpDeviceInfo[],
): string | null {
  const { vid, pid } = vidPidTokens(vendorId, productId);
  const matches = (value: string) => value.includes(vid) && value.includes(pid);
  const identityHit = (pnp: PnpDeviceInfo) =>
    matches(pnp.instanceId) || pnp.hardwareIds.some(matches);

  // 1. Prefer the USB root node's product name (matches Settings > Devices, and
  //    is the real iProduct string even if it isn't in our "generic" list).
  for (const pnp of pnpDevices) {
    if (!pnp.isUsbRoot || !identityHit(pnp)) continue;
    const name = pnp.name?.trim();
    if (name && !isGenericDeviceName(name)) return name;
  }

  // 2. Fall back to any non-generic name from the child HID nodes.
  for (const pnp of pnpDevices) {
    if (!identityHit(pnp)) continue;
    const name = pnp.name?.trim();
    if (name && !isGenericDeviceName(name)) return name;
  }
  return null;
}

export async function loadPnpDevices(force = false): Promise<PnpDeviceInfo[]> {
  const now = Date.now();
  if (!force && pnpCache && now - pnpCache.loadedAt < 10000) return pnpCache.devices;

  // Two sources of nodes:
  //  - HID/Keyboard/Mouse class children: give us the functional interfaces.
  //  - USB root nodes (InstanceId 'USB\VID_..&PID_..' without '&MI_'): carry the
  //    iProduct product name in BusReportedDeviceDesc — what Settings shows.
  // For each we prefer BusReportedDeviceDesc, then FriendlyName, then Name.
  const script = `
$result = @()
$nodes = @()
foreach ($class in @('HIDClass','Keyboard','Mouse')) {
  $nodes += Get-PnpDevice -Class $class -PresentOnly -ErrorAction SilentlyContinue
}
$nodes += Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -like 'USB\\VID_*' -and $_.InstanceId -notlike '*MI_*' }
foreach ($d in $nodes) {
  $busName = (Get-PnpDeviceProperty -InputObject $d -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc' -ErrorAction SilentlyContinue).Data
  $friendlyName = $d.FriendlyName
  $hardwareIds = (Get-PnpDeviceProperty -InputObject $d -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue).Data
  $isUsbRoot = ($d.InstanceId -like 'USB\\VID_*') -and ($d.InstanceId -notlike '*MI_*')
  $result += [PSCustomObject]@{
    Name = if ($busName) { $busName } elseif ($friendlyName) { $friendlyName } else { $d.Name }
    InstanceId = $d.InstanceId
    HardwareIds = @($hardwareIds)
    IsUsbRoot = $isUsbRoot
  }
}
$result | ConvertTo-Json -Compress -Depth 4
`.trim();

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], { timeout: 12000, windowsHide: true, maxBuffer: 1024 * 1024 });

    const text = stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const mapped: PnpDeviceInfo[] = rows.map((row: any) => ({
      name: String(row.Name ?? ''),
      instanceId: String(row.InstanceId ?? '').toUpperCase(),
      hardwareIds: (Array.isArray(row.HardwareIds) ? row.HardwareIds : [row.HardwareIds])
        .filter(Boolean)
        .map((id: any) => String(id).toUpperCase()),
      isUsbRoot: Boolean(row.IsUsbRoot),
    })).filter((row: PnpDeviceInfo) => row.instanceId.length > 0);
    pnpCache = { loadedAt: now, devices: mapped };
    return mapped;
  } catch (err: any) {
    console.warn('[device-names] PnP lookup failed:', err.message?.slice(0, 100));
    return pnpCache?.devices ?? [];
  }
}
