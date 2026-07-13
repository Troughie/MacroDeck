import { create } from 'zustand';
import { KeyboardDevice } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

interface KeyboardState {
  devices: KeyboardDevice[];
  selectedDeviceId: string;
  pressedKeys: Set<string>;
  isLoading: boolean;
  error: string | null;
  driverToolAvailable: boolean;
  dedicatingId: string | null;

  // Actions
  setDevices: (devices: KeyboardDevice[]) => void;
  setKeyPressed: (code: string) => void;
  setKeyReleased: (code: string) => void;
  clearKeys: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadDevices: () => Promise<void>;
  refreshDriverStatus: () => Promise<void>;
  dedicateDevice: (deviceId: string) => Promise<{ ok: boolean; exitCode?: number | null; error?: string; log?: string }>;
  undedicateDevice: (deviceId: string) => Promise<{ ok: boolean; exitCode?: number | null; error?: string; log?: string }>;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  devices: [],
  selectedDeviceId: '',
  pressedKeys: new Set(),
  isLoading: false,
  error: null,
  driverToolAvailable: false,
  dedicatingId: null,

  setDevices: (devices) => set({ devices }),

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

  // Clear all held keys — used when the main-process reader is replaced and any
  // pending key-ups were lost, so nothing stays stuck-highlighted.
  clearKeys: () => set({ pressedKeys: new Set() }),

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

      // The active macro keyboard is whichever device is dedicated (WinUSB-bound).
      // Only a dedicated device can be read, so selection follows the driver state:
      // prefer the saved device if it is dedicated, otherwise any dedicated device.
      const dedicatedDevices = devices.filter((d: KeyboardDevice) => d.driverState === 'dedicated');
      const resolvedDeviceId = dedicatedDevices.some((d: KeyboardDevice) => d.id === savedDeviceId)
        ? savedDeviceId
        : dedicatedDevices[0]?.id ?? '';

      const updatedDevices = devices.map((d: KeyboardDevice) => ({
        ...d,
        isSelected: d.id === resolvedDeviceId,
      }));

      set({
        devices: updatedDevices,
        selectedDeviceId: resolvedDeviceId,
        isLoading: false,
      });

      // Keep the main process reader in sync with the resolved device on startup,
      // and persist it if it changed (e.g. the saved one is no longer dedicated).
      if (resolvedDeviceId) {
        await electronAPI.keyboard.select(resolvedDeviceId);
      }
      if (resolvedDeviceId !== savedDeviceId) {
        await electronAPI.store.saveDevice(resolvedDeviceId);
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  refreshDriverStatus: async () => {
    try {
      const status = await electronAPI?.keyboard.driverStatus();
      set({ driverToolAvailable: !!status?.available });
    } catch (err) {
      console.error('[keyboardStore] driverStatus failed:', err);
      set({ driverToolAvailable: false });
    }
  },

  dedicateDevice: async (deviceId) => {
    set({ dedicatingId: deviceId });
    try {
      const result = await electronAPI?.keyboard.dedicate(deviceId);
      if (result?.ok) {
        // The dedicated device is now the active macro keyboard (main already
        // started reading it). Track and persist it so a restart re-reads it.
        set((state) => ({
          selectedDeviceId: deviceId,
          devices: state.devices.map((d) => ({
            ...d,
            isSelected: d.id === deviceId,
            driverState: d.id === deviceId ? 'dedicated' : d.driverState,
          })),
        }));
        await electronAPI?.store.saveDevice(deviceId);
      }
      return result ?? { ok: false, error: 'unavailable' };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'dedicate failed' };
    } finally {
      set({ dedicatingId: null });
    }
  },

  undedicateDevice: async (deviceId) => {
    set({ dedicatingId: deviceId });
    try {
      const result = await electronAPI?.keyboard.undedicate(deviceId);
      if (result?.ok) {
        const wasSelected = get().selectedDeviceId === deviceId;
        set((state) => ({
          selectedDeviceId: wasSelected ? '' : state.selectedDeviceId,
          devices: state.devices.map((d) => ({
            ...d,
            isSelected: d.id === deviceId ? false : d.isSelected,
            driverState: d.id === deviceId ? 'normal' : d.driverState,
          })),
        }));
        if (wasSelected) await electronAPI?.store.saveDevice('');
      }
      return result ?? { ok: false, error: 'unavailable' };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'undedicate failed' };
    } finally {
      set({ dedicatingId: null });
    }
  },
}));
