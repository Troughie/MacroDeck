import { create } from 'zustand';
import { AeSavedExpression, AeExprTarget } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

interface AeExpressionState {
  expressions: AeSavedExpression[];
  loaded: boolean;
  load: () => Promise<void>;
  addExpression: (name: string, expression: string, target: AeExprTarget) => AeSavedExpression;
  updateExpression: (id: string, patch: Partial<Pick<AeSavedExpression, 'name' | 'expression' | 'target'>>) => void;
  removeExpression: (id: string) => void;
}

function genId(): string {
  return `aeexpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function persist(expressions: AeSavedExpression[]): void {
  electronAPI?.store.saveAeExpressions(expressions).catch((err: unknown) =>
    console.error('[aeExpressionStore] save failed:', err));
}

export const useAeExpressionStore = create<AeExpressionState>((set, get) => ({
  expressions: [],
  loaded: false,

  load: async () => {
    try {
      const expressions = (await electronAPI?.store.loadAeExpressions()) ?? [];
      set({ expressions, loaded: true });
    } catch (err) {
      console.error('[aeExpressionStore] load failed:', err);
      set({ loaded: true });
    }
  },

  addExpression: (name, expression, target) => {
    const now = Date.now();
    const expr: AeSavedExpression = { id: genId(), name, expression, target, createdAt: now, updatedAt: now };
    const expressions = [...get().expressions, expr];
    set({ expressions });
    persist(expressions);
    return expr;
  },

  updateExpression: (id, patch) => {
    const expressions = get().expressions.map(e =>
      e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e);
    set({ expressions });
    persist(expressions);
  },

  removeExpression: (id) => {
    const expressions = get().expressions.filter(e => e.id !== id);
    set({ expressions });
    persist(expressions);
  },
}));
