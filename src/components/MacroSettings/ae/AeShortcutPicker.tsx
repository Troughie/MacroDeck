import React, { useState } from 'react';
import { AE_SHORTCUTS, AE_SHORTCUT_CATEGORIES, AeShortcut } from './aeShortcuts';

interface Props {
  selectedId: string | undefined;
  onChange: (shortcutId: string) => void;
}

export function AeShortcutPicker({ selectedId, onChange }: Props) {
  const [category, setCategory] = useState(AE_SHORTCUT_CATEGORIES[0].id);

  const filtered = AE_SHORTCUTS.filter(s => s.category === category);
  const selected = AE_SHORTCUTS.find(s => s.id === selectedId);

  return (
    <div className="space-y-3">
      {/* Category selector */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Category</label>
        <select
          className="input-field w-full text-sm"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {AE_SHORTCUT_CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
      </div>

      {/* Action list */}
      <div>
        <label className="text-text-secondary text-xs font-medium mb-1.5 block">Action</label>
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map((shortcut: AeShortcut) => (
            <button
              key={shortcut.id}
              onClick={() => onChange(shortcut.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors border-b border-border last:border-b-0 ${
                shortcut.id === selectedId
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span>{shortcut.label}</span>
              <span className="text-text-muted font-mono">{shortcut.displayKeys}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      {selected && (
        <div className="p-2 rounded-lg bg-bg-card border border-border">
          <p className="text-text-muted text-xs mb-0.5">Will send:</p>
          <p className="text-text-primary text-xs font-mono">{selected.displayKeys}</p>
          {selected.actions.length > 1 && (
            <p className="text-text-muted text-xs mt-0.5">(sent as {selected.actions.length} separate key presses)</p>
          )}
        </div>
      )}
    </div>
  );
}
