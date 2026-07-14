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
