import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Rocket, Globe, Music, VolumeX, Volume2, Keyboard, Layers,
  GripVertical,
} from 'lucide-react';
import { MacroTypeInfo } from '../../types/macro.types';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Rocket, Globe, Music, VolumeX, Volume2, Keyboard, Layers,
};

interface MacroTypeCardProps {
  info: MacroTypeInfo;
  isDragging?: boolean;
}

export function MacroTypeCard({ info, isDragging = false }: MacroTypeCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isActiveDrag } = useDraggable({
    id: `macro-type-${info.type}`,
    data: { macroType: info.type },
  });

  const Icon = ICON_MAP[info.icon] || Keyboard;

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isActiveDrag ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`macro-type-card ${isDragging ? 'drag-overlay' : ''}`}
      {...attributes}
      {...listeners}
    >
      {/* Drag handle */}
      <GripVertical size={14} className="text-text-muted flex-shrink-0" />

      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${info.color}20`, border: `1px solid ${info.color}40` }}
      >
        <Icon size={16} style={{ color: info.color }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-xs font-medium leading-tight">{info.label}</p>
        <p className="text-text-muted text-xs leading-tight truncate">{info.description}</p>
      </div>
    </div>
  );
}
