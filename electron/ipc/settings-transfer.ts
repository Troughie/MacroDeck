// Pure serialization/validation for exporting and importing a user's full
// MacroDeck configuration (all macros across all profiles + app settings + the
// AE script/expression libraries). No fs/Electron here so it unit-tests without
// a running app — the IPC layer (main.ts) handles the dialogs and disk IO.
//
// Note on profiles: the renderer stores profiles nested inside `settings` as
// `_profiles` / `_activeProfileId` (see profileStore.ts), so carrying `settings`
// verbatim also carries the profiles. We intentionally omit `selectedDeviceId`
// because it identifies a specific keyboard on the old machine and is meaningless
// after a reinstall on new hardware.

export const BACKUP_KIND = 'macrodeck-settings-backup';
export const BACKUP_VERSION = 1;

// The portable subset of the store. Typed loosely on purpose: this module must
// not depend on the renderer's type graph, and imported files come from disk.
export interface BackupData {
  macros: Record<string, unknown>;
  settings: Record<string, unknown>;
  aeScripts: unknown[];
  aeExpressions: unknown[];
}

export interface BackupBundle {
  app: 'MacroDeck';
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: number;
  data: BackupData;
}

// Shape of the live store as main.ts holds it (electron-store). Only the fields
// we export are read; everything is optional so a partially-populated store
// (e.g. fresh install) still exports cleanly.
export interface StoreLike {
  macros?: Record<string, unknown>;
  settings?: object;
  aeScripts?: unknown[];
  aeExpressions?: unknown[];
}

// Builds the export payload. `exportedAt` is injected (not read from Date.now())
// so callers stay in control and the function is deterministic for tests.
export function buildExportBundle(store: StoreLike, exportedAt: number): BackupBundle {
  return {
    app: 'MacroDeck',
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt,
    data: {
      macros: store.macros ?? {},
      settings: (store.settings ?? {}) as Record<string, unknown>,
      aeScripts: Array.isArray(store.aeScripts) ? store.aeScripts : [],
      aeExpressions: Array.isArray(store.aeExpressions) ? store.aeExpressions : [],
    },
  };
}

export type ParseResult =
  | { ok: true; data: BackupData; exportedAt: number | null }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Validates a file's raw text and extracts the portable data. Rejects anything
// that isn't a MacroDeck backup, has an unreadable version, or is missing/malformed
// in the one field we hard-require (`macros`). Optional collections are normalized
// to safe empty defaults so the caller can write them straight into the store.
export function parseImportBundle(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }

  if (!isPlainObject(parsed) || parsed.app !== 'MacroDeck' || parsed.kind !== BACKUP_KIND) {
    return { ok: false, error: 'This file is not a MacroDeck settings backup.' };
  }

  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: 'This backup was made by a newer version of MacroDeck. Please update the app and try again.',
    };
  }

  const data = parsed.data;
  if (!isPlainObject(data)) {
    return { ok: false, error: 'This backup is missing its data section.' };
  }

  if (!isPlainObject(data.macros)) {
    return { ok: false, error: 'This backup is corrupt: the macros section is missing or invalid.' };
  }

  const settings = isPlainObject(data.settings) ? data.settings : {};
  const aeScripts = Array.isArray(data.aeScripts) ? data.aeScripts : [];
  const aeExpressions = Array.isArray(data.aeExpressions) ? data.aeExpressions : [];

  return {
    ok: true,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : null,
    data: { macros: data.macros, settings, aeScripts, aeExpressions },
  };
}
