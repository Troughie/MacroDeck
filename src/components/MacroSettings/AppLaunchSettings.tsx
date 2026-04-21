import React, { useState, useEffect, useMemo } from 'react';
import { Search, Rocket, RefreshCw, CheckCircle2, FolderOpen, X } from 'lucide-react';
import { MacroConfig, InstalledApp, AppLaunchSettings as AppLaunchSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { electronAPI } from '../../lib/electron';
import path from 'path';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function AppLaunchSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const settings = macro.settings as AppLaunchSettingsType;

  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const loadApps = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!electronAPI) { setApps([]); setIsLoading(false); return; }
      const result = await electronAPI.apps.getInstalled();
      setApps(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadApps(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return apps.slice(0, 100);
    const q = search.toLowerCase();
    return apps.filter(a => a.name.toLowerCase().includes(q)).slice(0, 100);
  }, [apps, search]);

  const handleSelect = (app: InstalledApp) => {
    updateMacro(profileId, keyCode, {
      displayName: app.name.slice(0, 20),
      settings: { ...settings, exePath: app.exePath, appName: app.name },
    });
  };

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

      {/* Browse + Refresh row */}
      <div className="flex gap-2">
        <button
          onClick={handleBrowse}
          disabled={isBrowsing}
          className="btn-primary flex-1 text-xs py-2 gap-1.5"
        >
          <FolderOpen size={13} />
          {isBrowsing ? 'Selecting...' : 'Browse for .exe'}
        </button>
        <button
          onClick={loadApps}
          disabled={isLoading}
          className="btn-secondary text-xs py-2 px-3 gap-1.5"
          title="Refresh app list"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-muted text-xs">or choose from installed apps</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="input-field pl-8 pr-8"
          placeholder={`Search ${apps.length > 0 ? `${apps.length} installed apps` : 'installed apps'}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* App list */}
      <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 220 }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 gap-2">
            <RefreshCw size={14} className="animate-spin text-text-muted" />
            <span className="text-text-muted text-xs">Scanning installed apps...</span>
          </div>
        ) : error ? (
          <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs">{error}</p>
            <button onClick={loadApps} className="text-accent-blue text-xs mt-1 hover:underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-text-muted text-xs">
              {search ? `No apps matching "${search}"` : 'No apps found'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="text-accent-blue text-xs mt-1 hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          filtered.map(app => (
            <button
              key={app.exePath}
              onClick={() => handleSelect(app)}
              className={`
                w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-100
                ${settings.exePath === app.exePath
                  ? 'bg-accent-blue/10 border border-accent-blue/30'
                  : 'hover:bg-bg-hover border border-transparent'
                }
              `}
            >
              <Rocket size={12} className="text-yellow-500 flex-shrink-0" />
              <span className="text-text-primary text-xs truncate flex-1">{app.name}</span>
              {settings.exePath === app.exePath && (
                <CheckCircle2 size={12} className="text-accent-blue flex-shrink-0" />
              )}
            </button>
          ))
        )}
      </div>

      {/* Count */}
      {!isLoading && apps.length > 0 && (
        <p className="text-text-muted text-xs text-center">
          {filtered.length < apps.length
            ? `Showing ${filtered.length} of ${apps.length} apps`
            : `${apps.length} apps found`
          }
        </p>
      )}
    </div>
  );
}
