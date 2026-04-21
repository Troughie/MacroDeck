import { create } from 'zustand';
import { Profile, DEFAULT_PROFILE_ID, GLOBAL_PROFILE_ID } from '../types/macro.types';
import { electronAPI } from '../lib/electron';

const DEFAULT_PROFILES: Profile[] = [
  { id: DEFAULT_PROFILE_ID, name: 'Default', color: '#3b82f6', createdAt: 0 },
];

interface ProfileState {
  profiles: Profile[];
  activeProfileId: string;

  // Actions
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfile: (id: string) => void;
  addProfile: (name: string, color: string) => Profile;
  updateProfile: (id: string, updates: Partial<Pick<Profile, 'name' | 'color'>>) => void;
  removeProfile: (id: string) => void;
  loadProfiles: () => Promise<void>;
  saveProfiles: () => Promise<void>;
}

function generateId() {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: DEFAULT_PROFILES,
  activeProfileId: DEFAULT_PROFILE_ID,

  setProfiles: (profiles) => set({ profiles }),
  setActiveProfile: (id) => {
    set({ activeProfileId: id });
    get().saveProfiles();
  },

  addProfile: (name, color) => {
    const profile: Profile = { id: generateId(), name, color, createdAt: Date.now() };
    set(state => ({ profiles: [...state.profiles, profile] }));
    get().saveProfiles();
    return profile;
  },

  updateProfile: (id, updates) => {
    set(state => ({
      profiles: state.profiles.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
    get().saveProfiles();
  },

  removeProfile: (id) => {
    if (id === DEFAULT_PROFILE_ID) return; // can't delete default
    set(state => ({
      profiles: state.profiles.filter(p => p.id !== id),
      activeProfileId: state.activeProfileId === id ? DEFAULT_PROFILE_ID : state.activeProfileId,
    }));
    get().saveProfiles();
  },

  loadProfiles: async () => {
    if (!electronAPI) return;
    try {
      // Load from store — stored as JSON string under 'profiles' key
      const raw = await electronAPI.store.loadSettings() as any;
      if (raw?._profiles) {
        const profiles: Profile[] = JSON.parse(raw._profiles);
        const activeId: string = raw._activeProfileId ?? DEFAULT_PROFILE_ID;
        if (profiles.length > 0) {
          set({ profiles, activeProfileId: activeId });
        }
      }
    } catch {}
  },

  saveProfiles: async () => {
    if (!electronAPI) return;
    try {
      const { profiles, activeProfileId } = get();
      // Piggyback on settings store — save as extra fields
      const settings = await electronAPI.store.loadSettings();
      await electronAPI.store.saveSettings({
        ...settings,
        _profiles: JSON.stringify(profiles),
        _activeProfileId: activeProfileId,
      } as any);
    } catch {}
  },
}));
