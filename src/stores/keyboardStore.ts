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
      const selectableDevices = devices.filter((d: KeyboardDevice) => d.deviceType !== 'mouse' && d.isKeyboard !== false);
      const resolvedDeviceId = selectableDevices.some((d: KeyboardDevice) => d.id === savedDeviceId)
        ? savedDeviceId
        : selectableDevices[0]?.id ?? '';

      const updatedDevices = devices.map((d: KeyboardDevice) => ({
        ...d,
        isSelected: d.id === resolvedDeviceId,
      }));

      set({
        devices: updatedDevices,
        selectedDeviceId: resolvedDeviceId,
        isLoading: false,
      });

      // ── KEY FIX: notify main process of the saved device on startup ──────
      // Keep the main process in sync with the persisted device id.
      if (resolvedDeviceId) {
        await electronAPI.keyboard.select(resolvedDeviceId);
        if (resolvedDeviceId !== savedDeviceId) {
          await electronAPI.store.saveDevice(resolvedDeviceId);
        }
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));
