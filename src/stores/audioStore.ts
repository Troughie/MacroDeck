import { create } from 'zustand';
import { AudioSession } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

interface AudioState {
  sessions: AudioSession[];
  isLoading: boolean;
  error: string | null;
  lastRefresh: number;

  // Actions
  setSessions: (sessions: AudioSession[]) => void;
  loadSessions: () => Promise<void>;
  setVolume: (target: string, volume: number) => Promise<void>;
  toggleMute: (target: string) => Promise<void>;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  lastRefresh: 0,

  setSessions: (sessions) => set({ sessions }),

  loadSessions: async () => {
    const { lastRefresh } = get();
    const now = Date.now();
    if (now - lastRefresh < 5000) return;

    set({ isLoading: true, error: null });
    try {
      if (!electronAPI) { set({ sessions: [], isLoading: false, lastRefresh: now }); return; }
      const sessions = await electronAPI.audio.getSessions();
      set({ sessions, isLoading: false, lastRefresh: now });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setVolume: async (target, volume) => {
    try {
      await electronAPI?.audio.setVolume(target, volume);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.processName === target ? { ...s, volume } : s
        ),
      }));
    } catch (err) {
      console.error('[audioStore] setVolume failed:', err);
    }
  },

  toggleMute: async (target) => {
    try {
      await electronAPI?.audio.toggleMute(target);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.processName === target ? { ...s, isMuted: !s.isMuted } : s
        ),
      }));
    } catch (err) {
      console.error('[audioStore] toggleMute failed:', err);
    }
  },
}));
