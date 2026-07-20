import React, { useState, useEffect, useRef } from 'react';
import { Minus, Square, X, Keyboard, Settings, Power, EyeOff, Check, Upload, Download } from 'lucide-react';
import { electronAPI } from '../../lib/electron';
import { toast } from '../../stores/toastStore';
import { useMacroStore, syncMacroKeysToMain } from '../../stores/macroStore';
import { useProfileStore } from '../../stores/profileStore';
import { useAeScriptStore } from '../../stores/aeScriptStore';
import { useAeExpressionStore } from '../../stores/aeExpressionStore';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [runOnStartup, setRunOnStartup] = useState(false);
  const [startMinimized, setStartMinimized] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!electronAPI) return;
    electronAPI.window.isMaximized().then(setIsMaximized);
    const unsub = electronAPI.window.onMaximizeChange(setIsMaximized);

    electronAPI.store.loadSettings().then((s: import('../../types/macro.types').AppSettings) => {
      if (s) {
        setRunOnStartup(s.runOnStartup ?? false);
        setStartMinimized(s.startMinimized ?? false);
      }
    }).catch(() => {});

    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const handleRunOnStartup = async (enabled: boolean) => {
    setRunOnStartup(enabled);
    await electronAPI?.system.setStartup(enabled);
    await electronAPI?.store.saveSettings({ runOnStartup: enabled, startMinimized, theme: 'dark' });
  };

  const handleStartMinimized = async (enabled: boolean) => {
    setStartMinimized(enabled);
    await electronAPI?.store.saveSettings({ runOnStartup, startMinimized: enabled, theme: 'dark' });
  };

  const handleExport = async () => {
    setShowSettings(false);
    const res = await electronAPI?.backup.export();
    if (!res || res.canceled) return;
    if (res.ok) {
      toast.success('Settings exported', 'Backup file saved.', '💾');
    } else {
      toast.error('Export failed', res.error);
    }
  };

  const handleImport = async () => {
    setShowSettings(false);
    const res = await electronAPI?.backup.import();
    if (!res || res.canceled) return;
    if (!res.ok) {
      toast.error('Import failed', res.error);
      return;
    }
    // Config was replaced in the main store — reload every store from disk so the
    // UI reflects the imported macros, profiles, settings and AE libraries.
    await Promise.all([
      useProfileStore.getState().loadProfiles(),
      useMacroStore.getState().loadMacros(),
      useAeScriptStore.getState().load(),
      useAeExpressionStore.getState().load(),
    ]);
    syncMacroKeysToMain(useProfileStore.getState().activeProfileId);
    const s = await electronAPI?.store.loadSettings();
    if (s) {
      setRunOnStartup(s.runOnStartup ?? false);
      setStartMinimized(s.startMinimized ?? false);
    }
    toast.success('Settings imported', 'Your macros and profiles were restored.', '✅');
  };

  return (
    <div className="h-10 flex items-center justify-between bg-bg-secondary border-b border-border flex-shrink-0 titlebar-drag">
      <div className="flex items-center gap-2 px-4 titlebar-no-drag">
        <div className="w-6 h-6 rounded-md bg-accent-blue flex items-center justify-center">
          <Keyboard size={14} className="text-white" />
        </div>
        <span className="text-text-primary font-semibold text-sm tracking-wide">MacroDeck</span>
        <span className="text-text-muted text-xs">v1.0.0</span>
      </div>

      <div className="flex items-center titlebar-no-drag">
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`w-10 h-10 flex items-center justify-center transition-colors
              ${showSettings
                ? 'bg-bg-hover text-text-primary'
                : 'hover:bg-bg-hover text-text-secondary hover:text-text-primary'
              }`}
            title="Settings"
          >
            <Settings size={14} />
          </button>

          {showSettings && (
            <div className="absolute right-0 top-10 w-56 bg-bg-secondary border border-border rounded-lg shadow-card z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-border">
                <span className="text-text-muted text-xs font-medium uppercase tracking-wider">App Settings</span>
              </div>

              <button
                onClick={() => handleRunOnStartup(!runOnStartup)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover transition-colors text-left"
              >
                <Power size={14} className={runOnStartup ? 'text-accent-green' : 'text-text-muted'} />
                <div className="flex-1">
                  <p className="text-text-primary text-xs font-medium">Run on Startup</p>
                  <p className="text-text-muted text-xs">Launch with Windows</p>
                </div>
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                  ${runOnStartup ? 'bg-accent-blue border-accent-blue' : 'border-border'}`}>
                  {runOnStartup && <Check size={10} className="text-white" />}
                </div>
              </button>

              <button
                onClick={() => handleStartMinimized(!startMinimized)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover transition-colors text-left"
              >
                <EyeOff size={14} className={startMinimized ? 'text-accent-blue' : 'text-text-muted'} />
                <div className="flex-1">
                  <p className="text-text-primary text-xs font-medium">Start Minimized</p>
                  <p className="text-text-muted text-xs">Hide to tray on launch</p>
                </div>
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                  ${startMinimized ? 'bg-accent-blue border-accent-blue' : 'border-border'}`}>
                  {startMinimized && <Check size={10} className="text-white" />}
                </div>
              </button>

              <div className="border-t border-border">
                <div className="px-3 py-2">
                  <span className="text-text-muted text-xs font-medium uppercase tracking-wider">Backup</span>
                </div>
                <button
                  onClick={handleExport}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover transition-colors text-left"
                >
                  <Download size={14} className="text-text-muted" />
                  <div className="flex-1">
                    <p className="text-text-primary text-xs font-medium">Export Settings</p>
                    <p className="text-text-muted text-xs">Save all macros & profiles to a file</p>
                  </div>
                </button>
                <button
                  onClick={handleImport}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover transition-colors text-left"
                >
                  <Upload size={14} className="text-text-muted" />
                  <div className="flex-1">
                    <p className="text-text-primary text-xs font-medium">Import Settings</p>
                    <p className="text-text-muted text-xs">Restore from a backup file</p>
                  </div>
                </button>
              </div>

              <div className="px-3 py-2 border-t border-border">
                <p className="text-text-muted text-xs leading-relaxed">
                  Closing the window hides to tray. Right-click tray icon to quit.
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => electronAPI?.window.minimize()}
          className="w-10 h-10 flex items-center justify-center hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => electronAPI?.window.maximize()}
          className="w-10 h-10 flex items-center justify-center hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => electronAPI?.window.close()}
          className="w-10 h-10 flex items-center justify-center hover:bg-red-600 text-text-secondary hover:text-white transition-colors"
          title="Hide to Tray"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
