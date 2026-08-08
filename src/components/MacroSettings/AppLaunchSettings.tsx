import React, { useState } from 'react';
import { FolderOpen, CheckCircle2, X } from 'lucide-react';
import { MacroConfig, AppLaunchSettings as AppLaunchSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { electronAPI } from '../../lib/electron';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function AppLaunchSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const settings = macro.settings as AppLaunchSettingsType;

  const [isBrowsing, setIsBrowsing] = useState(false);

  const handleBrowse = async () => {
    if (!electronAPI) return;
    setIsBrowsing(true);
    try {
      const filePath = await electronAPI.apps.browseExe();
      if (filePath) {
        // Extract app name from filename
        const fileName = filePath.split('\\').pop()?.replace('.exe', '') ?? filePath;
        updateMacro(profileId, keyCode, {
          displayName: fileName.slice(0, 20),
          settings: { ...settings, exePath: filePath, appName: fileName },
        });
      }
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleClear = () => {
    updateMacro(profileId, keyCode, {
      settings: { ...settings, exePath: '', appName: '' },
    });
  };

  return (
    <div className="space-y-3">
      {/* Current selection */}
      {settings.exePath ? (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent-blue/10 border border-accent-blue/30">
          <CheckCircle2 size={14} className="text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-text-primary text-xs font-semibold truncate">{settings.appName}</p>
            <p className="text-text-muted text-xs truncate font-mono mt-0.5" title={settings.exePath}>
              {settings.exePath}
            </p>
          </div>
          <button
            onClick={handleClear}
            className="text-text-muted hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
            title="Clear selection"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-bg-card border border-border border-dashed text-center">
          <p className="text-text-muted text-xs">No app selected</p>
        </div>
      )}

      {/* Browse button with instruction */}
      <div className="space-y-2">
        <button
          onClick={handleBrowse}
          disabled={isBrowsing}
          className="btn-primary w-full text-xs py-2 gap-1.5"
        >
          <FolderOpen size={13} />
          {isBrowsing ? 'Selecting...' : 'Browse for .exe'}
        </button>
        <p className="text-text-muted text-xs text-center">
          You can also drag & drop shortcuts or folders onto keys
        </p>
      </div>
    </div>
  );
}
