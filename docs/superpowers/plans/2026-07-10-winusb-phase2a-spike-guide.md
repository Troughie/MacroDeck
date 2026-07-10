# Phase 2a — Build + Driver-Swap Spike Guide

**Goal of this guide:** Produce `wdi-simple.exe` and prove, by hand, the exact commands that (1) bind the Keychron to WinUSB and (2) restore it — before any of it goes into app code. This mirrors the Phase 0 reading spike.

⚠️ The Keychron becomes unusable as a normal keyboard while bound to WinUSB. Have a second keyboard connected.

---

## Part 1 — Build `wdi-simple.exe`

Reference: libwdi Install/Compile wiki — https://github.com/pbatard/libwdi/wiki/Install

1. Install **Visual Studio Community 2019+** with the **"Desktop development with C++"** workload.
2. Install the **Redistributable WDK 8 Components**: https://go.microsoft.com/fwlink/p/?LinkID=253170
   (The partial WDK bundled with VS is not enough for WinUSB.)
3. Clone libwdi:
   ```
   git clone https://github.com/pbatard/libwdi.git
   ```
4. Edit `libwdi/msvc/config.h`:
   - Set `WDK_DIR` to the folder where the WDK 8 redistributable components were installed
     (e.g. `#define WDK_DIR "C:\\Program Files (x86)\\Windows Kits\\8.0\\redist\\wdf"` — adjust to your install).
   - Set `#define WDF_VER 01011`.
5. Open the solution in `libwdi/msvc/` (e.g. `libwdi.sln` / `libwdi_2019.sln`) in Visual Studio.
6. Set configuration to **Release** and platform to **x64**. Build the solution (or the `wdi-simple` project).
7. The binary lands in `libwdi/x64/Release/wdi-simple.exe`.
8. Quick sanity: open a terminal in that folder and run `wdi-simple.exe --help` — you should see the usage/options text.

**Report back:** did the build succeed? Where is `wdi-simple.exe`? Any errors at step 4/6?

---

## Part 2 — Spike the INSTALL command (bind Keychron → WinUSB)

Your Keychron is `VID_3554 / PID_F503` (from the Phase 1 logs).

1. If the Keychron is currently WinUSB-bound from earlier testing, first restore it (Part 3) so you start from a normal keyboard, to properly test the install path.
2. Open an **elevated** (Run as administrator) terminal in the `wdi-simple.exe` folder.
3. Run the candidate install command (whole composite device → omit the interface flag):
   ```
   wdi-simple.exe -n "MacroDeck Keyboard" -f macrodeck.inf -m "MacroDeck" -v 0x3554 -p 0xF503 -t 0
   ```
   - `-t 0` = WinUSB. No `-i` = target the whole device.
4. Observe:
   - Did it complete and print success (exit code 0)?
   - **Did any Windows prompt appear?** e.g. "Windows can't verify the publisher of this driver software" or a "Would you like to install this device software?" dialog. Note the exact wording if so.
5. Verify the bind worked: run `npm run dev` in the MacroDeck repo, select the Keychron, and confirm keys read + it no longer types into Windows (as in Phase 1).

**Report back:**
- The exact command that worked.
- Whether any publisher/trust prompt appeared (this decides whether we need cert-trust flags like `-c` / `--stealth-cert` for a silent end-user install).
- Exit code.

---

## Part 3 — Spike the RESTORE command (WinUSB → normal keyboard)

1. Find the OEM INF that libwdi installed for the device. In an **elevated PowerShell**:
   ```powershell
   Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\VID_3554&PID_F503*' } |
     ForEach-Object {
       $inf = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_DriverInfPath').Data
       $svc = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_Service').Data
       "$($_.InstanceId)  INF=$inf  SERVICE=$svc"
     }
   ```
   - When WinUSB-bound, `SERVICE` should be `WinUSB` and `INF` should be an `oemNN.inf`.
2. Delete the driver package (your Phase 0 lesson: uninstall alone is not enough — the package must be removed). Replace `oemNN.inf` with the value from step 1:
   ```
   pnputil /delete-driver oemNN.inf /uninstall /force
   ```
3. Rescan so Windows reinstalls the inbox HID keyboard driver:
   ```
   pnputil /scan-devices
   ```
4. Verify: the Keychron types normally into Windows again. Re-run step 1 — `SERVICE` should now be something like `kbdhid` / `HidUsb`, not `WinUSB`.

**Report back:**
- The exact `oemNN.inf` value and the working delete + rescan commands.
- Whether the keyboard fully returned to normal (and whether a replug or scan was needed).

---

## What happens after this spike

Once you report the proven install + restore commands (and whether a trust prompt appears), I will write the full no-placeholder Phase 2a integration plan:
- `winusb-driver.ts`: `dedicate()` / `restore()` running the proven commands **elevated** (PowerShell `Start-Process -Verb RunAs`), plus OEM-INF discovery via PnP.
- `usb-enum.ts`: report `driverState` ('normal' vs 'dedicated') from `DEVPKEY_Device_Service`.
- IPC `keyboard:dedicate` / `keyboard:undedicate` / `keyboard:status` + a minimal dedicate/restore button with the lockout warning.
- (Phase 2b afterwards: persistence across reboot, auto-open on startup, recovery tool, uninstaller hook.)
