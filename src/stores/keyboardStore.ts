import { create } from 'zustand';
import { KeyboardDevice } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

interface KeyboardState {
  devices: KeyboardDevice[];
  selectedDeviceId: string;
  pressedKeys: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  setDevices: (devices: KeyboardDevice[]) => void;
  selectDevice: (deviceId: string) => void;
  setKeyPressed: (code: string) => void;
  setKeyReleased: (code: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadDevices: () => Promise<void>;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  devices: [],
  selectedDeviceId: '',
  pressedKeys: new Set(),
  isLoading: false,
  error: null,

  setDevices: (devices) => set({ devices }),

  selectDevice: async (deviceId) => {
    set({ selectedDeviceId: deviceId });

    set((state) => ({
      devices: state.devices.map((d) => ({
        ...d,
        isSelected: d.id === deviceId,
      })),
    }));

    try {
      await electronAPI?.keyboard.select(deviceId);
      await electronAPI?.store.saveDevice(deviceId);
    } catch (err) {
      console.error('[keyboardStore] selectDevice failed:', err);
    }
  },

  setKeyPressed: (code) => {
    set((state) => {
      const next = new Set(state.pressedKeys);
      next.add(code);
      return { pressedKeys: next };
    });
  },

  setKeyReleased: (code) => {
    set((state) => {
      const next = new Set(state.pressedKeys);
      next.delete(code);
      return { pressedKeys: next };
    });
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadDevices: async () => {
    set({ isLoading: true, error: null });
    try {
      if (!electronAPI) {
        set({ devices: [], selectedDeviceId: '', isLoading: false });
        return;
      }
      const devices = await electronAPI.keyboard.list();
      const savedDeviceId = await electronAPI.store.loadDevice();

      const updatedDevices = devices.map((d: KeyboardDevice) => ({
        ...d,
        isSelected: d.id === savedDeviceId,
      }));

      set({
        devices: updatedDevices,
        selectedDeviceId: savedDeviceId,
        isLoading: false,
      });

      // ── KEY FIX: notify main process of the saved device on startup ──────
      // Without this, Interception listener has selectedDeviceKey = ''
      // and ignores all keystrokes even though UI shows device as selected
      if (savedDeviceId) {
        await electronAPI.keyboard.select(savedDeviceId);
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));
