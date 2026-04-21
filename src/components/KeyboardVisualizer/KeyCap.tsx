import React from 'react';
import { KeyDef, isInteractiveKey } from './keyboardLayout';

const KEY_UNIT = 38;
const KEY_GAP = 4;

interface KeyCapProps {
  keyDef: KeyDef;
  isPressed: boolean;
  isSelected: boolean;
  hasMacro: boolean;
  macroName?: string;
  macroIcon?: string;  // emoji icon
  isDropTarget: boolean;
  onClick: () => void;
}

// Use forwardRef so KeyCapWrapper can pass setNodeRef directly
export const KeyCap = React.forwardRef<HTMLDivElement, KeyCapProps>(
  function KeyCap({ keyDef, isPressed, isSelected, hasMacro, macroName, macroIcon, isDropTarget, onClick }, ref) {
    // Gap keys — invisible spacers (no ref needed)
    if (!isInteractiveKey(keyDef.code)) {
      return (
        <div
          style={{
            width: keyDef.width * KEY_UNIT + (keyDef.width - 1) * KEY_GAP,
            height: (keyDef.height || 1) * KEY_UNIT,
            flexShrink: 0,
          }}
        />
      );
    }

    const width = keyDef.width * KEY_UNIT + (keyDef.width - 1) * KEY_GAP;
    const height = (keyDef.height || 1) * KEY_UNIT;

    const bgColor = isPressed
      ? '#1d4ed8'
      : isDropTarget
      ? '#1e3a5f'
      : isSelected
      ? '#1e2a4a'
      : hasMacro
      ? '#1a2035'
      : '#1e1e3a';

    const borderColor = isPressed
      ? '#3b82f6'
      : isDropTarget
      ? '#60a5fa'
      : isSelected
      ? '#3b82f6'
      : hasMacro
      ? 'rgba(59, 130, 246, 0.4)'
      : '#2a2a4a';

    const textColor = isPressed
      ? '#ffffff'
      : isSelected
      ? '#93c5fd'
      : hasMacro
      ? '#60a5fa'
      : '#94a3b8';

    // Use CSS transitions instead of framer-motion scale to avoid hitbox offset
    const boxShadow = isDropTarget
      ? '0 0 20px rgba(59, 130, 246, 0.9)'
      : isPressed
      ? '0 0 16px rgba(59, 130, 246, 0.7)'
      : isSelected
      ? '0 0 12px rgba(59, 130, 246, 0.5)'
      : '0 2px 4px rgba(0,0,0,0.4)';

    return (
      <div
        ref={ref}
        onClick={onClick}
        style={{
          width,
          height,
          flexShrink: 0,
          backgroundColor: bgColor,
          borderColor,
          borderWidth: 1,
          borderStyle: 'solid',
          borderRadius: 6,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
          boxShadow,
          // CSS transition instead of framer-motion (no layout shift)
          transition: 'background-color 80ms, border-color 80ms, box-shadow 80ms',
          // Pressed: use CSS transform (doesn't affect layout/hitbox)
          transform: isPressed ? 'scale(0.93)' : 'scale(1)',
        }}
      >
        {/* Macro icon (emoji or custom image) */}
        {hasMacro && macroIcon && !isPressed && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {macroIcon.startsWith('data:') || macroIcon.startsWith('http') ? (
              <img
                src={macroIcon}
                alt=""
                style={{
                  width: Math.min(width, height) * 0.55,
                  height: Math.min(width, height) * 0.55,
                  objectFit: 'contain',
                  borderRadius: 2,
                }}
              />
            ) : (
              <span style={{ fontSize: Math.min(width, height) * 0.42, lineHeight: 1 }}>
                {macroIcon}
              </span>
            )}
          </div>
        )}

        {/* Macro name overlay — shown only when no emoji */}
        {hasMacro && macroName && !macroIcon && !isPressed && (
          <div
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              right: 2,
              fontSize: 8,
              color: '#60a5fa',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
            }}
          >
            {macroName}
          </div>
        )}

        {/* Key label — always visible, smaller/corner when emoji present */}
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 500,
            color: hasMacro && macroIcon && !isPressed ? 'rgba(148,163,184,0.5)' : textColor,
            lineHeight: 1,
            marginTop: hasMacro && macroName && !macroIcon ? 8 : 0,
            position: hasMacro && macroIcon && !isPressed ? 'absolute' : 'relative',
            bottom: hasMacro && macroIcon && !isPressed ? 3 : undefined,
            right: hasMacro && macroIcon && !isPressed ? 4 : undefined,
            fontSize: hasMacro && macroIcon && !isPressed ? 7 : (keyDef.width >= 1.5 ? 10 : 11),
          } as React.CSSProperties}
        >
          {keyDef.label}
        </span>

        {/* Secondary label */}
        {keyDef.label2 && !hasMacro && (
          <span
            style={{
              fontSize: 8,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#64748b',
              lineHeight: 1,
              marginTop: 1,
            }}
          >
            {keyDef.label2}
          </span>
        )}

        {/* Drop target highlight */}
        {isDropTarget && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 5,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '2px dashed rgba(59, 130, 246, 0.8)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    );
  }
);
