import React, { useEffect } from 'react';
import { Music, SkipBack, SkipForward, Play, Pause, PlayCircle } from 'lucide-react';
import { MacroConfig, MultimediaSettings as MultimediaSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { useAudioStore } from '../../stores/audioStore';

type MediaAction = MultimediaSettingsType['action'];

const ACTIONS: { value: MediaAction; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'PLAY_PAUSE', label: 'Play/Pause', icon: PlayCircle },
  { value: 'PLAY', label: 'Play', icon: Play },
  { value: 'PAUSE', label: 'Pause', icon: Pause },
  { value: 'PREV', label: 'Previous', icon: SkipBack },
  { value: 'NEXT', label: 'Next', icon: SkipForward },
];

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function MultimediaSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const { sessions, loadSessions } = useAudioStore();
  const settings = macro.settings as MultimediaSettingsType;

  useEffect(() => {
    loadSessions();
  }, []);

  const handleActionChange = (action: MediaAction) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, action } });
  };

  const handleTargetChange = (target: string, name: string) => {
    updateMacro(profileId, keyCode, {
      settings: { ...settings, targetApp: target, targetAppName: name },
    });
  };

  return (
    <div className="space-y-3">
      {/* Action selector */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Action</label>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleActionChange(value)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all duration-100
                ${settings.action === value
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                  : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                }
              `}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Target app */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Target</label>
        <div className="space-y-1 max-h-50 overflow-y-auto">
          {/* System option */}
          <button
            onClick={() => handleTargetChange('system', 'System (Global)')}
            className={`
              w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-100
              ${settings.targetApp === 'system'
                ? 'bg-purple-500/10 border border-purple-500/30'
                : 'hover:bg-bg-hover border border-transparent'
              }
            `}
          >
            <Music size={12} className="text-purple-400 flex-shrink-0" />
            <span className="text-text-primary text-xs">System (Global)</span>
          </button>

          {/* Audio sessions */}
          {sessions.filter(s => s.processName !== 'master').map((session) => (
            <button
              key={session.processName}
              onClick={() => handleTargetChange(session.processName, session.displayName)}
              className={`
                w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all duration-100
                ${settings.targetApp === session.processName
                  ? 'bg-purple-500/10 border border-purple-500/30'
                  : 'hover:bg-bg-hover border border-transparent'
                }
              `}
            >
              {session.iconDataUrl
                ? <img src={session.iconDataUrl} alt={session.displayName} width={32} height={32} />
                : <Music size={12} className="text-purple-400 flex-shrink-0" />
              }

              <span className="text-text-primary text-xs truncate">{session.displayName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
