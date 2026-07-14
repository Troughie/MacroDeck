# After Effects CEP Panel Bridge — Design Spec

**Date:** 2026-07-15
**Branch:** feat/winusb-phase2a-usbdk
**Status:** Approved, pending implementation
**Supersedes execution path of:** `2026-07-14-ae-macros-design.md` (script mode only)

---

## Problem

The current AE script execution runs `AfterFX.exe -r <script>` for every script macro.
When After Effects is already running, this CLI re-activates the AE window, bringing it
to the foreground and causing a maximized/fullscreen AE window to visibly flicker and
shrink. The script still runs correctly, but the window disturbance is disruptive.

Root cause is inherent to the `-r` CLI mechanism — it hands the script to the live AE
instance *and activates its window*. There is no CLI flag to avoid activation.

## Solution

Install a **resident CEP panel inside After Effects**. The panel continuously watches a
JSON file. When MacroDeck writes a script request to that file, the panel detects it and
runs the script via `CSInterface.evalScript()` — AE executes the script **without any
window activation**.

This is the same approach used by commercial tools (After Effects Pro Toolkit, Motion
Bro, Flow) and is the standard, AE-2024-through-2026-compatible path.

## Technology decision: CEP (not UXP)

- **UXP cannot run existing `.jsx` files.** Adobe deliberately removed any `evalScript`
  equivalent from UXP for security reasons. All 15 existing ExtendScript presets would
  need a full rewrite against the UXP DOM — not a wrapper.
- **UXP for After Effects is still early** as of 2025/2026, lagging Photoshop/InDesign/
  Premiere. ExtendScript/JSX remains the official working path for AE scripting.
- **CEP is frozen but alive.** CEP 12 is the last major CEP version (security fixes
  continue). Adobe has announced **no CEP retirement date for After Effects** and
  promised developers "several years" of runway after UXP stabilizes for a given app.
- **CEP works on AE 2024 (CEP 11), 2025/2026 (CEP 12)** — covers the user's current 2024
  and any future upgrade without conflict.

**Future-proofing:** The design splits into three independent units (Bridge protocol /
CEP panel / MacroDeck client). If AE eventually forces UXP (years out), only the panel
unit needs rewriting — the file-watch protocol, MacroDeck client, and JSX presets are
reused. The same CEP + file-watch design also extends to Premiere Pro later (Premiere
CEP is supported through at least Sept 2026), sharing everything but the JSX command set.

Sources: Adobe Tech Blog (CEP 12 final), Adobe Community (no AE CEP retirement date),
Adobe UXP docs (no evalScript in UXP).

---

## Architecture

Three independent units communicating through a file-based bridge:

```
Macro key pressed (script mode)
  │
  ▼
MacroDeck (Electron main)                    ┌──────── AE process ────────┐
  │ ① write request.json                     │                            │
  │    { id, jsx, ts }                        │  ② CEP panel polls (150ms) │
  │                                           │     reads request.json     │
  │ (poll response.json for matching id)      │  ③ evalScript(jsx)         │
  │                                           │     AE runs — NO activation│
  │                                           │  ④ write response.json     │
  │                                           │     { id, ok, error, ts }  │
  ▼                                           │  (heartbeat.json every 1s) │
  ⑤ read response.json (id match)             └────────────────────────────┘
     → notification (or timeout error)
```

| Unit | Location | Responsibility |
|------|----------|----------------|
| **Bridge protocol** | `electron/ipc/ae-bridge.ts` | request/response/heartbeat JSON format + file paths. App-agnostic. |
| **CEP panel** | `ae-panel/` (installed into AE) | Poll request file, evalScript, write response + heartbeat. |
| **MacroDeck client** | `electron/ipc/ae.ipc.ts` + `ae-install.ts` | Write request, await response, timeout, install/uninstall, status. |

---

## CEP Panel structure

Lives in the repo at `ae-panel/`, bundled with MacroDeck via `extraResources`:

```
ae-panel/
  CSXS/
    manifest.xml          # panel ID, name, AE version range, permissions
  index.html              # single status line, minimal UI
  js/
    CSInterface.js        # Adobe's standard JS↔ExtendScript bridge library
    main.js               # poll loop + evalScript + write response/heartbeat
  jsx/
    runner.jsx            # MacroDeckRunner(jsxCode): wraps eval in try/catch
  .debug                  # dev only — allows unsigned panel
```

**main.js behavior:**
```
every 150ms:
  read request.json from %TEMP%\macrodeck\ae_bridge\
  if request.id !== lastHandledId:
    lastHandledId = request.id
    csInterface.evalScript('MacroDeckRunner(' + JSON.stringify(request.jsx) + ')',
      function(result) {
        write response.json = { id: request.id, ...JSON.parse(result), ts: Date.now() }
      })
  update status line: "Connected · last run HH:MM:SS"
every 1000ms:
  write heartbeat.json = { alive: true, aeVersion: <ae version>, ts: Date.now() }
```

**runner.jsx:**
```javascript
function MacroDeckRunner(jsxCode) {
  try {
    eval(jsxCode);
    return JSON.stringify({ ok: true, error: null });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.toString() });
  }
}
```

**manifest.xml** declares `HostList` for AE (`AEFT`) across CEP 11 and 12 version ranges,
extension type `Panel`, and required Node access (`cep_node`) for file I/O.

---

## Bridge protocol

### File locations

```
%TEMP%\macrodeck\ae_bridge\
  request.json     # MacroDeck writes, panel reads
  response.json    # panel writes, MacroDeck reads
  heartbeat.json   # panel writes every 1s
```

### Formats

request.json:
```json
{ "id": "req_1721030400123_a4f9", "jsx": "<full JSX code>", "ts": 1721030400123 }
```
response.json:
```json
{ "id": "req_1721030400123_a4f9", "ok": true, "error": null, "ts": 1721030400280 }
```
heartbeat.json:
```json
{ "alive": true, "aeVersion": "24.0", "ts": 1721030400500 }
```

### Why `id`

`id` (timestamp + random) pairs a request with its response. MacroDeck polls
response.json until `response.id === request.id`, preventing reads of a stale response
from a previous run.

### MacroDeck-side flow (`executeViaPanel`)

```
1. if !isPanelAlive():                         // heartbeat missing or ts older than 3s
     throw "Open the MacroDeck panel in AE first (Window → Extensions → MacroDeck)"
     // NO CLI fallback (decided)
2. id = genId(); write request.json = { id, jsx, ts: now }
3. poll response.json every 50ms, up to 5s:
     if response.id === id:
       if ok  → resolve
       else   → throw response.error           // real AE script error
4. if 5s elapse with no id match → throw "After Effects not responding (timeout)"
```

### Error handling

| Scenario | Detected by | Message |
|---|---|---|
| Panel not installed / not open | heartbeat missing or >3s old | "Open the MacroDeck panel in AE (Window → Extensions)" |
| Script syntax/runtime error | `response.ok === false` | show `response.error` |
| AE hung / busy | no id match after 5s | "After Effects not responding (timeout)" |
| Corrupt bridge file | JSON.parse throws | ignore, treat as no response, keep polling |

The 3s heartbeat threshold tolerates slow poll cycles during heavy AE renders.

---

## MacroDeck integration

### Files

```
electron/ipc/
  ae-bridge.ts        # NEW: file protocol (read/write request/response/heartbeat)
  ae-install.ts       # NEW: install/uninstall panel (registry + folder copy)
  ae.ipc.ts           # MODIFY: executeAeScript prefers panel; add install/status IPC
electron/
  preload.ts          # MODIFY: expose ae.install / ae.uninstall / ae.panelStatus
src/components/MacroSettings/
  AeCommandSettings.tsx  # MODIFY: add "AE Panel" status + Install button (Scripts tab)
ae-panel/**            # NEW: entire CEP panel
package.json           # MODIFY: add ae-panel/ to extraResources
```

### `ae-bridge.ts` exports (pure, app-agnostic — reusable for Premiere later)

```typescript
writeRequest(id: string, jsx: string): void
readResponse(): { id: string; ok: boolean; error: string | null } | null
readHeartbeat(): { alive: boolean; aeVersion?: string; ts: number } | null
isPanelAlive(): boolean            // heartbeat exists && ts within 3s
executeViaPanel(jsx: string): Promise<void>   // full flow above; throws on failure
```

### `ae.ipc.ts` execution routing

```
executeAeScript(jsx):
  if isPanelAlive():
    → executeViaPanel(jsx)          // new path, NO window activation
  else:
    → throw "Open the MacroDeck panel in AE first (Window → Extensions → MacroDeck)"
```

The old CLI helper (`spawn AfterFX.exe -r`) stays in the file but is no longer called —
retained for debugging/reference. `detectAfterEffects()` is unchanged and reused by the
installer to locate AE.

### New IPC channels

| Channel | Action | Returns |
|---|---|---|
| `ae:install` | write debug-mode registry + copy panel | `{ ok, error? }` |
| `ae:uninstall` | delete extension folder | `{ ok }` |
| `ae:panel-status` | read heartbeat + check folder | `{ installed, alive, aeVersion? }` |

`installed` = extension folder exists; `alive` = heartbeat fresh (panel running in AE).

### `ae-install.ts` logic

```
install():
  ① reg add HKCU\Software\Adobe\CSXS.11  /v PlayerDebugMode /t REG_SZ /d 1 /f
     reg add HKCU\Software\Adobe\CSXS.12  /v PlayerDebugMode /t REG_SZ /d 1 /f
     // HKCU only — no admin rights needed. Both keys cover CEP 11 (AE 2024)
     // and CEP 12 (AE 2025+).
  ② source: dev  → <repo>/ae-panel
             prod → process.resourcesPath/ae-panel
     dest: %APPDATA%\Adobe\CEP\extensions\com.macrodeck.panel\
     recursive copy, overwrite if present (supports panel upgrades)
  ③ return { ok: true }

uninstall():
  delete %APPDATA%\Adobe\CEP\extensions\com.macrodeck.panel\
  // leave registry debug mode as-is (harmless)
```

### Settings UI — "AE Panel" section (top of Scripts tab only)

Shortcut mode does not need the panel; only script mode. Three states map directly from
`ae:panel-status`:

```
alive:              ● Connected — AE 24.0
                      Scripts run instantly without window flicker

installed, !alive:  ◐ Installed but not open in AE
                      Open Window → Extensions → MacroDeck in AE.

!installed:         ○ Not installed                    [Install]
                      Install the panel so scripts run without
                      bringing AE to the foreground.
```

Poll `ae:panel-status` every ~2s while the Scripts tab is open, so the status updates
after the user launches AE or opens the panel.

---

## Testing

### Automated (Vitest) — pure logic only, mock `fs`

| Test | Verifies |
|---|---|
| `writeRequest` writes valid JSON | id, jsx, ts present; round-trips |
| `readResponse` returns null on corrupt file | invalid JSON → null, no throw |
| `readResponse` matches by id | different response.id → treated as no response |
| `isPanelAlive` honors 3s threshold | ts within 3s → true; older → false; missing → false |
| `install` builds correct dest path | `%APPDATA%\Adobe\CEP\extensions\com.macrodeck.panel` |
| `install` picks dev vs prod source | dev uses repo path, prod uses resourcesPath |

Follows the existing `electron/native/*.test.ts` pattern (temp dirs, no external deps).

### Manual (checklist — requires real AE)

1. Click Install → restart AE → panel appears under Window → Extensions
2. Open panel → MacroDeck settings show "Connected"
3. Run Center Anchor preset → script runs, **AE window does NOT flicker/shrink**
4. Close panel → settings show "Installed but not open" → key press shows correct error
5. Script with syntax error → notification shows AE error message

---

## Out of Scope

- Premiere Pro (architecture left open, but not coded this pass)
- UXP (analyzed — unsuitable for AE today; cannot run existing JSX)
- Signing the panel into a .ZXP (debug mode used instead)
- Advanced two-way communication (reading AE state back to MacroDeck) — one-way script
  execution only
- Dial/rotary controls (unchanged from prior AE spec)
