import { describe, it, expect } from 'vitest';
import { diffBootReports } from './boot-report';

const report = (mod: number, ...keys: number[]): Uint8Array => {
  const r = new Uint8Array(8);
  r[0] = mod;
  keys.slice(0, 6).forEach((k, i) => { r[2 + i] = k; });
  return r;
};

describe('diffBootReports', () => {
  it('emits down for a newly pressed key', () => {
    expect(diffBootReports(null, report(0, 0x04))).toEqual([
      { code: 'KeyA', state: 'down', usage: 0x04 },
    ]);
  });

  it('emits up when a key is released', () => {
    expect(diffBootReports(report(0, 0x04), report(0))).toEqual([
      { code: 'KeyA', state: 'up', usage: 0x04 },
    ]);
  });

  it('emits nothing when the report is unchanged', () => {
    expect(diffBootReports(report(0, 0x04), report(0, 0x04))).toEqual([]);
  });

  it('handles modifier press and release', () => {
    expect(diffBootReports(report(0x00), report(0x02))).toEqual([
      { code: 'ShiftLeft', state: 'down', usage: -1 },
    ]);
    expect(diffBootReports(report(0x02), report(0x00))).toEqual([
      { code: 'ShiftLeft', state: 'up', usage: -1 },
    ]);
  });

  it('ignores rollover/error codes (<= 0x03)', () => {
    expect(diffBootReports(null, report(0, 0x01))).toEqual([]);
  });

  it('reports multiple simultaneous new keys', () => {
    const deltas = diffBootReports(null, report(0, 0x04, 0x05));
    expect(deltas).toContainEqual({ code: 'KeyA', state: 'down', usage: 0x04 });
    expect(deltas).toContainEqual({ code: 'KeyB', state: 'down', usage: 0x05 });
    expect(deltas).toHaveLength(2);
  });

  it('treats a key moving slots as no change', () => {
    expect(diffBootReports(report(0, 0x04, 0x00), report(0, 0x00, 0x04))).toEqual([]);
  });
});
