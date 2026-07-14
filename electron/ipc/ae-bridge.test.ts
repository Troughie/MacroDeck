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
