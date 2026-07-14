# After Effects Macro Support (AE_COMMAND) — Design Spec

**Date:** 2026-07-14  
**Branch:** feat/winusb-phase2a-usbdk  
**Status:** Approved, pending implementation

---

## Overview

Add a new `AE_COMMAND` macro type to MacroDeck that lets users trigger Adobe After Effects actions from their macro keyboard. Supports two modes under one type: a categorized keyboard shortcut picker, and a JSX script runner (preset library + custom editor).

---

## Architecture

### New macro type

Add `AE_COMMAND` to the `MacroType` enum in `src/types/macro.types.ts`.

### Config structure

```typescript
// Mode 1: Shortcut
interface AeShortcutConfig extends BaseMacroConfig {
  type: 'AE_COMMAND';
  mode: 'shortcut';
  shortcutId: string; // e.g. 'timeline.ramPreview'
}

// Mode 2: Preset JSX script
interface AePresetScriptConfig extends BaseMacroConfig {
  type: 'AE_COMMAND';
  mode: 'script';
  scriptType: 'preset';
  presetId: string; // e.g. 'layer.centerAnchor'
}

// Mode 3: Custom JSX script
interface AeCustomScriptConfig extends BaseMacroConfig {
  type: 'AE_COMMAND';
  mode: 'script';
  scriptType: 'custom';
  script: string; // raw JSX code
}

type AeCommandConfig = AeShortcutConfig | AePresetScriptConfig | AeCustomScriptConfig;
```

### Execution flow

**Shortcut mode:**
```
macro triggered
  → lookup shortcutId in aeShortcuts.ts table
  → extract key combo string (e.g. "ctrl+shift+x")
  → call executeHotkey() — reuses existing C# EXE / PowerShell logic
```

**Script mode:**
```
macro triggered
  → resolve script string (from presetId lookup or raw custom script)
  → write to %TEMP%\macrodeck_ae_<uuid>.jsx
  → spawn: afterfx.exe -r <path>
  → delete temp file
  → if exit code != 0 or AE not running: show error notification
```

### AE path detection

On first use, scan for `afterfx.exe` via:
1. `HKLM\SOFTWARE\Adobe\After Effects` registry key
2. Default paths: `C:\Program Files\Adobe\After Effects <year>\Support Files\afterfx.exe` for years 2020–2026
3. If not found: show warning in settings UI, disable Test Script button

Detected path cached in electron-store settings.

---

## Shortcut Data (30 shortcuts, 5 categories)

### Timeline & Playback
| shortcutId | Label | Keys |
|---|---|---|
| timeline.ramPreview | RAM Preview | Numpad 0 |
| timeline.playPause | Play / Pause | Space |
| timeline.prevFrame | Previous Frame | Page Up |
| timeline.nextFrame | Next Frame | Page Down |
| timeline.prev10Frames | -10 Frames | Shift+Page Up |
| timeline.next10Frames | +10 Frames | Shift+Page Down |
| timeline.goToBeginning | Go to Beginning | Home |
| timeline.goToEnd | Go to End | End |
| timeline.setWorkStart | Set Work Area Start | B |
| timeline.setWorkEnd | Set Work Area End | N |
| timeline.trimToWorkArea | Trim Comp to Work Area | Ctrl+Shift+X |

### Layers
| shortcutId | Label | Keys |
|---|---|---|
| layer.newSolid | New Solid | Ctrl+Y |
| layer.newAdjustment | New Adjustment Layer | Ctrl+Alt+Y |
| layer.duplicate | Duplicate Layer | Ctrl+D |
| layer.split | Split Layer | Ctrl+Shift+D |
| layer.precompose | Pre-compose | Ctrl+Shift+C |
| layer.moveUp | Move Layer Up | Ctrl+] |
| layer.moveDown | Move Layer Down | Ctrl+[ |
| layer.showPosition | Show Position | P |
| layer.showScale | Show Scale | S |
| layer.showRotation | Show Rotation | R |
| layer.showOpacity | Show Opacity | T |
| layer.showModified | Show All Modified | UU |

### Keyframes & Animation
| shortcutId | Label | Keys |
|---|---|---|
| keys.easyEase | Easy Ease | F9 |
| keys.easyEaseIn | Easy Ease In | Shift+F9 |
| keys.easyEaseOut | Easy Ease Out | Ctrl+Shift+F9 |
| keys.graphEditor | Toggle Graph Editor | Shift+F3 |
| keys.selectAll | Select All Keyframes | Ctrl+Alt+A |

### Composition
| shortcutId | Label | Keys |
|---|---|---|
| comp.settings | Composition Settings | Ctrl+K |
| comp.addToRenderQueue | Add to Render Queue | Ctrl+M |
| comp.new | New Composition | Ctrl+N |
| comp.flowchart | Composition Flowchart | Ctrl+F11 |

### View & Panels
| shortcutId | Label | Keys |
|---|---|---|
| view.maximizePanel | Maximize Panel | ` |
| view.rulers | Toggle Rulers | Ctrl+R |
| view.grid | Toggle Grid | Ctrl+' |
| view.guides | Toggle Guides | Ctrl+; |
| view.fitToWidth | Fit to Comp Width | Ctrl+Shift+Alt+H |
| view.disableRefresh | Disable Auto-Refresh | Caps Lock |

---

## JSX Preset Library (15 presets, 3 categories)

### Layer Utilities
| presetId | Label | Description |
|---|---|---|
| layer.centerAnchor | Center Anchor Point | Moves anchor point to center of layer bounds |
| layer.parentToNull | Parent to New Null | Creates null, parents selected layers to it |
| layer.toggle3D | Toggle 3D Layer | Toggles 3D switch on selected layers |
| layer.freezeFrame | Freeze Frame | Creates time-remapped freeze at current time |
| layer.fitToComp | Fit Layer to Comp | Scales layer to fill composition |

### Expressions
| presetId | Label | Expression added |
|---|---|---|
| expr.wigglePosition | Wiggle Position | `wiggle(3, 20)` on Position |
| expr.loopOut | Loop Out | `loopOut("cycle")` on selected property |
| expr.timeSpeed | Time × Speed | `time * 100` on selected property |
| expr.overshoot | Overshoot Bounce | Full bounce expression on selected property |
| expr.randomOpacity | Random Opacity | `random(80, 100)` on Opacity |

### Composition
| presetId | Label | Description |
|---|---|---|
| comp.guideLayer | Create Guide Layer | New adjustment layer marked as guide |
| comp.removeEffects | Remove All Effects | Removes all effects from selected layers |
| comp.duplicateComp | Duplicate Comp | Duplicates currently active composition |
| comp.collectFiles | Collect to Folder | Runs Collect Files to a chosen directory |
| comp.toggleMotionBlur | Toggle Motion Blur | Toggles motion blur on selected layers |

---

## UI Components

### File structure

```
src/
  types/macro.types.ts                     ← add AE_COMMAND + union type
  components/MacroSettings/
    AeCommandSettings.tsx                  ← main settings component (tabbed)
    ae/
      AeShortcutPicker.tsx                 ← Shortcuts tab
      AeScriptEditor.tsx                   ← Scripts tab (preset + custom)
      aeShortcuts.ts                       ← shortcut data table
      aePresets.ts                         ← preset JSX strings + metadata
  components/MacroList/
    MacroTypeCard.tsx                      ← add AE_COMMAND card entry
electron/
  ipc/
    macro.ipc.ts                           ← add AE_COMMAND case
    ae.ipc.ts                              ← new: AE path detect + JSX execute
  preload.ts                               ← expose ae:execute, ae:detect
```

### AeCommandSettings layout

```
[Tab: Shortcuts]  [Tab: Scripts]
──────────────────────────────────────

── Shortcuts tab ──
Dropdown: Category
  ↳ List of actions in selected category
    (click row to select)
Preview text: "Will send: Ctrl+Shift+X"

── Scripts tab ──
Radio: [● Preset]  [○ Custom]

If Preset selected:
  Dropdown: Category → Dropdown: Script name
  Description text for selected preset
  [Test Script] button

If Custom selected:
  Textarea: JSX code (free input)
  [Test Script] button
```

### MacroTypeCard entry

```typescript
{
  type: 'AE_COMMAND',
  label: 'After Effects',
  color: '#9999FF',   // AE brand purple
  icon: 'Ae',         // text icon or SVG
}
```

---

## IPC Channels

### ae.ipc.ts (new)

| Channel | Input | Output |
|---|---|---|
| `ae:detect` | — | `{ found: boolean, path: string \| null }` |
| `ae:execute` | `{ script: string }` | `{ success: boolean, error?: string }` |

### macro.ipc.ts (updated)

Add `AE_COMMAND` case in `executeMacro()`:
- If `mode === 'shortcut'`: resolve key combo → call `executeHotkey()`
- If `mode === 'script'`: call `ae:execute` handler inline

---

## Error Handling

| Scenario | Behavior |
|---|---|
| AE not installed | Warning badge in settings, Test Script disabled |
| AE installed but not running | Error notification: "After Effects is not open" |
| JSX script syntax error | AE shows its own error dialog; MacroDeck shows generic fail notification |
| Shortcut sent while AE not focused | Shortcut goes to wrong window — user responsibility to focus AE first |

---

## Out of Scope

- Dial/rotary controls (planned for later hardware)
- Real-time AE state readback (e.g. current frame number display)
- CEP extension installation
- Script history or undo
