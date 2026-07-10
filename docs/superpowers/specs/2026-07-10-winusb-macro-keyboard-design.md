# WinUSB Macro Keyboard — Design Spec

**Date:** 2026-07-10
**Status:** Approved design (pending spec review)

## Goal

Turn a normal USB keyboard (e.g. Keychron) into a true Stream Deck–style macro
device: the keyboard is claimed exclusively via **WinUSB**, stops typing into
Windows entirely, and its key presses are read directly by MacroDeck as HID boot
reports. This replaces the current, fragile Raw Input + low-level keyboard hook
approach.

A Phase-0 spike already proved the mechanism end-to-end on the target hardware:
- Reading keys over WinUSB works (8-byte boot keyboard report `[modifier][reserved][6 keys]`).
- The keyboard stops typing into Windows completely once claimed.
- Restore works, but requires **deleting the driver package** (not just uninstall + replug).

## Locked Decisions

1. **Replace completely.** Drop Raw Input + LL hook (`electron/native/rawinput.ts`).
   Every macro keyboard goes through WinUSB after being claimed.
2. **Distribution: end users.** Auto driver install must be robust: libwdi-based,
   handle UAC, and rely on libwdi's self-signed cert + Trusted Publisher flow
   (no purchased certificate required, same as Zadig).
3. **Persistent across reboot.** A "dedicated" keyboard keeps its macro-pad role
   through restarts. Driver is only restored on explicit **un-dedicate**, on app
   **uninstall**, or via a standalone **recovery tool**. A lockout safety net is
   mandatory.
4. **Driver layer = Approach A.** Bundle a prebuilt libwdi helper `wdi-simple.exe`
   (x64), invoked elevated. Restore via `pnputil /delete-driver oemXX.inf
   /uninstall` + device rescan. (Rejected: native Node addon around libwdi;
   shipping full Zadig.exe.)

## Architecture

Three isolated layers plus an orchestrator. Each has one purpose and is testable
in isolation.

```
usb-enum.ts        List USB keyboards + driver state (normal vs WinUSB) + name enrichment
   |  devices + driverState
winusb-driver.ts   dedicate(): run wdi-simple.exe ELEVATED -> bind WinUSB (whole device)
   |               restore(): pnputil /delete-driver oemXX.inf + rescan
   |  device bound to WinUSB
hid-keyboard.ts    node-usb: open -> claim interfaces -> poll interrupt IN
   |               parse 8-byte boot report -> diff -> KeyEvent
   |  keyboard:event (IPC channel unchanged)
keyboard.ipc.ts    Orchestrator: filter assignedKeyCodes -> send to renderer
```

### Module map

| File | Role | Change |
|---|---|---|
| `electron/native/usb-enum.ts` | Enumerate USB keyboards; read `DEVPKEY_Device_Service` to detect `kbdhid`/`HidUsb` (normal) vs `WinUSB` (dedicated); move `enrichDeviceNames`/registry name lookup here from `keyboard.ipc.ts`. | New |
| `electron/native/winusb-driver.ts` | `dedicate(device)` / `restore(device)` run elevated; capture `oemXX.inf` name for clean restore. | New |
| `electron/native/hid-keyboard.ts` | node-usb open/claim/poll; `parseBootReport` (pure); HID usage -> code table. | New |
| `electron/ipc/keyboard.ipc.ts` | Orchestrator. Keep `keyboard:list/select/updateMacroKeys/event`; add `keyboard:dedicate`, `keyboard:undedicate`, `keyboard:status`. | Rewrite |
| `electron/native/rawinput.ts` | Raw Input host. | Delete |
| `resources/wdi-simple-x64.exe` | libwdi helper, bundled via electron-builder `extraResources`. | New (binary) |
| `installer.nsh` + recovery tool | Uninstaller restores all dedicated devices; standalone recovery tool. | New |

### IPC / renderer contract

- **Unchanged:** `keyboard:event` keeps the exact current `KeyEvent` shape, so
  `KeyboardSelector`, macro execution, and the store need no changes to consume events.
- **Added:** `keyboard:dedicate(deviceId)` -> `{ok, needsElevation, error?}`;
  `keyboard:undedicate(deviceId)`; `keyboard:status` where each device carries
  `driverState: 'normal' | 'dedicated' | 'busy'`.
- `KeyboardDevice` gains `driverState` and `isDedicated`. `keyboardStore` gains
  `dedicateDevice` / `undedicateDevice` actions.

## Data Flow — Reading (Phase 1)

Claim the **whole composite device** (not per-interface): one `usb.Device` exposes
all endpoints; `node-usb` opens it once and claims every interface with an
interrupt IN endpoint. wdi-simple installs WinUSB at device level by VID/PID.

```
open(device) -> claim all interfaces with an interrupt IN endpoint
   -> per endpoint: startPoll(3, maxPacketSize)
   -> receive 8-byte buffer: [modifier][reserved][k0..k5]
   -> parseBootReport(prev, cur)   <- PURE FUNCTION (unit tested)
   -> emit KeyEvent {code, state:'down'|'up', deviceId, isMacroDevice:true}
```

- **Diff:** compare `cur` vs `prev`; a usage newly present -> `down`, a usage that
  disappeared -> `up`. The modifier byte bits (LCtrl/LShift/LAlt/LGui/RCtrl/RShift/
  RAlt/RGui) diff separately -> ControlLeft/ShiftLeft/etc.
- **Mapping:** HID Usage Page 0x07 -> `code` string (KeyA, F1, Space…), mirroring
  the existing `CodeFromScan` output so the renderer receives the same `code`
  strings it does today.
- **Consumer/media keys** (usage page 0x0C, separate endpoint) are deferred to a
  later step. Phase 1 handles the proven 8-byte boot keyboard report only.

## Lifecycle & Persistence (persistent across reboot)

- **Store adds:** `dedicatedDevices: Record<deviceKey, {vid, pid, instanceId,
  oemInf?, name}>`. `deviceKey = VID_xxxx&PID_xxxx` (+ instanceId when needed to
  distinguish multiple identical models).
- **App start:** for each dedicated device still connected, open and read
  immediately via node-usb. No driver change, no UAC (driver already installed).
- **Dedicate (user action):** warn -> run `wdi-simple` elevated -> store `oemInf`
  and mark dedicated -> start reading.
- **Un-dedicate:** stop reading -> restore elevated (`pnputil /delete-driver
  oemXX.inf /uninstall` + rescan) -> keyboard returns to normal.
- **Elevation:** app runs `asInvoker`; elevate by wrapping `wdi-simple` in
  `Start-Process -Verb RunAs`, writing the result to a temp file that the main
  process reads back (matches the existing elevated-helper pattern).

## Lockout Safety Net (mandatory)

Because dedicate is persistent and a claimed keyboard is dead to Windows:

- **Prevent wrong claim:** before dedicating, if the target VID/PID matches the
  only keyboard present, show a hard warning and require explicit confirmation
  ("I have another keyboard"). Recommend dedicating only a secondary keyboard.
- **Standalone recovery tool:** `MacroDeck Recovery` (small exe/.ps1, Start Menu
  shortcut) reads the dedicated-device list from a JSON file in `%PROGRAMDATA%`
  (independent of the app running) and restores all of them, even if the main app
  is broken.
- **Uninstaller:** custom `installer.nsh` restores every dedicated device before
  removal.

## Error Handling

- wdi-simple fails / user cancels UAC -> return `{ok:false}`, no state change, UI
  reports clearly.
- Device unplugged while reading -> node-usb error -> stop poll, mark
  disconnected, keep dedicated state (re-reads on replug).
- node-usb cannot open (driver is not yet WinUSB) -> guide the user to dedicate.

## Testing

- **Unit (pure, CI-friendly):** `parseBootReport` diff logic; usage->code table;
  parsing `oemXX.inf` from pnputil output.
- **Manual (checklist):** dedicate Keychron -> typing produces no characters in
  Windows + events flow -> un-dedicate restores -> recovery tool works -> uninstall
  restores.

## Phasing (matches locked priority order)

- **Phase 1 — Reading (low risk, spike-proven):** build `hid-keyboard.ts` + parser
  + wire into IPC/renderer. Test immediately on the Keychron in a
  *manually-WinUSB-bound* state (Zadig once). No driver changes -> safe, works now.
- **Phase 2 — Driver swap/restore (risky):** `winusb-driver.ts` (wdi-simple + UAC),
  persistence across reboot, dedicate/undedicate UI + warnings, recovery tool,
  uninstaller hook.

## Out of Scope (YAGNI for now)

- Consumer/media (usage page 0x0C) and vendor-defined reports — added after boot
  keyboard works.
- Purchased/EV code-signing certificate — libwdi self-signed flow is sufficient
  for launch.
- Non-Windows platforms.
