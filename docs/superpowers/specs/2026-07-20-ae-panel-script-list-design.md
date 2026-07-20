# AE Panel — In-Panel Script List & Run — Design Spec

**Date:** 2026-07-20
**Branch:** feat/winusb-phase2a-usbdk
**Status:** Approved, pending implementation
**Builds on:** `2026-07-15-ae-cep-panel-design.md` (the CEP bridge panel)

---

## Problem

Saved AE scripts ("expressions") can already be stored in MacroDeck's library and bound
to macro keys. But to **run** a saved script the user must either press its bound key or
open the MacroDeck app. There is no way to see the library and run a script from **inside
After Effects** — where the user actually works.

The user wants the resident MacroDeck CEP panel (already living inside AE) to show the
saved-script library and let them click to run, so they don't have to open the MacroDeck
app just to trigger a script.

## Scope (decided)

- **Direction A — run only.** The panel lists saved scripts and runs them on click.
  Add / edit / delete of scripts stays in the MacroDeck app (not in the panel).
  Rationale: A reuses the existing bridge entirely, has near-zero sync risk, and matches
  the user's need to *run* from AE. Two-way editing (direction B) was considered and
  rejected for this pass — it introduces dual-writer sync complexity not worth it now.
- **Saved Scripts only.** The panel shows the user's custom saved-script library
  (`aeScripts` in the store). Built-in presets (Center Anchor, Wiggle, etc.) are NOT
  shown in the panel.

## Non-goals

- Editing / creating / deleting scripts from inside the panel (that's direction B).
- Showing built-in presets in the panel.
- Any change to the macro-key path, the request/response bridge, or install/uninstall.
- Two-way sync of any kind.

---

## Key insight

The CEP panel runs **inside the AE process** and can call `MacroDeckRunner(jsx)` directly
via `cs.evalScript()`. So a panel button click does NOT need the `request.json` /
`response.json` round-trip that the macro-key path uses (that round-trip exists only
because MacroDeck lives in a *separate* Electron process). The panel executes JSX
in-process, with no window activation — same as the bridge path.

The only new cross-process data flow is **one-way**: MacroDeck writes the library to a
file; the panel reads it. Single writer, single reader → no sync conflicts.

---

## Architecture

```
MacroDeck (Electron main)                    ┌──────── AE process ────────┐
  │ on library change / on startup:          │                            │
  │   write library.json                      │  panel reads library.json  │
  │   [{ id, name, jsx }, ...]                │    every ~1s               │
  │                                           │  render each script → button│
  │                                           │                            │
  │                                           │  click button:             │
  │                                           │    evalScript(              │
  │                                           │      MacroDeckRunner(jsx))  │
  │                                           │    → runs in AE, NO         │
  │                                           │      activation             │
  │                                           │    → show ✓ / ✗ inline      │
  └───────────────────────────────────────── └────────────────────────────┘
```

File location (reuses the existing bridge dir):

```
%TEMP%\macrodeck\ae_bridge\library.json
  [ { "id": "aescript_...", "name": "My Expr", "jsx": "<full JSX>" }, ... ]
```

Only MacroDeck writes it; only the panel reads it. If MacroDeck is not running, the panel
still reads the last-written file, so the list keeps working.

---

## Changes

### A. MacroDeck side — write `library.json`

**`electron/ipc/ae-bridge.ts`** (existing bridge module — app-agnostic file protocol):

```typescript
export function libraryPath(): string { return path.join(bridgeDir(), 'library.json'); }

// Writes the saved-script library for the panel to read. Strips to { id, name, jsx }
// so the panel never sees store internals (createdAt/updatedAt not needed there).
export function writeLibrary(scripts: Array<{ id: string; name: string; jsx: string }>): void {
  ensureBridgeDir();
  const slim = scripts.map(s => ({ id: s.id, name: s.name, jsx: s.jsx }));
  fs.writeFileSync(libraryPath(), JSON.stringify(slim), 'utf8');
}
```

**`electron/main.ts`**:

- In the `store:saveAeScripts` handler (currently ~line 184): after `store.set('aeScripts', scripts)`, call `writeLibrary(scripts)`. So every Save/Delete in the app refreshes the file.
- At app startup (after the store is created / window ready): call `writeLibrary(store.get('aeScripts', []))` once, so the panel has data even if the user changes nothing this session.
- `writeLibrary` is wrapped so a write failure logs and never crashes the handler (the bridge dir may not exist yet if AE was never launched — `ensureBridgeDir` handles creation).

### B. CEP panel — display + run

**`ae-panel/index.html`**: add, below the existing `#status` / `#last` lines:
- a scrollable script-list container (`#scripts`)
- an inline result line (`#runResult`) for ✓ / ✗ feedback
- minimal styling consistent with the existing dark panel (`#1e1e1e` bg)

**`ae-panel/js/main.js`**: add
- `libraryPath = path.join(bridgeDir, 'library.json')`
- a `refreshLibrary()` on a ~1s interval that reads `library.json`, and only re-renders
  when the raw text changed (avoids flicker / lost hover). Render each script as a button
  showing its `name`.
- click handler: `cs.evalScript('MacroDeckRunner(' + JSON.stringify(jsx) + ')', cb)`.
  In `cb`, parse the result (same shape as the bridge path) and set `#runResult` to
  `"✓ " + name` on ok, or `"✗ " + error` on failure. No blocking dialogs.
- empty state: if the file is missing or the array is empty, show
  "No saved scripts yet — save one in MacroDeck to see it here."

The panel reuses the existing `MacroDeckRunner` (runner.jsx) — same try/catch, so a guard
like "Open a composition first." surfaces as an inline `✗` message, never a modal
`alert` that freezes AE. (This matches the earlier fix that replaced `alert()` guards with
`throw new Error()` in the presets.)

### C. Untouched

- Macro-key execution path, `request.json` / `response.json` bridge, heartbeat,
  install / uninstall, panel-status — all unchanged.
- Built-in presets — not shown in the panel.
- `aeScriptStore` and the MacroDeck-app Saved Scripts UI — unchanged (they remain the
  place to add/edit/delete).

---

## Testing

### Automated (Vitest) — pure logic only, mock `fs`, follows `electron/ipc/*.test.ts`

| Test | Verifies |
|---|---|
| `libraryPath()` correct location | `%TEMP%\macrodeck\ae_bridge\library.json` |
| `writeLibrary` writes valid JSON | `[{id,name,jsx}]` round-trips; store-only fields stripped |
| `writeLibrary` with empty array | writes `[]`, no throw |

`main.js` runs only inside CEP, so its render/run logic is verified manually.

### Manual (requires real AE)

1. Save a script in MacroDeck → panel shows it within ~1s (no AE restart).
2. Click a script button with a comp open → runs correctly, **AE window does NOT flicker/shrink**.
3. Click a script button with NO comp open → panel shows "✗ Open a composition first", **AE does NOT freeze** (no alert).
4. Delete a script in MacroDeck → its button disappears from the panel within ~1s.
5. Quit MacroDeck → panel still shows the last-written list and can still run scripts.
6. Empty library → panel shows the empty-state message.

---

## Out of scope

- Direction B (create/edit/delete from the panel, two-way sync).
- Showing built-in presets in the panel.
- Reordering / searching / categorizing scripts in the panel (flat list this pass).
