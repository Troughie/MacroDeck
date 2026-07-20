import React from 'react';
import { AE_SHORTCUTS, AE_SHORTCUT_CATEGORIES, AeShortcut } from './aeShortcuts';

interface Props {
  selectedId: string | undefined;
  onChange: (shortcutId: string) => void;
}

export function AeShortcutPicker({ selectedId, onChange }: Props) {
  return (
    <div>
      <label className="text-text-secondary text-xs font-medium mb-1.5 block">Action</label>
      <div className="rounded-lg border border-border overflow-y-auto max-h-80">
        {AE_SHORTCUT_CATEGORIES.map(cat => {
          const items = AE_SHORTCUTS.filter(s => s.category === cat.id);
          if (items.length === 0) return null;
          return (
            <div key={cat.id}>
              <div className="px-3 py-1.5 bg-bg-card border-y border-border sticky top-0 z-10 first:border-t-0">
                <p className="text-text-muted text-[10px] font-semibold uppercase tracking-wide">
                  {cat.label}
                </p>
              </div>
              {items.map((shortcut: AeShortcut) => (
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
          );
        })}
      </div>
    </div>
  );
}
