# AE Panel — In-Panel Script List & Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the saved-script library inside the AE CEP panel and let the user click to run each script, without opening the MacroDeck app.

**Architecture:** MacroDeck (Electron main) writes the saved-script library to a single JSON file (`library.json`) in the existing bridge dir whenever the library changes and once at startup. The resident CEP panel reads that file every ~1s, renders each script as a button, and runs it in-process via the existing `MacroDeckRunner` (`cs.evalScript`) with no window activation. One-way data flow (MacroDeck writes, panel reads) — no sync conflicts.

**Tech Stack:** Electron main (TypeScript), Node `fs`, CEP panel (vanilla JS + CSInterface), Vitest.

Reference spec: `docs/superpowers/specs/2026-07-20-ae-panel-script-list-design.md`

---

## File Structure

- **Modify** `electron/ipc/ae-bridge.ts` — add `libraryPath()` and `writeLibrary()` (pure file protocol, sits next to existing request/response/heartbeat helpers).
- **Modify** `electron/ipc/ae-bridge.test.ts` — add tests for the two new functions.
- **Modify** `electron/main.ts` — call `writeLibrary` in the `store:saveAeScripts` handler and once at startup.
- **Modify** `ae-panel/index.html` — add the script-list container and result line + styling.
- **Modify** `ae-panel/js/main.js` — add the library read loop, render, and click-to-run.

No new files. No changes to the macro-key path, request/response bridge, install/uninstall, presets, or the MacroDeck-app Saved Scripts UI.

---

## Task 1: `libraryPath()` + `writeLibrary()` in the bridge module

**Files:**
- Modify: `electron/ipc/ae-bridge.ts`
- Test: `electron/ipc/ae-bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `electron/ipc/ae-bridge.test.ts`. First extend the import at the top of the file (currently lines 5-13) to include the two new names:

```typescript
import {
  bridgeDir,
  requestPath,
  responsePath,
  heartbeatPath,
  genRequestId,
  writeRequest,
  readResponse,
  libraryPath,
  writeLibrary,
} from './ae-bridge';
```

Then append this block at the end of the file:

```typescript
describe('libraryPath', () => {
  it('places library.json under macrodeck/ae_bridge in tmp', () => {
    const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
    expect(libraryPath()).toBe(path.join(dir, 'library.json'));
  });
});

describe('writeLibrary', () => {
  const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  beforeEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('writes id/name/jsx and strips store-only fields', () => {
    writeLibrary([
      { id: 'a1', name: 'Expr One', jsx: 'alert(1);', createdAt: 5, updatedAt: 9 } as any,
    ]);
    const raw = JSON.parse(fs.readFileSync(libraryPath(), 'utf8'));
    expect(raw).toEqual([{ id: 'a1', name: 'Expr One', jsx: 'alert(1);' }]);
  });

  it('writes an empty array without throwing', () => {
    expect(() => writeLibrary([])).not.toThrow();
    const raw = JSON.parse(fs.readFileSync(libraryPath(), 'utf8'));
    expect(raw).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: FAIL — `libraryPath`/`writeLibrary` are not exported (import error / undefined).

- [ ] **Step 3: Implement the two functions**

In `electron/ipc/ae-bridge.ts`, add `libraryPath` next to the existing path helpers (after `heartbeatPath`, currently line 12):

```typescript
export function libraryPath(): string { return path.join(bridgeDir(), 'library.json'); }
```

Then add `writeLibrary` in the "Request / Response IO" section (after `writeRequest`, currently ends line 40):

```typescript
// Writes the saved-script library for the AE panel to read. Slimmed to
// { id, name, jsx } so the panel never depends on store-only fields
// (createdAt/updatedAt). One-way: MacroDeck writes, the panel reads.
export function writeLibrary(
  scripts: Array<{ id: string; name: string; jsx: string }>,
): void {
  ensureBridgeDir();
  const slim = scripts.map(s => ({ id: s.id, name: s.name, jsx: s.jsx }));
  fs.writeFileSync(libraryPath(), JSON.stringify(slim), 'utf8');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: PASS (all bridge tests including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae-bridge.ts electron/ipc/ae-bridge.test.ts
git commit -m "feat: add writeLibrary/libraryPath to AE bridge"
```

---

## Task 2: MacroDeck writes `library.json` on save and at startup

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Import `writeLibrary`**

At the top of `electron/main.ts`, add a named import. There is currently no import from `ae-bridge`; add this line after the existing `registerAeIpc` import (line 10):

```typescript
import { writeLibrary } from './ipc/ae-bridge';
```

- [ ] **Step 2: Add a safe write helper**

In `electron/main.ts`, add a small wrapper near the top-level functions (e.g. just after the `store` definition block, around line 30) so a write failure never crashes a handler:

```typescript
function syncAeLibrary(): void {
  try {
    writeLibrary(store.get('aeScripts', []));
  } catch (e) {
    console.error('[main] writeLibrary failed:', e);
  }
}
```

- [ ] **Step 3: Call it from the save handler and at startup**

In the `store:saveAeScripts` handler (currently lines 184-187), add the sync call after `store.set`:

```typescript
  ipcMain.handle('store:saveAeScripts', (_event, scripts) => {
    store.set('aeScripts', scripts);
    syncAeLibrary();
    return true;
  });
```

In `app.whenReady().then(...)`, after `registerAeIpc();` (currently line 237), add a startup write so the panel has data even if the user changes nothing this session:

```typescript
  registerAeIpc();
  syncAeLibrary();
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: sync AE saved-script library to bridge file on save and startup"
```

---

## Task 3: Panel HTML — script list + result line

**Files:**
- Modify: `ae-panel/index.html`

- [ ] **Step 1: Add container markup and styles**

Replace the entire contents of `ae-panel/index.html` with:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: -apple-system, "Segoe UI", sans-serif;
      background: #1e1e1e; color: #ddd; margin: 0; padding: 12px;
      font-size: 12px; user-select: none;
    }
    h1 { font-size: 13px; margin: 0 0 8px; color: #fff; }
    #status { color: #6bcf63; }
    #last { color: #888; margin-top: 4px; font-size: 11px; }
    #scripts { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
    .script-btn {
      display: block; width: 100%; text-align: left; cursor: pointer;
      background: #2a2a2a; color: #eee; border: 1px solid #3a3a3a;
      border-radius: 6px; padding: 7px 9px; font-size: 12px;
      font-family: inherit;
    }
    .script-btn:hover { background: #333; border-color: #4a4a4a; }
    .script-btn:active { background: #3a3a3a; }
    #empty { color: #777; margin-top: 10px; font-size: 11px; line-height: 1.4; }
    #runResult { margin-top: 8px; font-size: 11px; min-height: 14px; }
    #runResult.ok { color: #6bcf63; }
    #runResult.err { color: #e06c6c; }
  </style>
</head>
<body>
  <h1>MacroDeck</h1>
  <div id="status">Starting…</div>
  <div id="last"></div>
  <div id="scripts"></div>
  <div id="empty"></div>
  <div id="runResult"></div>
  <script src="./js/CSInterface.js"></script>
  <script src="./js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add ae-panel/index.html
git commit -m "feat: add script-list container to AE panel markup"
```

---

## Task 4: Panel JS — read library, render buttons, run on click

**Files:**
- Modify: `ae-panel/js/main.js`

- [ ] **Step 1: Add library path + new DOM refs**

In `ae-panel/js/main.js`, add the library path next to the other bridge paths (after `heartbeatPath`, currently line 24):

```javascript
  var libraryPath = path.join(bridgeDir, 'library.json');
```

Add DOM refs next to the existing `statusEl` / `lastEl` (currently lines 26-27):

```javascript
  var scriptsEl = document.getElementById('scripts');
  var emptyEl = document.getElementById('empty');
  var runResultEl = document.getElementById('runResult');
```

Add a cache var next to `lastHandledId` (currently line 29):

```javascript
  var lastLibraryRaw = null;
```

- [ ] **Step 2: Add run + render + refresh functions**

Insert these functions before the `poll` function (currently line 68):

```javascript
  function setRunResult(ok, text) {
    if (!runResultEl) return;
    runResultEl.className = ok ? 'ok' : 'err';
    runResultEl.textContent = (ok ? '✓ ' : '✗ ') + text;
  }

  // Run a saved script IN-PROCESS. The panel lives inside AE, so it calls
  // MacroDeckRunner directly — no request.json round-trip (that path only
  // exists because MacroDeck runs in a separate process). No window activation.
  function runScript(name, jsx) {
    cs.evalScript('MacroDeckRunner(' + JSON.stringify(jsx) + ')', function (result) {
      var payload;
      try {
        payload = JSON.parse(result);
      } catch (e) {
        payload = { ok: false, error: 'Panel could not parse AE result: ' + result };
      }
      if (payload && payload.ok === true) {
        setRunResult(true, name);
      } else {
        setRunResult(false, (payload && payload.error) ? payload.error : 'Unknown error');
      }
    });
  }

  function renderScripts(scripts) {
    if (!scriptsEl) return;
    scriptsEl.innerHTML = '';
    if (!scripts || scripts.length === 0) {
      if (emptyEl) emptyEl.textContent =
        'No saved scripts yet — save one in MacroDeck to see it here.';
      return;
    }
    if (emptyEl) emptyEl.textContent = '';
    for (var i = 0; i < scripts.length; i++) {
      (function (s) {
        var btn = document.createElement('button');
        btn.className = 'script-btn';
        btn.textContent = s.name;
        btn.onclick = function () { runScript(s.name, s.jsx); };
        scriptsEl.appendChild(btn);
      })(scripts[i]);
    }
  }

  // Re-read library.json; only re-render when the raw text changed so hover
  // state and focus aren't lost every tick.
  function refreshLibrary() {
    var raw;
    try {
      raw = fs.readFileSync(libraryPath, 'utf8');
    } catch (e) {
      raw = '[]'; // missing file → empty library
    }
    if (raw === lastLibraryRaw) return;
    lastLibraryRaw = raw;
    var scripts;
    try {
      scripts = JSON.parse(raw);
    } catch (e) {
      scripts = [];
    }
    renderScripts(scripts);
  }
```

- [ ] **Step 3: Start the refresh loop**

At the bottom of the IIFE, next to the existing intervals (currently lines 122-124), add an initial call and interval:

```javascript
  heartbeat();
  refreshLibrary();
  setInterval(poll, 150);
  setInterval(heartbeat, 1000);
  setInterval(refreshLibrary, 1000);
```

(The `heartbeat();` line already exists — add `refreshLibrary();` after it and the new `setInterval(refreshLibrary, 1000);` after the existing intervals.)

- [ ] **Step 4: Commit**

```bash
git add ae-panel/js/main.js
git commit -m "feat: render saved-script list in AE panel with click-to-run"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, including the new `libraryPath` / `writeLibrary` tests.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual checklist (requires real AE + installed panel)**

Do these in order and confirm each:

1. Save a script in the MacroDeck app → panel shows a new button within ~1s (no AE restart).
2. Open a composition, click the button → script runs, **AE window does NOT flicker/shrink**, panel shows `✓ <name>`.
3. Close all comps, click the button → panel shows `✗ Open a composition first.`, **AE does NOT freeze** (no modal alert).
4. Delete the script in MacroDeck → the button disappears from the panel within ~1s.
5. Quit MacroDeck → the panel still shows the last list and can still run a script.
6. With no saved scripts, panel shows "No saved scripts yet — save one in MacroDeck to see it here."

- [ ] **Step 4: Commit any doc/checklist notes if needed**

If all manual checks pass, no code change is needed. If a check fails, return to the relevant task.

---

## Self-Review Notes

- **Spec coverage:** `writeLibrary`/`libraryPath` (Task 1) ↔ spec §Changes A; main.ts save+startup writes (Task 2) ↔ spec §Changes A; panel HTML (Task 3) + JS render/run/empty-state (Task 4) ↔ spec §Changes B; automated tests (Task 1) + manual checklist (Task 5) ↔ spec §Testing.
- **Untouched, per spec §Changes C:** macro-key path, request/response bridge, heartbeat, install/uninstall, presets, `aeScriptStore`, MacroDeck Saved Scripts UI — none are modified by any task.
- **Type consistency:** `writeLibrary` accepts `{ id, name, jsx }` (superset-compatible with `AeSavedScript`, extra fields stripped); the panel reads the same three fields. `MacroDeckRunner` result shape (`{ ok, error }`) matches the existing bridge parsing in `main.js`.
- **In-process run rationale:** panel calls `MacroDeckRunner` directly (not the request.json bridge) because it runs inside AE — documented inline in Task 4 Step 2.
