import React, { useEffect } from 'react';
import { VolumeX, Volume2 } from 'lucide-react';
import { MacroConfig, MuteSettings as MuteSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { useAudioStore } from '../../stores/audioStore';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function MuteSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const { sessions, loadSessions } = useAudioStore();
  const settings = macro.settings as MuteSettingsType;

  useEffect(() => {
    loadSessions();
  }, []);

  const handleTargetChange = (target: string, name: string) => {
    updateMacro(profileId, keyCode, {
      settings: { ...settings, target, targetName: name },
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">
          Mute/Unmute Target
        </label>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {/* Master volume */}
          <button
            onClick={() => handleTargetChange('master', 'Master Volume')}
            className={`
              w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-100
              ${settings.target === 'master'
                ? 'bg-red-500/10 border border-red-500/30'
                : 'hover:bg-bg-hover border border-transparent'
              }
            `}
          >
            <VolumeX size={12} className="text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-text-primary text-xs">Master Volume</span>
              <span className="text-text-muted text-xs ml-2">(System-wide)</span>
            </div>
            {settings.target === 'master' && (
              <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
            )}
          </button>

          {/* Per-app sessions */}
          {sessions.filter(s => s.processName !== 'master').map((session) => (
            <button
              key={session.processName}
              onClick={() => handleTargetChange(session.processName, session.displayName)}
              className={`
                w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-100
                ${settings.target === session.processName
                  ? 'bg-red-500/10 border border-red-500/30'
                  : 'hover:bg-bg-hover border border-transparent'
                }
              `}
            >
              {session.isMuted
                ? <VolumeX size={12} className="text-red-400 flex-shrink-0" />
                : <Volume2 size={12} className="text-green-400 flex-shrink-0" />
              }
              <span className="text-text-primary text-xs truncate flex-1">{session.displayName}</span>
              <span className="text-text-muted text-xs">{session.volume}%</span>
              {settings.target === session.processName && (
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
