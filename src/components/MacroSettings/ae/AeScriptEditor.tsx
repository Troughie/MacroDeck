import React, { useState } from 'react';
import { Play, AlertCircle } from 'lucide-react';
import { AE_PRESETS, AE_PRESET_CATEGORIES } from './aePresets';
import { electronAPI } from '../../../lib/electron';

interface Props {
  scriptType: 'preset' | 'custom';
  presetId: string | undefined;
  customScript: string | undefined;
  onScriptTypeChange: (type: 'preset' | 'custom') => void;
  onPresetChange: (presetId: string) => void;
  onCustomScriptChange: (script: string) => void;
}

export function AeScriptEditor({
  scriptType,
  presetId,
  customScript,
  onScriptTypeChange,
  onPresetChange,
  onCustomScriptChange,
}: Props) {
  const [presetCategory, setPresetCategory] = useState(AE_PRESET_CATEGORIES[0].id);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');

  const filteredPresets = AE_PRESETS.filter(p => p.category === presetCategory);
  const selectedPreset = AE_PRESETS.find(p => p.id === presetId);

  const resolveJsx = (): string | null => {
    if (scriptType === 'preset') return selectedPreset?.jsx ?? null;
    return customScript ?? null;
  };

  const handleTest = async () => {
    const jsx = resolveJsx();
    if (!jsx?.trim()) return;
    setTestStatus('running');
    setTestError('');
    const result = await electronAPI?.ae.execute(jsx);
    if (result?.ok) {
      setTestStatus('ok');
      setTimeout(() => setTestStatus('idle'), 2500);
    } else {
      setTestStatus('error');
      setTestError(result?.error ?? 'Unknown error');
    }
  };

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => onScriptTypeChange('preset')}
          className={`flex-1 py-1.5 text-xs transition-colors ${
            scriptType === 'preset'
              ? 'bg-accent-blue/20 text-accent-blue'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          Preset
        </button>
        <button
          onClick={() => onScriptTypeChange('custom')}
          className={`flex-1 py-1.5 text-xs border-l border-border transition-colors ${
            scriptType === 'custom'
              ? 'bg-accent-blue/20 text-accent-blue'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          Custom JSX
        </button>
      </div>

      {scriptType === 'preset' ? (
        <>
          {/* Preset category */}
          <div>
            <label className="text-text-secondary text-xs font-medium mb-1.5 block">Category</label>
            <select
              className="input-field w-full text-sm"
              value={presetCategory}
              onChange={e => setPresetCategory(e.target.value)}
            >
              {AE_PRESET_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Preset picker */}
          <div>
            <label className="text-text-secondary text-xs font-medium mb-1.5 block">Script</label>
            <div className="rounded-lg border border-border overflow-hidden">
              {filteredPresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => onPresetChange(preset.id)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-border last:border-b-0 ${
                    preset.id === presetId
                      ? 'bg-accent-blue/20 text-accent-blue'
                      : 'text-text-primary hover:bg-bg-hover'
                  }`}
                >
                  <p className="font-medium">{preset.label}</p>
                  <p className="text-text-muted mt-0.5">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Custom JSX editor */
        <div>
          <label className="text-text-secondary text-xs font-medium mb-1.5 block">JSX Script</label>
          <textarea
            className="input-field w-full text-xs font-mono resize-y"
            rows={10}
            value={customScript ?? ''}
            onChange={e => onCustomScriptChange(e.target.value)}
            placeholder="// Write your After Effects ExtendScript here..."
            spellCheck={false}
          />
        </div>
      )}

      {/* Test Script button */}
      <button
        onClick={handleTest}
        disabled={testStatus === 'running' || !resolveJsx()?.trim()}
        className="btn-secondary text-xs py-1.5 w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <Play size={12} />
        {testStatus === 'running' ? 'Running...' : testStatus === 'ok' ? 'Success!' : 'Test Script'}
      </button>

      {/* Error display */}
      {testStatus === 'error' && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-xs">{testError}</p>
        </div>
      )}
    </div>
  );
}
