# WinUSB Macro Keyboard — Phase 1 (Reading) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read key presses from a keyboard already bound to WinUSB, via `node-usb`, and deliver them through the existing `keyboard:event` IPC channel so macros fire — replacing the Raw Input + low-level-hook reader.

**Architecture:** Pure logic (HID usage→code map, boot-report diff, device-id helpers) is separated from the `node-usb` native binding so it can be unit-tested under Vitest. A thin `node-usb` reader (`hid-keyboard.ts`) polls the interrupt IN endpoint(s) of the WinUSB-bound device and emits key deltas. `usb-enum.ts` lists USB keyboards. `keyboard.ipc.ts` is rewritten to orchestrate enumeration + reading while keeping the renderer contract unchanged.

**Tech Stack:** TypeScript, Electron (main process, CommonJS build via `tsconfig.electron.json`), `node-usb` v2 (already a dependency), Vitest (new), PowerShell (device-name enrichment, reused).

**Precondition for manual testing:** The target keyboard (Keychron) must already be bound to WinUSB (run Zadig once, "install WinUSB on the whole device"). Automating that swap is Phase 2.

**Scope note:** This plan is Phase 1 only. Phase 2 (automatic driver swap/restore, persistence, dedicate UI, recovery tool, uninstaller hook) is a separate plan.

---

### Task 1: Set up Vitest and keep tests out of the Electron build

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.electron.json`
- Test: `electron/native/smoke.test.ts` (temporary, deleted in this task)

- [ ] **Step 1: Add Vitest dependency and scripts**

In `package.json`, add to `devDependencies`:

```json
"vitest": "^1.6.0"
```

Add to `scripts` (after `"typecheck"`):

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck:electron": "tsc -p tsconfig.electron.json --noEmit"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: installs `vitest`, no errors.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Exclude test files from the Electron production build**

In `tsconfig.electron.json`, change the `exclude` array to:

```json
"exclude": ["node_modules", "dist", "**/*.test.ts"]
```

- [ ] **Step 5: Add a temporary smoke test**

Create `electron/native/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run tests to verify Vitest works**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 7: Delete the smoke test**

Delete `electron/native/smoke.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.electron.json
git commit -m "chore: add vitest and exclude tests from electron build"
```

---

### Task 2: HID usage → code map

**Files:**
- Create: `electron/native/hid-usage-map.ts`
- Test: `electron/native/hid-usage-map.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/native/hid-usage-map.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hidUsageToCode, modifierBitToCode, MODIFIER_COUNT } from './hid-usage-map';

describe('hidUsageToCode', () => {
  it('maps letters', () => {
    expect(hidUsageToCode(0x04)).toBe('KeyA');
    expect(hidUsageToCode(0x1d)).toBe('KeyZ');
  });
  it('maps digits and common keys', () => {
    expect(hidUsageToCode(0x1e)).toBe('Digit1');
    expect(hidUsageToCode(0x27)).toBe('Digit0');
    expect(hidUsageToCode(0x28)).toBe('Enter');
    expect(hidUsageToCode(0x2c)).toBe('Space');
    expect(hidUsageToCode(0x29)).toBe('Escape');
  });
  it('maps function keys', () => {
    expect(hidUsageToCode(0x3a)).toBe('F1');
    expect(hidUsageToCode(0x45)).toBe('F12');
  });
  it('maps arrows and numpad', () => {
    expect(hidUsageToCode(0x4f)).toBe('ArrowRight');
    expect(hidUsageToCode(0x52)).toBe('ArrowUp');
    expect(hidUsageToCode(0x62)).toBe('Numpad0');
  });
  it('falls back to HID<n> for unknown usages', () => {
    expect(hidUsageToCode(0xff)).toBe('HID255');
  });
});

describe('modifierBitToCode', () => {
  it('maps the 8 modifier bits in HID order', () => {
    expect(MODIFIER_COUNT).toBe(8);
    expect(modifierBitToCode(0)).toBe('ControlLeft');
    expect(modifierBitToCode(1)).toBe('ShiftLeft');
    expect(modifierBitToCode(2)).toBe('AltLeft');
    expect(modifierBitToCode(3)).toBe('MetaLeft');
    expect(modifierBitToCode(4)).toBe('ControlRight');
    expect(modifierBitToCode(5)).toBe('ShiftRight');
    expect(modifierBitToCode(6)).toBe('AltRight');
    expect(modifierBitToCode(7)).toBe('MetaRight');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/native/hid-usage-map.test.ts`
Expected: FAIL — cannot find module `./hid-usage-map`.

- [ ] **Step 3: Write the implementation**

Create `electron/native/hid-usage-map.ts`:

```ts
// HID Usage Page 0x07 (Keyboard/Keypad) usage ID -> renderer `code` string.
// The code strings mirror what the old scan-code map produced, so the renderer
// (KeyboardSelector, macro matching) needs no changes.

const USAGE_TO_CODE: Record<number, string> = {
  0x04: 'KeyA', 0x05: 'KeyB', 0x06: 'KeyC', 0x07: 'KeyD', 0x08: 'KeyE',
  0x09: 'KeyF', 0x0a: 'KeyG', 0x0b: 'KeyH', 0x0c: 'KeyI', 0x0d: 'KeyJ',
  0x0e: 'KeyK', 0x0f: 'KeyL', 0x10: 'KeyM', 0x11: 'KeyN', 0x12: 'KeyO',
  0x13: 'KeyP', 0x14: 'KeyQ', 0x15: 'KeyR', 0x16: 'KeyS', 0x17: 'KeyT',
  0x18: 'KeyU', 0x19: 'KeyV', 0x1a: 'KeyW', 0x1b: 'KeyX', 0x1c: 'KeyY',
  0x1d: 'KeyZ',
  0x1e: 'Digit1', 0x1f: 'Digit2', 0x20: 'Digit3', 0x21: 'Digit4', 0x22: 'Digit5',
  0x23: 'Digit6', 0x24: 'Digit7', 0x25: 'Digit8', 0x26: 'Digit9', 0x27: 'Digit0',
  0x28: 'Enter', 0x29: 'Escape', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
  0x2d: 'Minus', 0x2e: 'Equal', 0x2f: 'BracketLeft', 0x30: 'BracketRight',
  0x31: 'Backslash', 0x33: 'Semicolon', 0x34: 'Quote', 0x35: 'Backquote',
  0x36: 'Comma', 0x37: 'Period', 0x38: 'Slash', 0x39: 'CapsLock',
  0x3a: 'F1', 0x3b: 'F2', 0x3c: 'F3', 0x3d: 'F4', 0x3e: 'F5', 0x3f: 'F6',
  0x40: 'F7', 0x41: 'F8', 0x42: 'F9', 0x43: 'F10', 0x44: 'F11', 0x45: 'F12',
  0x46: 'PrintScreen', 0x47: 'ScrollLock', 0x48: 'Pause',
  0x49: 'Insert', 0x4a: 'Home', 0x4b: 'PageUp', 0x4c: 'Delete', 0x4d: 'End',
  0x4e: 'PageDown', 0x4f: 'ArrowRight', 0x50: 'ArrowLeft', 0x51: 'ArrowDown',
  0x52: 'ArrowUp', 0x53: 'NumLock', 0x54: 'NumpadDivide', 0x55: 'NumpadMultiply',
  0x56: 'NumpadSubtract', 0x57: 'NumpadAdd', 0x58: 'NumpadEnter',
  0x59: 'Numpad1', 0x5a: 'Numpad2', 0x5b: 'Numpad3', 0x5c: 'Numpad4',
  0x5d: 'Numpad5', 0x5e: 'Numpad6', 0x5f: 'Numpad7', 0x60: 'Numpad8',
  0x61: 'Numpad9', 0x62: 'Numpad0', 0x63: 'NumpadDecimal', 0x65: 'ContextMenu',
};

export function hidUsageToCode(usage: number): string {
  return USAGE_TO_CODE[usage] ?? `HID${usage}`;
}

// Modifier byte bit order per HID spec (byte 0 of the boot report).
const MODIFIER_CODES = [
  'ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft',
  'ControlRight', 'ShiftRight', 'AltRight', 'MetaRight',
];

export const MODIFIER_COUNT = MODIFIER_CODES.length;

export function modifierBitToCode(bit: number): string {
  return MODIFIER_CODES[bit] ?? `Modifier${bit}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/native/hid-usage-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/native/hid-usage-map.ts electron/native/hid-usage-map.test.ts
git commit -m "feat: add HID usage-to-code map"
```

---

### Task 3: Boot-report diff (pure key-event derivation)

**Files:**
- Create: `electron/native/boot-report.ts`
- Test: `electron/native/boot-report.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/native/boot-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffBootReports } from './boot-report';

const report = (mod: number, ...keys: number[]): Uint8Array => {
  const r = new Uint8Array(8);
  r[0] = mod;
  keys.slice(0, 6).forEach((k, i) => { r[2 + i] = k; });
  return r;
};

describe('diffBootReports', () => {
  it('emits down for a newly pressed key', () => {
    expect(diffBootReports(null, report(0, 0x04))).toEqual([
      { code: 'KeyA', state: 'down', usage: 0x04 },
    ]);
  });

  it('emits up when a key is released', () => {
    expect(diffBootReports(report(0, 0x04), report(0))).toEqual([
      { code: 'KeyA', state: 'up', usage: 0x04 },
    ]);
  });

  it('emits nothing when the report is unchanged', () => {
    expect(diffBootReports(report(0, 0x04), report(0, 0x04))).toEqual([]);
  });

  it('handles modifier press and release', () => {
    expect(diffBootReports(report(0x00), report(0x02))).toEqual([
      { code: 'ShiftLeft', state: 'down', usage: -1 },
    ]);
    expect(diffBootReports(report(0x02), report(0x00))).toEqual([
      { code: 'ShiftLeft', state: 'up', usage: -1 },
    ]);
  });

  it('ignores rollover/error codes (<= 0x03)', () => {
    expect(diffBootReports(null, report(0, 0x01))).toEqual([]);
  });

  it('reports multiple simultaneous new keys', () => {
    const deltas = diffBootReports(null, report(0, 0x04, 0x05));
    expect(deltas).toContainEqual({ code: 'KeyA', state: 'down', usage: 0x04 });
    expect(deltas).toContainEqual({ code: 'KeyB', state: 'down', usage: 0x05 });
    expect(deltas).toHaveLength(2);
  });

  it('treats a key moving slots as no change', () => {
    expect(diffBootReports(report(0, 0x04, 0x00), report(0, 0x00, 0x04))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/native/boot-report.test.ts`
Expected: FAIL — cannot find module `./boot-report`.

- [ ] **Step 3: Write the implementation**

Create `electron/native/boot-report.ts`:

```ts
import { hidUsageToCode, modifierBitToCode, MODIFIER_COUNT } from './hid-usage-map';

export interface KeyDelta {
  code: string;
  state: 'down' | 'up';
  usage: number; // HID usage id, or -1 for modifier-derived deltas
}

// A USB HID boot keyboard report is 8 bytes: [modifier][reserved][k0..k5].
// This derives down/up deltas by diffing the current report against the previous.
export function diffBootReports(prev: Uint8Array | null, cur: Uint8Array): KeyDelta[] {
  const deltas: KeyDelta[] = [];

  const prevMod = prev ? prev[0] : 0;
  const curMod = cur[0];
  for (let bit = 0; bit < MODIFIER_COUNT; bit++) {
    const mask = 1 << bit;
    const was = (prevMod & mask) !== 0;
    const is = (curMod & mask) !== 0;
    if (is && !was) deltas.push({ code: modifierBitToCode(bit), state: 'down', usage: -1 });
    else if (!is && was) deltas.push({ code: modifierBitToCode(bit), state: 'up', usage: -1 });
  }

  const prevKeys = keySet(prev);
  const curKeys = keySet(cur);
  for (const usage of curKeys) {
    if (!prevKeys.has(usage)) deltas.push({ code: hidUsageToCode(usage), state: 'down', usage });
  }
  for (const usage of prevKeys) {
    if (!curKeys.has(usage)) deltas.push({ code: hidUsageToCode(usage), state: 'up', usage });
  }

  return deltas;
}

function keySet(report: Uint8Array | null): Set<number> {
  const keys = new Set<number>();
  if (!report) return keys;
  // Bytes 2..7 hold up to 6 pressed usage ids. 0x00 = empty; 0x01..0x03 = error/rollover.
  for (let i = 2; i < Math.min(report.length, 8); i++) {
    const usage = report[i];
    if (usage > 0x03) keys.add(usage);
  }
  return keys;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/native/boot-report.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/native/boot-report.ts electron/native/boot-report.test.ts
git commit -m "feat: add boot keyboard report diff"
```

---

### Task 4: USB device-id helpers

**Files:**
- Create: `electron/native/usb-device-id.ts`
- Test: `electron/native/usb-device-id.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/native/usb-device-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDeviceKey, parseDeviceKey, isBootKeyboardInterface } from './usb-device-id';

describe('buildDeviceKey / parseDeviceKey', () => {
  it('builds an uppercase VID/PID key', () => {
    expect(buildDeviceKey(0x3434, 0x0111)).toBe('usb:VID_3434&PID_0111');
  });
  it('pads to 4 hex digits', () => {
    expect(buildDeviceKey(0x5e, 0x7)).toBe('usb:VID_005E&PID_0007');
  });
  it('round-trips', () => {
    expect(parseDeviceKey(buildDeviceKey(0x3434, 0x0111))).toEqual({
      vendorId: 0x3434,
      productId: 0x0111,
    });
  });
  it('returns null for a bad key', () => {
    expect(parseDeviceKey('not-a-key')).toBeNull();
  });
});

describe('isBootKeyboardInterface', () => {
  it('is true for HID/boot/keyboard', () => {
    expect(isBootKeyboardInterface({
      bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x01,
    })).toBe(true);
  });
  it('is false for a mouse interface', () => {
    expect(isBootKeyboardInterface({
      bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x02,
    })).toBe(false);
  });
  it('is false for a non-HID interface', () => {
    expect(isBootKeyboardInterface({
      bInterfaceClass: 0x08, bInterfaceSubClass: 0x00, bInterfaceProtocol: 0x00,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/native/usb-device-id.test.ts`
Expected: FAIL — cannot find module `./usb-device-id`.

- [ ] **Step 3: Write the implementation**

Create `electron/native/usb-device-id.ts`:

```ts
export function buildDeviceKey(vendorId: number, productId: number): string {
  return `usb:VID_${hex4(vendorId)}&PID_${hex4(productId)}`;
}

export function parseDeviceKey(key: string): { vendorId: number; productId: number } | null {
  const match = /^usb:VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})$/.exec(key);
  if (!match) return null;
  return {
    vendorId: parseInt(match[1], 16),
    productId: parseInt(match[2], 16),
  };
}

export interface InterfaceDescLike {
  bInterfaceClass: number;
  bInterfaceSubClass: number;
  bInterfaceProtocol: number;
}

// HID class (0x03), Boot subclass (0x01), Keyboard protocol (0x01).
export function isBootKeyboardInterface(iface: InterfaceDescLike): boolean {
  return iface.bInterfaceClass === 0x03
    && iface.bInterfaceSubClass === 0x01
    && iface.bInterfaceProtocol === 0x01;
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/native/usb-device-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/native/usb-device-id.ts electron/native/usb-device-id.test.ts
git commit -m "feat: add usb device-id helpers"
```

---

### Task 5: Device-name enrichment module (moved from keyboard.ipc)

**Files:**
- Create: `electron/native/device-names.ts`
- Test: `electron/native/device-names.test.ts`

This extracts the PowerShell PnP name lookup (currently inside `keyboard.ipc.ts`) into a reusable module, simplified to match by VID/PID (we no longer have a Raw Input `hwid`).

- [ ] **Step 1: Write the failing test (pure helpers only)**

Create `electron/native/device-names.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isGenericDeviceName, findPnpNameByVidPid, PnpDeviceInfo } from './device-names';

describe('isGenericDeviceName', () => {
  it('flags generic names', () => {
    expect(isGenericDeviceName('HID Keyboard Device')).toBe(true);
    expect(isGenericDeviceName('USB Input Device')).toBe(true);
  });
  it('accepts real names', () => {
    expect(isGenericDeviceName('Keychron K2')).toBe(false);
  });
});

describe('findPnpNameByVidPid', () => {
  const pnp: PnpDeviceInfo[] = [
    {
      name: 'Keychron K2',
      instanceId: 'USB\\VID_3434&PID_0111&MI_00\\7&ABCDEF',
      hardwareIds: ['USB\\VID_3434&PID_0111&REV_0100'],
    },
    {
      name: 'HID Keyboard Device',
      instanceId: 'USB\\VID_1234&PID_5678\\6&1',
      hardwareIds: ['USB\\VID_1234&PID_5678'],
    },
  ];

  it('finds a real name by VID/PID', () => {
    expect(findPnpNameByVidPid(0x3434, 0x0111, pnp)).toBe('Keychron K2');
  });
  it('ignores generic matches', () => {
    expect(findPnpNameByVidPid(0x1234, 0x5678, pnp)).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(findPnpNameByVidPid(0x9999, 0x9999, pnp)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/native/device-names.test.ts`
Expected: FAIL — cannot find module `./device-names`.

- [ ] **Step 3: Write the implementation**

Create `electron/native/device-names.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/native/device-names.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/native/device-names.ts electron/native/device-names.test.ts
git commit -m "feat: extract device-name enrichment into device-names module"
```

---

### Task 6: node-usb keyboard reader

**Files:**
- Create: `electron/native/hid-keyboard.ts`

This module imports the native `usb` binding, so it is **not** unit-tested; verification is a typecheck plus manual hardware test in Task 8.

- [ ] **Step 1: Write the implementation**

Create `electron/native/hid-keyboard.ts`:

```ts
import { usb, findByIds, Interface, InEndpoint, Endpoint } from 'usb';
import { diffBootReports, KeyDelta } from './boot-report';

export interface KeyboardReader {
  close(): void;
}

// Opens a keyboard already bound to WinUSB and streams key deltas.
// Throws if the device is missing or no interrupt IN endpoint can be claimed
// (typically because the device is not WinUSB-bound yet).
export function openKeyboardReader(
  vendorId: number,
  productId: number,
  onDelta: (delta: KeyDelta) => void,
  onError: (err: Error) => void,
): KeyboardReader {
  const device = findByIds(vendorId, productId);
  if (!device) {
    throw new Error(`USB device ${hex4(vendorId)}:${hex4(productId)} not found`);
  }

  device.open();

  const claimed: Interface[] = [];
  const polling: InEndpoint[] = [];
  const prevByAddress = new Map<number, Uint8Array | null>();

  for (const iface of device.interfaces ?? []) {
    const inEp = iface.endpoints.find(
      (ep: Endpoint) =>
        ep.direction === 'in' &&
        ep.transferType === usb.LIBUSB_TRANSFER_TYPE_INTERRUPT,
    ) as InEndpoint | undefined;
    if (!inEp) continue;

    try {
      // On Windows, detaching the kernel driver is unsupported and throws; ignore.
      try {
        if (iface.isKernelDriverActive()) iface.detachKernelDriver();
      } catch {
        /* Windows / WinUSB: no-op */
      }

      iface.claim();
      claimed.push(iface);
      prevByAddress.set(inEp.address, null);

      inEp.on('data', (data: Buffer) => {
        if (data.length < 8) return; // Phase 1: 8-byte boot keyboard report only
        const prev = prevByAddress.get(inEp.address) ?? null;
        const cur = Uint8Array.from(data.subarray(0, 8));
        for (const delta of diffBootReports(prev, cur)) onDelta(delta);
        prevByAddress.set(inEp.address, cur);
      });
      inEp.on('error', (err: Error) => onError(err));
      inEp.startPoll(3, inEp.descriptor.wMaxPacketSize);
      polling.push(inEp);
    } catch (err) {
      onError(err as Error);
    }
  }

  if (polling.length === 0) {
    try { device.close(); } catch { /* ignore */ }
    throw new Error('No interrupt IN endpoint claimed - is the device WinUSB-bound?');
  }

  return {
    close() {
      for (const ep of polling) {
        try { ep.stopPoll(); } catch { /* ignore */ }
      }
      for (const iface of claimed) {
        try { iface.release(true, () => { /* ignore */ }); } catch { /* ignore */ }
      }
      try { device.close(); } catch { /* ignore */ }
    },
  };
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:electron`
Expected: no errors. If `usb` type names differ (e.g. `LIBUSB_TRANSFER_TYPE_INTERRUPT`), consult `node_modules/usb/dist/usb/index.d.ts` and adjust the constant/property name, keeping behavior identical.

- [ ] **Step 3: Commit**

```bash
git add electron/native/hid-keyboard.ts
git commit -m "feat: add node-usb boot keyboard reader"
```

---

### Task 7: USB keyboard enumeration

**Files:**
- Create: `electron/native/usb-enum.ts`

Imports the native `usb` binding, so verification is typecheck + manual test.

- [ ] **Step 1: Write the implementation**

Create `electron/native/usb-enum.ts`:

```ts
import { getDeviceList, Device } from 'usb';
import { KeyboardDevice } from '../../src/types/macro.types';
import { buildDeviceKey, isBootKeyboardInterface, InterfaceDescLike } from './usb-device-id';
import { loadPnpDevices, findPnpNameByVidPid } from './device-names';

// Lists connected USB devices that expose an HID boot-keyboard interface.
export async function listUsbKeyboards(selectedDeviceKey: string): Promise<KeyboardDevice[]> {
  const devices = getDeviceList();
  const pnp = await loadPnpDevices();
  const seen = new Set<string>();
  const result: KeyboardDevice[] = [];

  for (const device of devices) {
    const ifaces = interfaceDescriptors(device);
    if (!ifaces.some(isBootKeyboardInterface)) continue;

    const vendorId = device.deviceDescriptor.idVendor;
    const productId = device.deviceDescriptor.idProduct;
    const key = buildDeviceKey(vendorId, productId);
    if (seen.has(key)) continue;
    seen.add(key);

    const name = findPnpNameByVidPid(vendorId, productId, pnp)
      ?? `Keyboard ${hex4(vendorId)}:${hex4(productId)}`;

    result.push({
      id: key,
      name,
      deviceType: 'keyboard',
      vendorId,
      productId,
      isKeyboard: true,
      isConnected: true,
      isSelected: key === selectedDeviceKey,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function interfaceDescriptors(device: Device): InterfaceDescLike[] {
  try {
    const config = device.configDescriptor;
    if (!config) return [];
    // configDescriptor.interfaces is InterfaceDescriptor[][] (alt settings nested).
    return config.interfaces.flat().map((iface: any) => ({
      bInterfaceClass: iface.bInterfaceClass,
      bInterfaceSubClass: iface.bInterfaceSubClass,
      bInterfaceProtocol: iface.bInterfaceProtocol,
    }));
  } catch {
    return [];
  }
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:electron`
Expected: no errors. If `device.configDescriptor` typing differs, verify against `node_modules/usb/dist/usb/index.d.ts`; the runtime shape is `{ interfaces: InterfaceDescriptor[][] }`.

- [ ] **Step 3: Commit**

```bash
git add electron/native/usb-enum.ts
git commit -m "feat: enumerate USB keyboards via node-usb"
```

---

### Task 8: Rewrite `keyboard.ipc.ts` to use the WinUSB reader

**Files:**
- Modify: `electron/ipc/keyboard.ipc.ts` (full rewrite)

Keeps the renderer contract: `keyboard:list`, `keyboard:select`, `keyboard:updateMacroKeys`, and outgoing `keyboard:event` with the existing `KeyEvent` shape. Removes all Raw Input host usage.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `electron/ipc/keyboard.ipc.ts` with:

```ts
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
        console.error('[keyboard.ipc] reader error:', err.message);
        stopReader();
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:electron`
Expected: no errors.

- [ ] **Step 3: Manual hardware test**

Precondition: the Keychron is bound to WinUSB (Zadig, whole device).

1. Run: `npm run dev`
2. In the app, open the keyboard selector; confirm the Keychron appears in the list.
3. Select it, then assign a macro to a key (so it enters `assignedKeyCodes`).
4. Press that key on the Keychron.

Expected:
- The assigned macro fires.
- Pressing keys on the Keychron produces **no characters** anywhere in Windows (it is WinUSB-claimed).
- Your normal keyboard still types normally.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/keyboard.ipc.ts
git commit -m "feat: read macro keys from WinUSB device via node-usb"
```

---

### Task 9: Remove the Raw Input host and finalize

**Files:**
- Delete: `electron/native/rawinput.ts`
- Modify: `package.json` (electron-builder `extraResources` no longer needs `rawinput.cs`)

- [ ] **Step 1: Confirm no remaining references to the Raw Input host**

Run: `git grep -n "rawinput\|RawInputHost\|startRawInputHost" -- electron src`
Expected: no matches (Task 8 already removed the import). If any remain, remove them.

- [ ] **Step 2: Delete the Raw Input host module**

Delete `electron/native/rawinput.ts`.

- [ ] **Step 3: Update electron-builder resource filter**

In `package.json`, the `extraResources` entry that copies `electron/native/` currently includes `*.cs`. `rawinput.cs` no longer exists at build time (it was generated at runtime only), so no change is required unless a stale copy is referenced. Leave the `*.cs`/`*.ps1` filter as-is for the remaining `appvolume` helper. (No edit needed — verified.)

- [ ] **Step 4: Typecheck the whole electron project**

Run: `npm run typecheck:electron`
Expected: no errors.

- [ ] **Step 5: Run the full unit-test suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 2–5.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Raw Input keyboard host (replaced by WinUSB reader)"
```

---

## Manual Acceptance Checklist (end of Phase 1)

- [ ] Keychron (WinUSB-bound) appears in the device list with a real name.
- [ ] Selecting it and pressing an assigned key fires the macro.
- [ ] Keychron keystrokes produce no characters in Windows.
- [ ] A second (normal) keyboard still types normally and does not fire macros.
- [ ] Unplugging/replugging the Keychron does not crash the app (reader error is logged; re-select to resume — full auto-reconnect is Phase 2).
- [ ] `npm test` is green.

## Deferred to Phase 2 (separate plan)

- Automatic WinUSB driver install/restore (`wdi-simple.exe` via libwdi, elevated).
- Persistence of dedicated devices across reboot + auto-open on startup.
- `keyboard:dedicate` / `keyboard:undedicate` IPC + dedicate UI with lockout warning.
- Standalone recovery tool + `%PROGRAMDATA%` device list.
- Uninstaller hook that restores all dedicated devices.
- Consumer/media (usage page 0x0C) reports and auto-reconnect on replug.
