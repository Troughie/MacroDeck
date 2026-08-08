# Drop-to-Assign: Drag External Files onto Keys — Design Spec

**Date:** 2026-08-08
**Status:** Approved

---

## Overview

Allow users to drag `.exe`, `.lnk` (Windows shortcut), or folders from the desktop / Explorer directly onto a key in the KeyboardVisualizer. MacroDeck automatically creates an `APP_LAUNCH` macro with the correct exe path, app name, and extracted icon — then opens the settings panel so the user can review or rename.

This replaces the multi-step flow: click key → pick macro type → search app → configure.

---

## Supported Input Types

| Dragged item | Resolution | Macro created |
|---|---|---|
| `.lnk` (shortcut) | PowerShell resolves `TargetPath` from the shortcut | `APP_LAUNCH` with the target exe path |
| `.exe` | Used directly as the launch path | `APP_LAUNCH` with that exe path |
| Folder | Used as the path argument to `explorer.exe` | `APP_LAUNCH` launching Explorer at that folder |

URL drag from browser is out of scope — a dedicated `WEB_LINK` macro type already handles that.

---

## Architecture & Data Flow

```
OS file drag (Explorer / Desktop)
  → KeyCap: onDragOver  — highlight key, show drop indicator
  → KeyCap: onDrop      — extract event.dataTransfer.files[0].path

  → electronAPI.files.resolveDropped(filePath)
       ↓ main process (files.ipc.ts)
       - Detect type: .lnk / .exe / folder
       - .lnk  → PowerShell: resolve TargetPath + friendly name
       - .exe  → use path directly
       - folder → wrap as explorer.exe <path>
       - app.getFileIcon(path, { size: 'large' }) → NativeImage → base64
       - Return: ResolvedFile
       ↓ renderer (App.tsx: handleFileDrop)

  → If key already has a macro → window.confirm "Overwrite?"
  → assignMacro(keyCode, 'APP_LAUNCH', profileId)
  → updateMacro with full settings (exePath, appName, iconDataUrl)
  → selectKey(keyCode)  — opens MacroSettings panel
```

### ResolvedFile type

```typescript
interface ResolvedFile {
  ok: boolean;
  fileType: 'exe' | 'lnk' | 'folder';
  exePath: string;         // path to launch
  appName: string;         // display name (filename without extension)
  iconDataUrl: string | null;
  error?: string;
}
```

---

## Files Changed

### New

| File | Purpose |
|---|---|
| `electron/ipc/files.ipc.ts` | IPC handler for `files:resolveDropped` |

### Modified

| File | Change |
|---|---|
| `electron/main.ts` | Register `registerFilesIpc()` |
| `electron/preload.ts` | Expose `electronAPI.files.resolveDropped(path)` |
| `src/components/KeyboardVisualizer/KeyCap.tsx` | Add HTML5 `onDragOver` / `onDrop` handlers; external-file drop highlight (teal/amber) distinct from internal dnd-kit highlight (blue) |
| `src/components/KeyboardVisualizer/KeyboardVisualizer.tsx` | Pass `onFileDrop` callback into `KeyCapWrapper` |
| `src/App.tsx` | `handleFileDrop(keyCode, filePath)`: call IPC → confirm if key occupied → assignMacro → updateMacro → selectKey |

No new renderer files needed — `assignMacro` and `updateMacro` from `macroStore` are reused as-is.

---

## Conflict with @dnd-kit

dnd-kit tracks pointer drags that originate inside the app. HTML5 file drag from the OS fires `dragenter` / `dragover` / `drop` with `dataTransfer.types` containing `"Files"` — a completely separate event path. The two systems do not conflict. Each KeyCap checks `event.dataTransfer.types.includes('Files')` before processing to ensure only OS file drags are handled here.

---

## Visual Feedback

| State | Visual |
|---|---|
| File drag enters window | All KeyCaps show a subtle pulsing border (whole keyboard is a drop zone) |
| Hovering over a specific key (no macro) | Key highlights **teal/cyan** |
| Hovering over a key that already has a macro | Key highlights **amber** (overwrite warning) |
| Successful drop | Brief flash, then MacroSettings panel slides open |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Unsupported file type (`.txt`, `.pdf`, …) | Rejected in renderer before IPC call; toast: "Only .exe, .lnk, and folders are supported" |
| `.lnk` target does not exist | `resolveDropped` returns `ok: false`; toast shows `error` message |
| `app.getFileIcon` fails | Macro is still created with `iconDataUrl: null`; no icon shown on key |
| Key already has a macro | `window.confirm("Key [X] already has macro '[name]'. Replace it?")` — cancel = no-op |
| PowerShell resolve timeout (5 s) | Fallback: use the `.lnk` path itself with `explorer.exe` |
| UNC / network paths | Allowed; icon extraction may fail silently |

---

## Out of Scope

- URL drag from browser (WEB_LINK macro type handles this)
- Drag multiple files at once (first file only is used)
- Reordering existing macros via drag-drop
