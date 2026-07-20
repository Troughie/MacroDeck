# After Effects CEP Panel Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run AE JSX macros through a resident CEP panel via a file-watch bridge, so scripts execute without `AfterFX.exe -r` re-activating and shrinking the AE window.

**Architecture:** Three independent units. (1) A pure file-protocol module (`ae-bridge.ts`) reads/writes `request.json`/`response.json`/`heartbeat.json` in `%TEMP%\macrodeck\ae_bridge\`. (2) A resident CEP panel (`ae-panel/`) installed into AE polls the request file, runs the JSX via `CSInterface.evalScript()`, and writes a response plus a 1s heartbeat. (3) MacroDeck's client (`ae-install.ts` + modified `ae.ipc.ts`) installs the panel, checks the heartbeat, routes script execution through the bridge, and surfaces status in the Scripts UI. No CLI fallback — if the panel is not alive, script mode errors with a clear message.

**Tech Stack:** Electron main (Node `fs`/`os`/`child_process`), TypeScript, React + Tailwind renderer, Adobe CEP 11/12 (CSInterface + ExtendScript), Vitest (mock-`fs` unit tests, mirroring `electron/native/*.test.ts`).

---

## File Structure

**New files:**
- `electron/ipc/ae-bridge.ts` — Bridge protocol: paths, `writeRequest`, `readResponse`, `readHeartbeat`, `isPanelAlive`, `genRequestId`, `executeViaPanel`. App-agnostic and pure enough to unit-test with a mockable clock + `fs`.
- `electron/ipc/ae-bridge.test.ts` — Vitest for the bridge logic (temp dirs, injected clock).
- `electron/ipc/ae-install.ts` — `panelDestDir()`, `panelSourceDir()`, `install()`, `uninstall()`, `isInstalled()`, `panelStatus()`.
- `electron/ipc/ae-install.test.ts` — Vitest for path-building and dev/prod source selection.
- `ae-panel/CSXS/manifest.xml` — CEP extension manifest (AE `AEFT`, CEP 11 + 12 ranges).
- `ae-panel/index.html` — minimal status UI.
- `ae-panel/js/CSInterface.js` — Adobe's standard bridge library (vendored).
- `ae-panel/js/main.js` — poll loop, `evalScript`, response + heartbeat writer.
- `ae-panel/jsx/runner.jsx` — `MacroDeckRunner(jsxCode)` wrapper.
- `ae-panel/.debug` — allows the unsigned panel to load in debug mode.

**Modified files:**
- `electron/ipc/ae.ipc.ts` — route `executeAeScript` through the panel; add `ae:install`/`ae:uninstall`/`ae:panel-status` IPC handlers. Keep the old CLI helper (renamed) for reference, no longer called.
- `electron/preload.ts` — expose `ae.install`, `ae.uninstall`, `ae.panelStatus`.
- `src/lib/electron.ts` — (no change; `electronAPI` is a passthrough) — **not modified**.
- `src/components/MacroSettings/AeCommandSettings.tsx` — add an "AE Panel" status block above the Scripts tab content, polling `ae:panel-status` every 2s.
- `package.json` — add `ae-panel/` to `extraResources`.

**Types touched:** none new required in `src/types/macro.types.ts`. The panel-status shape is local to preload/component.

---

## Conventions (read once before starting)

- **Bridge dir:** `path.join(os.tmpdir(), 'macrodeck', 'ae_bridge')`.
- **Extension id / folder:** `com.macrodeck.panel`.
- **Dest dir:** `path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.macrodeck.panel')`.
- **Heartbeat freshness threshold:** 3000 ms.
- **Response poll:** every 50 ms, timeout 5000 ms.
- **Time injection:** `ae-bridge.ts` functions that need "now" accept an optional `now: number` parameter (default `Date.now()`), so tests pass a fixed clock without mocking globals. This mirrors how the workflow avoids `Date.now()` in pure logic.
- Run a single Vitest file with: `npx vitest run <path>`.
- Commit after every green step. Commit message convention in this repo is Conventional Commits (`feat:`, `test:`, `chore:`).

---

## Task 1: Bridge protocol — paths, ids, request/response IO

**Files:**
- Create: `electron/ipc/ae-bridge.ts`
- Test: `electron/ipc/ae-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/ipc/ae-bridge.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  bridgeDir,
  requestPath,
  responsePath,
  heartbeatPath,
  genRequestId,
  writeRequest,
  readResponse,
} from './ae-bridge';

describe('ae-bridge paths', () => {
  it('places all three files under macrodeck/ae_bridge in tmp', () => {
    const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
    expect(bridgeDir()).toBe(dir);
    expect(requestPath()).toBe(path.join(dir, 'request.json'));
    expect(responsePath()).toBe(path.join(dir, 'response.json'));
    expect(heartbeatPath()).toBe(path.join(dir, 'heartbeat.json'));
  });
});

describe('genRequestId', () => {
  it('produces unique-ish ids with the req_ prefix', () => {
    const a = genRequestId(1000);
    const b = genRequestId(1000);
    expect(a.startsWith('req_1000_')).toBe(true);
    expect(a).not.toBe(b); // random suffix differs
  });
});

describe('writeRequest / readResponse round-trip', () => {
  const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  beforeEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('writeRequest writes valid JSON with id, jsx, ts', () => {
    writeRequest('req_1_x', 'alert(1);', 1234);
    const raw = JSON.parse(fs.readFileSync(requestPath(), 'utf8'));
    expect(raw).toEqual({ id: 'req_1_x', jsx: 'alert(1);', ts: 1234 });
  });

  it('readResponse returns null when file is missing', () => {
    expect(readResponse()).toBeNull();
  });

  it('readResponse returns null on corrupt JSON', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(responsePath(), '{not json', 'utf8');
    expect(readResponse()).toBeNull();
  });

  it('readResponse parses a valid response', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(responsePath(), JSON.stringify({ id: 'req_1_x', ok: true, error: null, ts: 9 }), 'utf8');
    expect(readResponse()).toEqual({ id: 'req_1_x', ok: true, error: null, ts: 9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: FAIL — `Cannot find module './ae-bridge'`.

- [ ] **Step 3: Write minimal implementation**

Create `electron/ipc/ae-bridge.ts`:

```typescript
import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── File locations ───────────────────────────────────────────────────────────

export function bridgeDir(): string {
  return path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
}
export function requestPath(): string { return path.join(bridgeDir(), 'request.json'); }
export function responsePath(): string { return path.join(bridgeDir(), 'response.json'); }
export function heartbeatPath(): string { return path.join(bridgeDir(), 'heartbeat.json'); }

function ensureBridgeDir(): void {
  const dir = bridgeDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Ids ──────────────────────────────────────────────────────────────────────

// req_<ts>_<random>. Timestamp+random pairs a request with its response so a
// stale response.json from a previous run is never mistaken for this one.
export function genRequestId(now: number = Date.now()): string {
  const rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `req_${now}_${rand}`;
}

// ─── Request / Response IO ──────────────────────────────────────────────────────

export interface BridgeResponse {
  id: string;
  ok: boolean;
  error: string | null;
  ts?: number;
}

export function writeRequest(id: string, jsx: string, ts: number = Date.now()): void {
  ensureBridgeDir();
  fs.writeFileSync(requestPath(), JSON.stringify({ id, jsx, ts }), 'utf8');
}

export function readResponse(): BridgeResponse | null {
  try {
    const raw = fs.readFileSync(responsePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.ok === 'boolean') {
      return parsed as BridgeResponse;
    }
    return null;
  } catch {
    return null; // missing file or corrupt JSON — treat as no response
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: PASS (all cases in this file).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae-bridge.ts electron/ipc/ae-bridge.test.ts
git commit -m "feat: add AE bridge file protocol (paths, ids, request/response IO)"
```

---

## Task 2: Bridge heartbeat + liveness

**Files:**
- Modify: `electron/ipc/ae-bridge.ts`
- Test: `electron/ipc/ae-bridge.test.ts:` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `electron/ipc/ae-bridge.test.ts`:

```typescript
import { readHeartbeat, isPanelAlive, HEARTBEAT_MAX_AGE_MS } from './ae-bridge';

describe('heartbeat + liveness', () => {
  const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  beforeEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const writeHb = (ts: number, aeVersion = '24.0') => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'heartbeat.json'),
      JSON.stringify({ alive: true, aeVersion, ts }), 'utf8');
  };

  it('threshold constant is 3s', () => {
    expect(HEARTBEAT_MAX_AGE_MS).toBe(3000);
  });

  it('readHeartbeat returns null when missing', () => {
    expect(readHeartbeat()).toBeNull();
  });

  it('readHeartbeat returns null on corrupt JSON', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'heartbeat.json'), 'nope', 'utf8');
    expect(readHeartbeat()).toBeNull();
  });

  it('isPanelAlive is true when heartbeat ts is within 3s of now', () => {
    writeHb(10_000);
    expect(isPanelAlive(10_500)).toBe(true);
    expect(isPanelAlive(12_999)).toBe(true);
  });

  it('isPanelAlive is false when heartbeat is older than 3s', () => {
    writeHb(10_000);
    expect(isPanelAlive(13_001)).toBe(false);
  });

  it('isPanelAlive is false when heartbeat is missing', () => {
    expect(isPanelAlive(10_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: FAIL — `readHeartbeat`, `isPanelAlive`, `HEARTBEAT_MAX_AGE_MS` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `electron/ipc/ae-bridge.ts`:

```typescript
// ─── Heartbeat + liveness ───────────────────────────────────────────────────────

export const HEARTBEAT_MAX_AGE_MS = 3000;

export interface BridgeHeartbeat {
  alive: boolean;
  aeVersion?: string;
  ts: number;
}

export function readHeartbeat(): BridgeHeartbeat | null {
  try {
    const raw = fs.readFileSync(heartbeatPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === 'number') return parsed as BridgeHeartbeat;
    return null;
  } catch {
    return null;
  }
}

// Panel is "alive" if a heartbeat exists and its ts is within 3s of now.
// The 3s window tolerates slow poll cycles during heavy AE renders.
export function isPanelAlive(now: number = Date.now()): boolean {
  const hb = readHeartbeat();
  if (!hb) return false;
  return now - hb.ts <= HEARTBEAT_MAX_AGE_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae-bridge.ts electron/ipc/ae-bridge.test.ts
git commit -m "feat: add AE bridge heartbeat read + liveness check"
```

---

## Task 3: `executeViaPanel` — full request/response flow

**Files:**
- Modify: `electron/ipc/ae-bridge.ts`
- Test: `electron/ipc/ae-bridge.test.ts` (append)

The flow: throw if not alive → write request → poll response until id matches → resolve on `ok`, throw `error` on failure, throw timeout after 5s. To keep it testable without real time, `executeViaPanel` takes an options object with injectable `now`, `sleep`, `pollIntervalMs`, and `timeoutMs`.

- [ ] **Step 1: Write the failing test**

Append to `electron/ipc/ae-bridge.test.ts`:

```typescript
import { executeViaPanel } from './ae-bridge';

describe('executeViaPanel', () => {
  const dir = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  beforeEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const writeFreshHeartbeat = (ts: number) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'heartbeat.json'),
      JSON.stringify({ alive: true, aeVersion: '24.0', ts }), 'utf8');
  };

  it('throws a panel-not-open error when heartbeat is stale', async () => {
    await expect(executeViaPanel('alert(1);', { now: () => 100000 }))
      .rejects.toThrow(/panel/i);
  });

  it('resolves when a matching ok response appears', async () => {
    writeFreshHeartbeat(0);
    // Simulate the panel: after the request is written, drop a matching response.
    const opts = {
      now: () => 0,
      sleep: async () => {
        const reqRaw = fs.readFileSync(path.join(dir, 'request.json'), 'utf8');
        const req = JSON.parse(reqRaw);
        fs.writeFileSync(path.join(dir, 'response.json'),
          JSON.stringify({ id: req.id, ok: true, error: null, ts: 1 }), 'utf8');
      },
      pollIntervalMs: 1,
      timeoutMs: 5000,
    };
    await expect(executeViaPanel('alert(1);', opts)).resolves.toBeUndefined();
  });

  it('throws the AE error when the panel reports ok:false', async () => {
    writeFreshHeartbeat(0);
    const opts = {
      now: () => 0,
      sleep: async () => {
        const req = JSON.parse(fs.readFileSync(path.join(dir, 'request.json'), 'utf8'));
        fs.writeFileSync(path.join(dir, 'response.json'),
          JSON.stringify({ id: req.id, ok: false, error: 'undefined is not an object', ts: 1 }), 'utf8');
      },
      pollIntervalMs: 1,
      timeoutMs: 5000,
    };
    await expect(executeViaPanel('boom', opts)).rejects.toThrow(/undefined is not an object/);
  });

  it('ignores a stale response with a non-matching id then times out', async () => {
    writeFreshHeartbeat(0);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'response.json'),
      JSON.stringify({ id: 'OLD', ok: true, error: null, ts: 1 }), 'utf8');
    let clock = 0;
    const opts = {
      now: () => clock,
      sleep: async () => { clock += 1000; }, // advance time each poll, no matching response ever written
      pollIntervalMs: 1000,
      timeoutMs: 5000,
    };
    await expect(executeViaPanel('x', opts)).rejects.toThrow(/not responding|timeout/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: FAIL — `executeViaPanel` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `electron/ipc/ae-bridge.ts`:

```typescript
// ─── Full execution flow ────────────────────────────────────────────────────────

export interface ExecuteViaPanelOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const PANEL_NOT_OPEN =
  'Open the MacroDeck panel in After Effects first (Window → Extensions → MacroDeck).';

export async function executeViaPanel(jsx: string, opts: ExecuteViaPanelOptions = {}): Promise<void> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const timeoutMs = opts.timeoutMs ?? 5000;

  if (!isPanelAlive(now())) {
    throw new Error(PANEL_NOT_OPEN); // NO CLI fallback (by design)
  }

  const id = genRequestId(now());
  writeRequest(id, jsx, now());

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const res = readResponse();
    if (res && res.id === id) {
      if (res.ok) return;
      throw new Error(res.error || 'After Effects script error');
    }
    await sleep(pollIntervalMs);
  }
  throw new Error('After Effects not responding (timeout).');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ipc/ae-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae-bridge.ts electron/ipc/ae-bridge.test.ts
git commit -m "feat: add executeViaPanel request/response flow with timeout"
```

---

## Task 4: Installer — dest/source paths and status

**Files:**
- Create: `electron/ipc/ae-install.ts`
- Test: `electron/ipc/ae-install.test.ts`

`install()`/`uninstall()` do real registry + filesystem work and are covered by the manual checklist. The **pure, testable** parts are the dest/source path builders and `panelStatus()` (which composes `isInstalled()` + `isPanelAlive()`). Tests target those.

- [ ] **Step 1: Write the failing test**

Create `electron/ipc/ae-install.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { panelDestDir, panelSourceDir, EXTENSION_ID } from './ae-install';

describe('panelDestDir', () => {
  it('builds the CEP extensions path under APPDATA', () => {
    const dest = panelDestDir('C:\\Users\\me\\AppData\\Roaming');
    expect(dest).toBe(
      path.join('C:\\Users\\me\\AppData\\Roaming', 'Adobe', 'CEP', 'extensions', EXTENSION_ID),
    );
  });
  it('uses com.macrodeck.panel as the extension id', () => {
    expect(EXTENSION_ID).toBe('com.macrodeck.panel');
  });
});

describe('panelSourceDir', () => {
  it('uses the repo ae-panel folder in dev', () => {
    const src = panelSourceDir({ isPackaged: false, resourcesPath: '/ignored', appPath: '/repo' });
    expect(src).toBe(path.join('/repo', 'ae-panel'));
  });
  it('uses resourcesPath/ae-panel in prod', () => {
    const src = panelSourceDir({ isPackaged: true, resourcesPath: '/app/resources', appPath: '/x' });
    expect(src).toBe(path.join('/app/resources', 'ae-panel'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/ae-install.test.ts`
Expected: FAIL — `Cannot find module './ae-install'`.

- [ ] **Step 3: Write minimal implementation**

Create `electron/ipc/ae-install.ts`:

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { isPanelAlive, readHeartbeat } from './ae-bridge';

const execFileAsync = promisify(execFile);

export const EXTENSION_ID = 'com.macrodeck.panel';

// %APPDATA%\Adobe\CEP\extensions\com.macrodeck.panel
export function panelDestDir(appData: string | undefined = process.env.APPDATA): string {
  return path.join(appData || '', 'Adobe', 'CEP', 'extensions', EXTENSION_ID);
}

export interface SourceEnv {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string; // repo root in dev (process.cwd())
}

// dev  -> <repo>/ae-panel ; prod -> <resourcesPath>/ae-panel (from extraResources)
export function panelSourceDir(env: SourceEnv): string {
  const base = env.isPackaged ? env.resourcesPath : env.appPath;
  return path.join(base, 'ae-panel');
}

export function isInstalled(appData?: string): boolean {
  return fs.existsSync(panelDestDir(appData));
}

export interface PanelStatus {
  installed: boolean;
  alive: boolean;
  aeVersion?: string;
}

export function panelStatus(now: number = Date.now(), appData?: string): PanelStatus {
  const installed = isInstalled(appData);
  const alive = isPanelAlive(now);
  const hb = alive ? readHeartbeat() : null;
  return { installed, alive, aeVersion: hb?.aeVersion };
}

// ─── Install / uninstall (covered by manual checklist) ─────────────────────────

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

export async function install(source: SourceEnv): Promise<{ ok: boolean; error?: string }> {
  try {
    // ① Enable unsigned panels for CEP 11 (AE 2024) and CEP 12 (AE 2025+).
    //    HKCU only — no admin rights needed.
    for (const csxs of ['CSXS.11', 'CSXS.12']) {
      await execFileAsync('reg', [
        'add', `HKCU\\Software\\Adobe\\${csxs}`,
        '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f',
      ], { timeout: 5000, windowsHide: true } as any);
    }
    // ② Copy panel into the CEP extensions folder (overwrite to support upgrades).
    const src = panelSourceDir(source);
    if (!fs.existsSync(src)) return { ok: false, error: `Panel source not found: ${src}` };
    const dest = panelDestDir();
    fs.rmSync(dest, { recursive: true, force: true });
    copyDirRecursive(src, dest);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message?.slice(0, 200) ?? 'Install failed' };
  }
}

export async function uninstall(): Promise<{ ok: boolean; error?: string }> {
  try {
    fs.rmSync(panelDestDir(), { recursive: true, force: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message?.slice(0, 200) ?? 'Uninstall failed' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ipc/ae-install.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae-install.ts electron/ipc/ae-install.test.ts
git commit -m "feat: add AE panel installer (paths, status, install/uninstall)"
```

---

## Task 5: Route `executeAeScript` through the panel + new IPC channels

**Files:**
- Modify: `electron/ipc/ae.ipc.ts` (execution routing at lines ~83-123; IPC registration at ~127-141)

- [ ] **Step 1: Write the failing test**

There is no unit test for `ae.ipc.ts` execution (it depends on live AE). Instead this task is verified by (a) TypeScript compiling and (b) the existing bridge tests still passing. Confirm baseline first.

Run: `npx vitest run electron/ipc/ae-bridge.test.ts electron/ipc/ae-install.test.ts`
Expected: PASS (baseline before edit).

- [ ] **Step 2: Rename the old CLI helper and add panel routing**

In `electron/ipc/ae.ipc.ts`, add these imports near the top (after the existing `import os from 'os';`):

```typescript
import { executeViaPanel, isPanelAlive } from './ae-bridge';
import { install as installPanel, uninstall as uninstallPanel, panelStatus } from './ae-install';
```

Replace the entire `executeAeScript` function (currently lines ~83-123) with:

```typescript
// Route every script through the resident CEP panel — this runs the JSX inside
// AE with NO window activation (no flicker/shrink). If the panel is not open,
// error out with a clear message. No CLI fallback (by design).
export async function executeAeScript(jsx: string): Promise<void> {
  await executeViaPanel(jsx);
}

// Legacy CLI path (kept for reference/debugging — no longer called). Runs
// "AfterFX.exe -r <script>", which re-activates the AE window.
export async function executeAeScriptViaCli(jsx: string): Promise<void> {
  const { found, path: aePath } = await detectAfterEffects();
  if (!found || !aePath) {
    throw new Error('After Effects not found. Install AE or set the path manually.');
  }
  ensureTmpDir();
  const scriptPath = path.join(tmpDir, 'ae_current_script.jsx');
  fs.writeFileSync(scriptPath, jsx, 'utf8');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(aePath, ['-r', scriptPath], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.on('error', reject);
    child.on('spawn', () => { child.unref(); resolve(); });
  });
}
```

- [ ] **Step 3: Add the new IPC channels**

In `registerAeIpc()` (currently ends ~line 141), add these handlers alongside the existing `ae:detect` and `ae:execute`:

```typescript
  ipcMain.handle('ae:install', async (): Promise<{ ok: boolean; error?: string }> => {
    return installPanel({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: process.cwd(),
    });
  });

  ipcMain.handle('ae:uninstall', async (): Promise<{ ok: boolean; error?: string }> => {
    return uninstallPanel();
  });

  ipcMain.handle('ae:panel-status', async (): Promise<{ installed: boolean; alive: boolean; aeVersion?: string }> => {
    return panelStatus();
  });
```

Add `app` to the electron import at the top of the file. Change:

```typescript
import { ipcMain } from 'electron';
```
to:
```typescript
import { ipcMain, app } from 'electron';
```

Note: `isPanelAlive` is imported but only used indirectly via `panelStatus`; if TypeScript flags it unused, drop it from the import — keep only `executeViaPanel`.

- [ ] **Step 4: Verify build + tests**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors from `ae.ipc.ts`.

Run: `npx vitest run electron/ipc/ae-bridge.test.ts electron/ipc/ae-install.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/ae.ipc.ts
git commit -m "feat: route AE script execution through CEP panel + add install/status IPC"
```

---

## Task 6: Expose install/uninstall/panelStatus in preload

**Files:**
- Modify: `electron/preload.ts:67-73` (the `ae` block)

- [ ] **Step 1: Extend the `ae` bridge object**

In `electron/preload.ts`, replace the `ae` block (lines ~67-73) with:

```typescript
  // ── After Effects ──────────────────────────────────────────────────────────
  ae: {
    detect: (): Promise<{ found: boolean; path: string | null }> =>
      ipcRenderer.invoke('ae:detect'),
    execute: (jsx: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('ae:execute', jsx),
    install: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('ae:install'),
    uninstall: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('ae:uninstall'),
    panelStatus: (): Promise<{ installed: boolean; alive: boolean; aeVersion?: string }> =>
      ipcRenderer.invoke('ae:panel-status'),
  },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (`ElectronAPI` type auto-updates from `typeof electronAPI`.)

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: expose ae.install/uninstall/panelStatus in preload"
```

---

## Task 7: "AE Panel" status section in Scripts UI

**Files:**
- Modify: `src/components/MacroSettings/AeCommandSettings.tsx`

Show the panel status only when `settings.mode === 'script'`, above the script editor. Poll `ae:panel-status` every 2s while mounted. Three states: Connected / Installed-not-open / Not-installed (with Install button).

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/components/MacroSettings/AeCommandSettings.tsx` with:

```typescript
import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Loader2 } from 'lucide-react';
import { MacroConfig, AeCommandSettings as AeCommandSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { electronAPI } from '../../lib/electron';
import { AeShortcutPicker } from './ae/AeShortcutPicker';
import { AeScriptEditor } from './ae/AeScriptEditor';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

interface PanelStatus { installed: boolean; alive: boolean; aeVersion?: string; }

function AePanelStatus() {
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = () => {
      electronAPI?.ae.panelStatus().then((s: PanelStatus) => { if (active) setStatus(s); });
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { active = false; clearInterval(t); };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try { await electronAPI?.ae.install(); } finally { setInstalling(false); }
  };

  if (!status) return null;

  if (status.alive) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle2 size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
        <p className="text-green-300 text-xs">
          Connected{status.aeVersion ? ` — AE ${status.aeVersion}` : ''}
          <br />
          <span className="text-text-muted">Scripts run instantly without window flicker.</span>
        </p>
      </div>
    );
  }

  if (status.installed) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <CircleDashed size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-yellow-300 text-xs">
          Installed but not open in AE
          <br />
          <span className="text-text-muted">Open Window &rarr; Extensions &rarr; MacroDeck in After Effects.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-bg-hover border border-border">
      <Circle size={12} className="text-text-muted flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-text-secondary text-xs">
          Panel not installed
          <br />
          <span className="text-text-muted">Install the panel so scripts run without bringing AE to the foreground.</span>
        </p>
      </div>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 disabled:opacity-50"
      >
        {installing ? <Loader2 size={12} className="animate-spin" /> : null}
        {installing ? 'Installing...' : 'Install'}
      </button>
    </div>
  );
}

export function AeCommandSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const settings = macro.settings as AeCommandSettingsType;
  const [aeFound, setAeFound] = useState<boolean | null>(null);

  useEffect(() => {
    electronAPI?.ae.detect().then((r: any) => setAeFound(r.found));
  }, []);

  const update = (patch: Partial<AeCommandSettingsType>) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, ...patch } });
  };

  const isScriptMode = settings.mode === 'script';

  return (
    <div className="space-y-4">
      {/* AE not found warning */}
      {aeFound === false && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-300 text-xs">
            After Effects not found. Install Adobe After Effects or it must be running for scripts to work.
          </p>
        </div>
      )}

      {/* Mode tabs */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Mode</label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => update({ mode: 'shortcut' })}
            className={`flex-1 py-1.5 text-xs transition-colors ${
              settings.mode === 'shortcut'
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            Shortcuts
          </button>
          <button
            onClick={() => update({ mode: 'script' })}
            className={`flex-1 py-1.5 text-xs border-l border-border transition-colors ${
              settings.mode === 'script'
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            Scripts
          </button>
        </div>
      </div>

      {/* Panel status — script mode only */}
      {isScriptMode && <AePanelStatus />}

      {/* Tab content */}
      {settings.mode === 'shortcut' || !settings.mode ? (
        <AeShortcutPicker
          selectedId={settings.shortcutId}
          onChange={shortcutId => update({ mode: 'shortcut', shortcutId })}
        />
      ) : (
        <AeScriptEditor
          scriptType={settings.scriptType ?? 'preset'}
          presetId={settings.presetId}
          customScript={settings.script}
          onScriptTypeChange={scriptType => update({ scriptType })}
          onPresetChange={presetId => update({ scriptType: 'preset', presetId })}
          onCustomScriptChange={script => update({ scriptType: 'custom', script })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (Confirm `lucide-react` exports `CheckCircle2`, `Circle`, `CircleDashed`, `Loader2` — they are standard; if any is missing in the installed version, substitute a present icon.)

- [ ] **Step 3: Commit**

```bash
git add src/components/MacroSettings/AeCommandSettings.tsx
git commit -m "feat: add AE Panel status + Install button to Scripts tab"
```

---

## Task 8: CEP panel — runner.jsx

**Files:**
- Create: `ae-panel/jsx/runner.jsx`

- [ ] **Step 1: Write the runner**

Create `ae-panel/jsx/runner.jsx`:

```javascript
// MacroDeckRunner: evaluates JSX handed over from MacroDeck and returns a JSON
// string the panel forwards into response.json. Wrapping eval in try/catch turns
// AE script errors into a structured { ok, error } instead of a silent failure.
function MacroDeckRunner(jsxCode) {
    try {
        eval(jsxCode);
        return JSON.stringify({ ok: true, error: null });
    } catch (e) {
        return JSON.stringify({ ok: false, error: e.toString() });
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ae-panel/jsx/runner.jsx
git commit -m "feat: add MacroDeckRunner JSX wrapper for the CEP panel"
```

---

## Task 9: CEP panel — manifest, .debug, index.html

**Files:**
- Create: `ae-panel/CSXS/manifest.xml`
- Create: `ae-panel/.debug`
- Create: `ae-panel/index.html`

- [ ] **Step 1: Write the manifest**

Create `ae-panel/CSXS/manifest.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="7.0" ExtensionBundleId="com.macrodeck.panel"
    ExtensionBundleVersion="1.0.0" ExtensionBundleName="MacroDeck"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ExtensionList>
    <Extension Id="com.macrodeck.panel" Version="1.0.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[17.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="9.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.macrodeck.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/runner.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>MacroDeck</Menu>
          <Geometry>
            <Size><Height>120</Height><Width>240</Width></Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

Notes: `AEFT [17.0,99.9]` covers AE 2020 through future (CEP 11/12 hosts included — CEP version follows the host, not the manifest). `--enable-nodejs` + `--mixed-context` give `main.js` Node `fs` access for the file bridge.

- [ ] **Step 2: Write the .debug file**

Create `ae-panel/.debug`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="com.macrodeck.panel">
    <HostList>
      <Host Name="AEFT" Port="8092" />
    </HostList>
  </Extension>
</ExtensionList>
```

- [ ] **Step 3: Write index.html**

Create `ae-panel/index.html`:

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
  </style>
</head>
<body>
  <h1>MacroDeck</h1>
  <div id="status">Starting…</div>
  <div id="last"></div>
  <script src="./js/CSInterface.js"></script>
  <script src="./js/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add ae-panel/CSXS/manifest.xml ae-panel/.debug ae-panel/index.html
git commit -m "feat: add CEP panel manifest, debug config, and status UI"
```

---

## Task 10: CEP panel — CSInterface.js (vendored)

**Files:**
- Create: `ae-panel/js/CSInterface.js`

- [ ] **Step 1: Vendor Adobe's CSInterface library**

This is Adobe's standard, unmodified CEP bridge library. Fetch the official `CSInterface.js` (CEP 11 / version 11.x) from Adobe's CEP-Resources repo and save it verbatim to `ae-panel/js/CSInterface.js`.

Source (reference): `https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/CSInterface.js`

The only methods `main.js` uses are `new CSInterface()`, `csInterface.evalScript(script, callback)`, and `csInterface.getHostEnvironment()`. Do not edit the file — vendored as-is so it can be updated wholesale later.

If the plan is executed offline, request the file contents from the human rather than hand-writing it (it is ~1000 lines of Adobe code and must not be paraphrased).

- [ ] **Step 2: Commit**

```bash
git add ae-panel/js/CSInterface.js
git commit -m "chore: vendor Adobe CSInterface.js for the CEP panel"
```

---

## Task 11: CEP panel — main.js (poll loop + heartbeat)

**Files:**
- Create: `ae-panel/js/main.js`

- [ ] **Step 1: Write the poll loop**

Create `ae-panel/js/main.js`:

```javascript
/* MacroDeck CEP panel bridge.
 * Polls request.json every 150ms; when a new request id appears, runs the JSX
 * via evalScript (NO window activation) and writes response.json. Writes
 * heartbeat.json every 1000ms so MacroDeck knows the panel is alive. */
(function () {
  var cs = new CSInterface();
  var fs = require('fs');
  var os = require('os');
  var path = require('path');

  var BRIDGE_DIR = path.join(os.tmpdir(), 'macrodeck', 'ae_bridge');
  var REQUEST = path.join(BRIDGE_DIR, 'request.json');
  var RESPONSE = path.join(BRIDGE_DIR, 'response.json');
  var HEARTBEAT = path.join(BRIDGE_DIR, 'heartbeat.json');

  var statusEl = document.getElementById('status');
  var lastEl = document.getElementById('last');
  var lastHandledId = null;
  var aeVersion = '';

  try {
    var env = cs.getHostEnvironment();
    aeVersion = env && env.appVersion ? env.appVersion : '';
  } catch (e) { aeVersion = ''; }

  function ensureDir() {
    try { if (!fs.existsSync(BRIDGE_DIR)) fs.mkdirSync(BRIDGE_DIR, { recursive: true }); }
    catch (e) {}
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function nowClock() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function pollRequest() {
    try {
      var raw = fs.readFileSync(REQUEST, 'utf8');
      var req = JSON.parse(raw);
      if (req && req.id && req.id !== lastHandledId) {
        lastHandledId = req.id;
        var call = 'MacroDeckRunner(' + JSON.stringify(req.jsx) + ')';
        cs.evalScript(call, function (result) {
          var payload;
          try { payload = JSON.parse(result); }
          catch (e) { payload = { ok: false, error: 'Bad runner result: ' + result }; }
          payload.id = req.id;
          payload.ts = Date.now();
          try { fs.writeFileSync(RESPONSE, JSON.stringify(payload), 'utf8'); } catch (e) {}
          lastEl.textContent = 'last run ' + nowClock();
        });
      }
    } catch (e) {
      // no request file yet, or mid-write / corrupt — ignore, try again next tick
    }
  }

  function writeHeartbeat() {
    ensureDir();
    try {
      fs.writeFileSync(HEARTBEAT, JSON.stringify({
        alive: true, aeVersion: aeVersion, ts: Date.now(),
      }), 'utf8');
    } catch (e) {}
  }

  ensureDir();
  statusEl.textContent = 'Connected' + (aeVersion ? ' · AE ' + aeVersion : '');
  setInterval(pollRequest, 150);
  setInterval(writeHeartbeat, 1000);
  writeHeartbeat();
})();
```

- [ ] **Step 2: Commit**

```bash
git add ae-panel/js/main.js
git commit -m "feat: add CEP panel poll loop, evalScript bridge, and heartbeat"
```

---

## Task 12: Bundle the panel + full test run

**Files:**
- Modify: `package.json:92-108` (extraResources array)

- [ ] **Step 1: Add ae-panel to extraResources**

In `package.json`, add a third entry to the `extraResources` array (after the `electron/native/` entry, before the closing `]`):

```json
      {
        "from": "ae-panel/",
        "to": "ae-panel/",
        "filter": [
          "**/*"
        ]
      }
```

The full array becomes:

```json
    "extraResources": [
      {
        "from": "resources/",
        "to": "resources/",
        "filter": [ "**/*", "!*.md" ]
      },
      {
        "from": "electron/native/",
        "to": "native/",
        "filter": [ "*.cs", "*.ps1" ]
      },
      {
        "from": "ae-panel/",
        "to": "ae-panel/",
        "filter": [ "**/*" ]
      }
    ],
```

(Preserve the existing formatting of the first two entries; only add the third.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `ae-bridge.test.ts` and `ae-install.test.ts`.

- [ ] **Step 3: Typecheck the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bundle ae-panel into extraResources"
```

---

## Manual Verification Checklist (requires real After Effects)

Cannot be automated — run these after the tasks above:

1. Open MacroDeck → any AE macro → Scripts tab → status shows **○ Not installed**. Click **Install** (no admin prompt expected — HKCU only).
2. Restart After Effects. **Window → Extensions → MacroDeck** exists and opens; panel shows **Connected · AE <version>**.
3. Back in MacroDeck, Scripts tab now shows **● Connected — AE <version>** within ~2s.
4. Assign the **Center Anchor Point** preset to a key. Maximize/fullscreen AE, select a layer, press the key: the anchor centers **and the AE window does NOT flicker or shrink**.
5. Assign a **Custom JSX** with a deliberate error (e.g. `foo.bar()`). Press the key: MacroDeck notification shows the AE error message (from `response.error`).
6. Close the panel in AE (or quit AE). Within ~3s the Scripts tab shows **◐ Installed but not open**. Press an AE script key: notification says "Open the MacroDeck panel in After Effects first…".
7. `Test Script` button in the editor routes through the same path (uses `ae:execute`) — confirm it also shows Connected-path behavior with no window activation.

---

## Self-Review Notes

- **Spec coverage:** ae-bridge (T1-3), ae-install + status (T4), ae.ipc routing + 3 IPC channels (T5), preload (T6), Settings UI 3-state (T7), panel runner/manifest/debug/html/CSInterface/main (T8-11), extraResources (T12), Vitest for all pure logic (T1-4), manual checklist. All spec sections mapped.
- **Type consistency:** `panelStatus()` returns `{ installed, alive, aeVersion? }` — matches preload `ae:panel-status`, the `PanelStatus` interface in the component, and the spec's status table. `BridgeResponse` = `{ id, ok, error, ts? }` matches response.json and runner output (runner emits `{ ok, error }`, panel adds `id`+`ts`). `executeViaPanel` signature is stable across T3 (definition) and T5 (call site, called with just `jsx`).
- **No CLI fallback:** T5 `executeAeScript` calls only `executeViaPanel`; the CLI helper is renamed `executeAeScriptViaCli` and never invoked — matches the "error only, no fallback" decision.
- **`ae:execute` unchanged:** still calls `executeAeScript`, which now goes through the panel — so both the macro key path (`macro.ipc.ts:656`) and the editor Test button inherit panel routing with no extra edits.
```
