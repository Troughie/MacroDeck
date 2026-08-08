// ─── Macro Types ────────────────────────────────────────────────────────────

import type { AeExprTarget } from '../components/MacroSettings/ae/compileExpression';

export type { AeExprTarget };

export type MacroType =
  | 'APP_LAUNCH'
  | 'WEB_LINK'
  | 'MULTIMEDIA'
  | 'MUTE_TOGGLE'
  | 'VOLUME_ADJUST'
  | 'HOTKEY'
  | 'PROFILE_SWITCH'
  | 'FORCE_QUIT'
  | 'AE_COMMAND';

// ─── Settings Interfaces ─────────────────────────────────────────────────────

export interface BaseSettings {
  displayName: string;
}

export interface AppLaunchSettings extends BaseSettings {
  exePath: string;
  appName: string;
  iconPath?: string;
  iconDataUrl?: string;
  args?: string;  // optional launch argument (e.g. folder path for explorer.exe)
}

export interface WebLinkSettings extends BaseSettings {
  browserExePath: string;
  browserName: string;
  url: string;
}

export interface MultimediaSettings extends BaseSettings {
  targetApp: 'system' | string; // 'system' or process name
  targetAppName: string;
  action: 'PLAY_PAUSE' | 'PLAY' | 'PAUSE' | 'NEXT' | 'PREV';
}

export interface MuteSettings extends BaseSettings {
  target: 'master' | string; // 'master' or process name
  targetName: string;
}

export interface VolumeSettings extends BaseSettings {
  target: 'master' | string; // 'master' or process name
  targetName: string;
  delta: number; // e.g. +10 or -10
  mode: 'increase' | 'decrease' | 'set';
  setValue?: number; // used when mode === 'set'
}

export interface HotkeySettings extends BaseSettings {
  keys: string[]; // e.g. ['Control', 'Shift', 'KeyN']
}

export interface ProfileSwitchSettings extends BaseSettings {
  mode: 'specific' | 'next' | 'prev'; // switch to specific profile, or cycle
  targetProfileId?: string;            // used when mode === 'specific'
}

// Force-quits (kills) the app that owns the foreground window — like macOS
// Force Quit / Task Manager's End Task. Kills the whole process tree.
// There is nothing to configure per key, so settings only carry the display name.
export interface ForceQuitSettings extends BaseSettings {
  // Reserved for a future "specific app" target mode; unused for foreground kill.
  target?: 'foreground';
}

export interface AeCommandSettings extends BaseSettings {
  mode: 'shortcut' | 'script';
  shortcutId?: string;       // used when mode === 'shortcut', e.g. 'timeline.ramPreview'
  scriptType?: 'preset' | 'custom' | 'expression'; // used when mode === 'script'
  presetId?: string;         // used when mode === 'script' && scriptType === 'preset'
  script?: string;           // used when mode === 'script' && scriptType === 'custom'
  expressionId?: string;     // used when scriptType === 'expression'
}

export type MacroSettings =
  | AppLaunchSettings
  | WebLinkSettings
  | MultimediaSettings
  | MuteSettings
  | VolumeSettings
  | HotkeySettings
  | ProfileSwitchSettings
  | ForceQuitSettings
  | AeCommandSettings;

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  color: string; // hex color for visual distinction
  createdAt: number;
}

export const DEFAULT_PROFILE_ID = 'default';
export const GLOBAL_PROFILE_ID = 'global'; // macros that appear in ALL profiles

// ─── Macro Config ─────────────────────────────────────────────────────────────

export interface MacroConfig {
  id: string;
  keyCode: string; // e.g. 'KeyF1'
  type: MacroType;
  displayName: string;
  iconEmoji?: string;  // optional emoji shown on key (e.g. '🎵', '🚀', '🔊')
  settings: MacroSettings;
  profileId: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Keyboard Device ─────────────────────────────────────────────────────────

export interface KeyboardDevice {
  id: string;
  name: string;
  deviceType?: 'keyboard' | 'mouse' | 'hid';
  inputTags?: Array<'keyboard' | 'mouse' | 'hid'>;
  vendorId: number;
  productId: number;
  interfaceNumber?: number;  // HID interface index (-1 = single-interface, 0 = primary keyboard, >0 = secondary)
  hwid?: string;             // raw hardware ID string when the input backend provides one
  rawDeviceHandle?: string;  // Windows Raw Input hDevice handle, for diagnostics only
  isKeyboard?: boolean;      // false if device name suggests it's not a keyboard (mouse, receiver, etc.)
  driverState?: 'normal' | 'dedicated'; // 'dedicated' = bound to WinUSB (captured by MacroDeck)
  isSelected: boolean;
  isConnected: boolean;
}

// ─── Key Event ───────────────────────────────────────────────────────────────

export interface KeyEvent {
  code: string;   // e.g. 'KeyA', 'F1', 'Space'
  keycode: number;
  scanCode?: number;
  extended?: boolean;
  state: 'down' | 'up';
  deviceId?: string;
  isMacroDevice?: boolean;
}

// ─── Installed App ───────────────────────────────────────────────────────────

export interface InstalledApp {
  name: string;
  exePath: string;
  iconPath?: string;
  iconDataUrl?: string;
  publisher?: string;
}

// ─── Audio Session ────────────────────────────────────────────────────────────

export interface AudioSession {
  processName: string;
  processId: number;
  displayName: string;
  volume: number;    // 0–100
  isMuted: boolean;
  iconPath?: string;
  iconDataUrl?: string
}

// ─── Store Schema ─────────────────────────────────────────────────────────────

export interface AppSettings {
  runOnStartup: boolean;
  startMinimized: boolean;
  theme: 'dark' | 'light';
}

export interface StoreSchema {
  selectedDeviceId: string;
  macros: Record<string, MacroConfig>; // `${profileId}:${keyCode}` → MacroConfig
  profiles: Profile[];
  activeProfileId: string;
  settings: AppSettings;
  aeScripts: AeSavedScript[]; // reusable custom JSX library, shared across keys
  aeExpressions: AeSavedExpression[]; // reusable custom expression library
}

// A user-saved custom JSX script, reusable across any AE macro key.
export interface AeSavedScript {
  id: string;
  name: string;
  jsx: string;
  createdAt: number;
  updatedAt: number;
}

// A user-saved custom expression, reusable across any AE macro key and the panel.
export interface AeSavedExpression {
  id: string;
  name: string;
  expression: string;   // raw expression, e.g. wiggle(3, 20)
  target: AeExprTarget;  // selected property, or a fixed Transform property
  createdAt: number;
  updatedAt: number;
}

// ─── IPC Channel Names ────────────────────────────────────────────────────────

export const IPC_CHANNELS = {
  // Keyboard
  KEYBOARD_LIST: 'keyboard:list',
  KEYBOARD_SELECT: 'keyboard:select',
  KEYBOARD_EVENT: 'keyboard:event',

  // Apps
  APPS_GET_INSTALLED: 'apps:getInstalled',

  // Audio
  AUDIO_GET_SESSIONS: 'audio:getSessions',
  AUDIO_SET_VOLUME: 'audio:setVolume',
  AUDIO_TOGGLE_MUTE: 'audio:toggleMute',

  // Macro
  MACRO_EXECUTE: 'macro:execute',

  // Store
  STORE_SAVE_MACROS: 'store:saveMacros',
  STORE_LOAD_MACROS: 'store:loadMacros',
  STORE_SAVE_SETTINGS: 'store:saveSettings',
  STORE_LOAD_SETTINGS: 'store:loadSettings',
  STORE_SAVE_DEVICE: 'store:saveDevice',
  STORE_LOAD_DEVICE: 'store:loadDevice',

  // System
  SYSTEM_SET_STARTUP: 'system:setStartup',
  SYSTEM_GET_STARTUP: 'system:getStartup',
  SYSTEM_HIDE_WINDOW: 'system:hideWindow',
  SYSTEM_SHOW_WINDOW: 'system:showWindow',
} as const;

// ─── Macro Type Metadata ──────────────────────────────────────────────────────

export interface MacroTypeInfo {
  type: MacroType;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const MACRO_TYPE_INFO: MacroTypeInfo[] = [
  {
    type: 'APP_LAUNCH',
    label: 'Launch App',
    description: 'Open any installed application',
    icon: 'Rocket',
    color: '#f59e0b',
  },
  {
    type: 'WEB_LINK',
    label: 'Web Link',
    description: 'Open a URL in your browser',
    icon: 'Globe',
    color: '#3b82f6',
  },
  {
    type: 'MULTIMEDIA',
    label: 'Media Control',
    description: 'Play, pause, skip tracks',
    icon: 'Music',
    color: '#8b5cf6',
  },
  {
    type: 'MUTE_TOGGLE',
    label: 'Mute Toggle',
    description: 'Mute/unmute audio',
    icon: 'VolumeX',
    color: '#ef4444',
  },
  {
    type: 'VOLUME_ADJUST',
    label: 'Volume Control',
    description: 'Adjust volume levels',
    icon: 'Volume2',
    color: '#22c55e',
  },
  {
    type: 'HOTKEY',
    label: 'Hotkey',
    description: 'Send a key combination',
    icon: 'Keyboard',
    color: '#06b6d4',
  },
  {
    type: 'PROFILE_SWITCH',
    label: 'Switch Profile',
    description: 'Switch to another profile',
    icon: 'Layers',
    color: '#a855f7',
  },
  {
    type: 'FORCE_QUIT',
    label: 'Force Quit',
    description: 'Kill the app in focus (End Task)',
    icon: 'Skull',
    color: '#dc2626',
  },
  {
    type: 'AE_COMMAND',
    label: 'After Effects',
    description: 'AE shortcuts and JSX scripts',
    icon: 'Clapperboard',
    color: '#9999FF',
  },
];
