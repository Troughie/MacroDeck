import React, { useEffect } from 'react';
import { Volume2, VolumeX, Minus, Plus } from 'lucide-react';
import { MacroConfig, VolumeSettings as VolumeSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { useAudioStore } from '../../stores/audioStore';

type VolumeMode = VolumeSettingsType['mode'];

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function VolumeSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const { sessions, loadSessions } = useAudioStore();
  const settings = macro.settings as VolumeSettingsType;

  useEffect(() => {
    loadSessions();
  }, []);

  const handleTargetChange = (target: string, name: string) => {
    updateMacro(profileId, keyCode, {
      settings: { ...settings, target, targetName: name },
    });
  };

  const handleModeChange = (mode: VolumeMode) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, mode } });
  };

  const handleDeltaChange = (delta: number) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, delta: Math.max(1, Math.min(100, delta)) } });
  };

  const handleSetValueChange = (value: number) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, setValue: Math.max(0, Math.min(100, value)) } });
  };

  const currentSession = sessions.find(s => s.processName === settings.target);

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Mode</label>
        <div className="flex gap-1.5">
          {(['increase', 'decrease', 'set'] as VolumeMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border transition-all duration-100
                ${settings.mode === mode
                  ? 'bg-green-500/20 border-green-500/50 text-green-300'
                  : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                }
              `}
            >
              {mode === 'increase' && <Plus size={11} />}
              {mode === 'decrease' && <Minus size={11} />}
              {mode === 'set' && <Volume2 size={11} />}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Delta / Set value */}
      {settings.mode !== 'set' ? (
        <div>
          <label className="text-text-secondary text-xs font-medium mb-1.5 block">
            Amount ({settings.mode === 'increase' ? '+' : '-'}{settings.delta}%)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDeltaChange(settings.delta - 5)}
              className="btn-secondary px-2 py-1"
            >
              <Minus size={12} />
            </button>
            <input
              type="range"
              min={1}
              max={50}
              value={settings.delta}
              onChange={(e) => handleDeltaChange(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <button
              onClick={() => handleDeltaChange(settings.delta + 5)}
              className="btn-secondary px-2 py-1"
            >
              <Plus size={12} />
            </button>
            <span className="text-text-primary text-xs font-mono w-8 text-right">{settings.delta}%</span>
          </div>
        </div>
      ) : (
        <div>
          <label className="text-text-secondary text-xs font-medium mb-1.5 block">
            Set to ({settings.setValue ?? 50}%)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.setValue ?? 50}
              onChange={(e) => handleSetValueChange(Number(e.target.value))}
              className="flex-1 accent-green-500"
            />
            <span className="text-text-primary text-xs font-mono w-8 text-right">{settings.setValue ?? 50}%</span>
          </div>
        </div>
      )}

      {/* Target selector */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Target</label>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {/* Master */}
          <button
            onClick={() => handleTargetChange('master', 'Master Volume')}
            className={`
              w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-100
              ${settings.target === 'master'
                ? 'bg-green-500/10 border border-green-500/30'
                : 'hover:bg-bg-hover border border-transparent'
              }
            `}
          >
            <Volume2 size={12} className="text-green-400 flex-shrink-0" />
            <span className="text-text-primary text-xs flex-1">Master Volume</span>
            {settings.target === 'master' && currentSession && (
              <span className="text-text-muted text-xs">{currentSession.volume}%</span>
            )}
          </button>

          {sessions.filter(s => s.processName !== 'master').map((session) => (
            <button
              key={session.processName}
              onClick={() => handleTargetChange(session.processName, session.displayName)}
              className={`
                w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-100
                ${settings.target === session.processName
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'hover:bg-bg-hover border border-transparent'
                }
              `}
            >
              <Volume2 size={12} className="text-green-400 flex-shrink-0" />
              <span className="text-text-primary text-xs truncate flex-1">{session.displayName}</span>
              <span className="text-text-muted text-xs">{session.volume}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
