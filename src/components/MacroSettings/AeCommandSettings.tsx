import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MacroConfig, AeCommandSettings as AeCommandSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { electronAPI } from '../../lib/electron';
import { AeShortcutPicker } from './ae/AeShortcutPicker';
import { AeScriptEditor } from './ae/AeScriptEditor';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function AeCommandSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const settings = macro.settings as AeCommandSettingsType;
  const [aeFound, setAeFound] = useState<boolean | null>(null);

  useEffect(() => {
    electronAPI?.ae.detect().then((r: any) => setAeFound(r.found));
  }, []);

  const update = (patch: Partial<AeCommandSettingsType>) => {
    updateMacro(profileId, keyCode, { settings: { ...settings, ...patch } });
  };

  return (
    <div className="space-y-4">
      {/* AE not found warning */}
      {aeFound === false && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-300 text-xs">
            After Effects not found. Install Adobe After Effects or it must be running for scripts to work.
          </p>
        </div>
      )}

      {/* Mode tabs */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Mode</label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => update({ mode: 'shortcut' })}
            className={`flex-1 py-1.5 text-xs transition-colors ${
              settings.mode === 'shortcut'
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            Shortcuts
          </button>
          <button
            onClick={() => update({ mode: 'script' })}
            className={`flex-1 py-1.5 text-xs border-l border-border transition-colors ${
              settings.mode === 'script'
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            Scripts
          </button>
        </div>
      </div>

      {/* Tab content */}
      {settings.mode === 'shortcut' || !settings.mode ? (
        <AeShortcutPicker
          selectedId={settings.shortcutId}
          onChange={shortcutId => update({ mode: 'shortcut', shortcutId })}
        />
      ) : (
        <AeScriptEditor
          scriptType={settings.scriptType ?? 'preset'}
          presetId={settings.presetId}
          customScript={settings.script}
          onScriptTypeChange={scriptType => update({ scriptType })}
          onPresetChange={presetId => update({ scriptType: 'preset', presetId })}
          onCustomScriptChange={script => update({ scriptType: 'custom', script })}
        />
      )}
    </div>
  );
}
