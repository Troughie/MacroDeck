import React, { useState, useEffect } from 'react';
import { Play, AlertCircle, Save, Trash2, FolderOpen, Zap } from 'lucide-react';
import { AE_PRESETS, AE_PRESET_CATEGORIES } from './aePresets';
import { electronAPI } from '../../../lib/electron';
import { useAeScriptStore } from '../../../stores/aeScriptStore';
import { useAeExpressionStore } from '../../../stores/aeExpressionStore';
import { AeExprTarget } from '../../../types/macro.types';
import { compileExpression } from './compileExpression';

interface Props {
  scriptType: 'preset' | 'custom' | 'expression';
  presetId: string | undefined;
  customScript: string | undefined;
  onScriptTypeChange: (type: 'preset' | 'custom' | 'expression') => void;
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
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');
  const [saveName, setSaveName] = useState('');

  const { scripts, loaded, load, addScript, removeScript } = useAeScriptStore();

  const {
    expressions,
    loaded: exprLoaded,
    load: loadExpr,
    addExpression,
    removeExpression,
  } = useAeExpressionStore();

  const [exprText, setExprText] = useState('');
  const [exprName, setExprName] = useState('');
  const [exprTarget, setExprTarget] = useState<AeExprTarget>('selected');
  const [exprTestStatus, setExprTestStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [exprTestError, setExprTestError] = useState('');

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (!exprLoaded) loadExpr();
  }, [exprLoaded, loadExpr]);

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
    try {
      const result = await electronAPI?.ae.execute(jsx);
      if (result?.ok) {
        setTestStatus('ok');
        setTimeout(() => setTestStatus('idle'), 2500);
      } else {
        setTestStatus('error');
        setTestError(result?.error ?? 'Unknown error');
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e?.message ?? 'IPC error');
    }
  };

  const handleSaveToLibrary = () => {
    const jsx = customScript?.trim();
    const name = saveName.trim();
    if (!jsx || !name) return;
    addScript(name, jsx);
    setSaveName('');
  };

  const EXPR_TARGETS: { value: AeExprTarget; label: string }[] = [
    { value: 'selected', label: 'Selected property' },
    { value: 'position', label: 'Position' },
    { value: 'scale', label: 'Scale' },
    { value: 'rotation', label: 'Rotation' },
    { value: 'opacity', label: 'Opacity' },
    { value: 'anchorPoint', label: 'Anchor Point' },
  ];

  const handleSaveExpression = () => {
    const expr = exprText.trim();
    const name = exprName.trim();
    if (!expr || !name) return;
    addExpression(name, expr, exprTarget);
    setExprName('');
  };

  const handleTestExpression = async () => {
    const expr = exprText.trim();
    if (!expr) return;
    setExprTestStatus('running');
    setExprTestError('');
    try {
      const jsx = compileExpression(expr, exprTarget);
      const result = await electronAPI?.ae.execute(jsx);
      if (result?.ok) {
        setExprTestStatus('ok');
        setTimeout(() => setExprTestStatus('idle'), 2500);
      } else {
        setExprTestStatus('error');
        setExprTestError(result?.error ?? 'Unknown error');
      }
    } catch (e: any) {
      setExprTestStatus('error');
      setExprTestError(e?.message ?? 'IPC error');
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
        /* Grouped preset list — all categories shown with headers, no dropdown */
        <div>
          <label className="text-text-secondary text-xs font-medium mb-1.5 block">Script</label>
          <div className="rounded-lg border border-border overflow-y-auto max-h-96">
            {AE_PRESET_CATEGORIES.map(cat => {
              const items = AE_PRESETS.filter(p => p.category === cat.id);
              if (items.length === 0) return null;
              return (
                <div key={cat.id}>
                  <div className="px-3 py-1.5 bg-bg-card border-y border-border sticky top-0 z-10 first:border-t-0">
                    <p className="text-text-muted text-[10px] font-semibold uppercase tracking-wide">
                      {cat.label}
                    </p>
                  </div>
                  {items.map(preset => (
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
              );
            })}
          </div>
        </div>
      ) : (
        /* Custom JSX editor + reusable library */
        <>
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

          {/* Save current script to the shared library */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input-field flex-1 text-xs"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Name this script to reuse it..."
            />
            <button
              onClick={handleSaveToLibrary}
              disabled={!customScript?.trim() || !saveName.trim()}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
              title="Save to library so other keys can reuse it"
            >
              <Save size={12} />
              Save
            </button>
          </div>

          {/* Saved scripts library */}
          {scripts.length > 0 && (
            <div>
              <label className="text-text-secondary text-xs font-medium mb-1.5 flex items-center gap-1">
                <FolderOpen size={12} />
                Saved Scripts
              </label>
              <div className="rounded-lg border border-border overflow-y-auto max-h-48">
                {scripts.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs border-b border-border last:border-b-0 hover:bg-bg-hover group"
                  >
                    <button
                      onClick={() => onCustomScriptChange(s.jsx)}
                      className="flex-1 text-left text-text-primary truncate"
                      title="Load this script into the editor"
                    >
                      {s.name}
                    </button>
                    <button
                      onClick={() => removeScript(s.id)}
                      className="text-text-muted hover:text-red-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete from library"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Expressions library ─────────────────────────────────────── */}
          <div className="border-t border-border pt-3 space-y-3">
            <label className="text-text-secondary text-xs font-medium flex items-center gap-1">
              <Zap size={12} />
              Expressions
            </label>

            <textarea
              className="input-field w-full text-xs font-mono resize-y"
              rows={3}
              value={exprText}
              onChange={e => setExprText(e.target.value)}
              placeholder="wiggle(3, 20)"
              spellCheck={false}
            />

            <div className="flex items-center gap-2">
              <select
                className="input-field text-xs py-1.5 flex-shrink-0"
                value={exprTarget}
                onChange={e => setExprTarget(e.target.value as AeExprTarget)}
              >
                {EXPR_TARGETS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <input
                type="text"
                className="input-field flex-1 text-xs"
                value={exprName}
                onChange={e => setExprName(e.target.value)}
                placeholder="Name this expression..."
              />
              <button
                onClick={handleSaveExpression}
                disabled={!exprText.trim() || !exprName.trim()}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
              >
                <Save size={12} />
                Save
              </button>
            </div>

            <button
              onClick={handleTestExpression}
              disabled={exprTestStatus === 'running' || !exprText.trim()}
              className="btn-secondary text-xs py-1.5 w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Play size={12} />
              {exprTestStatus === 'running' ? 'Running...' : exprTestStatus === 'ok' ? 'Success!' : 'Test Expression'}
            </button>

            {exprTestStatus === 'error' && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-xs">{exprTestError}</p>
              </div>
            )}

            {expressions.length > 0 && (
              <div className="rounded-lg border border-border overflow-y-auto max-h-48">
                {expressions.map(e => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs border-b border-border last:border-b-0 hover:bg-bg-hover group"
                  >
                    <button
                      onClick={() => { setExprText(e.expression); setExprTarget(e.target); }}
                      className="flex-1 text-left text-text-primary truncate"
                      title="Load this expression into the editor"
                    >
                      {e.name}
                    </button>
                    <span className="text-text-muted flex-shrink-0 text-[10px] uppercase tracking-wide">
                      {e.target}
                    </span>
                    <button
                      onClick={() => removeExpression(e.id)}
                      className="text-text-muted hover:text-red-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete expression"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
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
