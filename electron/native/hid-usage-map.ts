// HID Usage Page 0x07 (Keyboard/Keypad) usage ID -> renderer `code` string.
// The code strings mirror what the old scan-code map produced, so the renderer
// (KeyboardSelector, macro matching) needs no changes.

const USAGE_TO_CODE: Record<number, string> = {
  0x04: 'KeyA', 0x05: 'KeyB', 0x06: 'KeyC', 0x07: 'KeyD', 0x08: 'KeyE',
  0x09: 'KeyF', 0x0a: 'KeyG', 0x0b: 'KeyH', 0x0c: 'KeyI', 0x0d: 'KeyJ',
  0x0e: 'KeyK', 0x0f: 'KeyL', 0x10: 'KeyM', 0x11: 'KeyN', 0x12: 'KeyO',
  0x13: 'KeyP', 0x14: 'KeyQ', 0x15: 'KeyR', 0x16: 'KeyS', 0x17: 'KeyT',
  0x18: 'KeyU', 0x19: 'KeyV', 0x1a: 'KeyW', 0x1b: 'KeyX', 0x1c: 'KeyY',
  0x1d: 'KeyZ',
  0x1e: 'Digit1', 0x1f: 'Digit2', 0x20: 'Digit3', 0x21: 'Digit4', 0x22: 'Digit5',
  0x23: 'Digit6', 0x24: 'Digit7', 0x25: 'Digit8', 0x26: 'Digit9', 0x27: 'Digit0',
  0x28: 'Enter', 0x29: 'Escape', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
  0x2d: 'Minus', 0x2e: 'Equal', 0x2f: 'BracketLeft', 0x30: 'BracketRight',
  0x31: 'Backslash', 0x33: 'Semicolon', 0x34: 'Quote', 0x35: 'Backquote',
  0x36: 'Comma', 0x37: 'Period', 0x38: 'Slash', 0x39: 'CapsLock',
  0x3a: 'F1', 0x3b: 'F2', 0x3c: 'F3', 0x3d: 'F4', 0x3e: 'F5', 0x3f: 'F6',
  0x40: 'F7', 0x41: 'F8', 0x42: 'F9', 0x43: 'F10', 0x44: 'F11', 0x45: 'F12',
  0x46: 'PrintScreen', 0x47: 'ScrollLock', 0x48: 'Pause',
  0x49: 'Insert', 0x4a: 'Home', 0x4b: 'PageUp', 0x4c: 'Delete', 0x4d: 'End',
  0x4e: 'PageDown', 0x4f: 'ArrowRight', 0x50: 'ArrowLeft', 0x51: 'ArrowDown',
  0x52: 'ArrowUp', 0x53: 'NumLock', 0x54: 'NumpadDivide', 0x55: 'NumpadMultiply',
  0x56: 'NumpadSubtract', 0x57: 'NumpadAdd', 0x58: 'NumpadEnter',
  0x59: 'Numpad1', 0x5a: 'Numpad2', 0x5b: 'Numpad3', 0x5c: 'Numpad4',
  0x5d: 'Numpad5', 0x5e: 'Numpad6', 0x5f: 'Numpad7', 0x60: 'Numpad8',
  0x61: 'Numpad9', 0x62: 'Numpad0', 0x63: 'NumpadDecimal', 0x65: 'ContextMenu',
};

export function hidUsageToCode(usage: number): string {
  return USAGE_TO_CODE[usage] ?? `HID${usage}`;
}

// Modifier byte bit order per HID spec (byte 0 of the boot report).
const MODIFIER_CODES = [
  'ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft',
  'ControlRight', 'ShiftRight', 'AltRight', 'MetaRight',
];

export const MODIFIER_COUNT = MODIFIER_CODES.length;

export function modifierBitToCode(bit: number): string {
  return MODIFIER_CODES[bit] ?? `Modifier${bit}`;
}
