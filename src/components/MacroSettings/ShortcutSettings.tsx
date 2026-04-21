import React, { useState, useCallback, useRef } from 'react';
import { Keyboard, X, AlertCircle } from 'lucide-react';
import { MacroConfig, HotkeySettings as HotkeySettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';

// Modifier keys
const MODIFIERS = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

const KEY_DISPLAY: Record<string, string> = {
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  ShiftLeft: 'Shift', ShiftRight: 'Shift',
  AltLeft: 'Alt', AltRight: 'Alt',
  MetaLeft: 'Win', MetaRight: 'Win',
  Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  Backspace: '⌫', Tab: 'Tab', Delete: 'Del',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
};

function getKeyDisplay(code: string): string {
  if (KEY_DISPLAY[code]) return KEY_DISPLAY[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('F') && !isNaN(Number(code.slice(1)))) return code;
  return code;
}

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function ShortcutSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const settings = macro.settings as HotkeySettingsType;

  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>(settings.keys || []);
  const currentModifiers = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLDivElement>(null);

  const startRecording = () => {
    setIsRecording(true);
    setRecordedKeys([]);
    currentModifiers.current = new Set();
    inputRef.current?.focus();
  };

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (recordedKeys.length > 0) {
      updateMacro(profileId, keyCode, {
        settings: { ...settings, keys: recordedKeys },
      });
    }
  }, [recordedKeys, keyCode, settings, updateMacro]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    const code = e.code;

    if (MODIFIERS.has(code)) {
      currentModifiers.current.add(code);
      // Show modifiers in real-time
      setRecordedKeys([...currentModifiers.current]);
    } else {
      // Final key — combine modifiers + main key
      const combo = [...currentModifiers.current, code];
      setRecordedKeys(combo);
      // Auto-stop after capturing
      setTimeout(() => {
        setIsRecording(false);
        updateMacro(profileId, keyCode, {
          settings: { ...settings, keys: combo },
        });
      }, 100);
    }
  }, [isRecording, keyCode, settings, updateMacro]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    currentModifiers.current.delete(e.code);
  }, [isRecording]);

  const clearKeys = () => {
    setRecordedKeys([]);
    updateMacro(profileId, keyCode, { settings: { ...settings, keys: [] } });
  };

  const displayKeys = isRecording ? recordedKeys : (settings.keys || []);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">
          Key Combination
        </label>

        {/* Key recorder */}
        <div
          ref={inputRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={() => isRecording && stopRecording()}
          className={`
            relative flex items-center gap-2 p-3 rounded-lg border min-h-[48px] cursor-pointer
            outline-none transition-all duration-150
            ${isRecording
              ? 'border-accent-blue bg-accent-blue/10 shadow-glow-blue-sm'
              : 'border-border bg-bg-card hover:border-border-hover'
            }
          `}
          onClick={!isRecording ? startRecording : undefined}
        >
          {displayKeys.length === 0 ? (
            <span className="text-text-muted text-xs">
              {isRecording ? 'Press your key combination...' : 'Click to record shortcut'}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {displayKeys.map((key, i) => (
                <React.Fragment key={key}>
                  <span className="
                    px-2 py-0.5 rounded-md bg-bg-secondary border border-border
                    text-text-primary text-xs font-mono font-medium
                  ">
                    {getKeyDisplay(key)}
                  </span>
                  {i < displayKeys.length - 1 && (
                    <span className="text-text-muted text-xs">+</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs">Recording</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          {!isRecording ? (
            <button onClick={startRecording} className="btn-secondary text-xs py-1">
              <Keyboard size={12} />
              {displayKeys.length > 0 ? 'Re-record' : 'Record Shortcut'}
            </button>
          ) : (
            <button onClick={stopRecording} className="btn-primary text-xs py-1">
              Stop Recording
            </button>
          )}

          {displayKeys.length > 0 && !isRecording && (
            <button onClick={clearKeys} className="btn-ghost text-xs py-1 text-red-400 hover:text-red-300">
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Warning for empty keys */}
      {settings.keys?.length === 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle size={12} className="text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-300 text-xs">No shortcut recorded. Click "Record Shortcut" to set one.</p>
        </div>
      )}

      {/* Preview */}
      {settings.keys && settings.keys.length > 0 && (
        <div className="p-2 rounded-lg bg-bg-card border border-border">
          <p className="text-text-muted text-xs mb-1">Will send:</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {settings.keys.map((key, i) => (
              <React.Fragment key={key}>
                <span className="px-2 py-0.5 rounded bg-bg-secondary border border-border text-text-primary text-xs font-mono">
                  {getKeyDisplay(key)}
                </span>
                {i < settings.keys.length - 1 && (
                  <span className="text-text-muted text-xs">+</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
