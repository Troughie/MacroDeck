import { describe, it, expect } from 'vitest';
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  buildExportBundle,
  parseImportBundle,
} from './settings-transfer';

const SAMPLE = {
  macros: {
    'default:KeyA': { id: 'm1', keyCode: 'KeyA', type: 'HOTKEY', displayName: 'A', profileId: 'default', settings: { displayName: 'A', keys: ['KeyA'] }, createdAt: 1, updatedAt: 2 },
  },
  settings: { runOnStartup: true, startMinimized: false, theme: 'dark', _profiles: '[{"id":"default","name":"Default","color":"#3b82f6","createdAt":0}]', _activeProfileId: 'default' },
  aeScripts: [{ id: 's1', name: 'x', jsx: 'a', createdAt: 1, updatedAt: 2 }],
  aeExpressions: [{ id: 'e1', name: 'w', expression: 'wiggle(3,20)', target: 'position', createdAt: 1, updatedAt: 2 }],
} as any;

describe('buildExportBundle', () => {
  it('wraps the store data with an identifying header', () => {
    const bundle = buildExportBundle(SAMPLE, 1_700_000_000_000);
    expect(bundle.app).toBe('MacroDeck');
    expect(bundle.kind).toBe(BACKUP_KIND);
    expect(bundle.version).toBe(BACKUP_VERSION);
    expect(bundle.exportedAt).toBe(1_700_000_000_000);
  });

  it('carries macros, settings (with nested profiles), aeScripts and aeExpressions', () => {
    const bundle = buildExportBundle(SAMPLE, 0);
    expect(bundle.data.macros).toEqual(SAMPLE.macros);
    expect(bundle.data.settings._profiles).toContain('Default');
    expect(bundle.data.aeScripts).toEqual(SAMPLE.aeScripts);
    expect(bundle.data.aeExpressions).toEqual(SAMPLE.aeExpressions);
  });

  it('does not carry the machine-specific selectedDeviceId', () => {
    const bundle = buildExportBundle({ ...SAMPLE, selectedDeviceId: 'usb-123' } as any, 0);
    expect('selectedDeviceId' in bundle.data).toBe(false);
  });

  it('defaults missing collections to empty rather than undefined', () => {
    const bundle = buildExportBundle({ macros: {}, settings: SAMPLE.settings } as any, 0);
    expect(bundle.data.aeScripts).toEqual([]);
    expect(bundle.data.aeExpressions).toEqual([]);
    expect(bundle.data.macros).toEqual({});
  });
});

describe('parseImportBundle — round trip', () => {
  it('accepts a bundle produced by buildExportBundle', () => {
    const raw = JSON.stringify(buildExportBundle(SAMPLE, 0));
    const res = parseImportBundle(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.macros).toEqual(SAMPLE.macros);
      expect(res.data.aeExpressions).toEqual(SAMPLE.aeExpressions);
    }
  });
});

describe('parseImportBundle — rejects bad input', () => {
  it('rejects invalid JSON', () => {
    const res = parseImportBundle('{ not json');
    expect(res.ok).toBe(false);
  });

  it('rejects a file that is not a MacroDeck backup', () => {
    const res = parseImportBundle(JSON.stringify({ hello: 'world' }));
    expect(res.ok).toBe(false);
  });

  it('rejects the wrong kind', () => {
    const res = parseImportBundle(JSON.stringify({ app: 'MacroDeck', kind: 'something-else', version: 1, data: {} }));
    expect(res.ok).toBe(false);
  });

  it('rejects a newer major version it cannot understand', () => {
    const res = parseImportBundle(JSON.stringify({ app: 'MacroDeck', kind: BACKUP_KIND, version: BACKUP_VERSION + 1, data: { macros: {}, settings: {} } }));
    expect(res.ok).toBe(false);
  });

  it('rejects when data.macros is missing', () => {
    const res = parseImportBundle(JSON.stringify({ app: 'MacroDeck', kind: BACKUP_KIND, version: BACKUP_VERSION, data: { settings: {} } }));
    expect(res.ok).toBe(false);
  });

  it('rejects when data.macros is not an object', () => {
    const res = parseImportBundle(JSON.stringify({ app: 'MacroDeck', kind: BACKUP_KIND, version: BACKUP_VERSION, data: { macros: [], settings: {} } }));
    expect(res.ok).toBe(false);
  });
});

describe('parseImportBundle — normalizes optional collections', () => {
  it('fills missing aeScripts/aeExpressions with empty arrays', () => {
    const res = parseImportBundle(JSON.stringify({
      app: 'MacroDeck', kind: BACKUP_KIND, version: BACKUP_VERSION,
      data: { macros: {}, settings: { runOnStartup: false, startMinimized: false, theme: 'dark' } },
    }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.aeScripts).toEqual([]);
      expect(res.data.aeExpressions).toEqual([]);
    }
  });
});
