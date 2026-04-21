import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Pencil, Trash2, Check, X, Globe } from 'lucide-react';
import { useProfileStore } from '../../stores/profileStore';
import { DEFAULT_PROFILE_ID, GLOBAL_PROFILE_ID } from '../../types/macro.types';

const PROFILE_COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#f97316',
];

export function ProfileSelector() {
  const { profiles, activeProfileId, setActiveProfile, addProfile, updateProfile, removeProfile } = useProfileStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PROFILE_COLORS[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addProfile(newName.trim(), newColor);
    setNewName('');
    setNewColor(PROFILE_COLORS[0]);
    setAdding(false);
  };

  const handleEdit = (id: string) => {
    updateProfile(id, { name: editName.trim() || 'Profile' });
    setEditingId(null);
  };

  return (
    <div ref={ref} className="relative titlebar-no-drag">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 h-8 rounded-lg border text-xs font-medium transition-all
          ${open ? 'bg-bg-hover border-accent-blue text-text-primary' : 'bg-bg-card border-border text-text-secondary hover:border-border-hover hover:text-text-primary'}`}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: activeProfile?.color ?? '#3b82f6' }}
        />
        <span className="max-w-[100px] truncate">{activeProfile?.name ?? 'Default'}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-10 left-0 w-56 bg-bg-secondary border border-border rounded-lg shadow-card z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-text-muted text-xs font-medium uppercase tracking-wider">Profiles</span>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {profiles.map(profile => (
              <div key={profile.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-bg-hover">
                {editingId === profile.id ? (
                  <>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: profile.color }} />
                    <input
                      autoFocus
                      className="flex-1 bg-bg-card border border-accent-blue rounded px-2 py-0.5 text-xs text-text-primary outline-none"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEdit(profile.id); if (e.key === 'Escape') setEditingId(null); }}
                    />
                    <button onClick={() => handleEdit(profile.id)} className="text-accent-green hover:text-accent-green p-0.5"><Check size={12} /></button>
                    <button onClick={() => setEditingId(null)} className="text-text-muted hover:text-text-primary p-0.5"><X size={12} /></button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setActiveProfile(profile.id); setOpen(false); }}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: profile.color }} />
                      <span className={`text-xs truncate ${activeProfileId === profile.id ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                        {profile.name}
                      </span>
                      {activeProfileId === profile.id && <Check size={11} className="text-accent-blue ml-auto flex-shrink-0" />}
                    </button>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        onClick={() => { setEditingId(profile.id); setEditName(profile.name); }}
                        className="p-1 text-text-muted hover:text-text-primary rounded"
                      ><Pencil size={11} /></button>
                      {profile.id !== DEFAULT_PROFILE_ID && (
                        <button
                          onClick={() => removeProfile(profile.id)}
                          className="p-1 text-text-muted hover:text-red-400 rounded"
                        ><Trash2 size={11} /></button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new profile */}
          <div className="border-t border-border p-2">
            {adding ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  className="w-full bg-bg-card border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-blue"
                  placeholder="Profile name..."
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PROFILE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={handleAdd} className="flex-1 btn-primary text-xs py-1">Add</button>
                  <button onClick={() => setAdding(false)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary text-xs transition-colors"
              >
                <Plus size={12} />
                New Profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
