import React, { useState, useRef, useEffect } from 'react';
import { Smile, X, Upload, Image } from 'lucide-react';

const EMOJI_CATEGORIES = [
  {
    label: 'Media',
    emojis: ['🎵','🎶','🎸','🎹','🎤','🎧','📻','🔊','🔇','🔔','⏯️','⏭️','⏮️','⏸️','▶️','⏹️','🎬','📺','📡','🎙️','🎚️','🎛️','🔈','📢'],
  },
  {
    label: 'Apps & Web',
    emojis: ['🚀','🌐','💻','📱','🖥️','⌨️','🖱️','📂','📁','🔗','📧','💬','🔍','📝','📋','🗂️','🖨️','💾','💿','📀','🖲️','📲','🗃️','🗄️'],
  },
  {
    label: 'Actions',
    emojis: ['⚡','🔥','💥','✨','🎯','🏆','🎮','🕹️','🎲','🃏','🎴','🀄','🎰','🎳','🎪','🎭','🏅','🥇','🎖️','🏵️','🎗️','🎀','🎁','🎊'],
  },
  {
    label: 'System',
    emojis: ['⚙️','🔧','🔨','🛠️','🔩','🔑','🔒','🔓','🛡️','⚠️','❌','✅','🔴','🟡','🟢','🔵','🟣','🟠','⭕','❗','❓','💡','🔦','🕯️'],
  },
  {
    label: 'Arrows',
    emojis: ['⬆️','⬇️','⬅️','➡️','↩️','↪️','🔄','🔃','⏫','⏬','⏪','⏩','🔼','🔽','↕️','↔️','↗️','↘️','↙️','↖️','🔀','🔁','🔂','🔛'],
  },
  {
    label: 'Symbols',
    emojis: ['❤️','💙','💚','💛','🧡','💜','🖤','🤍','💯','🔢','🔣','🔤','🅰️','🅱️','🆎','🆑','🆒','🆓','🆔','🆕','🆖','🆗','🆘','🆙'],
  },
  {
    label: 'People',
    emojis: ['👍','👎','👏','🙌','🤝','✌️','🤞','👌','🤙','💪','🦾','🖐️','✋','🤚','👋','🤜','🤛','👊','✊','🤲','🙏','🫶','❤️‍🔥','🫀'],
  },
  {
    label: 'Nature',
    emojis: ['🌟','⭐','🌙','☀️','🌈','⚡','🌊','🔥','💧','🌿','🍀','🌸','🌺','🌻','🌹','🍁','🍂','🍃','🌾','🌵','🌴','🌲','🌳','🎋'],
  },
];

interface EmojiPickerProps {
  value?: string;
  onChange: (emoji: string | undefined) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'emoji' | 'custom'>('emoji');
  const [customUrl, setCustomUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setSearch(''); setUrlError(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
  const filtered = search.trim()
    ? allEmojis.filter(e => e.includes(search.trim()))
    : null;

  const isCustomIcon = value && (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/'));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setUrlError('Please select an image file'); return; }
    if (file.size > 512 * 1024) { setUrlError('Image must be under 512KB'); return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onChange(dataUrl);
      setOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUrlSubmit = () => {
    const url = customUrl.trim();
    if (!url) return;
    if (!url.startsWith('http') && !url.startsWith('data:')) {
      setUrlError('Enter a valid URL starting with http:// or https://');
      return;
    }
    onChange(url);
    setCustomUrl('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Set icon"
        className={`
          w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all overflow-hidden
          ${open ? 'ring-1 ring-accent-blue' : ''}
          ${value
            ? 'bg-bg-card border border-accent-blue/40 hover:border-accent-blue'
            : 'bg-bg-card border border-border hover:border-border-hover text-text-muted hover:text-text-primary'
          }
        `}
      >
        {value ? (
          isCustomIcon ? (
            <img src={value} alt="icon" className="w-5 h-5 object-contain" />
          ) : (
            <span style={{ fontSize: 14, lineHeight: 1 }}>{value}</span>
          )
        ) : (
          <Smile size={13} />
        )}
      </button>

      {/* Picker panel — fixed position to avoid clipping */}
      {open && (
        <div
          className="fixed z-[9999] w-72 bg-bg-secondary border border-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
          style={{
            // Position below the button, aligned to its right edge
            top: (() => {
              const btn = ref.current?.querySelector('button');
              if (!btn) return 100;
              const rect = btn.getBoundingClientRect();
              const panelH = 380;
              // If not enough space below, show above
              return rect.bottom + panelH > window.innerHeight
                ? rect.top - panelH - 4
                : rect.bottom + 4;
            })(),
            left: (() => {
              const btn = ref.current?.querySelector('button');
              if (!btn) return 0;
              const rect = btn.getBoundingClientRect();
              const panelW = 288;
              return Math.max(8, Math.min(rect.right - panelW, window.innerWidth - panelW - 8));
            })(),
          }}
        >
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setTab('emoji')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                tab === 'emoji' ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Smile size={12} /> Emoji
            </button>
            <button
              onClick={() => setTab('custom')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                tab === 'custom' ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Image size={12} /> Custom
            </button>
          </div>

          {tab === 'emoji' ? (
            <>
              {/* Search */}
              <div className="p-2 border-b border-border">
                <input
                  autoFocus
                  className="input-field text-xs h-7"
                  placeholder="Search emoji..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Clear */}
              {value && (
                <button
                  onClick={() => { onChange(undefined); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-muted hover:text-red-400 text-xs transition-colors border-b border-border"
                >
                  <X size={11} /> Remove icon
                </button>
              )}

              {/* Grid */}
              <div className="overflow-y-auto p-2" style={{ maxHeight: 280 }}>
                {filtered ? (
                  <div className="grid grid-cols-8 gap-0.5">
                    {filtered.map(emoji => (
                      <EmojiBtn key={emoji} emoji={emoji} selected={value === emoji}
                        onClick={() => { onChange(emoji); setOpen(false); }} />
                    ))}
                    {filtered.length === 0 && (
                      <p className="col-span-8 text-text-muted text-xs text-center py-4">No results</p>
                    )}
                  </div>
                ) : (
                  EMOJI_CATEGORIES.map(cat => (
                    <div key={cat.label} className="mb-3">
                      <p className="text-text-muted text-xs font-medium mb-1 px-0.5">{cat.label}</p>
                      <div className="grid grid-cols-8 gap-0.5">
                        {cat.emojis.map(emoji => (
                          <EmojiBtn key={emoji} emoji={emoji} selected={value === emoji}
                            onClick={() => { onChange(emoji); setOpen(false); }} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="p-3 space-y-3">
              {/* Upload file */}
              <div>
                <p className="text-text-secondary text-xs font-medium mb-2">Upload image</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-border hover:border-accent-blue hover:bg-accent-blue/5 text-text-muted hover:text-accent-blue text-xs transition-all"
                >
                  <Upload size={14} />
                  Click to upload PNG / JPG / SVG / GIF
                </button>
                <p className="text-text-muted text-xs mt-1">Max 512KB</p>
              </div>

              {/* URL input */}
              <div>
                <p className="text-text-secondary text-xs font-medium mb-2">Or paste image URL</p>
                <div className="flex gap-1.5">
                  <input
                    className="input-field text-xs flex-1"
                    placeholder="https://example.com/icon.png"
                    value={customUrl}
                    onChange={e => { setCustomUrl(e.target.value); setUrlError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                  />
                  <button
                    onClick={handleUrlSubmit}
                    className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    Set
                  </button>
                </div>
                {urlError && <p className="text-red-400 text-xs mt-1">{urlError}</p>}
              </div>

              {/* Current custom icon preview */}
              {value && isCustomIcon && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-card border border-border">
                  <img src={value} alt="current" className="w-8 h-8 object-contain rounded" />
                  <span className="text-text-secondary text-xs flex-1">Current icon</span>
                  <button
                    onClick={() => { onChange(undefined); setOpen(false); }}
                    className="text-text-muted hover:text-red-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Clear any icon */}
              {value && (
                <button
                  onClick={() => { onChange(undefined); setOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 text-xs transition-colors border border-border hover:border-red-500/30"
                >
                  <X size={11} /> Remove icon
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmojiBtn({ emoji, selected, onClick }: { emoji: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-8 h-8 flex items-center justify-center text-lg rounded-md transition-all hover:scale-110 hover:bg-bg-hover
        ${selected ? 'bg-accent-blue/20 ring-1 ring-accent-blue' : ''}
      `}
    >
      {emoji}
    </button>
  );
}
