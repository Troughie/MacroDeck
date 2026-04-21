import { create } from 'zustand';

export type ToastType = 'success' | 'loading' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  icon?: string;       // emoji or custom icon
  duration?: number;   // ms, 0 = manual dismiss
  progress?: number;   // 0-100 for loading
}

interface ToastState {
  toasts: Toast[];
  add: (toast: Omit<Toast, 'id'>) => string;
  update: (id: string, updates: Partial<Toast>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

function genId() {
  return `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  add: (toast) => {
    const id = genId();
    const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 3000);
    set(state => ({ toasts: [...state.toasts, { ...toast, id, duration }] }));

    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },

  update: (id, updates) => {
    set(state => ({
      toasts: state.toasts.map(t => t.id === id ? { ...t, ...updates } : t),
    }));
    // If updated to non-loading with no explicit duration, auto-dismiss
    if (updates.type && updates.type !== 'loading') {
      const toast = get().toasts.find(t => t.id === id);
      const dur = updates.duration ?? toast?.duration ?? 3000;
      if (dur > 0) {
        setTimeout(() => get().dismiss(id), dur);
      }
    }
  },

  dismiss: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
  },

  dismissAll: () => set({ toasts: [] }),
}));

// ─── Helper functions ─────────────────────────────────────────────────────────

export const toast = {
  success: (title: string, message?: string, icon?: string) =>
    useToastStore.getState().add({ type: 'success', title, message, icon, duration: 3000 }),

  error: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'error', title, message, icon: '❌', duration: 4000 }),

  info: (title: string, message?: string, icon?: string) =>
    useToastStore.getState().add({ type: 'info', title, message, icon, duration: 3000 }),

  loading: (title: string, message?: string, icon?: string) =>
    useToastStore.getState().add({ type: 'loading', title, message, icon, duration: 0 }),

  // Start loading, then resolve with success/error
  promise: async <T>(
    fn: () => Promise<T>,
    opts: { loading: string; success: string | ((r: T) => string); error?: string; icon?: string }
  ): Promise<T> => {
    const id = useToastStore.getState().add({
      type: 'loading', title: opts.loading, icon: opts.icon, duration: 0,
    });
    try {
      const result = await fn();
      const successMsg = typeof opts.success === 'function' ? opts.success(result) : opts.success;
      useToastStore.getState().update(id, {
        type: 'success', title: successMsg, duration: 3000,
      });
      return result;
    } catch (err: any) {
      useToastStore.getState().update(id, {
        type: 'error', title: opts.error ?? 'Failed', message: err.message?.slice(0, 80), duration: 4000,
      });
      throw err;
    }
  },
};
