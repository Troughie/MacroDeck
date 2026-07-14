// Each AeKeyAction is an array of KeyboardEvent.code strings pressed simultaneously.
// A shortcut with multiple actions sends them in sequence with a 100ms gap (e.g. "UU").
export type AeKeyAction = string[];

export interface AeShortcut {
  id: string;
  label: string;
  category: string;
  displayKeys: string;     // human-readable, shown in UI
  actions: AeKeyAction[];  // sequence of chords
}

export interface AeShortcutCategory {
  id: string;
  label: string;
}

export const AE_SHORTCUT_CATEGORIES: AeShortcutCategory[] = [
  { id: 'timeline', label: 'Timeline & Playback' },
  { id: 'layers',   label: 'Layers' },
  { id: 'keys',     label: 'Keyframes & Animation' },
  { id: 'comp',     label: 'Composition' },
  { id: 'view',     label: 'View & Panels' },
];

export const AE_SHORTCUTS: AeShortcut[] = [
  // ── Timeline & Playback ───────────────────────────────────────────────────
  { id: 'timeline.ramPreview',    label: 'RAM Preview',            category: 'timeline', displayKeys: 'Numpad 0',         actions: [['Numpad0']] },
  { id: 'timeline.playPause',     label: 'Play / Pause',           category: 'timeline', displayKeys: 'Space',            actions: [['Space']] },
  { id: 'timeline.prevFrame',     label: 'Previous Frame',         category: 'timeline', displayKeys: 'Page Up',          actions: [['PageUp']] },
  { id: 'timeline.nextFrame',     label: 'Next Frame',             category: 'timeline', displayKeys: 'Page Down',        actions: [['PageDown']] },
  { id: 'timeline.prev10Frames',  label: '-10 Frames',             category: 'timeline', displayKeys: 'Shift+Page Up',    actions: [['ShiftLeft', 'PageUp']] },
  { id: 'timeline.next10Frames',  label: '+10 Frames',             category: 'timeline', displayKeys: 'Shift+Page Down',  actions: [['ShiftLeft', 'PageDown']] },
  { id: 'timeline.goToBeginning', label: 'Go to Beginning',        category: 'timeline', displayKeys: 'Home',             actions: [['Home']] },
  { id: 'timeline.goToEnd',       label: 'Go to End',              category: 'timeline', displayKeys: 'End',              actions: [['End']] },
  { id: 'timeline.setWorkStart',  label: 'Set Work Area Start',    category: 'timeline', displayKeys: 'B',                actions: [['KeyB']] },
  { id: 'timeline.setWorkEnd',    label: 'Set Work Area End',      category: 'timeline', displayKeys: 'N',                actions: [['KeyN']] },
  { id: 'timeline.trimToWork',    label: 'Trim Comp to Work Area', category: 'timeline', displayKeys: 'Ctrl+Shift+X',     actions: [['ControlLeft', 'ShiftLeft', 'KeyX']] },

  // ── Layers ────────────────────────────────────────────────────────────────
  { id: 'layer.newSolid',       label: 'New Solid',           category: 'layers', displayKeys: 'Ctrl+Y',         actions: [['ControlLeft', 'KeyY']] },
  { id: 'layer.newAdjustment',  label: 'New Adjustment Layer',category: 'layers', displayKeys: 'Ctrl+Alt+Y',     actions: [['ControlLeft', 'AltLeft', 'KeyY']] },
  { id: 'layer.duplicate',      label: 'Duplicate Layer',     category: 'layers', displayKeys: 'Ctrl+D',         actions: [['ControlLeft', 'KeyD']] },
  { id: 'layer.split',          label: 'Split Layer',         category: 'layers', displayKeys: 'Ctrl+Shift+D',   actions: [['ControlLeft', 'ShiftLeft', 'KeyD']] },
  { id: 'layer.precompose',     label: 'Pre-compose',         category: 'layers', displayKeys: 'Ctrl+Shift+C',   actions: [['ControlLeft', 'ShiftLeft', 'KeyC']] },
  { id: 'layer.moveUp',         label: 'Move Layer Up',       category: 'layers', displayKeys: 'Ctrl+]',         actions: [['ControlLeft', 'BracketRight']] },
  { id: 'layer.moveDown',       label: 'Move Layer Down',     category: 'layers', displayKeys: 'Ctrl+[',         actions: [['ControlLeft', 'BracketLeft']] },
  { id: 'layer.showPosition',   label: 'Show Position',       category: 'layers', displayKeys: 'P',              actions: [['KeyP']] },
  { id: 'layer.showScale',      label: 'Show Scale',          category: 'layers', displayKeys: 'S',              actions: [['KeyS']] },
  { id: 'layer.showRotation',   label: 'Show Rotation',       category: 'layers', displayKeys: 'R',              actions: [['KeyR']] },
  { id: 'layer.showOpacity',    label: 'Show Opacity',        category: 'layers', displayKeys: 'T',              actions: [['KeyT']] },
  // "UU" = press U twice in sequence (show all modified properties)
  { id: 'layer.showModified',   label: 'Show All Modified',   category: 'layers', displayKeys: 'U U',            actions: [['KeyU'], ['KeyU']] },

  // ── Keyframes & Animation ─────────────────────────────────────────────────
  { id: 'keys.easyEase',     label: 'Easy Ease',            category: 'keys', displayKeys: 'F9',              actions: [['F9']] },
  { id: 'keys.easyEaseIn',   label: 'Easy Ease In',         category: 'keys', displayKeys: 'Shift+F9',        actions: [['ShiftLeft', 'F9']] },
  { id: 'keys.easyEaseOut',  label: 'Easy Ease Out',        category: 'keys', displayKeys: 'Ctrl+Shift+F9',   actions: [['ControlLeft', 'ShiftLeft', 'F9']] },
  { id: 'keys.graphEditor',  label: 'Toggle Graph Editor',  category: 'keys', displayKeys: 'Shift+F3',        actions: [['ShiftLeft', 'F3']] },
  { id: 'keys.selectAll',    label: 'Select All Keyframes', category: 'keys', displayKeys: 'Ctrl+Alt+A',      actions: [['ControlLeft', 'AltLeft', 'KeyA']] },

  // ── Composition ───────────────────────────────────────────────────────────
  { id: 'comp.settings',        label: 'Composition Settings',  category: 'comp', displayKeys: 'Ctrl+K',    actions: [['ControlLeft', 'KeyK']] },
  { id: 'comp.addToRenderQueue',label: 'Add to Render Queue',   category: 'comp', displayKeys: 'Ctrl+M',    actions: [['ControlLeft', 'KeyM']] },
  { id: 'comp.new',             label: 'New Composition',       category: 'comp', displayKeys: 'Ctrl+N',    actions: [['ControlLeft', 'KeyN']] },
  { id: 'comp.flowchart',       label: 'Composition Flowchart', category: 'comp', displayKeys: 'Ctrl+F11',  actions: [['ControlLeft', 'F11']] },

  // ── View & Panels ─────────────────────────────────────────────────────────
  { id: 'view.maximizePanel',    label: 'Maximize Panel',         category: 'view', displayKeys: '`',               actions: [['Backquote']] },
  { id: 'view.rulers',           label: 'Toggle Rulers',          category: 'view', displayKeys: 'Ctrl+R',          actions: [['ControlLeft', 'KeyR']] },
  { id: 'view.grid',             label: 'Toggle Grid',            category: 'view', displayKeys: "Ctrl+'",          actions: [['ControlLeft', 'Quote']] },
  { id: 'view.guides',           label: 'Toggle Guides',          category: 'view', displayKeys: 'Ctrl+;',          actions: [['ControlLeft', 'Semicolon']] },
  { id: 'view.fitToWidth',       label: 'Fit to Comp Width',      category: 'view', displayKeys: 'Ctrl+Shift+Alt+H',actions: [['ControlLeft', 'ShiftLeft', 'AltLeft', 'KeyH']] },
  { id: 'view.disableRefresh',   label: 'Disable Auto-Refresh',   category: 'view', displayKeys: 'Caps Lock',       actions: [['CapsLock']] },
];
