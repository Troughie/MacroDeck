import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Loader2 } from 'lucide-react';
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

interface PanelStatus { installed: boolean; alive: boolean; aeVersion?: string; }

function AePanelStatus() {
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = () => {
      electronAPI?.ae.panelStatus().then((s: PanelStatus) => { if (active) setStatus(s); });
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { active = false; clearInterval(t); };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try { await electronAPI?.ae.install(); } finally { setInstalling(false); }
  };

  const reinstallButton = (
    <button
      onClick={handleInstall}
      disabled={installing}
      className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
      title="Copy the latest panel files into After Effects (needed after MacroDeck updates the panel)"
    >
      {installing ? <Loader2 size={12} className="animate-spin" /> : null}
      {installing ? 'Updating...' : 'Reinstall'}
    </button>
  );

  if (!status) return null;

  if (status.alive) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle2 size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
        <p className="text-green-300 text-xs flex-1">
          Connected{status.aeVersion ? ` — AE ${status.aeVersion}` : ''}
          <br />
          <span className="text-text-muted">Scripts run instantly without window flicker.</span>
        </p>
        {reinstallButton}
      </div>
    );
  }

  if (status.installed) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <CircleDashed size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-yellow-300 text-xs flex-1">
          Installed but not open in AE
          <br />
          <span className="text-text-muted">Open Window &rarr; Extensions &rarr; MacroDeck in After Effects.</span>
        </p>
        {reinstallButton}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-bg-hover border border-border">
      <Circle size={12} className="text-text-muted flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-text-secondary text-xs">
          Panel not installed
          <br />
          <span className="text-text-muted">Install the panel so scripts run without bringing AE to the foreground.</span>
        </p>
      </div>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 disabled:opacity-50"
      >
        {installing ? <Loader2 size={12} className="animate-spin" /> : null}
        {installing ? 'Installing...' : 'Install'}
      </button>
    </div>
  );
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

  const isScriptMode = settings.mode === 'script';

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

      {/* Panel status — script mode only */}
      {isScriptMode && <AePanelStatus />}

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
