import React, { useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useKeyboardStore } from '../../stores/keyboardStore';
import { useMacroStore } from '../../stores/macroStore';
import { useProfileStore } from '../../stores/profileStore';
import { KeyCap } from './KeyCap';
import { KEYBOARD_LAYOUT, KeyDef } from './keyboardLayout';

export function KeyboardVisualizer() {
  const { pressedKeys } = useKeyboardStore();
  const { getMacrosForProfile, selectedKeyCode, selectKey } = useMacroStore();
  const { activeProfileId } = useProfileStore();

  const macros = getMacrosForProfile(activeProfileId);

  const handleKeyClick = useCallback((keyCode: string) => {
    selectKey(selectedKeyCode === keyCode ? null : keyCode);
  }, [selectedKeyCode, selectKey]);

  return (
    <div className="panel flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="panel-header">
        <div className="w-2 h-2 rounded-full bg-accent-green glow-animate" />
        <span className="text-text-primary font-medium text-sm">Keyboard Layout</span>
        <span className="text-text-muted text-xs ml-auto">
          {Object.keys(macros).length} macro{Object.keys(macros).length !== 1 ? 's' : ''} assigned
        </span>
      </div>

      {/* Keyboard Grid */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="keyboard-container" style={{ transform: 'scale(1)', transformOrigin: 'center' }}>
          {KEYBOARD_LAYOUT.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1 mb-1">
              {row.map((keyDef) => (
                <KeyCapWrapper
                  key={keyDef.code}
                  keyDef={keyDef}
                  isPressed={pressedKeys.has(keyDef.code)}
                  isSelected={selectedKeyCode === keyDef.code}
                  hasMacro={!!macros[keyDef.code]}
                  macroName={macros[keyDef.code]?.displayName}
                  macroIcon={macros[keyDef.code]?.iconEmoji}
                  onClick={() => handleKeyClick(keyDef.code)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-border flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-accent-blue/20 border border-accent-blue/50" />
          <span className="text-text-muted text-xs">Has macro</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-accent-blue border border-accent-blue" />
          <span className="text-text-muted text-xs">Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-bg-card border border-border" />
          <span className="text-text-muted text-xs">Unassigned</span>
        </div>
        <span className="text-text-muted text-xs ml-auto">
          Drag a macro type onto a key to assign it
        </span>
      </div>
    </div>
  );
}

// ─── Key Cap Wrapper (with drop zone) ────────────────────────────────────────

interface KeyCapWrapperProps {
  keyDef: KeyDef;
  isPressed: boolean;
  isSelected: boolean;
  hasMacro: boolean;
  macroName?: string;
  macroIcon?: string;
  onClick: () => void;
}

function KeyCapWrapper({ keyDef, isPressed, isSelected, hasMacro, macroName, macroIcon, onClick }: KeyCapWrapperProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `key-${keyDef.code}`,
    data: { keyCode: keyDef.code },
  });

  return (
    <KeyCap
      ref={setNodeRef}
      keyDef={keyDef}
      isPressed={isPressed}
      isSelected={isSelected}
      hasMacro={hasMacro}
      macroName={macroName}
      macroIcon={macroIcon}
      isDropTarget={isOver}
      onClick={onClick}
    />
  );
}
