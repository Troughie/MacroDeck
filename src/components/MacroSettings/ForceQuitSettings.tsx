import React from 'react';
import { Skull, AlertTriangle } from 'lucide-react';
import { MacroConfig } from '../../types/macro.types';

interface Props {
  keyCode: string;
  macro: MacroConfig;
  profileId: string;
}

// Force Quit has nothing to configure per key — it always kills whatever window is
// in focus when the macro fires. This panel just explains the behaviour.
export function ForceQuitSettings(_props: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
        <Skull size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary text-xs font-semibold">Kills the app in focus</p>
          <p className="text-text-muted text-xs leading-relaxed mt-0.5">
            When you press this key, MacroDeck force-quits the application that owns
            the currently focused window — the whole process tree, like Task
            Manager's <span className="font-medium">End Task</span> or macOS Force Quit.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-yellow-200/90 text-xs leading-relaxed">
          Unsaved work in the focused app is lost — there's no confirmation. System
          processes (Explorer, the desktop shell) and MacroDeck itself are protected
          and will not be killed.
        </p>
      </div>
    </div>
  );
}
