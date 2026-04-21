export interface KeyDef {
  code: string;       // KeyboardEvent.code
  label: string;      // Display label (top)
  label2?: string;    // Secondary label (bottom, for shifted chars)
  width: number;      // in key units (1 = standard key ~40px)
  height?: number;    // default 1
}

// Standard 104-key ANSI layout
export const KEYBOARD_LAYOUT: KeyDef[][] = [
  // Row 0: Function keys
  [
    { code: 'Escape',      label: 'Esc',    width: 1 },
    { code: '_gap1',       label: '',       width: 0.5 },
    { code: 'F1',          label: 'F1',     width: 1 },
    { code: 'F2',          label: 'F2',     width: 1 },
    { code: 'F3',          label: 'F3',     width: 1 },
    { code: 'F4',          label: 'F4',     width: 1 },
    { code: '_gap2',       label: '',       width: 0.5 },
    { code: 'F5',          label: 'F5',     width: 1 },
    { code: 'F6',          label: 'F6',     width: 1 },
    { code: 'F7',          label: 'F7',     width: 1 },
    { code: 'F8',          label: 'F8',     width: 1 },
    { code: '_gap3',       label: '',       width: 0.5 },
    { code: 'F9',          label: 'F9',     width: 1 },
    { code: 'F10',         label: 'F10',    width: 1 },
    { code: 'F11',         label: 'F11',    width: 1 },
    { code: 'F12',         label: 'F12',    width: 1 },
    { code: '_gap4',       label: '',       width: 0.5 },
    { code: 'PrintScreen', label: 'PrtSc',  width: 1 },
    { code: 'ScrollLock',  label: 'Scrl',   width: 1 },
    { code: 'Pause',       label: 'Pause',  width: 1 },
  ],

  // Row 1: Number row
  [
    { code: 'Backquote',    label: '`',  label2: '~',  width: 1 },
    { code: 'Digit1',       label: '1',  label2: '!',  width: 1 },
    { code: 'Digit2',       label: '2',  label2: '@',  width: 1 },
    { code: 'Digit3',       label: '3',  label2: '#',  width: 1 },
    { code: 'Digit4',       label: '4',  label2: '$',  width: 1 },
    { code: 'Digit5',       label: '5',  label2: '%',  width: 1 },
    { code: 'Digit6',       label: '6',  label2: '^',  width: 1 },
    { code: 'Digit7',       label: '7',  label2: '&',  width: 1 },
    { code: 'Digit8',       label: '8',  label2: '*',  width: 1 },
    { code: 'Digit9',       label: '9',  label2: '(',  width: 1 },
    { code: 'Digit0',       label: '0',  label2: ')',  width: 1 },
    { code: 'Minus',        label: '-',  label2: '_',  width: 1 },
    { code: 'Equal',        label: '=',  label2: '+',  width: 1 },
    { code: 'Backspace',    label: '⌫',               width: 2 },
    { code: '_gap5',        label: '',                 width: 0.5 },
    { code: 'Insert',       label: 'Ins',              width: 1 },
    { code: 'Home',         label: 'Home',             width: 1 },
    { code: 'PageUp',       label: 'PgUp',             width: 1 },
  ],

  // Row 2: QWERTY
  [
    { code: 'Tab',          label: 'Tab',  width: 1.5 },
    { code: 'KeyQ',         label: 'Q',    width: 1 },
    { code: 'KeyW',         label: 'W',    width: 1 },
    { code: 'KeyE',         label: 'E',    width: 1 },
    { code: 'KeyR',         label: 'R',    width: 1 },
    { code: 'KeyT',         label: 'T',    width: 1 },
    { code: 'KeyY',         label: 'Y',    width: 1 },
    { code: 'KeyU',         label: 'U',    width: 1 },
    { code: 'KeyI',         label: 'I',    width: 1 },
    { code: 'KeyO',         label: 'O',    width: 1 },
    { code: 'KeyP',         label: 'P',    width: 1 },
    { code: 'BracketLeft',  label: '[',  label2: '{', width: 1 },
    { code: 'BracketRight', label: ']',  label2: '}', width: 1 },
    { code: 'Backslash',    label: '\\', label2: '|', width: 1.5 },
    { code: '_gap6',        label: '',                width: 0.5 },
    { code: 'Delete',       label: 'Del',             width: 1 },
    { code: 'End',          label: 'End',             width: 1 },
    { code: 'PageDown',     label: 'PgDn',            width: 1 },
  ],

  // Row 3: ASDF
  [
    { code: 'CapsLock',     label: 'Caps',  width: 1.75 },
    { code: 'KeyA',         label: 'A',     width: 1 },
    { code: 'KeyS',         label: 'S',     width: 1 },
    { code: 'KeyD',         label: 'D',     width: 1 },
    { code: 'KeyF',         label: 'F',     width: 1 },
    { code: 'KeyG',         label: 'G',     width: 1 },
    { code: 'KeyH',         label: 'H',     width: 1 },
    { code: 'KeyJ',         label: 'J',     width: 1 },
    { code: 'KeyK',         label: 'K',     width: 1 },
    { code: 'KeyL',         label: 'L',     width: 1 },
    { code: 'Semicolon',    label: ';',   label2: ':', width: 1 },
    { code: 'Quote',        label: "'",   label2: '"', width: 1 },
    { code: 'Enter',        label: 'Enter', width: 2.25 },
  ],

  // Row 4: ZXCV
  [
    { code: 'ShiftLeft',    label: 'Shift',  width: 2.25 },
    { code: 'KeyZ',         label: 'Z',      width: 1 },
    { code: 'KeyX',         label: 'X',      width: 1 },
    { code: 'KeyC',         label: 'C',      width: 1 },
    { code: 'KeyV',         label: 'V',      width: 1 },
    { code: 'KeyB',         label: 'B',      width: 1 },
    { code: 'KeyN',         label: 'N',      width: 1 },
    { code: 'KeyM',         label: 'M',      width: 1 },
    { code: 'Comma',        label: ',',    label2: '<', width: 1 },
    { code: 'Period',       label: '.',    label2: '>', width: 1 },
    { code: 'Slash',        label: '/',    label2: '?', width: 1 },
    { code: 'ShiftRight',   label: 'Shift',  width: 2.75 },
    { code: '_gap7',        label: '',       width: 0.5 },
    { code: 'ArrowUp',      label: '↑',      width: 1 },
  ],

  // Row 5: Bottom row
  [
    { code: 'ControlLeft',  label: 'Ctrl',   width: 1.25 },
    { code: 'MetaLeft',     label: '⊞',      width: 1.25 },
    { code: 'AltLeft',      label: 'Alt',    width: 1.25 },
    { code: 'Space',        label: '',       width: 6.25 },
    { code: 'AltRight',     label: 'Alt',    width: 1.25 },
    { code: 'MetaRight',    label: '⊞',      width: 1.25 },
    { code: 'ContextMenu',  label: '☰',      width: 1.25 },
    { code: 'ControlRight', label: 'Ctrl',   width: 1.25 },
    { code: '_gap8',        label: '',       width: 0.5 },
    { code: 'ArrowLeft',    label: '←',      width: 1 },
    { code: 'ArrowDown',    label: '↓',      width: 1 },
    { code: 'ArrowRight',   label: '→',      width: 1 },
  ],
];

// Filter out gap keys for interaction
export function isInteractiveKey(code: string): boolean {
  return !code.startsWith('_gap');
}
