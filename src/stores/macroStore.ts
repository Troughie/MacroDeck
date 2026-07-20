import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { MacroConfig, MacroType, DEFAULT_PROFILE_ID, GLOBAL_PROFILE_ID } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

// ─── Store key format: `${profileId}:${keyCode}` ─────────────────────────────
// Global macros use GLOBAL_PROFILE_ID as profileId
// Profile macros use their profile's id

export function makeMacroKey(profileId: string, keyCode: string): string {
  return `${profileId}:${keyCode}`;
}

export function parseMacroKey(key: string): { profileId: string; keyCode: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { profileId: DEFAULT_PROFILE_ID, keyCode: key }; // legacy
  return { profileId: key.slice(0, idx), keyCode: key.slice(idx + 1) };
}

interface MacroState {
  // All macros across all profiles: `${profileId}:${keyCode}` → MacroConfig
  allMacros: Record<string, MacroConfig>;
  selectedKeyCode: string | null;
  isDirty: boolean;

  // Actions
  setAllMacros: (macros: Record<string, MacroConfig>) => void;
  assignMacro: (keyCode: string, type: MacroType, profileId: string) => void;
  updateMacro: (profileId: string, keyCode: string, updates: Partial<MacroConfig>) => void;
  removeMacro: (profileId: string, keyCode: string) => void;
  // Move macro to different key (same profile) or different profile
  moveMacro: (
    fromProfileId: string, fromKeyCode: string,
    toProfileId: string, toKeyCode: string,
    mode: 'move' | 'copy'
  ) => void;
  selectKey: (keyCode: string | null) => void;
  saveMacros: () => Promise<void>;
  loadMacros: () => Promise<void>;

  // Get macros visible for a given profile (profile macros + global macros)
  getMacrosForProfile: (profileId: string) => Record<string, MacroConfig>;
}

function generateId(): string {
  return `macro_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultSettings(type: MacroType, keyCode: string) {
  const displayName = keyCode.replace('Key', '').replace('Digit', '').replace('Arrow', '↑').slice(0, 8);
  switch (type) {
    case 'APP_LAUNCH':   return { displayName, exePath: '', appName: '' };
    case 'WEB_LINK':     return { displayName, browserExePath: '', browserName: '', url: '' };
    case 'MULTIMEDIA':   return { displayName, targetApp: 'system', targetAppName: 'System', action: 'PLAY_PAUSE' as const };
    case 'MUTE_TOGGLE':  return { displayName, target: 'master', targetName: 'Master Volume' };
    case 'VOLUME_ADJUST':return { displayName, target: 'master', targetName: 'Master Volume', delta: 10, mode: 'increase' as const };
    case 'HOTKEY':       return { displayName, keys: [] };
    case 'FORCE_QUIT':   return { displayName: 'Force Quit', target: 'foreground' as const };
    case 'AE_COMMAND':   return { displayName, mode: 'shortcut' as const };
    default:             return { displayName };
  }
}

export const useMacroStore = create<MacroState>()(
  subscribeWithSelector((set, get) => ({
    allMacros: {},
    selectedKeyCode: null,
    isDirty: false,

    setAllMacros: (allMacros) => set({ allMacros, isDirty: false }),

    getMacrosForProfile: (profileId) => {
      const { allMacros } = get();
      const result: Record<string, MacroConfig> = {};
      for (const [storeKey, macro] of Object.entries(allMacros)) {
        const { profileId: mProfileId, keyCode } = parseMacroKey(storeKey);
        // Include if: belongs to this profile OR is global
        if (mProfileId === profileId || mProfileId === GLOBAL_PROFILE_ID) {
          // Profile-specific macro takes priority over global for same key
          if (!result[keyCode] || mProfileId === profileId) {
            result[keyCode] = macro;
          }
        }
      }
      return result;
    },

    assignMacro: (keyCode, type, profileId) => {
      const now = Date.now();
      const storeKey = makeMacroKey(profileId, keyCode);
      const macro: MacroConfig = {
        id: generateId(),
        keyCode,
        type,
        profileId,
        displayName: keyCode.replace('Key', '').replace('Digit', '').slice(0, 8),
        settings: getDefaultSettings(type, keyCode) as any,
        createdAt: now,
        updatedAt: now,
      };
      set(state => ({
        allMacros: { ...state.allMacros, [storeKey]: macro },
        selectedKeyCode: keyCode,
        isDirty: true,
      }));
    },

    updateMacro: (profileId, keyCode, updates) => {
      const storeKey = makeMacroKey(profileId, keyCode);
      set(state => {
        const existing = state.allMacros[storeKey];
        if (!existing) return state;
        return {
          allMacros: {
            ...state.allMacros,
            [storeKey]: {
              ...existing,
              ...updates,
              settings: updates.settings
                ? { ...existing.settings, ...updates.settings }
                : existing.settings,
              updatedAt: Date.now(),
            },
          },
          isDirty: true,
        };
      });
    },

    removeMacro: (profileId, keyCode) => {
      const storeKey = makeMacroKey(profileId, keyCode);
      set(state => {
        const { [storeKey]: _, ...rest } = state.allMacros;
        return {
          allMacros: rest,
          selectedKeyCode: state.selectedKeyCode === keyCode ? null : state.selectedKeyCode,
          isDirty: true,
        };
      });
    },

    moveMacro: (fromProfileId, fromKeyCode, toProfileId, toKeyCode, mode) => {
      const fromKey = makeMacroKey(fromProfileId, fromKeyCode);
      const toKey = makeMacroKey(toProfileId, toKeyCode);
      set(state => {
        const source = state.allMacros[fromKey];
        if (!source) return state;
        const updated = { ...state.allMacros };
        // Place at destination with updated profileId and keyCode
        updated[toKey] = {
          ...source,
          keyCode: toKeyCode,
          profileId: toProfileId,
          updatedAt: Date.now(),
        };
        // Remove source if moving (not copying)
        if (mode === 'move') delete updated[fromKey];
        return { allMacros: updated, isDirty: true };
      });
    },

    selectKey: (keyCode) => set({ selectedKeyCode: keyCode }),

    saveMacros: async () => {
      const { allMacros } = get();
      try {
        await electronAPI?.store.saveMacros(allMacros as any);
        set({ isDirty: false });
      } catch (err) {
        console.error('[macroStore] saveMacros failed:', err);
      }
    },

    loadMacros: async () => {
      try {
        if (!electronAPI) { set({ allMacros: {}, isDirty: false }); return; }
        const raw = await electronAPI.store.loadMacros();
        // Migrate legacy format (keyCode → MacroConfig without profileId)
        const migrated: Record<string, MacroConfig> = {};
        for (const [key, macro] of Object.entries(raw || {})) {
          if (key.includes(':')) {
            // Already new format
            migrated[key] = macro as MacroConfig;
          } else {
            // Legacy: assign to default profile
            const newKey = makeMacroKey(DEFAULT_PROFILE_ID, key);
            migrated[newKey] = { ...(macro as MacroConfig), profileId: DEFAULT_PROFILE_ID };
          }
        }
        set({ allMacros: migrated, isDirty: false });
      } catch (err) {
        console.error('[macroStore] loadMacros failed:', err);
      }
    },
  }))
);

// Auto-save debounced
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
useMacroStore.subscribe(
  (state) => state.isDirty,
  (isDirty) => {
    if (!isDirty) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => useMacroStore.getState().saveMacros(), 1000);
  }
);

// Sync active macro keys to main process
export function syncMacroKeysToMain(profileId: string) {
  const macros = useMacroStore.getState().getMacrosForProfile(profileId);
  const keyCodes = Object.keys(macros);
  if (window.electronAPI) {
    window.electronAPI.keyboard.updateMacroKeys(keyCodes).catch(() => {});
  }
}
