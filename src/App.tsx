import React, { useEffect, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, pointerWithin } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';

import { motion, AnimatePresence } from 'framer-motion';

import { TitleBar } from './components/TitleBar/TitleBar';
import { KeyboardSelector } from './components/KeyboardSelector/KeyboardSelector';
import { KeyboardVisualizer } from './components/KeyboardVisualizer/KeyboardVisualizer';
import { MacroList } from './components/MacroList/MacroList';
import { MacroSettings } from './components/MacroSettings/MacroSettings';
import { ProfileSelector } from './components/ProfileSelector/ProfileSelector';

import { useKeyboardStore } from './stores/keyboardStore';
import { useMacroStore, syncMacroKeysToMain } from './stores/macroStore';
import { useProfileStore } from './stores/profileStore';
import { MACRO_TYPE_INFO, MacroType, MacroConfig } from './types/macro.types';
import { electronAPI } from './lib/electron';

export default function App() {
  const { loadDevices, setKeyPressed, setKeyReleased } = useKeyboardStore();
  const { loadMacros, assignMacro, selectedKeyCode, getMacrosForProfile } = useMacroStore();
  const { activeProfileId, loadProfiles } = useProfileStore();

  const [activeDragType, setActiveDragType] = React.useState<MacroType | null>(null);

  // Active macros for current profile (profile + global)
  const activeMacros = getMacrosForProfile(activeProfileId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Initialize
  useEffect(() => {
    loadDevices();
    loadProfiles();
    loadMacros().then(() => {
      syncMacroKeysToMain(activeProfileId);
    });
  }, []);

  // Listen for profile switch from macro execution
  useEffect(() => {
    if (!electronAPI) return;
    const unsub = electronAPI.profile.onSwitch(({ mode, targetProfileId }: { mode: string; targetProfileId?: string }) => {
      const { profiles, activeProfileId, setActiveProfile } = useProfileStore.getState();
      if (mode === 'specific' && targetProfileId) {
        setActiveProfile(targetProfileId);
      } else if (mode === 'next') {
        const idx = profiles.findIndex(p => p.id === activeProfileId);
        const next = profiles[(idx + 1) % profiles.length];
        setActiveProfile(next.id);
      } else if (mode === 'prev') {
        const idx = profiles.findIndex(p => p.id === activeProfileId);
        const prev = profiles[(idx - 1 + profiles.length) % profiles.length];
        setActiveProfile(prev.id);
      }
    });
    return () => { unsub(); };
  }, []);
  useEffect(() => {
    syncMacroKeysToMain(activeProfileId);
  }, [activeProfileId, useMacroStore.getState().allMacros]);

  // Keyboard events
  useEffect(() => {
    if (!electronAPI) return;
    const unsubscribe = electronAPI.keyboard.onKeyEvent((event: import('./types/macro.types').KeyEvent) => {
      if (event.state === 'down') {
        setKeyPressed(event.code);
        const macro = activeMacros[event.code];
        if (macro && event.isMacroDevice) {
          executeMacroWithToast(macro);
        }
      } else {
        setKeyReleased(event.code);
      }
    });
    return () => { unsubscribe(); };
  }, [activeMacros, setKeyPressed, setKeyReleased]);

  // ─── Execute macro — notifications handled by main process overlay ─────────
  const executeMacroWithToast = useCallback(async (macro: MacroConfig) => {
    if (!electronAPI) return;
    electronAPI.macro.execute(macro).catch(console.error);
  }, []);

  // DnD
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragType(event.active.data.current?.macroType as MacroType ?? null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragType(null);
    const { over, active } = event;
    if (!over) return;
    const macroType = active.data.current?.macroType as MacroType;
    const keyCode = over.data.current?.keyCode as string;
    if (macroType && keyCode) {
      assignMacro(keyCode, macroType, activeProfileId);
    }
  }, [assignMacro, activeProfileId]);

  const activeDragInfo = activeDragType
    ? MACRO_TYPE_INFO.find(m => m.type === activeDragType)
    : null;

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Profile bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border flex-shrink-0">
          <span className="text-text-muted text-xs">Profile:</span>
          <ProfileSelector />
          <span className="text-text-muted text-xs ml-auto">
            {Object.keys(activeMacros).length} macro{Object.keys(activeMacros).length !== 1 ? 's' : ''} active
          </span>
        </div>

        <div className="flex flex-1 flex-0 overflow-hidden gap-2 p-2">
          <div className="w-[220px] flex-shrink-0">
            <KeyboardSelector />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden gap-2 min-w-0">
            <KeyboardVisualizer />

            <AnimatePresence>
              {selectedKeyCode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 650, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className="overflow-hidden"
                >
                  <MacroSettings keyCode={selectedKeyCode} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-[260px] flex-shrink-0">
            <MacroList />
          </div>
        </div>

        <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
          {activeDragInfo && (
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: activeDragInfo.color,
              boxShadow: `0 0 8px ${activeDragInfo.color}`,
              pointerEvents: 'none',
            }} />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
