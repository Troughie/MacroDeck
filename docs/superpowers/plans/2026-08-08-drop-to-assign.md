# Drop-to-Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag `.exe`, `.lnk`, or folders from the OS onto a key in KeyboardVisualizer to instantly create an `APP_LAUNCH` macro with extracted icon, then open the settings panel.

**Architecture:** HTML5 file drop handlers on each KeyCap detect OS file drags (distinct from internal dnd-kit drags via `dataTransfer.types.includes('Files')`). On drop, the renderer calls a new IPC channel `files:resolveDropped` which resolves the file to an exe path + app name + icon data URL. The renderer then creates the macro via existing `macroStore` methods and opens the settings panel.

**Tech Stack:** Electron `app.getFileIcon()`, PowerShell (resolve `.lnk`), React HTML5 drag events, Zustand macroStore, TypeScript.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `electron/ipc/files.ipc.ts` | Create | IPC handler: resolve file path, extract icon |
| `electron/main.ts` | Modify | Register `registerFilesIpc()` |
| `electron/preload.ts` | Modify | Expose `electronAPI.files.resolveDropped` |
| `src/components/KeyboardVisualizer/KeyCap.tsx` | Modify | HTML5 drag handlers + teal/amber visual states |
| `src/components/KeyboardVisualizer/KeyboardVisualizer.tsx` | Modify | Pass `onFileDrop` + `isExternalDragOver` props |
| `src/App.tsx` | Modify | `handleFileDrop`: IPC call → confirm → assignMacro → selectKey |

---

## Task 1: Create `electron/ipc/files.ipc.ts`

**Files:**
- Create: `electron/ipc/files.ipc.ts`

- [ ] **Step 1: Write the file**

```typescript
import { ipcMain, app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

export interface ResolvedFile {
  ok: boolean;
  fileType: 'exe' | 'lnk' | 'folder';
  exePath: string;
  appName: string;
  iconDataUrl: string | null;
  error?: string;
}

async function extractIcon(targetPath: string): Promise<string | null> {
  try {
    const icon = await app.getFileIcon(targetPath, { size: 'large' });
    return icon.toDataURL();
  } catch {
    return null;
  }
}

async function resolveLnk(lnkPath: string): Promise<{ targetPath: string; appName: string } | null> {
  const script = `
$sh = New-Object -ComObject WScript.Shell
$sc = $sh.CreateShortcut('${lnkPath.replace(/'/g, "''")}')
Write-Output $sc.TargetPath
`;
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true } as any
    );
    const targetPath = String(stdout).trim();
    if (!targetPath) return null;
    const appName = path.basename(lnkPath, '.lnk');
    return { targetPath, appName };
  } catch {
    return null;
  }
}

export async function resolveDroppedFile(filePath: string): Promise<ResolvedFile> {
  const ext = path.extname(filePath).toLowerCase();
  const stat = (() => { try { return fs.statSync(filePath); } catch { return null; } })();

  // Folder
  if (stat?.isDirectory()) {
    const appName = path.basename(filePath);
    const exePath = `explorer.exe`;
    const iconDataUrl = await extractIcon(filePath);
    return { ok: true, fileType: 'folder', exePath, appName, iconDataUrl };
  }

  // .exe
  if (ext === '.exe') {
    if (!stat) return { ok: false, fileType: 'exe', exePath: filePath, appName: '', iconDataUrl: null, error: 'File not found' };
    const appName = path.basename(filePath, '.exe');
    const iconDataUrl = await extractIcon(filePath);
    return { ok: true, fileType: 'exe', exePath: filePath, appName, iconDataUrl };
  }

  // .lnk
  if (ext === '.lnk') {
    const resolved = await resolveLnk(filePath);
    if (!resolved || !resolved.targetPath) {
      // Fallback: open .lnk via explorer
      const appName = path.basename(filePath, '.lnk');
      const iconDataUrl = await extractIcon(filePath);
      return { ok: true, fileType: 'lnk', exePath: filePath, appName, iconDataUrl };
    }
    const iconDataUrl = await extractIcon(resolved.targetPath);
    return { ok: true, fileType: 'lnk', exePath: resolved.targetPath, appName: resolved.appName, iconDataUrl };
  }

  return { ok: false, fileType: 'exe', exePath: '', appName: '', iconDataUrl: null, error: `Unsupported file type: ${ext || '(no extension)'}` };
}

export function registerFilesIpc(): void {
  ipcMain.handle('files:resolveDropped', async (_event, filePath: string): Promise<ResolvedFile> => {
    return resolveDroppedFile(filePath);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc/files.ipc.ts
git commit -m "feat(files): add resolveDropped IPC handler (.exe/.lnk/folder + icon)"
```

---

## Task 2: Register IPC in `electron/main.ts`

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add import after existing ipc imports**

In `electron/main.ts`, after the line:
```typescript
import { registerAeIpc } from './ipc/ae.ipc';
```
add:
```typescript
import { registerFilesIpc } from './ipc/files.ipc';
```

- [ ] **Step 2: Register in `app.whenReady()`**

In the `app.whenReady()` block, after `registerAeIpc();`, add:
```typescript
registerFilesIpc();
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat(main): register registerFilesIpc"
```

---

## Task 3: Expose API in `electron/preload.ts`

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add import type at top**

After the existing type imports block, add:
```typescript
import type { ResolvedFile } from './ipc/files.ipc';
```

- [ ] **Step 2: Add `files` namespace to `electronAPI`**

After the `ae` block (around line 81), add:
```typescript
  // ── Files (drag-drop resolution) ─────────────────────────────────────────
  files: {
    resolveDropped: (filePath: string): Promise<ResolvedFile> =>
      ipcRenderer.invoke('files:resolveDropped', filePath),
  },
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(preload): expose electronAPI.files.resolveDropped"
```

---

## Task 4: Add drop visual states to `KeyCap.tsx`

**Files:**
- Modify: `src/components/KeyboardVisualizer/KeyCap.tsx`

- [ ] **Step 1: Extend `KeyCapProps`**

Add two new props to the `KeyCapProps` interface:
```typescript
  isExternalDropTarget: boolean;  // OS file drag hovering over this key
  isExternalDropOverwrite: boolean; // key already has a macro (amber warning)
  onFileDrop: (filePath: string) => void;
```

- [ ] **Step 2: Add HTML5 drag handlers inside the component**

Inside `KeyCap`, before the `return`, add:
```typescript
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) onFileDrop((file as any).path);
    };
```

- [ ] **Step 3: Update color logic**

Replace the `bgColor`, `borderColor`, and `boxShadow` blocks with:
```typescript
    const bgColor = isPressed
      ? '#1d4ed8'
      : isExternalDropOverwrite
      ? '#3d2200'
      : isExternalDropTarget
      ? '#0d3030'
      : isDropTarget
      ? '#1e3a5f'
      : isSelected
      ? '#1e2a4a'
      : hasMacro
      ? '#1a2035'
      : '#1e1e3a';

    const borderColor = isPressed
      ? '#3b82f6'
      : isExternalDropOverwrite
      ? '#f59e0b'
      : isExternalDropTarget
      ? '#2dd4bf'
      : isDropTarget
      ? '#60a5fa'
      : isSelected
      ? '#3b82f6'
      : hasMacro
      ? 'rgba(59, 130, 246, 0.4)'
      : '#2a2a4a';

    const boxShadow = isExternalDropOverwrite
      ? '0 0 20px rgba(245, 158, 11, 0.8)'
      : isExternalDropTarget
      ? '0 0 20px rgba(45, 212, 191, 0.8)'
      : isDropTarget
      ? '0 0 20px rgba(59, 130, 246, 0.9)'
      : isPressed
      ? '0 0 16px rgba(59, 130, 246, 0.7)'
      : isSelected
      ? '0 0 12px rgba(59, 130, 246, 0.5)'
      : '0 2px 4px rgba(0,0,0,0.4)';
```

- [ ] **Step 4: Wire handlers and update drop highlight overlay**

Add `onDragOver={handleDragOver}` and `onDrop={handleDrop}` to the outer `<div>`.

Replace the existing drop target highlight `<div>` (bottom of JSX) with:
```tsx
        {/* Drop target highlight — internal dnd-kit (blue) */}
        {isDropTarget && !isExternalDropTarget && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 5,
            background: 'rgba(59, 130, 246, 0.15)',
            border: '2px dashed rgba(59, 130, 246, 0.8)',
            pointerEvents: 'none',
          }} />
        )}
        {/* External file drop highlight — teal (no macro) or amber (overwrite) */}
        {isExternalDropTarget && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 5,
            background: isExternalDropOverwrite
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(45, 212, 191, 0.15)',
            border: `2px dashed ${isExternalDropOverwrite ? 'rgba(245, 158, 11, 0.8)' : 'rgba(45, 212, 191, 0.8)'}`,
            pointerEvents: 'none',
          }} />
        )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/KeyboardVisualizer/KeyCap.tsx
git commit -m "feat(keycap): add external file drop handlers + teal/amber visual states"
```

---

## Task 5: Update `KeyboardVisualizer.tsx`

**Files:**
- Modify: `src/components/KeyboardVisualizer/KeyboardVisualizer.tsx`

- [ ] **Step 1: Add props to `KeyboardVisualizer`**

Add to the component:
```typescript
interface KeyboardVisualizerProps {
  onFileDrop: (keyCode: string, filePath: string) => void;
}

export function KeyboardVisualizer({ onFileDrop }: KeyboardVisualizerProps) {
```

- [ ] **Step 2: Add external drag-over tracking state**

Inside `KeyboardVisualizer`, add:
```typescript
  const [externalDragOverKey, setExternalDragOverKey] = React.useState<string | null>(null);
```

- [ ] **Step 3: Update `KeyCapWrapper` props interface and component**

Replace the `KeyCapWrapperProps` interface and `KeyCapWrapper` function with:
```typescript
interface KeyCapWrapperProps {
  keyDef: KeyDef;
  isPressed: boolean;
  isSelected: boolean;
  hasMacro: boolean;
  macroName?: string;
  macroIcon?: string;
  externalDragOverKey: string | null;
  onFileDrop: (keyCode: string, filePath: string) => void;
  onClick: () => void;
}

function KeyCapWrapper({
  keyDef, isPressed, isSelected, hasMacro, macroName, macroIcon,
  externalDragOverKey, onFileDrop, onClick,
}: KeyCapWrapperProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `key-${keyDef.code}`,
    data: { keyCode: keyDef.code },
  });

  const isExternalDropTarget = externalDragOverKey === keyDef.code;

  return (
    <KeyCap
      ref={setNodeRef}
      keyDef={keyDef}
      isPressed={isPressed}
      isSelected={isSelected}
      hasMacro={hasMacro}
      macroName={macroName}
      macroIcon={macroIcon}
      isDropTarget={isOver}
      isExternalDropTarget={isExternalDropTarget}
      isExternalDropOverwrite={isExternalDropTarget && hasMacro}
      onFileDrop={(filePath) => onFileDrop(keyDef.code, filePath)}
      onClick={onClick}
    />
  );
}
```

- [ ] **Step 4: Add window-level dragenter/dragleave to track when file enters/leaves window**

Inside `KeyboardVisualizer`, add a `useEffect`:
```typescript
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
    };
    const handleDragLeave = (e: DragEvent) => {
      // Only clear if leaving the window entirely
      if (e.clientX === 0 && e.clientY === 0) setExternalDragOverKey(null);
    };
    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      // Find which key code is under cursor via data-keycode attribute
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const keyEl = el?.closest('[data-keycode]');
      const code = keyEl?.getAttribute('data-keycode') ?? null;
      setExternalDragOverKey(code);
    };
    const handleDrop = () => setExternalDragOverKey(null);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);
```

- [ ] **Step 5: Add `data-keycode` attribute to each KeyCapWrapper's outer div**

In `KeyCap.tsx`, add `data-keycode={keyDef.code}` to the outer `<div>` (only for interactive keys):
```tsx
        data-keycode={keyDef.code}
```

- [ ] **Step 6: Pass `externalDragOverKey` and `onFileDrop` to each `KeyCapWrapper`**

In the `KEYBOARD_LAYOUT.map` render, update the `KeyCapWrapper` usage:
```tsx
              <KeyCapWrapper
                key={keyDef.code}
                keyDef={keyDef}
                isPressed={pressedKeys.has(keyDef.code)}
                isSelected={selectedKeyCode === keyDef.code}
                hasMacro={!!macros[keyDef.code]}
                macroName={macros[keyDef.code]?.displayName}
                macroIcon={macros[keyDef.code]?.iconEmoji}
                externalDragOverKey={externalDragOverKey}
                onFileDrop={onFileDrop}
                onClick={() => handleKeyClick(keyDef.code)}
              />
```

- [ ] **Step 7: Commit**

```bash
git add src/components/KeyboardVisualizer/KeyboardVisualizer.tsx src/components/KeyboardVisualizer/KeyCap.tsx
git commit -m "feat(visualizer): wire external file drag tracking + data-keycode attrs"
```

---

## Task 6: Handle file drop in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `handleFileDrop` callback**

Inside `App`, add after the existing `handleDragEnd`:
```typescript
  const handleFileDrop = useCallback(async (keyCode: string, filePath: string) => {
    if (!electronAPI) return;

    // Validate extension before IPC call
    const lower = filePath.toLowerCase();
    const isFolder = !lower.includes('.');  // rough check; IPC handles stat
    const validExt = lower.endsWith('.exe') || lower.endsWith('.lnk') || isFolder;
    // Check by trying — let IPC return the error for unknown types
    // (folders don't have extensions, so we always forward)

    const resolved = await electronAPI.files.resolveDropped(filePath);

    if (!resolved.ok) {
      // Show a brief error — reuse existing notification system via macro execute? 
      // No — just alert for now, matching the keyboard dedicate pattern.
      window.alert(`Could not open file: ${resolved.error ?? 'Unknown error'}`);
      return;
    }

    // Confirm overwrite if key already has a macro
    const existing = useMacroStore.getState().getMacrosForProfile(activeProfileId)[keyCode];
    if (existing) {
      const proceed = window.confirm(
        `Key already has macro "${existing.displayName}". Replace it?`
      );
      if (!proceed) return;
    }

    // Build launch args for folder
    const launchArgs = resolved.fileType === 'folder' ? filePath : undefined;

    assignMacro(keyCode, 'APP_LAUNCH', activeProfileId);

    // updateMacro needs to run after assignMacro sets the key
    const { updateMacro } = useMacroStore.getState();
    updateMacro(activeProfileId, keyCode, {
      displayName: resolved.appName,
      iconEmoji: resolved.iconDataUrl ?? undefined,
      settings: {
        displayName: resolved.appName,
        exePath: resolved.exePath,
        appName: resolved.appName,
        iconDataUrl: resolved.iconDataUrl ?? undefined,
        ...(launchArgs ? { args: launchArgs } : {}),
      } as any,
    });

    selectKey(keyCode);
  }, [activeProfileId, assignMacro, selectKey]);
```

- [ ] **Step 2: Pass `handleFileDrop` to `KeyboardVisualizer`**

Replace the `<KeyboardVisualizer />` usage with:
```tsx
            <KeyboardVisualizer onFileDrop={handleFileDrop} />
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): handleFileDrop — resolve dropped file, assign APP_LAUNCH macro, open settings"
```

---

## Task 7: Handle folder launch in `macro.ipc.ts`

**Files:**
- Modify: `electron/ipc/macro.ipc.ts`

The `executeAppLaunch` function currently spawns `settings.exePath` directly. For folders, `exePath` is `explorer.exe` and the folder path is in `settings.args`. Update `executeAppLaunch` to pass args if present.

- [ ] **Step 1: Update `AppLaunchSettings` type to accept optional `args`**

In `src/types/macro.types.ts`, update `AppLaunchSettings`:
```typescript
export interface AppLaunchSettings extends BaseSettings {
  exePath: string;
  appName: string;
  iconPath?: string;
  iconDataUrl?: string;
  args?: string;  // optional launch argument (e.g. folder path for explorer.exe)
}
```

- [ ] **Step 2: Update `executeAppLaunch` to pass `args`**

In `electron/ipc/macro.ipc.ts`, replace `executeAppLaunch`:
```typescript
async function executeAppLaunch(settings: AppLaunchSettings): Promise<void> {
  if (!settings.exePath) throw new Error('No exe path specified');

  // For folder macros: exePath is 'explorer.exe' (always on PATH), no existence check needed.
  const isExplorer = settings.exePath.toLowerCase() === 'explorer.exe';
  if (!isExplorer && !fs.existsSync(settings.exePath)) {
    throw new Error(`App not found: ${settings.exePath}`);
  }

  const args = settings.args ? [settings.args] : [];
  const cwd = isExplorer
    ? undefined
    : require('path').dirname(settings.exePath);

  const child = spawn(settings.exePath, args, {
    detached: true,
    stdio: 'ignore',
    ...(cwd ? { cwd } : {}),
  });
  child.unref();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/macro.types.ts electron/ipc/macro.ipc.ts
git commit -m "feat(macro): support optional args in APP_LAUNCH for folder macros"
```

---

## Task 8: Manual verification checklist

- [ ] Run the app: `npm run dev`
- [ ] Drag a `.exe` file from Explorer onto an empty key → teal highlight appears → drop → settings panel opens with correct app name and icon
- [ ] Drag a `.lnk` shortcut from the desktop → same result, icon comes from the target exe
- [ ] Drag a folder → amber/teal highlight → macro created, pressing key opens Explorer at that folder
- [ ] Drag onto a key that already has a macro → amber highlight → confirm dialog appears → cancel = no change, confirm = macro replaced
- [ ] Drag a `.txt` file → `alert` shows "Unsupported file type"
- [ ] Internal dnd-kit drag (drag macro type card onto key) still works normally — no interference
- [ ] Press the newly created key while the dedicated keyboard is active → app/folder launches
