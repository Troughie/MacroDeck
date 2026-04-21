import React from 'react';
import { ArrowLeftRight, ArrowRight, ArrowLeft, Layers } from 'lucide-react';
import { MacroConfig, ProfileSwitchSettings as ProfileSwitchSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { useProfileStore } from '../../stores/profileStore';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

type SwitchMode = ProfileSwitchSettingsType['mode'];

const MODES: { value: SwitchMode; label: string; icon: React.ComponentType<any>; desc: string }[] = [
  { value: 'specific', label: 'Go to Profile', icon: Layers,         desc: 'Switch to a specific profile' },
  { value: 'next',     label: 'Next Profile',  icon: ArrowRight,     desc: 'Cycle to next profile' },
  { value: 'prev',     label: 'Prev Profile',  icon: ArrowLeft,      desc: 'Cycle to previous profile' },
];

export function ProfileSwitchSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const { profiles } = useProfileStore();
  const settings = macro.settings as ProfileSwitchSettingsType;

  const handleModeChange = (mode: SwitchMode) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, mode } });
  };

  const handleTargetChange = (targetProfileId: string) => {
    const target = profiles.find(p => p.id === targetProfileId);
    updateMacro(profileId, keyCode, {
      displayName: `→ ${target?.name ?? 'Profile'}`,
      settings: { ...settings, targetProfileId },
    });
  };

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Switch Mode</label>
        <div className="space-y-1.5">
          {MODES.map(({ value, label, icon: Icon, desc }) => (
            <button
              key={value}
              onClick={() => handleModeChange(value)}
              className={`
                w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all duration-100
                ${settings.mode === value
                  ? 'bg-purple-500/15 border-purple-500/50'
                  : 'bg-bg-card border-border hover:border-border-hover hover:bg-bg-hover'
                }
              `}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                settings.mode === value ? 'bg-purple-500/20' : 'bg-bg-secondary'
              }`}>
                <Icon size={14} className={settings.mode === value ? 'text-purple-400' : 'text-text-muted'} />
              </div>
              <div>
                <p className={`text-xs font-medium ${settings.mode === value ? 'text-purple-300' : 'text-text-primary'}`}>
                  {label}
                </p>
                <p className="text-text-muted text-xs">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Target profile selector (only for 'specific' mode) */}
      {settings.mode === 'specific' && (
        <div>
          <label className="text-text-secondary text-xs font-medium mb-1.5 block">Target Profile</label>
          <div className="space-y-1">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => handleTargetChange(profile.id)}
                className={`
                  w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all duration-100
                  ${settings.targetProfileId === profile.id
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-border bg-bg-card hover:border-border-hover hover:bg-bg-hover'
                  }
                `}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: profile.color }}
                />
                <span className={`text-xs font-medium ${
                  settings.targetProfileId === profile.id ? 'text-purple-300' : 'text-text-primary'
                }`}>
                  {profile.name}
                </span>
                {settings.targetProfileId === profile.id && (
                  <span className="ml-auto text-purple-400 text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info for cycle modes */}
      {settings.mode !== 'specific' && (
        <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-start gap-2">
            <ArrowLeftRight size={12} className="text-purple-400 mt-0.5 flex-shrink-0" />
            <p className="text-purple-300 text-xs leading-relaxed">
              {settings.mode === 'next'
                ? 'Cycles forward through profiles in order. Wraps around to first after last.'
                : 'Cycles backward through profiles. Wraps around to last after first.'
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
