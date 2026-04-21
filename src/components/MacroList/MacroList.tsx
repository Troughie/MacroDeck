import React from 'react';
import { Layers, Info } from 'lucide-react';
import { MACRO_TYPE_INFO } from '../../types/macro.types';
import { MacroTypeCard } from './MacroTypeCard';
import { AssignedMacroList } from './AssignedMacroList';

export function MacroList() {
  return (
    <div className="panel h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <Layers size={16} className="text-accent-blue" />
        <span className="text-text-primary font-medium text-sm">Macro Types</span>
      </div>

      {/* Drag instructions */}
      <div className="px-3 py-2 bg-accent-blue/5 border-b border-border">
        <div className="flex items-start gap-2">
          <Info size={12} className="text-accent-blue mt-0.5 flex-shrink-0" />
          <p className="text-text-muted text-xs leading-relaxed">
            Drag a macro type onto any key in the visualizer to assign it.
          </p>
        </div>
      </div>

      {/* Macro type list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {MACRO_TYPE_INFO.map((info) => (
          <MacroTypeCard key={info.type} info={info} />
        ))}
      </div>

      {/* Assigned macros section */}
      <AssignedMacroList />
    </div>
  );
}
