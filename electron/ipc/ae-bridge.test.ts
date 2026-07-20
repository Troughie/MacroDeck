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
  libraryPath,
  writeLibrary,
  readHeartbeat,
  isPanelAlive,
  HEARTBEAT_MAX_AGE_MS,
  executeViaPanel,
  expressionsPath,
  writeExpressions,
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
