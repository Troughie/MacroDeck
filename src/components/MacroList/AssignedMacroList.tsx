import React from 'react';
import { Trash2, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { useMacroStore } from '../../stores/macroStore';
import { useProfileStore } from '../../stores/profileStore';
import { MacroType, GLOBAL_PROFILE_ID } from '../../types/macro.types';

const TYPE_COLORS: Record<MacroType, string> = {
  APP_LAUNCH: '#f59e0b',
  WEB_LINK: '#3b82f6',
  MULTIMEDIA: '#8b5cf6',
  MUTE_TOGGLE: '#ef4444',
  VOLUME_ADJUST: '#22c55e',
  HOTKEY: '#06b6d4',
  PROFILE_SWITCH: '#a855f7',
  FORCE_QUIT: '#f97316',
  AE_COMMAND: '#00bcd4',
};

const TYPE_LABELS: Record<MacroType, string> = {
  APP_LAUNCH: 'App',
  WEB_LINK: 'Web',
  MULTIMEDIA: 'Media',
  MUTE_TOGGLE: 'Mute',
  VOLUME_ADJUST: 'Vol',
  HOTKEY: 'Key',
  PROFILE_SWITCH: 'Profile',
  FORCE_QUIT: 'Kill',
  AE_COMMAND: 'AE',
};

export function AssignedMacroList() {
  const [expanded, setExpanded] = React.useState(true);
  const { getMacrosForProfile, removeMacro, selectKey, selectedKeyCode, allMacros } = useMacroStore();
  const { activeProfileId } = useProfileStore();

  const macros = getMacrosForProfile(activeProfileId);
  const entries = Object.entries(macros);
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-border">
      {/* Section header */}
      <button
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-bg-hover transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-text-secondary text-xs font-medium">
          Assigned ({entries.length})
        </span>
        {expanded ? <ChevronDown size={12} className="text-text-muted" /> : <ChevronUp size={12} className="text-text-muted" />}
      </button>

      {expanded && (
        <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
          {entries.map(([keyCode, macro]) => (
            <div
              key={keyCode}
              className={`
                flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-150
                ${selectedKeyCode === keyCode
                  ? 'bg-accent-blue/10 border border-accent-blue/30'
                  : 'bg-bg-card border border-border hover:border-border-hover hover:bg-bg-hover'
                }
              `}
              onClick={() => selectKey(keyCode)}
            >
              {/* Type badge */}
              <span
                className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: TYPE_COLORS[macro.type],
                  backgroundColor: `${TYPE_COLORS[macro.type]}20`,
                }}
              >
                {keyCode.replace('Key', '').replace('Digit', '').slice(0, 4)}
              </span>

              {/* Macro name */}
              <span className="text-text-secondary text-xs flex-1 truncate">
                {macro.displayName}
              </span>

              {/* Global indicator */}
              {macro.profileId === GLOBAL_PROFILE_ID && (
                <Globe size={10} className="text-accent-blue flex-shrink-0" />
              )}

              {/* Type label */}
              <span className="text-xs" style={{ color: TYPE_COLORS[macro.type] }}>
                {TYPE_LABELS[macro.type]}
              </span>

              {/* Remove button */}
              <button
                className="p-1 hover:text-red-400 text-text-muted transition-colors"
                onClick={(e) => { e.stopPropagation(); removeMacro(macro.profileId, keyCode); }}
                title="Remove macro"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
