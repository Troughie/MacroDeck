import { create } from 'zustand';
import { AeSavedScript } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

interface AeScriptState {
  scripts: AeSavedScript[];
  loaded: boolean;
  load: () => Promise<void>;
  addScript: (name: string, jsx: string) => AeSavedScript;
  updateScript: (id: string, patch: Partial<Pick<AeSavedScript, 'name' | 'jsx'>>) => void;
  removeScript: (id: string) => void;
}

function genId(): string {
  return `aescript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function persist(scripts: AeSavedScript[]): void {
  electronAPI?.store.saveAeScripts(scripts).catch((err: unknown) =>
    console.error('[aeScriptStore] save failed:', err));
}

export const useAeScriptStore = create<AeScriptState>((set, get) => ({
  scripts: [],
  loaded: false,

  load: async () => {
    try {
      const scripts = (await electronAPI?.store.loadAeScripts()) ?? [];
      set({ scripts, loaded: true });
    } catch (err) {
      console.error('[aeScriptStore] load failed:', err);
      set({ loaded: true });
    }
  },

  addScript: (name, jsx) => {
    const now = Date.now();
    const script: AeSavedScript = { id: genId(), name, jsx, createdAt: now, updatedAt: now };
    const scripts = [...get().scripts, script];
    set({ scripts });
    persist(scripts);
    return script;
  },

  updateScript: (id, patch) => {
    const scripts = get().scripts.map(s =>
      s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s);
    set({ scripts });
    persist(scripts);
  },

  removeScript: (id) => {
    const scripts = get().scripts.filter(s => s.id !== id);
    set({ scripts });
    persist(scripts);
  },
}));
