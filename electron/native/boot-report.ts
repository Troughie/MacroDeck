import { hidUsageToCode, modifierBitToCode, MODIFIER_COUNT } from './hid-usage-map';

export interface KeyDelta {
  code: string;
  state: 'down' | 'up';
  usage: number; // HID usage id, or -1 for modifier-derived deltas
}

// A USB HID boot keyboard report is 8 bytes: [modifier][reserved][k0..k5].
// This derives down/up deltas by diffing the current report against the previous.
export function diffBootReports(prev: Uint8Array | null, cur: Uint8Array): KeyDelta[] {
  const deltas: KeyDelta[] = [];

  const prevMod = prev ? prev[0] : 0;
  const curMod = cur[0];
  for (let bit = 0; bit < MODIFIER_COUNT; bit++) {
    const mask = 1 << bit;
    const was = (prevMod & mask) !== 0;
    const is = (curMod & mask) !== 0;
    if (is && !was) deltas.push({ code: modifierBitToCode(bit), state: 'down', usage: -1 });
    else if (!is && was) deltas.push({ code: modifierBitToCode(bit), state: 'up', usage: -1 });
  }

  const prevKeys = keySet(prev);
  const curKeys = keySet(cur);
  for (const usage of curKeys) {
    if (!prevKeys.has(usage)) deltas.push({ code: hidUsageToCode(usage), state: 'down', usage });
  }
  for (const usage of prevKeys) {
    if (!curKeys.has(usage)) deltas.push({ code: hidUsageToCode(usage), state: 'up', usage });
  }

  return deltas;
}

function keySet(report: Uint8Array | null): Set<number> {
  const keys = new Set<number>();
  if (!report) return keys;
  // Bytes 2..7 hold up to 6 pressed usage ids. 0x00 = empty; 0x01..0x03 = error/rollover.
  for (let i = 2; i < Math.min(report.length, 8); i++) {
    const usage = report[i];
    if (usage > 0x03) keys.add(usage);
  }
  return keys;
}
