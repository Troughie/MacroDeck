import React, { useState } from 'react';
import { X, Trash2, Globe, User, Smile, ArrowRight, Plus } from 'lucide-react';
import { useMacroStore, makeMacroKey } from '../../stores/macroStore';
import { useProfileStore } from '../../stores/profileStore';
import { GLOBAL_PROFILE_ID } from '../../types/macro.types';
import { AppLaunchSettings } from './AppLaunchSettings';
import { WebLinkSettings } from './WebLinkSettings';
import { MultimediaSettings } from './MultimediaSettings';
import { MuteSettings } from './MuteSettings';
import { VolumeSettings } from './VolumeSettings';
import { ShortcutSettings } from './ShortcutSettings';
import { ProfileSwitchSettings } from './ProfileSwitchSettings';
import { ForceQuitSettings } from './ForceQuitSettings';
import { AeCommandSettings } from './AeCommandSettings';
import { EmojiPicker } from './EmojiPicker';
import { MoveMacroDialog } from './MoveMacroDialog';
import { AnimatePresence } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';

interface MacroSettingsProps {
  keyCode: string;
}

export function MacroSettings({ keyCode }: MacroSettingsProps) {
  const { allMacros, getMacrosForProfile, removeMacro, selectKey, updateMacro, assignMacro } = useMacroStore();
  const { activeProfileId, profiles } = useProfileStore();
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  // Find macro for this key in current context (profile or global)
  const profileMacroKey = makeMacroKey(activeProfileId, keyCode);
  const globalMacroKey = makeMacroKey(GLOBAL_PROFILE_ID, keyCode);

  const profileMacro = allMacros[profileMacroKey];
  const globalMacro = allMacros[globalMacroKey];

  // Which macro is "active" for this key in current profile
  const macro = profileMacro ?? globalMacro;
  const isGlobal = !profileMacro && !!globalMacro;
  const currentProfileId = isGlobal ? GLOBAL_PROFILE_ID : activeProfileId;

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleClose = () => selectKey(null);

  // Drop zone for the empty state: dragging a macro type here assigns it to this
  // key (App.tsx handleDragEnd reads over.data.keyCode). Hook must run before the
  // early return, so it's declared here unconditionally.
  const { setNodeRef: setEmptyDropRef, isOver: isEmptyOver } = useDroppable({
    id: `settings-empty-${keyCode}`,
    data: { keyCode },
  });

  if (!macro) {
    return (
      <div className="panel h-full flex flex-col">
        {/* Header — always present so the panel can be closed even on small screens */}
        <div className="panel-header">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-text-secondary text-xs font-mono bg-bg-card px-2 py-0.5 rounded border border-border">
              {keyCode.replace('Key', '').replace('Digit', '')}
            </span>
            <span className="text-text-muted text-xs truncate">No macro assigned</span>
          </div>
          <button onClick={handleClose} className="btn-ghost p-1.5 ml-2" title="Close">
            <X size={14} />
          </button>
        </div>

        {/* Drop zone — drag a macro type from the right panel to assign it here */}
        <div
          ref={setEmptyDropRef}
          className={`flex-1 m-3 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center px-4 transition-colors ${isEmptyOver
            ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
            : 'border-border text-text-muted'
            }`}
        >
          <Plus size={22} className={isEmptyOver ? 'text-accent-blue' : 'text-text-muted'} />
          <p className="text-sm font-medium">
            {isEmptyOver ? 'Drop to assign macro' : 'No macro on this key'}
          </p>
          <p className="text-xs">
            Drag a macro type here to assign it to{' '}
            <span className="font-mono text-text-secondary">
              {keyCode.replace('Key', '').replace('Digit', '')}
            </span>
          </p>
        </div>
      </div>
    );
  }

  const handleDisplayNameChange = (name: string) => {
    updateMacro(currentProfileId, keyCode, { displayName: name });
  };

  const handleIconChange = (emoji: string | undefined) => {
    updateMacro(currentProfileId, keyCode, { iconEmoji: emoji });
  };

  const handleRemove = () => {
    removeMacro(currentProfileId, keyCode);
    selectKey(null);
  };

  const handleToggleScope = (makeGlobal: boolean) => {
    const targetProfileId = makeGlobal ? GLOBAL_PROFILE_ID : activeProfileId;
    const sourceProfileId = makeGlobal ? activeProfileId : GLOBAL_PROFILE_ID;

    // Remove from source, add to target with same settings
    removeMacro(sourceProfileId, keyCode);
    // Re-assign with same type and settings
    const now = Date.now();
    const newKey = makeMacroKey(targetProfileId, keyCode);
    useMacroStore.setState(state => ({
      allMacros: {
        ...state.allMacros,
        [newKey]: {
          ...macro,
          profileId: targetProfileId,
          updatedAt: now,
        },
      },
      isDirty: true,
    }));
  };

  return (
    <div className="panel h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-text-secondary text-xs font-mono bg-bg-card px-2 py-0.5 rounded border border-border">
            {keyCode.replace('Key', '').replace('Digit', '')}
          </span>
          {/* Emoji icon picker */}
          <EmojiPicker value={macro.iconEmoji} onChange={handleIconChange} />
          <input
            className="input-field flex-1 h-7 text-sm font-medium"
            value={macro.displayName}
            onChange={(e) => handleDisplayNameChange(e.target.value)}
            placeholder="Macro name..."
            maxLength={20}
          />
        </div>

        <div className="flex items-center gap-1 ml-2">
          {/* Profile scope toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => handleToggleScope(false)}
              title={`Only in "${activeProfile?.name ?? 'this profile'}"`}
              className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${!isGlobal
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                }`}
            >
              <User size={11} />
              <span className="hidden sm:inline">Profile</span>
            </button>
            <button
              onClick={() => handleToggleScope(true)}
              title="Available in all profiles"
              className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors border-l border-border ${isGlobal
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                }`}
            >
              <Globe size={11} />
              <span className="hidden sm:inline">All</span>
            </button>
          </div>

          <button
            onClick={() => setShowMoveDialog(true)}
            className="btn-ghost p-1.5 text-text-muted hover:text-accent-blue"
            title="Move / Copy to another key or profile"
          >
            <ArrowRight size={14} />
          </button>

          <button
            onClick={handleRemove}
            className="btn-ghost text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5"
            title="Remove macro"
          >
            <Trash2 size={14} />
          </button>
          <button onClick={handleClose} className="btn-ghost p-1.5">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Move dialog */}
      <AnimatePresence>
        {showMoveDialog && (
          <MoveMacroDialog
            fromProfileId={currentProfileId}
            fromKeyCode={keyCode}
            onClose={() => setShowMoveDialog(false)}
          />
        )}
      </AnimatePresence>
      {/* Scope indicator */}
      <div className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-b border-border ${isGlobal ? 'bg-accent-blue/5 text-accent-blue' : 'bg-bg-card text-text-muted'
        }`}>
        {isGlobal ? (
          <><Globe size={11} /> Available in <strong>all profiles</strong></>
        ) : (
          <><User size={11} /> Only in <strong style={{ color: activeProfile?.color }}>{activeProfile?.name ?? 'this profile'}</strong></>
        )}
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-3 h-500">
        {macro.type === 'APP_LAUNCH' && <AppLaunchSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'WEB_LINK' && <WebLinkSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'MULTIMEDIA' && <MultimediaSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'MUTE_TOGGLE' && <MuteSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'VOLUME_ADJUST' && <VolumeSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'HOTKEY' && <ShortcutSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'PROFILE_SWITCH' && <ProfileSwitchSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'FORCE_QUIT' && <ForceQuitSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
        {macro.type === 'AE_COMMAND' && <AeCommandSettings keyCode={keyCode} macro={macro} profileId={currentProfileId} />}
      </div>
    </div>
  );
}
