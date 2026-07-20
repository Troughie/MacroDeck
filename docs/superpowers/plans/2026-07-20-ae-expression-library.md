# AE Expression Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save custom AE expressions (raw expression + target property), bind them to macro keys, and run them from the AE panel — reusing the existing JSX execution paths.

**Architecture:** A pure `compileExpression(expression, target)` turns a saved expression into JSX shaped exactly like the existing presets. MacroDeck compiles at the boundary, so the macro-key handler and the CEP panel both consume plain JSX unchanged. A new `aeExpressions` store mirrors `aeScripts`; MacroDeck writes pre-compiled JSX to `expressions.json` for the panel to read (one-way, single writer).

**Tech Stack:** TypeScript, Electron, React + Zustand, electron-store, Vitest (node env), vanilla JS CEP panel.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/MacroSettings/ae/compileExpression.ts` | **New.** Pure `compileExpression(expr, target)` → JSX. Single source of truth. |
| `src/components/MacroSettings/ae/compileExpression.test.ts` | **New.** Unit tests for the compiler. |
| `src/types/macro.types.ts` | Add `AeExprTarget`, `AeSavedExpression`, `aeExpressions` in `StoreSchema`, extend `AeCommandSettings`. |
| `electron/ipc/ae-bridge.ts` | Add `expressionsPath()`, `writeExpressions()`. |
| `electron/ipc/ae-bridge.test.ts` | Add tests for the two new bridge functions. |
| `electron/preload.ts` | Add `saveAeExpressions` / `loadAeExpressions` bridge methods. |
| `electron/main.ts` | Add store handlers, `syncAeExpressions()`, startup seed. |
| `electron/ipc/macro.ipc.ts` | Add `scriptType === 'expression'` branch in `AE_COMMAND`. |
| `src/stores/aeExpressionStore.ts` | **New.** Zustand store mirroring `aeScriptStore`. |
| `src/components/MacroSettings/ae/AeScriptEditor.tsx` | Add Expressions editor + saved list. |
| `src/components/MacroSettings/AeCommandSettings.tsx` | Pass expression props to editor. |
| `ae-panel/index.html` | Add `#expressions` + `#exprEmpty` sections. |
| `ae-panel/js/main.js` | Read/render/run `expressions.json`. |

**Testing note:** Vitest runs in **node** env (`vitest.config.ts`), no jsdom. Automated tests cover the pure compiler and the bridge IO (node-friendly, matching `electron/ipc/*.test.ts`). React store/UI and the CEP `main.js` are verified manually — there is no existing store/component test to mirror.

---

## Task 1: Pure `compileExpression` compiler

**Files:**
- Create: `src/components/MacroSettings/ae/compileExpression.ts`
- Test: `src/components/MacroSettings/ae/compileExpression.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/MacroSettings/ae/compileExpression.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { compileExpression } from './compileExpression';

describe('compileExpression — Transform targets', () => {
  it('position: assigns to transform.position.expression', () => {
    const jsx = compileExpression('wiggle(3, 20)', 'position');
    expect(jsx).toContain('sel[i].transform.position.expression =');
    expect(jsx).toContain('"wiggle(3, 20)"'); // embedded via JSON.stringify
  });

  it('includes both layer guards', () => {
    const jsx = compileExpression('wiggle(3, 20)', 'position');
    expect(jsx).toContain('Open a composition first.');
    expect(jsx).toContain('Select one or more layers first.');
  });

  it('wraps an undo group', () => {
    const jsx = compileExpression('wiggle(3, 20)', 'position');
    expect(jsx).toContain('app.beginUndoGroup(');
    expect(jsx).toContain('app.endUndoGroup()');
  });

  it('maps each Transform target to the correct property path', () => {
    expect(compileExpression('x', 'scale')).toContain('transform.scale.expression');
    expect(compileExpression('x', 'rotation')).toContain('transform.rotation.expression');
    expect(compileExpression('x', 'opacity')).toContain('transform.opacity.expression');
    expect(compileExpression('x', 'anchorPoint')).toContain('transform.anchorPoint.expression');
  });
});

describe('compileExpression — selected property target', () => {
  it('assigns to comp.selectedProperties[0]', () => {
    const jsx = compileExpression('loopOut("cycle")', 'selected');
    expect(jsx).toContain('comp.selectedProperties');
    expect(jsx).toContain('.expression =');
    expect(jsx).toContain('Select a property in the timeline first.');
  });
});

describe('compileExpression — safe embedding', () => {
  it('embeds a multi-line expression with quotes without breaking the JSX', () => {
    const expr = 'var s = "a\\nb";\nvalue + s';
    const jsx = compileExpression(expr, 'opacity');
    // The whole expression must appear as one JSON string literal.
    expect(jsx).toContain(JSON.stringify(expr));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/MacroSettings/ae/compileExpression.test.ts`
Expected: FAIL — "Failed to resolve import './compileExpression'" / `compileExpression is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/MacroSettings/ae/compileExpression.ts`:

```typescript
export type AeExprTarget =
  | 'selected'
  | 'position'
  | 'scale'
  | 'rotation'
  | 'opacity'
  | 'anchorPoint';

// Maps a Transform target to its ExtendScript property path under a layer.
const TRANSFORM_PATH: Record<Exclude<AeExprTarget, 'selected'>, string> = {
  position: 'transform.position',
  scale: 'transform.scale',
  rotation: 'transform.rotation',
  opacity: 'transform.opacity',
  anchorPoint: 'transform.anchorPoint',
};

// Turns a raw AE expression into JSX that applies it, shaped like the existing
// presets (aePresets.ts). The expression is embedded via JSON.stringify so
// newlines/quotes in the user's text can never break the generated script.
export function compileExpression(expression: string, target: AeExprTarget): string {
  const expr = JSON.stringify(expression);
  const undoName = JSON.stringify('Apply Expression');

  if (target === 'selected') {
    return `var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
}
var props = comp.selectedProperties;
if (!props || props.length === 0) {
  throw new Error("Select a property in the timeline first.");
}
app.beginUndoGroup(${undoName});
props[0].expression = ${expr};
app.endUndoGroup();`;
  }

  const path = TRANSFORM_PATH[target];
  return `var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
}
var sel = comp.selectedLayers;
if (sel.length === 0) {
  throw new Error("Select one or more layers first.");
}
app.beginUndoGroup(${undoName});
for (var i = 0; i < sel.length; i++) {
  sel[i].${path}.expression = ${expr};
}
app.endUndoGroup();`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/MacroSettings/ae/compileExpression.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/MacroSettings/ae/compileExpression.ts src/components/MacroSettings/ae/compileExpression.test.ts
git commit -m "feat: add pure compileExpression(expr, target) for AE expressions"
```

---

## Task 2: Data model — types + store schema + settings

**Files:**
- Modify: `src/types/macro.types.ts:68-74` (AeCommandSettings), `:173-180` (StoreSchema), after `:189` (add AeSavedExpression)

- [ ] **Step 1: Add the expression types**

`AeExprTarget` is defined canonically in the pure compiler (`compileExpression.ts`,
Task 1) — it runs first and has no React/runtime deps, so it's a safe home for the type.
`macro.types.ts` re-exports it so the rest of the app imports it from the usual type hub
without a second copy of the union. In `src/types/macro.types.ts`, after the
`AeSavedScript` interface (ends line 189), add:

```typescript
import type { AeExprTarget } from '../components/MacroSettings/ae/compileExpression';
export type { AeExprTarget };

// A user-saved custom expression, reusable across any AE macro key and the panel.
export interface AeSavedExpression {
  id: string;
  name: string;
  expression: string;   // raw expression, e.g. wiggle(3, 20)
  target: AeExprTarget;  // selected property, or a fixed Transform property
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add `aeExpressions` to StoreSchema**

In `StoreSchema` (line 173-180), add after the `aeScripts` line:

```typescript
  aeExpressions: AeSavedExpression[]; // reusable custom expression library
```

- [ ] **Step 3: Extend `AeCommandSettings`**

Replace the `scriptType` line and add `expressionId` in `AeCommandSettings` (line 68-74):

```typescript
export interface AeCommandSettings extends BaseSettings {
  mode: 'shortcut' | 'script';
  shortcutId?: string;       // used when mode === 'shortcut', e.g. 'timeline.ramPreview'
  scriptType?: 'preset' | 'custom' | 'expression'; // used when mode === 'script'
  presetId?: string;         // used when scriptType === 'preset'
  script?: string;           // used when scriptType === 'custom'
  expressionId?: string;     // used when scriptType === 'expression'
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: PASS (no output). This confirms the electron side still type-checks; the new store field is referenced next task.

- [ ] **Step 5: Commit**

```bash
git add src/types/macro.types.ts
git commit -m "feat: add AeSavedExpression type + aeExpressions store schema"
```

---

## Task 3: Bridge — `expressionsPath()` + `writeExpressions()`

**Files:**
- Modify: `electron/ipc/ae-bridge.ts:13` (add path), `:46-52` (after writeLibrary)
- Test: `electron/ipc/ae-bridge.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `electron/ipc/ae-bridge.test.ts`:

```typescript
import { expressionsPath, writeExpressions } from './ae-bridge';

describe('expressionsPath', () => {
  it('places expressions.json under macrodeck/ae_bridge in tmp', () => {
    const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
    expect(expressionsPath()).toBe(path.join(dir, 'expressions.json'));
  });
});

describe('writeExpressions', () => {
  const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  beforeEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('writes id/name/jsx entries', () => {
    writeExpressions([{ id: 'e1', name: 'Wiggle', jsx: 'sel[0]...' }]);
    const raw = JSON.parse(fs.readFileSync(expressionsPath(), 'utf8'));
    expect(raw).toEqual([{ id: 'e1', name: 'Wiggle', jsx: 'sel[0]...' }]);
  });

  it('writes an empty array without throwing', () => {
    expect(() => writeExpressions([])).not.toThrow();
    const raw = JSON.parse(fs.readFileSync(expressionsPath(), 'utf8'));
    expect(raw).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: FAIL — `expressionsPath`/`writeExpressions` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `electron/ipc/ae-bridge.ts`, add after line 13 (the `libraryPath` export):

```typescript
export function expressionsPath(): string { return path.join(bridgeDir(), 'expressions.json'); }
```

Then add after `writeLibrary` (after line 52):

```typescript
// Writes pre-compiled expression JSX for the AE panel to read. Same one-way
// contract as writeLibrary: MacroDeck writes, the panel reads.
export function writeExpressions(
  items: Array<{ id: string; name: string; jsx: string }>,
): void {
  ensureBridgeDir();
  const slim = items.map(e => ({ id: e.id, name: e.name, jsx: e.jsx }));
  fs.writeFileSync(expressionsPath(), JSON.stringify(slim), 'utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: PASS (all bridge tests, including the new ones).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae-bridge.ts electron/ipc/ae-bridge.test.ts
git commit -m "feat: add expressionsPath/writeExpressions to AE bridge"
```

---

## Task 4: Preload — expose expression store IPC

**Files:**
- Modify: `electron/preload.ts:9` (import), `:96-99` (after loadAeScripts)

- [ ] **Step 1: Add the import**

In `electron/preload.ts`, extend the type import on line 9 area to include `AeSavedExpression`:

```typescript
  AeSavedScript,
  AeSavedExpression,
```

(Add the `AeSavedExpression,` line directly below the existing `AeSavedScript,` import line.)

- [ ] **Step 2: Add the bridge methods**

In `electron/preload.ts`, after the `loadAeScripts` method (line 98-99), add:

```typescript
    saveAeExpressions: (expressions: AeSavedExpression[]): Promise<boolean> =>
      ipcRenderer.invoke('store:saveAeExpressions', expressions),
    loadAeExpressions: (): Promise<AeSavedExpression[]> =>
      ipcRenderer.invoke('store:loadAeExpressions'),
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: PASS (no output).

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose saveAeExpressions/loadAeExpressions in preload"
```

---

## Task 5: Main — store handlers + `syncAeExpressions()` + startup seed

**Files:**
- Modify: `electron/main.ts:2` (import), `:15-29` (store defaults), `syncAeLibrary` area, `store:saveAeScripts`/`loadAeScripts` area, startup seed area

- [ ] **Step 1: Import compileExpression + writeExpressions**

In `electron/main.ts`, extend the ae-bridge import (currently `import { writeLibrary } from './ipc/ae-bridge';`) to:

```typescript
import { writeLibrary, writeExpressions } from './ipc/ae-bridge';
import { compileExpression } from '../src/components/MacroSettings/ae/compileExpression';
```

- [ ] **Step 2: Add the store default**

In the `Store` defaults object (around line 27), after `aeScripts: [],` add:

```typescript
    aeExpressions: [],
```

- [ ] **Step 3: Add `syncAeExpressions()`**

In `electron/main.ts`, directly after the `syncAeLibrary()` function, add:

```typescript
// Compile each saved expression to JSX and refresh the panel's expressions.json.
// Wrapped so a write/compile failure is logged but never crashes the caller.
function syncAeExpressions(): void {
  try {
    const exprs = store.get('aeExpressions', []);
    const compiled = exprs.map(e => ({
      id: e.id,
      name: e.name,
      jsx: compileExpression(e.expression, e.target),
    }));
    writeExpressions(compiled);
  } catch (e) {
    console.error('[main] writeExpressions failed:', e);
  }
}
```

- [ ] **Step 4: Add the IPC handlers**

In `registerStoreIpc()`, after the `store:loadAeScripts` handler (line 189-191), add:

```typescript
  ipcMain.handle('store:saveAeExpressions', (_event, expressions) => {
    store.set('aeExpressions', expressions);
    syncAeExpressions();
    return true;
  });

  ipcMain.handle('store:loadAeExpressions', () => {
    return store.get('aeExpressions', []);
  });
```

- [ ] **Step 5: Seed at startup**

In `app.whenReady()`, next to the existing `syncAeLibrary();` seed call, add:

```typescript
  syncAeExpressions();
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: PASS (no output).

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire aeExpressions store handlers + expressions.json sync"
```

---

## Task 6: Macro-key execution — `scriptType === 'expression'`

**Files:**
- Modify: `electron/ipc/macro.ipc.ts:26` (import), `:644-656` (AE_COMMAND script branch)

- [ ] **Step 1: Import compileExpression**

In `electron/ipc/macro.ipc.ts`, next to the existing AE_PRESETS import (line 26), add:

```typescript
import { compileExpression } from '../../src/components/MacroSettings/ae/compileExpression';
```

- [ ] **Step 2: Add the expression branch**

In `macro.ipc.ts`, replace the script-mode resolution block (lines 644-656, the `else { ... await executeAeScript(jsx); ... }` section) so it reads:

```typescript
          } else {
            // ── Script mode: resolve JSX and run via the resident panel ────
            let jsx: string;
            if (s.scriptType === 'expression') {
              const expr = store.get('aeExpressions', []).find(e => e.id === s.expressionId);
              if (!expr) throw new Error('Saved expression not found.');
              jsx = compileExpression(expr.expression, expr.target);
            } else if (s.scriptType === 'custom') {
              if (!s.script?.trim()) throw new Error('No JSX script configured.');
              jsx = s.script;
            } else {
              // Default to 'preset' when unset, matching the settings UI default.
              const preset = AE_PRESETS.find(p => p.id === s.presetId);
              if (!preset) throw new Error(`No preset selected.`);
              jsx = preset.jsx;
            }
            await executeAeScript(jsx);
            updateNotification(id, { type: 'success', title: name || 'AE script ran', duration: 2000 });
          }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: PASS. (`store` is already in scope in this handler — it reads other `store.get` calls; if the local symbol differs, use the same store reference the surrounding handler uses.)

- [ ] **Step 4: Run the full electron test suite**

Run: `npx vitest run electron/`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/macro.ipc.ts
git commit -m "feat: run saved expression from macro key via compileExpression"
```

---

## Task 7: Renderer store — `aeExpressionStore`

**Files:**
- Create: `src/stores/aeExpressionStore.ts`

- [ ] **Step 1: Write the store (mirrors aeScriptStore)**

Create `src/stores/aeExpressionStore.ts`:

```typescript
import { create } from 'zustand';
import { AeSavedExpression, AeExprTarget } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

interface AeExpressionState {
  expressions: AeSavedExpression[];
  loaded: boolean;
  load: () => Promise<void>;
  addExpression: (name: string, expression: string, target: AeExprTarget) => AeSavedExpression;
  updateExpression: (
    id: string,
    patch: Partial<Pick<AeSavedExpression, 'name' | 'expression' | 'target'>>,
  ) => void;
  removeExpression: (id: string) => void;
}

function genId(): string {
  return `aeexpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function persist(expressions: AeSavedExpression[]): void {
  electronAPI?.store.saveAeExpressions(expressions).catch((err: unknown) =>
    console.error('[aeExpressionStore] save failed:', err));
}

export const useAeExpressionStore = create<AeExpressionState>((set, get) => ({
  expressions: [],
  loaded: false,

  load: async () => {
    try {
      const expressions = (await electronAPI?.store.loadAeExpressions()) ?? [];
      set({ expressions, loaded: true });
    } catch (err) {
      console.error('[aeExpressionStore] load failed:', err);
      set({ loaded: true });
    }
  },

  addExpression: (name, expression, target) => {
    const now = Date.now();
    const expr: AeSavedExpression = {
      id: genId(), name, expression, target, createdAt: now, updatedAt: now,
    };
    const expressions = [...get().expressions, expr];
    set({ expressions });
    persist(expressions);
    return expr;
  },

  updateExpression: (id, patch) => {
    const expressions = get().expressions.map(e =>
      e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e);
    set({ expressions });
    persist(expressions);
  },

  removeExpression: (id) => {
    const expressions = get().expressions.filter(e => e.id !== id);
    set({ expressions });
    persist(expressions);
  },
}));
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no output).

- [ ] **Step 3: Commit**

```bash
git add src/stores/aeExpressionStore.ts
git commit -m "feat: add aeExpressionStore (mirror of aeScriptStore)"
```

---

## Task 8: Renderer UI — Expressions editor in AeScriptEditor

**Files:**
- Modify: `src/components/MacroSettings/ae/AeScriptEditor.tsx`

- [ ] **Step 1: Add imports + expression state**

In `AeScriptEditor.tsx`, add to the imports at the top:

```typescript
import { useAeExpressionStore } from '../../../stores/aeExpressionStore';
import { AeExprTarget } from '../../../types/macro.types';
```

Add `Zap` to the existing `lucide-react` import (line 2), e.g. `import { Play, AlertCircle, Save, Trash2, FolderOpen, Zap } from 'lucide-react';`.

Inside the component, after the existing `useAeScriptStore` destructure (line 28), add:

```typescript
  const {
    expressions,
    loaded: exprLoaded,
    load: loadExpr,
    addExpression,
    removeExpression,
  } = useAeExpressionStore();

  const [exprText, setExprText] = useState('');
  const [exprName, setExprName] = useState('');
  const [exprTarget, setExprTarget] = useState<AeExprTarget>('selected');
  const [exprTestStatus, setExprTestStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [exprTestError, setExprTestError] = useState('');
```

- [ ] **Step 2: Load expressions on mount**

After the existing script-load `useEffect` (line 30-32), add:

```typescript
  useEffect(() => {
    if (!exprLoaded) loadExpr();
  }, [exprLoaded, loadExpr]);
```

- [ ] **Step 3: Add compile import + handlers**

Add to imports:

```typescript
import { compileExpression } from './compileExpression';
```

Inside the component, after `handleSaveToLibrary` (line 67), add:

```typescript
  const EXPR_TARGETS: { value: AeExprTarget; label: string }[] = [
    { value: 'selected', label: 'Selected property' },
    { value: 'position', label: 'Position' },
    { value: 'scale', label: 'Scale' },
    { value: 'rotation', label: 'Rotation' },
    { value: 'opacity', label: 'Opacity' },
    { value: 'anchorPoint', label: 'Anchor Point' },
  ];

  const handleSaveExpression = () => {
    const expr = exprText.trim();
    const name = exprName.trim();
    if (!expr || !name) return;
    addExpression(name, expr, exprTarget);
    setExprName('');
  };

  const handleTestExpression = async () => {
    const expr = exprText.trim();
    if (!expr) return;
    setExprTestStatus('running');
    setExprTestError('');
    try {
      const jsx = compileExpression(expr, exprTarget);
      const result = await electronAPI?.ae.execute(jsx);
      if (result?.ok) {
        setExprTestStatus('ok');
        setTimeout(() => setExprTestStatus('idle'), 2500);
      } else {
        setExprTestStatus('error');
        setExprTestError(result?.error ?? 'Unknown error');
      }
    } catch (e: any) {
      setExprTestStatus('error');
      setExprTestError(e?.message ?? 'IPC error');
    }
  };
```

- [ ] **Step 4: Render the Expressions block**

In `AeScriptEditor.tsx`, inside the `scriptType === 'custom'` branch, add the following JSX immediately after the "Saved scripts library" block (after line 195, the closing `)}` of `{scripts.length > 0 && ( ... )}`), still inside the `<>...</>` fragment:

```tsx
          {/* ── Expressions library ─────────────────────────────────────── */}
          <div className="border-t border-border pt-3 space-y-3">
            <label className="text-text-secondary text-xs font-medium flex items-center gap-1">
              <Zap size={12} />
              Expressions
            </label>

            <textarea
              className="input-field w-full text-xs font-mono resize-y"
              rows={3}
              value={exprText}
              onChange={e => setExprText(e.target.value)}
              placeholder="wiggle(3, 20)"
              spellCheck={false}
            />

            <div className="flex items-center gap-2">
              <select
                className="input-field text-xs py-1.5 flex-shrink-0"
                value={exprTarget}
                onChange={e => setExprTarget(e.target.value as AeExprTarget)}
              >
                {EXPR_TARGETS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <input
                type="text"
                className="input-field flex-1 text-xs"
                value={exprName}
                onChange={e => setExprName(e.target.value)}
                placeholder="Name this expression..."
              />
              <button
                onClick={handleSaveExpression}
                disabled={!exprText.trim() || !exprName.trim()}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
              >
                <Save size={12} />
                Save
              </button>
            </div>

            <button
              onClick={handleTestExpression}
              disabled={exprTestStatus === 'running' || !exprText.trim()}
              className="btn-secondary text-xs py-1.5 w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Play size={12} />
              {exprTestStatus === 'running' ? 'Running...' : exprTestStatus === 'ok' ? 'Success!' : 'Test Expression'}
            </button>

            {exprTestStatus === 'error' && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-xs">{exprTestError}</p>
              </div>
            )}

            {expressions.length > 0 && (
              <div className="rounded-lg border border-border overflow-y-auto max-h-48">
                {expressions.map(e => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs border-b border-border last:border-b-0 hover:bg-bg-hover group"
                  >
                    <button
                      onClick={() => { setExprText(e.expression); setExprTarget(e.target); }}
                      className="flex-1 text-left text-text-primary truncate"
                      title="Load this expression into the editor"
                    >
                      {e.name}
                    </button>
                    <span className="text-text-muted flex-shrink-0 text-[10px] uppercase tracking-wide">
                      {e.target === 'selected' ? 'selected' : e.target}
                    </span>
                    <button
                      onClick={() => removeExpression(e.id)}
                      className="text-text-muted hover:text-red-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete expression"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no output).

- [ ] **Step 6: Commit**

```bash
git add src/components/MacroSettings/ae/AeScriptEditor.tsx
git commit -m "feat: add Expressions editor + saved list to AE script editor"
```

---

## Task 9: Panel — read/render/run expressions.json

**Files:**
- Modify: `ae-panel/index.html`, `ae-panel/js/main.js`

- [ ] **Step 1: Add the panel HTML sections**

In `ae-panel/index.html`, add these elements right after the existing `<div id="empty"></div>` line:

```html
  <div id="expressionsLabel" style="display:none; margin-top:12px; color:#888; font-size:11px;">Expressions</div>
  <div id="expressions"></div>
  <div id="exprEmpty"></div>
```

- [ ] **Step 2: Add expression paths + elements in main.js**

In `ae-panel/js/main.js`, after `var libraryPath = ...` add:

```javascript
  var expressionsPath = path.join(bridgeDir, 'expressions.json');
```

After the `var runResultEl = ...` line add:

```javascript
  var expressionsEl = document.getElementById('expressions');
  var exprEmptyEl = document.getElementById('exprEmpty');
  var expressionsLabelEl = document.getElementById('expressionsLabel');
```

- [ ] **Step 3: Add the expression refresh/render (reuses runScript)**

In `ae-panel/js/main.js`, immediately after the `refreshLibrary` function (before the heartbeat section), add:

```javascript
  var lastExpressionsRaw = null;

  function renderExpressions(items) {
    if (!expressionsEl) return;
    expressionsEl.textContent = '';

    if (!items || items.length === 0) {
      if (expressionsLabelEl) expressionsLabelEl.style.display = 'none';
      if (exprEmptyEl) exprEmptyEl.textContent =
        'No saved expressions yet — save one in MacroDeck to see it here.';
      return;
    }
    if (exprEmptyEl) exprEmptyEl.textContent = '';
    if (expressionsLabelEl) expressionsLabelEl.style.display = 'block';

    for (var i = 0; i < items.length; i++) {
      (function (e) {
        var btn = document.createElement('button');
        btn.textContent = e.name || '(unnamed)';
        btn.addEventListener('click', function () {
          runScript(e.name || '(unnamed)', e.jsx != null ? e.jsx : '');
        });
        expressionsEl.appendChild(btn);
      })(items[i]);
    }
  }

  function refreshExpressions() {
    var raw;
    try {
      raw = fs.readFileSync(expressionsPath, 'utf8');
    } catch (e) {
      if (lastExpressionsRaw !== '') { lastExpressionsRaw = ''; renderExpressions([]); }
      return;
    }
    if (raw === lastExpressionsRaw) return;
    lastExpressionsRaw = raw;

    var items;
    try {
      items = JSON.parse(raw);
    } catch (e) {
      return;
    }
    renderExpressions(Array.isArray(items) ? items : []);
  }
```

- [ ] **Step 4: Style the expression buttons + call the interval**

In `ae-panel/index.html`, extend the `#scripts button` CSS selectors to also cover `#expressions button`. Change:

```css
    #scripts button {
```
to:
```css
    #scripts button, #expressions button {
```
and similarly for the `:hover` and `:active` rules (`#scripts button:hover, #expressions button:hover` / `#scripts button:active, #expressions button:active`). Also add to `#expressions`:

```css
    #expressions {
      max-height: 240px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 4px;
    }
    #exprEmpty { color: #777; font-size: 11px; margin-top: 6px; }
```

In `ae-panel/js/main.js`, at the bottom bootstrap block, add next to the existing `refreshLibrary()` calls:

```javascript
  refreshExpressions();
```
and next to `setInterval(refreshLibrary, 1000);`:

```javascript
  setInterval(refreshExpressions, 1000);
```

- [ ] **Step 5: Reinstall the panel + verify files match**

Run:
```bash
npx vitest run electron/ && npx tsc -p tsconfig.electron.json --noEmit
```
Expected: PASS (no regressions, compiles).

The panel is copied into `%APPDATA%\Adobe\CEP\extensions\com.macrodeck.panel` on install. To test the new panel, use the app's **Reinstall** button (AE Command → Scripts mode → panel status card) or restart, then re-open the panel in AE.

- [ ] **Step 6: Commit**

```bash
git add ae-panel/index.html ae-panel/js/main.js
git commit -m "feat: show + run saved expressions in the AE panel"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS — all files, including `compileExpression.test.ts` and the new bridge tests.

- [ ] **Step 2: Type-check both projects**

Run: `npx tsc --noEmit && npx tsc -p tsconfig.electron.json --noEmit`
Expected: PASS (no output from either).

- [ ] **Step 3: Manual AE checklist (requires real AE)**

Follow the spec's Manual testing section (`docs/superpowers/specs/2026-07-20-ae-expression-library-design.md`):
1. Save a Position-target expression → select a layer, press bound key → wiggle on Position, **no window flicker**.
2. Save a `selected`-target expression → select a property, click its panel button → expression lands on it.
3. Run with no comp / no layer / no property → inline `✗` guard message, **no frozen AE alert**.
4. Save in MacroDeck → panel button appears within ~1s.
5. Delete in MacroDeck → panel button disappears within ~1s.
6. Load a saved expression, edit, save → macro key + panel both run the new version.
7. Empty library → panel shows empty-state message.

- [ ] **Step 4: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "fix: address manual AE expression testing findings"
```

(Skip if no changes.)

---

## Self-Review Notes

- **Spec coverage:** compiler (Task 1), data model (Task 2), bridge file (Task 3), preload (Task 4), main sync + startup seed (Task 5), macro-key branch (Task 6), renderer store (Task 7), renderer UI (Task 8), panel display/run (Task 9), verification (Task 10). All spec §Components and §Changes-summary rows are covered.
- **Type consistency:** `AeExprTarget` is defined **once** in `compileExpression.ts`
  (Task 1) and re-exported from `macro.types.ts` (Task 2). The store/UI import it from
  `macro.types.ts`; the compiler owns the source union. No duplicate list to keep in sync.
- **Panel presets:** per the approved spec, the panel shows only user-saved expressions — no presets. Built-in presets remain solely on the Preset tab.
