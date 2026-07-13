# Single-toggle Macro Keyboard — Design

**Date:** 2026-07-11
**Status:** Approved

## Problem

The keyboard selector currently exposes two separate actions per device:
"Set as Macro Keyboard" (select which device to read) and
"Dedicate (WinUSB)" / "Release to Windows" (swap the driver). This is confusing:
reading only works once a device is WinUSB-bound, so "select" without "dedicate"
does nothing useful.

## Goal

Merge into a single toggle per keyboard card:

- Click on a **normal** keyboard → dedicate it to WinUSB and make it the active
  macro keyboard (starts reading).
- Click on the **dedicated** keyboard → release it back to the normal Windows
  driver (stops reading, keyboard types into Windows again).

## Decisions (from brainstorming)

1. **Interaction:** a single button on the card (card shows info only; one button
   toggles). Not whole-card click.
2. **Only one macro keyboard at a time:** before dedicating a new keyboard,
   auto-release any other currently-dedicated keyboard. This may cause two UAC
   prompts (release old + dedicate new); a first-time single dedicate is one prompt.
3. **Keep the "only keyboard" warning:** still `window.confirm` before dedicating
   when it is the user's only keyboard (they would lose the ability to type into
   Windows).

## Behavior

| Current state | Button label | On click |
|---|---|---|
| `normal` | "Set as Macro Keyboard" (green) | warn-if-only-keyboard → release other dedicated device → dedicate this → becomes active macro device |
| `dedicated` | "Release to Windows" (yellow) | undedicate → restore HID driver → stop reading |
| busy | "Working…" (disabled) | — |
| non-keyboard (mouse) | "Input device" (static) | — |

- `selectedDeviceId` = the dedicated macro keyboard. On successful dedicate it is
  set and persisted (saved device) so a restart re-reads it. On release it is
  cleared.
- The old separate "select" concept is removed; selecting == dedicating.
- Disable the dedicate button when the WinUSB tool is unavailable.

## Files

1. `src/components/KeyboardSelector/KeyboardSelector.tsx` — one toggle button;
   dedicate handler auto-releases the previously-dedicated device first.
2. `src/stores/keyboardStore.ts` — `dedicateDevice` success sets `selectedDeviceId`
   + persists saved device; `undedicateDevice` success clears it when it was the
   selected one; `loadDevices` only auto-selects/reads a `dedicated` device.
3. `electron/ipc/keyboard.ipc.ts` — drop the `isDriverToolAvailable()` gate on
   `undedicate` (pnputil is a built-in Windows command, so release must always be
   possible).

## Out of scope / unchanged

- Native dedicate/undedicate (wdi-simple / pnputil).
- USB reader (`hid-keyboard.ts`) and main-process reader lifecycle.
