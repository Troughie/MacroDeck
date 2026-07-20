# AE Expression Library — Save, Bind & Run Custom Expressions — Design Spec

**Date:** 2026-07-20
**Branch:** feat/winusb-phase2a-usbdk
**Status:** Approved, pending implementation
**Builds on:** `2026-07-20-ae-panel-script-list-design.md` (the in-panel Saved Scripts list)

---

## Problem

MacroDeck already ships **expression presets** (Wiggle Position, Loop Out, Random
Opacity, Time × Speed) under the Preset tab — one click binds an expression onto a
property, no Alt+click on the stopwatch needed. But the user cannot **save their own**
expressions. They want a custom-expression library that mirrors Saved Scripts (JSX):
write a raw expression once, name it, and then either bind it to a macro key or run it
straight from the AE panel.

The distinction the user drew: a **JSX script** is a full program that does many things;
an **expression** is a single string applied to one property. Those are two different
things and deserve two different libraries.

## Scope (decided)

- **New Expression library**, separate from the Saved Scripts (JSX) library.
- User writes a **raw expression** (e.g. `wiggle(3, 20)`), names it, and picks a
  **target** property. Saving stores `{ id, name, expression, target }`.
- **Target** is one of: `selected` (the property currently selected in the timeline) or
  one of five Transform properties — `position`, `scale`, `rotation`, `opacity`,
  `anchorPoint`.
- A saved expression can be **bound to a macro key** and **run from the AE panel** — both
  reuse the existing execution paths.
- Built-in expression presets **stay where they are** (Preset tab). They are not moved
  and are **not** shown in the panel.

## Non-goals

- Moving or changing the existing built-in expression presets.
- Showing presets (of any kind) in the AE panel — the panel shows only user-saved items.
- A visual expression builder / picker of arbitrary nested property paths. Target is the
  selected property or one of the five Transform properties, nothing deeper this pass.
- Two-way sync or editing expressions from inside the panel (same stance as Saved
  Scripts — edit in the MacroDeck app).

---

## Key insight

Every existing execution path — the macro-key handler (`macro.ipc.ts`) and the CEP panel
(`evalScript`) — consumes **plain JSX**. So if MacroDeck **compiles an expression into
JSX** at the boundary, both paths reuse their existing machinery unchanged. The panel
never needs to know what an "expression" is; it just runs pre-compiled JSX exactly like a
Saved Script.

`compileExpression(expression, target)` is a **pure function** — trivially unit-tested
without AE, and it produces JSX shaped exactly like the current presets
(`aePresets.ts` Wiggle / Loop Out), so runtime behavior matches proven code.

---

## Architecture

```
MacroDeck (renderer)                MacroDeck (main / Electron)          AE panel
  ┌──────────────────┐              ┌───────────────────────────┐      ┌───────────────┐
  │ Expression editor │  save →      │ store 'aeExpressions'      │      │ reads         │
  │ raw expr + target │  IPC         │ [{id,name,expression,      │      │ expressions.  │
  │ name + Save/Test  │              │   target,...}]             │      │ json          │
  └──────────────────┘              │                            │      │               │
                                     │ on save/startup:           │      │ render button │
  macro key (AE_COMMAND,             │   writeExpressions():      │──────▶│ per item      │
  scriptType='expression',          │   compile each → jsx,      │ file │               │
  expressionId) ─────────┐          │   write {id,name,jsx}      │      │ click:        │
                          │          │                            │      │  evalScript(  │
                          ▼          │                            │      │   Runner(jsx))│
             compileExpression(expr, target) → jsx ──▶ executeAeScript(jsx)  → ✓/✗ inline│
                                     └───────────────────────────┘      └───────────────┘
```

`compileExpression()` lives in shared code imported by both the renderer (for Test) and
main (for macro-key + file writing). It is the single source of truth for turning an
expression into JSX.

File location (reuses the existing bridge dir):

```
%TEMP%\macrodeck\ae_bridge\expressions.json
  [ { "id": "aeexpr_...", "name": "Subtle Wiggle", "jsx": "<compiled JSX>" }, ... ]
```

Single writer (MacroDeck), single reader (panel) — same one-way contract as
`library.json`.

---

## Components

### 1. `compileExpression()` — pure compiler

New shared module (co-located with presets, e.g.
`src/components/MacroSettings/ae/compileExpression.ts`) so both renderer and main import
the same function.

```ts
export type ExprTarget =
  | 'selected' | 'position' | 'scale' | 'rotation' | 'opacity' | 'anchorPoint';

export function compileExpression(expression: string, target: ExprTarget): string;
```

Behavior — output mirrors the existing presets:

- **Transform target** (`position`|`scale`|`rotation`|`opacity`|`anchorPoint`): iterate
  `comp.selectedLayers`, set `layer.transform.<prop>.expression = <expr>`. Guards:
  no comp → `throw new Error("Open a composition first.")`; empty selection →
  `throw new Error("Select one or more layers first.")`.
- **`selected` target**: set `comp.selectedProperties[0].expression = <expr>`. Guard:
  no property selected → `throw new Error("Select a property in the timeline first.")`.
- Wraps `app.beginUndoGroup(name)` / `app.endUndoGroup()` so one Ctrl+Z reverts it.
- The expression is embedded via `JSON.stringify(expression)` so newlines and quotes in
  the user's expression can't break the generated JSX.
- The AE property name map: `position → transform.position`, `scale → transform.scale`,
  `rotation → transform.rotation`, `opacity → transform.opacity`,
  `anchorPoint → transform.anchorPoint`.

### 2. Data model + store

**`macro.types.ts`**:

```ts
export type AeExprTarget =
  | 'selected' | 'position' | 'scale' | 'rotation' | 'opacity' | 'anchorPoint';

export interface AeSavedExpression {
  id: string;
  name: string;
  expression: string;
  target: AeExprTarget;
  createdAt: number;
  updatedAt: number;
}
```

- Add `aeExpressions: AeSavedExpression[]` to `StoreSchema` (default `[]`).
- Extend `AeCommandSettings`: `scriptType?: 'preset' | 'custom' | 'expression'` and
  `expressionId?: string`.

**`src/stores/aeExpressionStore.ts`** — mirrors `aeScriptStore.ts` exactly (load, add,
update, remove, persist via `store.saveAeExpressions`). Id prefix `aeexpr_`.

**IPC**: add `store:saveAeExpressions` / `store:loadAeExpressions` handlers, mirroring the
`aeScripts` handlers. The save handler also calls `syncAeExpressions()` (see §4).

### 3. Renderer UI — `AeScriptEditor.tsx` (Custom JSX tab)

Below the existing "Saved Scripts" block, add an **"Expressions"** block:

- **Editor row:** a textarea for the raw expression (placeholder `wiggle(3, 20)`), a name
  input, a target `<select>` (`Selected property`, `Position`, `Scale`, `Rotation`,
  `Opacity`, `Anchor Point`), a **Save** button, and a **Test** button.
- **Test:** `compileExpression(expr, target)` → `electronAPI.ae.execute(jsx)`; show ✓ / ✗
  inline using the same status pattern already in this component.
- **Saved Expressions list:** each row shows the name + a small target badge; clicking the
  name loads it back into the editor (expression + target) for editing; a trash icon
  removes it — mirrors the Saved Scripts list (`AeScriptEditor.tsx:164-195`).
- Built-in expression presets are untouched and remain on the Preset tab.

### 4. Macro-key binding — `macro.ipc.ts`

In the `AE_COMMAND` script branch (`macro.ipc.ts:646`), add a third case:

```ts
if (s.scriptType === 'expression') {
  const expr = store.get('aeExpressions', []).find(e => e.id === s.expressionId);
  if (!expr) throw new Error('Saved expression not found.');
  jsx = compileExpression(expr.expression, expr.target);
} else if (s.scriptType === 'custom') { ... } else { /* preset */ }
await executeAeScript(jsx);
```

`AeCommandSettings.tsx` gains an "Expression" source option alongside preset / custom,
listing saved expressions to pick from; selecting one stores
`{ scriptType: 'expression', expressionId }`.

### 5. Panel file + display

**`electron/ipc/ae-bridge.ts`**: add
`expressionsPath()` and `writeExpressions(items: Array<{id,name,jsx}>)` — a near-copy of
`writeLibrary`, writing `expressions.json`.

**`electron/main.ts`**: add `syncAeExpressions()` — reads `aeExpressions` from the store,
maps each through `compileExpression()`, and calls `writeExpressions()`. Wrapped in
try/catch (log, never crash), just like `syncAeLibrary()`. Called from the
`store:saveAeExpressions` handler and once at startup.

**`ae-panel/index.html` + `js/main.js`**: add an "Expressions" section below the Saved
Scripts list, reading `expressions.json` on the same ~1s interval with the same
change-detection + render-button + `evalScript` + inline ✓/✗ logic. Empty state:
"No saved expressions yet — save one in MacroDeck to see it here."

---

## Changes summary

| File | Change |
|---|---|
| `src/components/MacroSettings/ae/compileExpression.ts` | **New.** Pure `compileExpression(expr, target)`. |
| `src/types/macro.types.ts` | Add `AeExprTarget`, `AeSavedExpression`; `aeExpressions` in `StoreSchema`; extend `AeCommandSettings`. |
| `src/stores/aeExpressionStore.ts` | **New.** Mirrors `aeScriptStore`. |
| `src/components/MacroSettings/ae/AeScriptEditor.tsx` | Add Expressions editor + saved list. |
| `src/components/MacroSettings/AeCommandSettings.tsx` | Add "Expression" source option. |
| `electron/main.ts` | `store:save/loadAeExpressions` handlers; `syncAeExpressions()`; startup seed. |
| `electron/ipc/ae-bridge.ts` | `expressionsPath()`, `writeExpressions()`. |
| `electron/ipc/macro.ipc.ts` | `scriptType === 'expression'` branch. |
| `electron/preload.ts` | `saveAeExpressions` / `loadAeExpressions` bridge methods. |
| `ae-panel/index.html`, `ae-panel/js/main.js` | Expressions section + read/render/run. |

---

## Testing

### Automated (Vitest)

| Test | Verifies |
|---|---|
| `compileExpression('wiggle(3,20)', 'position')` | JSX sets `transform.position.expression`, has both layer guards, wraps undo group |
| `compileExpression(expr, 'selected')` | JSX targets `comp.selectedProperties[0]`, has the property-selected guard |
| `compileExpression` with a multi-line expression containing quotes | Embedded safely via `JSON.stringify`, output is valid (no unescaped breaks) |
| each of the 5 Transform targets | maps to the correct `transform.<prop>` path |
| `expressionsPath()` location | `%TEMP%\macrodeck\ae_bridge\expressions.json` |
| `writeExpressions` writes `[{id,name,jsx}]` | round-trips; empty array writes `[]` without throwing |
| `aeExpressionStore` add/update/remove | mirrors the `aeScriptStore` tests |

`main.js` render/run logic is verified manually (runs only inside CEP), like the Saved
Scripts list.

### Manual (requires real AE)

1. Save an expression targeting Position → select a layer, press its bound key → wiggle
   appears on Position; **AE window does not flicker/shrink**.
2. Save an expression targeting `selected` → select a property in the timeline, click its
   button in the panel → expression lands on that property.
3. Run with no comp / no selection / no property → panel shows the matching inline `✗`
   guard message, **AE does not freeze** (no modal alert).
4. Save an expression in MacroDeck → its button appears in the panel within ~1s.
5. Delete an expression in MacroDeck → its panel button disappears within ~1s.
6. Edit a saved expression (load → change → save) → macro key and panel both run the new
   version.
7. Empty library → panel shows the empty-state message.

---

## Out of scope

- Moving built-in presets, or showing any preset in the panel.
- Nested / effect property targets beyond the 5 Transform properties + selected property.
- Editing / creating expressions from inside the panel (two-way sync).
- Reordering / searching / categorizing expressions in the panel (flat list this pass).
