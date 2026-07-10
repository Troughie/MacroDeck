import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface PnpDeviceInfo {
  name: string;
  instanceId: string;
  hardwareIds: string[];
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

  for (const pnp of pnpDevices) {
    const identityHit = matches(pnp.instanceId) || pnp.hardwareIds.some(matches);
    if (!identityHit) continue;
    const name = pnp.name?.trim();
    if (name && !isGenericDeviceName(name)) return name;
  }
  return null;
}

export async function loadPnpDevices(force = false): Promise<PnpDeviceInfo[]> {
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
    }
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
    })).filter((row: PnpDeviceInfo) => row.instanceId.length > 0);
    pnpCache = { loadedAt: now, devices: mapped };
    return mapped;
  } catch (err: any) {
    console.warn('[device-names] PnP lookup failed:', err.message?.slice(0, 100));
    return pnpCache?.devices ?? [];
  }
}
