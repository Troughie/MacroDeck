import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Copy, X, Layers, Keyboard } from 'lucide-react';
import { useMacroStore } from '../../stores/macroStore';
import { useProfileStore } from '../../stores/profileStore';
import { KEYBOARD_LAYOUT, isInteractiveKey } from '../KeyboardVisualizer/keyboardLayout';
import { GLOBAL_PROFILE_ID } from '../../types/macro.types';

interface Props {
  fromProfileId: string;
  fromKeyCode: string;
  onClose: () => void;
}

// Flat list of all interactive keys
const ALL_KEYS = KEYBOARD_LAYOUT.flat().filter(k => isInteractiveKey(k.code));

export function MoveMacroDialog({ fromProfileId, fromKeyCode, onClose }: Props) {
  const { allMacros, moveMacro, getMacrosForProfile } = useMacroStore();
  const { profiles, activeProfileId } = useProfileStore();

  const [mode, setMode] = useState<'move' | 'copy'>('move');
  const [targetProfileId, setTargetProfileId] = useState(fromProfileId);
  const [targetKeyCode, setTargetKeyCode] = useState('');
  const [keySearch, setKeySearch] = useState('');

  const targetMacros = getMacrosForProfile(targetProfileId);

  const filteredKeys = ALL_KEYS.filter(k => {
    if (!keySearch) return true;
    return k.label.toLowerCase().includes(keySearch.toLowerCase()) ||
           k.code.toLowerCase().includes(keySearch.toLowerCase());
  });

  const handleConfirm = () => {
    if (!targetKeyCode) return;
    moveMacro(fromProfileId, fromKeyCode, targetProfileId, targetKeyCode, mode);
    onClose();
  };

  const fromMacro = allMacros[`${fromProfileId}:${fromKeyCode}`];
  const targetOccupied = targetKeyCode ? !!targetMacros[targetKeyCode] : false;
  const isSameLocation = targetProfileId === fromProfileId && targetKeyCode === fromKeyCode;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="panel w-[480px] max-h-[80vh] flex flex-col"
        style={{ maxWidth: 'calc(100vw - 32px)' }}
      >
        {/* Header */}
        <div className="panel-header">
          <ArrowRight size={15} className="text-accent-blue" />
          <span className="text-text-primary font-medium text-sm flex-1">
            {mode === 'move' ? 'Move Macro' : 'Copy Macro'}
          </span>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={14} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Source info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-card border border-border">
            <div className="w-8 h-8 rounded-lg bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent-blue text-xs font-mono font-bold">
                {fromKeyCode.replace('Key','').replace('Digit','').slice(0,4)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-xs font-medium">{fromMacro?.displayName ?? fromKeyCode}</p>
              <p className="text-text-muted text-xs">{fromMacro?.type?.replace('_',' ')}</p>
            </div>
            <ArrowRight size={14} className="text-text-muted flex-shrink-0" />
            <div className="w-8 h-8 rounded-lg bg-bg-secondary border border-dashed border-border flex items-center justify-center flex-shrink-0">
              {targetKeyCode ? (
                <span className="text-text-primary text-xs font-mono font-bold">
                  {targetKeyCode.replace('Key','').replace('Digit','').slice(0,4)}
                </span>
              ) : (
                <span className="text-text-muted text-xs">?</span>
              )}
            </div>
          </div>

          {/* Mode toggle */}
          <div>
            <label className="text-text-secondary text-xs font-medium mb-2 block">Action</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('move')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                  mode === 'move'
                    ? 'bg-accent-blue/15 border-accent-blue/50 text-accent-blue'
                    : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                }`}
              >
                <ArrowRight size={13} /> Move (remove from original)
              </button>
              <button
                onClick={() => setMode('copy')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                  mode === 'copy'
                    ? 'bg-accent-blue/15 border-accent-blue/50 text-accent-blue'
                    : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                }`}
              >
                <Copy size={13} /> Copy (keep original)
              </button>
            </div>
          </div>

          {/* Target profile */}
          <div>
            <label className="text-text-secondary text-xs font-medium mb-2 block flex items-center gap-1.5">
              <Layers size={11} /> Target Profile
            </label>
            <div className="flex flex-wrap gap-1.5">
              {/* Global option */}
              <button
                onClick={() => setTargetProfileId(GLOBAL_PROFILE_ID)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                  targetProfileId === GLOBAL_PROFILE_ID
                    ? 'bg-accent-blue/15 border-accent-blue/50 text-accent-blue'
                    : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                }`}
              >
                🌐 All Profiles
              </button>
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => setTargetProfileId(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    targetProfileId === p.id
                      ? 'bg-accent-blue/15 border-accent-blue/50 text-accent-blue'
                      : 'bg-bg-card border-border text-text-secondary hover:border-border-hover'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                  {p.id === activeProfileId && <span className="text-text-muted">(current)</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Target key */}
          <div>
            <label className="text-text-secondary text-xs font-medium mb-2 block flex items-center gap-1.5">
              <Keyboard size={11} /> Target Key
            </label>
            <input
              className="input-field mb-2 text-xs"
              placeholder="Search keys (A, F1, Space...)"
              value={keySearch}
              onChange={e => setKeySearch(e.target.value)}
            />
            <div className="grid gap-1 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', maxHeight: 180 }}>
              {filteredKeys.map(k => {
                const isOccupied = !!targetMacros[k.code];
                const isSelected = targetKeyCode === k.code;
                const isSource = k.code === fromKeyCode && targetProfileId === fromProfileId;
                return (
                  <button
                    key={k.code}
                    onClick={() => setTargetKeyCode(k.code)}
                    title={isOccupied && !isSelected ? `Occupied by: ${targetMacros[k.code]?.displayName}` : k.code}
                    className={`
                      relative flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-xs transition-all
                      ${isSelected
                        ? 'bg-accent-blue/20 border-accent-blue text-accent-blue font-bold'
                        : isSource
                        ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
                        : isOccupied
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-bg-card border-border text-text-secondary hover:border-border-hover hover:bg-bg-hover'
                      }
                    `}
                  >
                    <span className="font-mono font-medium leading-tight">
                      {k.label || k.code.replace('Key','').replace('Digit','').slice(0,4)}
                    </span>
                    {isOccupied && !isSelected && (
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                    )}
                    {isSource && (
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400" /> Source key</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /> Has macro</span>
            </div>
          </div>

          {/* Warnings */}
          {targetOccupied && targetKeyCode && !isSameLocation && (
            <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300">
              ⚠️ Key <strong>{targetKeyCode.replace('Key','').replace('Digit','')}</strong> already has a macro assigned.
              It will be <strong>overwritten</strong>.
            </div>
          )}
          {isSameLocation && (
            <div className="p-2.5 rounded-lg bg-bg-card border border-border text-xs text-text-muted">
              Source and destination are the same.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 text-xs py-2">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!targetKeyCode || isSameLocation}
            className="btn-primary flex-1 text-xs py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === 'move' ? '→ Move Macro' : '⊕ Copy Macro'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
