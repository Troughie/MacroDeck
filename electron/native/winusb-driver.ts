import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);

// libwdi's helper (the same engine Zadig uses) is bundled as a prebuilt x64 exe.
// It installs the WinUSB driver for a device by VID/PID, relying on libwdi's
// self-signed cert + Trusted Publisher flow — no purchased certificate needed.
// Build it from https://github.com/pbatard/libwdi (examples/wdi-simple.c, x64)
// and drop the result in resources/. Either filename is accepted.
const WDI_SIMPLE_NAMES = ['wdi-simple-x64.exe', 'wdi-simple.exe'];

// Directories to look in, most-specific first. In production the file is unpacked
// under <resources>/resources/ via electron-builder extraResources; in dev it
// lives in the repo's resources/.
function candidateDirs(): string[] {
  const dirs: string[] = [];
  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, 'resources'));
  }
  // Dev / running from source. __dirname is dist/electron/electron/native, so
  // walk up to the repo root; also try the process cwd (npm run dev root).
  dirs.push(path.join(__dirname, '..', '..', '..', '..', 'resources'));
  dirs.push(path.join(__dirname, '..', '..', '..', 'resources'));
  dirs.push(path.join(process.cwd(), 'resources'));
  return dirs;
}

function candidatePaths(): string[] {
  const paths: string[] = [];
  for (const dir of candidateDirs()) {
    for (const name of WDI_SIMPLE_NAMES) {
      paths.push(path.join(dir, name));
    }
  }
  return paths;
}

let loggedResolution = false;

export function findWdiSimple(): string | null {
  for (const candidate of candidatePaths()) {
    try {
      if (fs.existsSync(candidate)) {
        if (!loggedResolution) {
          console.log('[winusb-driver] Using WinUSB tool:', candidate);
          loggedResolution = true;
        }
        return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  if (!loggedResolution) {
    console.warn(
      '[winusb-driver] wdi-simple(-x64).exe NOT found. Looked in:\n  ' +
      candidatePaths().join('\n  '),
    );
    loggedResolution = true;
  }
  return null;
}

export function isDriverToolAvailable(): boolean {
  return findWdiSimple() !== null;
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}

// wdi-simple takes VID/PID as 0x-prefixed hex and a driver type (0 = WinUSB).
// --name is the device description shown in Device Manager after the swap.
// --dest sets the driver-extraction directory: pass a writable temp dir, because
// when run elevated the default is C:\Windows\System32\usb_driver (not writable).
export function buildDedicateArgs(
  vendorId: number,
  productId: number,
  name = 'MacroDeck Keyboard (WinUSB)',
  dest?: string,
): string[] {
  const args = [
    '--vid', `0x${hex4(vendorId)}`,
    '--pid', `0x${hex4(productId)}`,
    '--type', '0',
    '--name', name,
  ];
  if (dest) args.push('--dest', dest);
  return args;
}

// Extracts the "oemXX.inf" driver-store name that pnputil / DriverInfPath report.
// Returns null when no oem inf is present (device is not WinUSB-bound).
export function parseOemInf(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = /oem\d+\.inf/i.exec(text);
  return match ? match[0].toLowerCase() : null;
}

export interface ElevatedResult {
  ok: boolean;
  exitCode: number | null;
  error?: string;
  log?: string;
  rebootRequired?: boolean;
}

// Windows exit codes that mean "the operation succeeded". 3010 is
// ERROR_SUCCESS_REBOOT_REQUIRED: pnputil/libwdi finished, but Windows wants a
// reboot / device re-enumeration to fully apply it. Treating it as a failure is
// wrong — the driver change already happened.
const REBOOT_REQUIRED_EXIT = 3010;

export function isSuccessExit(code: number | null): boolean {
  return code === 0 || code === REBOOT_REQUIRED_EXIT;
}

// libwdi (WDI_ERROR_*) exit codes. wdi-simple returns the negative wdi error
// code; map the common ones to something the user can act on.
function describeWdiExit(code: number | null): string {
  switch (code) {
    case null: return 'no exit code (elevation cancelled or failed to start)';
    case 0: return 'success';
    case REBOOT_REQUIRED_EXIT: return 'success — a replug or reboot may be needed to finish (ERROR_SUCCESS_REBOOT_REQUIRED)';
    case -2: return 'invalid parameter (WDI_ERROR_INVALID_PARAM)';
    case -3: return 'access denied — run elevated / accept the UAC prompt (WDI_ERROR_ACCESS)';
    case -4: return 'device not found — is it plugged in? (WDI_ERROR_NO_DEVICE)';
    case -5: return 'driver files not found next to wdi-simple (WDI_ERROR_NOT_FOUND)';
    case -6: return 'device busy — close other apps using it (WDI_ERROR_BUSY)';
    case -7: return 'timed out (WDI_ERROR_TIMEOUT)';
    case -9: return 'a driver install is pending a reboot — restart Windows first (WDI_ERROR_PENDING_INSTALLATION)';
    case -10: return 'not supported on this system (WDI_ERROR_NOT_SUPPORTED)';
    case -13: return 'needs administrator rights (WDI_ERROR_NEEDS_ADMIN)';
    case -14: return 'wrong architecture — use the x64 wdi-simple on 64-bit Windows (WDI_ERROR_WOW64)';
    case -15: return 'INF syntax error (WDI_ERROR_INF_SYNTAX)';
    case -16: return 'catalog file missing (WDI_ERROR_CAT_MISSING)';
    case -17: return 'driver is unsigned / signing failed (WDI_ERROR_UNSIGNED)';
    case -99: return 'unspecified libwdi error (WDI_ERROR_OTHER)';
    default: return `exit code ${code}`;
  }
}

// Runs a command line ELEVATED via cmd.exe (triggers one UAC prompt), redirecting
// the child's stdout+stderr to a temp log file that we read back — Start-Process
// can't redirect output when it also elevates (-Verb RunAs), so cmd does the
// redirection instead. Returns the exit code plus the captured log.
function runElevatedCommand(commandLine: string): Promise<ElevatedResult> {
  const logPath = path.join(os.tmpdir(), `macrodeck-wdi-${process.pid}.log`);
  try { fs.rmSync(logPath, { force: true }); } catch { /* ignore */ }

  // cmd /c "<commandLine> > "log" 2>&1"  — quotes escaped for the PowerShell arg.
  const inner = `${commandLine} > "${logPath}" 2>&1`;
  const cmdArg = `'/c','${inner.replace(/'/g, "''")}'`;
  const script =
    `$ErrorActionPreference='Stop';` +
    `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList ${cmdArg} ` +
    `-Verb RunAs -Wait -PassThru -WindowStyle Hidden;` +
    `$p.ExitCode`;

  return execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
  ], { timeout: 120000, windowsHide: true })
    .then(({ stdout }) => {
      const code = parseInt(String(stdout).trim(), 10);
      const exitCode = Number.isNaN(code) ? null : code;
      let log: string | undefined;
      try { log = fs.readFileSync(logPath, 'utf8').trim() || undefined; } catch { /* ignore */ }
      try { fs.rmSync(logPath, { force: true }); } catch { /* ignore */ }
      const ok = isSuccessExit(exitCode);
      return {
        ok,
        exitCode,
        log,
        rebootRequired: exitCode === REBOOT_REQUIRED_EXIT,
        error: ok ? undefined : describeWdiExit(exitCode),
      };
    })
    .catch((err: any) => ({
      ok: false,
      exitCode: null,
      error: err?.message ?? 'elevation failed or was cancelled',
    }));
}

// Quotes a single argument for a Windows cmd.exe command line.
function cmdQuote(arg: string): string {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

// Reads a device's current driver service (e.g. 'kbdhid'/'HidUsb' = normal,
// 'WinUSB' = dedicated). Read-only, no elevation required. Returns null when the
// device can't be found or the query fails.
export async function getDriverService(vendorId: number, productId: number): Promise<string | null> {
  const like = `*VID_${hex4(vendorId)}&PID_${hex4(productId)}*`;
  const script =
    `$d = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.InstanceId -like '${like}' } | Select-Object -First 1;` +
    `if ($d) { (Get-PnpDeviceProperty -InstanceId $d.InstanceId ` +
    `-KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue).Data }`;
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], { timeout: 12000, windowsHide: true });
    const service = String(stdout).trim();
    return service.length ? service : null;
  } catch {
    return null;
  }
}

// True when the device is currently bound to WinUSB (already dedicated).
export async function isDedicated(vendorId: number, productId: number): Promise<boolean> {
  const service = await getDriverService(vendorId, productId);
  return !!service && /^winusb$/i.test(service);
}

// Reads the oemXX.inf that the device's WinUSB driver package was installed as,
// so restore can delete exactly that package. null when not WinUSB-bound.
export async function getDriverInf(vendorId: number, productId: number): Promise<string | null> {
  const like = `*VID_${hex4(vendorId)}&PID_${hex4(productId)}*`;
  const script =
    `$d = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.InstanceId -like '${like}' } | Select-Object -First 1;` +
    `if ($d) { (Get-PnpDeviceProperty -InstanceId $d.InstanceId ` +
    `-KeyName 'DEVPKEY_Device_DriverInfPath' -ErrorAction SilentlyContinue).Data }`;
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], { timeout: 12000, windowsHide: true });
    return parseOemInf(stdout);
  } catch {
    return null;
  }
}

// Swaps the device to WinUSB via wdi-simple (elevated). Windows re-enumerates
// the device automatically; the keyboard stops typing into Windows once bound.
export function dedicate(vendorId: number, productId: number): Promise<ElevatedResult> {
  const exe = findWdiSimple();
  if (!exe) {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      error: `wdi-simple(-x64).exe not found in resources/ — install the WinUSB driver tool`,
    });
  }
  const args = buildDedicateArgs(vendorId, productId, undefined, driverExtractDir());
  const commandLine = [exe, ...args].map(cmdQuote).join(' ');
  return runElevatedCommand(commandLine);
}

// A writable extraction directory for wdi-simple's driver files. Created up front
// so the elevated process only needs to write into it (never create it under a
// protected path like System32, which fails with "Access denied").
function driverExtractDir(): string {
  const dir = path.join(os.tmpdir(), 'macrodeck-winusb-driver');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

// PowerShell that restores the keyboard to its normal driver WITHOUT a physical
// replug. `pnputil /delete-driver` removes the WinUSB package, but on its own the
// device stays bound to WinUSB (present, unchanged) until it re-enumerates — which
// is why a manual unplug/replug was needed. Disable-PnpDevice + Enable-PnpDevice
// is the software equivalent of that replug: it tears the device down and brings
// it back, so Windows re-detects it and installs the in-box HID driver right away.
//
// It matches every present device node for the VID/PID (a composite keyboard has
// several), deletes any WinUSB oemXX.inf they use, then disable/enable-cycles them.
// -ErrorAction SilentlyContinue keeps best-effort; the script always exits 0.
export function buildRestoreScript(vendorId: number, productId: number): string {
  const like = `*VID_${hex4(vendorId)}&PID_${hex4(productId)}*`;
  // Order matters:
  //  1. Find every present device node for this VID/PID (composite = several).
  //  2. Delete the WinUSB oemXX.inf package(s) so Windows won't re-bind WinUSB.
  //  3. pnputil /remove-device tears the node out completely (software unplug).
  //     This is stronger than Disable/Enable, which left the WinUSB binding
  //     intact on some devices — forcing a physical replug.
  //  4. /scan-devices re-detects the now-removed hardware from scratch, so PnP
  //     installs the default in-box HID driver (software replug).
  // Every step logs so the elevated log captures what actually happened.
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `Write-Output "[restore] VID/PID filter: ${like}"`,
    `$devs = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like '${like}' })`,
    `Write-Output "[restore] matched $($devs.Count) device node(s)"`,
    `foreach ($d in $devs) {`,
    `  Write-Output "[restore] node: $($d.InstanceId) status=$($d.Status)"`,
    `  $inf = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_DriverInfPath').Data`,
    `  if ($inf -match 'oem\\d+\\.inf') {`,
    `    Write-Output "[restore] deleting driver $($matches[0])"`,
    `    pnputil /delete-driver $matches[0] /uninstall /force`,
    `  } else { Write-Output "[restore] no oem inf on this node (inf=$inf)" }`,
    `}`,
    `foreach ($d in $devs) {`,
    `  Write-Output "[restore] remove-device $($d.InstanceId)"`,
    `  pnputil /remove-device "$($d.InstanceId)"`,
    `}`,
    `Start-Sleep -Milliseconds 500`,
    `Write-Output "[restore] scan-devices"`,
    `pnputil /scan-devices`,
    `exit 0`,
  ].join('\r\n');
}

// Restores the keyboard to normal, forcing a software re-enumeration so no
// physical unplug/replug is needed. Runs elevated once (single UAC prompt).
export async function restore(vendorId: number, productId: number): Promise<ElevatedResult> {
  const scriptPath = path.join(os.tmpdir(), `macrodeck-restore-${process.pid}.ps1`);
  try {
    fs.writeFileSync(scriptPath, buildRestoreScript(vendorId, productId), 'utf8');
  } catch (err: any) {
    return { ok: false, exitCode: null, error: `failed to write restore script: ${err?.message}` };
  }
  const commandLine = [
    'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
  ].map(cmdQuote).join(' ');
  const result = await runElevatedCommand(commandLine);
  try { fs.rmSync(scriptPath, { force: true }); } catch { /* ignore */ }
  return result;
}
