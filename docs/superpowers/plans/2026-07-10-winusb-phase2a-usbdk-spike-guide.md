# Phase 2a — UsbDk Driver Spike Guide (replaces the wdi-simple build)

**Why this changed:** Building `wdi-simple.exe` from libwdi failed (needs an exact WDK
redistributable + config.h tuning — brittle). We are switching the driver mechanism from
per-device WinUSB (Zadig/wdi-simple) to **UsbDk**, which:

- ships as a **signed MSI** (SHA-256) — end users run Next/Next/Finish, no Zadig, no per-device
  driver picking;
- captures a device **by VID/PID from code** (`UsbDkController.exe`), detaching it from Windows
  so a captured keyboard stops typing into Windows — exactly what we need;
- is supported by `node-usb` via `usb.useUsbDkBackend()`, so the Phase 1 reader mostly carries over.

**Goal of this spike:** by hand, prove on the Keychron that (1) a UsbDk hide rule makes it stop
typing into Windows, (2) node-usb can read it through the UsbDk backend, and (3) we can cleanly
undo it. No compiling.

⚠️ The Keychron stops working as a normal keyboard once hidden. You confirmed you have a second
keyboard — keep it plugged in. If anything goes wrong, the escape hatch is Part 4.

Keychron identity from Phase 1 logs: **VID `0x3554` / PID `0xF503`**.

---

## Part 1 — Install UsbDk (signed MSI, no build)

1. Open the releases page: https://github.com/daynix/UsbDk/releases
2. Download the latest **x64** installer asset. It is named like `UsbDk_1.0.22_x64.msi`
   (older releases were zipped, e.g. `UsbDk_1.0.15_x64.msi.zip` — unzip if so).
3. Run the MSI → Next / Next / Finish. This installs a single system-wide signed driver.
4. Verify the controller is installed. Open a normal terminal:
   ```
   "C:\Program Files\UsbDk Runtime Library\UsbDkController.exe" -n
   ```
   (If the path differs, search for `UsbDkController.exe` under `C:\Program Files\`.)
   Expected: it prints a list of USB devices, including a line whose ID contains
   `USB\VID_3554&PID_F503`.

**Report back:** did the MSI install cleanly? Does `-n` list the Keychron? Paste the Keychron line.

---

## Part 2 — Prove capture: make the Keychron stop typing into Windows

`UsbDkController` hide-rule syntax (from source): `-P TYPE VID PID BCD Class Hide`, where each of
VID/PID/BCD/Class is hex or `-1` (match all), and `Hide` is `1`. `-P` = **persistent** rule
(survives reboot — matches our "persistent across reboot" design). VID/PID are given **without**
the `0x` prefix.

1. Open an **elevated** (Run as administrator) terminal.
2. Add a persistent hide rule for the Keychron:
   ```
   "C:\Program Files\UsbDk Runtime Library\UsbDkController.exe" -P 0 3554 F503 -1 -1 1
   ```
3. Unplug and replug the Keychron (so the rule takes effect on re-enumeration).
4. Test: type on the Keychron into Notepad.
   - **Expected: nothing is typed** (Windows no longer sees it). Your second keyboard still works.

**Report back:** after the rule + replug, does the Keychron stop typing into Windows? Any error
from the command? Any BSoD or hang (if so, stop and tell me — that rules UsbDk out for your HW).

---

## Part 3 — Prove reading through the UsbDk backend

I will give you a tiny throwaway script to confirm node-usb can read the hidden Keychron via the
UsbDk backend before I touch the app. After Part 2 succeeds, tell me and I will provide
`scripts/usbdk-read-spike.js` (a ~30-line reader using `usb.useUsbDkBackend()` +
`findByIds(0x3554,0xF503)`), which you run with:
```
node scripts/usbdk-read-spike.js
```
Expected: pressing Keychron keys prints 8-byte HID reports / decoded key codes to the console.

(We do this as a separate step so we confirm capture before wiring the app.)

---

## Part 4 — Undo (escape hatch + normal restore)

To give the Keychron back to Windows:

1. Elevated terminal. Delete the persistent hide rule (same fields, `-D`):
   ```
   "C:\Program Files\UsbDk Runtime Library\UsbDkController.exe" -D 0 3554 F503 -1 -1 1
   ```
2. Also clear everything if needed:
   ```
   "C:\Program Files\UsbDk Runtime Library\UsbDkController.exe" -Z
   ```
   (`-Z` deletes all persistent hide rules.)
3. Unplug/replug the Keychron. It should type into Windows normally again.
4. Full removal (optional): uninstall "UsbDk Runtime Library" from Add/Remove Programs, or
   `UsbDkController.exe -u` from an elevated prompt.

**Report back:** did `-D` (or `-Z`) + replug restore normal typing?

---

## After this spike

When you confirm Parts 1, 2, 4 work (and Part 3 after I send the script), I will write the full
no-placeholder **Phase 2a integration plan** around the proven commands:

- `usbdk.ts`: locate `UsbDkController.exe`, run hide/unhide (`-P` / `-D`) **elevated**, detect
  install state.
- `hid-keyboard.ts` / reader init: call `usb.useUsbDkBackend()` before opening.
- `usb-enum.ts`: report `driverState` ('normal' vs 'dedicated') from UsbDk rules / capture state.
- IPC `keyboard:dedicate` / `keyboard:undedicate` + a minimal dedicate button with the
  single-keyboard lockout warning.
- Bundle the UsbDk MSI (or link+auto-download) and trigger its install on first dedicate.

Phase 2b afterwards: persistence bookkeeping, startup auto-attach, recovery tool, uninstaller hook.

**Open question I will resolve from your Part 2/3 results:** whether we hide the whole device or
also need to handle the composite interfaces — your report will tell us.
