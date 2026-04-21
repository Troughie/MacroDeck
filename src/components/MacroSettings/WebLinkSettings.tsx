import React, { useState, useEffect, useMemo } from 'react';
import { Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { MacroConfig, InstalledApp, WebLinkSettings as WebLinkSettingsType } from '../../types/macro.types';
import { useMacroStore } from '../../stores/macroStore';
import { electronAPI } from '../../lib/electron';

const BROWSER_PATTERNS = [
  { name: 'Google Chrome', patterns: ['chrome.exe', 'googlechrome'] },
  { name: 'Mozilla Firefox', patterns: ['firefox.exe'] },
  { name: 'Microsoft Edge', patterns: ['msedge.exe', 'microsoftedge'] },
  { name: 'Brave Browser', patterns: ['brave.exe'] },
  { name: 'Opera', patterns: ['opera.exe', 'launcher.exe'] },
  { name: 'Vivaldi', patterns: ['vivaldi.exe'] },
];

function isBrowser(app: InstalledApp): boolean {
  const nameLower = app.name.toLowerCase();
  const pathLower = app.exePath.toLowerCase();
  return BROWSER_PATTERNS.some((b) =>
    b.patterns.some((p) => nameLower.includes(p.replace('.exe', '')) || pathLower.includes(p))
  );
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

export function WebLinkSettings({ keyCode, macro, profileId }: Props) {
  const { updateMacro } = useMacroStore();
  const settings = macro.settings as WebLinkSettingsType;

  const [browsers, setBrowsers] = useState<InstalledApp[]>([]);
  const [urlInput, setUrlInput] = useState(settings.url || '');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (!electronAPI) return;
    electronAPI.apps.getInstalled().then((apps: import('../../types/macro.types').InstalledApp[]) => {
      setBrowsers(apps.filter(isBrowser));
    }).catch(console.error);
  }, []);

  const handleBrowserSelect = (browser: InstalledApp) => {
    updateMacro(profileId, keyCode, {
      settings: {
        ...settings,
        browserExePath: browser.exePath,
        browserName: browser.name,
      },
    });
  };

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    if (value && !isValidUrl(value)) {
      setUrlError('Enter a valid URL (e.g. https://example.com)');
    } else {
      setUrlError('');
      updateMacro(profileId, keyCode, {
        settings: { ...settings, url: value },
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* URL Input */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">URL</label>
        <div className="relative">
          <Globe size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className={`input-field pl-8 ${urlError ? 'border-red-500/50' : ''}`}
            placeholder="https://example.com"
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
          />
          {urlInput && !urlError && (
            <CheckCircle2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-green" />
          )}
        </div>
        {urlError && (
          <div className="flex items-center gap-1 mt-1">
            <AlertCircle size={11} className="text-red-400" />
            <p className="text-red-400 text-xs">{urlError}</p>
          </div>
        )}
      </div>

      {/* Browser selector */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">
          Open with browser
        </label>
        {browsers.length === 0 ? (
          <p className="text-text-muted text-xs">No browsers detected — will use system default</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {/* Default option */}
            <button
              onClick={() => updateMacro(profileId, keyCode, { settings: { ...settings, browserExePath: '', browserName: 'Default' } })}
              className={`
                px-3 py-1.5 rounded-lg text-xs border transition-all duration-100
                ${!settings.browserExePath
                  ? 'bg-accent-blue/10 border-accent-blue/50 text-accent-blue'
                  : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                }
              `}
            >
              Default
            </button>
            {browsers.map((browser) => (
              <button
                key={browser.exePath}
                onClick={() => handleBrowserSelect(browser)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs border transition-all duration-100
                  ${settings.browserExePath === browser.exePath
                    ? 'bg-accent-blue/10 border-accent-blue/50 text-accent-blue'
                    : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                  }
                `}
              >
                {browser.name.replace('Google ', '').replace(' Browser', '').slice(0, 12)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
