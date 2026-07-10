import { describe, it, expect } from 'vitest';
import { hidUsageToCode, modifierBitToCode, MODIFIER_COUNT } from './hid-usage-map';

describe('hidUsageToCode', () => {
  it('maps letters', () => {
    expect(hidUsageToCode(0x04)).toBe('KeyA');
    expect(hidUsageToCode(0x1d)).toBe('KeyZ');
  });
  it('maps digits and common keys', () => {
    expect(hidUsageToCode(0x1e)).toBe('Digit1');
    expect(hidUsageToCode(0x27)).toBe('Digit0');
    expect(hidUsageToCode(0x28)).toBe('Enter');
    expect(hidUsageToCode(0x2c)).toBe('Space');
    expect(hidUsageToCode(0x29)).toBe('Escape');
  });
  it('maps function keys', () => {
    expect(hidUsageToCode(0x3a)).toBe('F1');
    expect(hidUsageToCode(0x45)).toBe('F12');
  });
  it('maps arrows and numpad', () => {
    expect(hidUsageToCode(0x4f)).toBe('ArrowRight');
    expect(hidUsageToCode(0x52)).toBe('ArrowUp');
    expect(hidUsageToCode(0x62)).toBe('Numpad0');
  });
  it('falls back to HID<n> for unknown usages', () => {
    expect(hidUsageToCode(0xff)).toBe('HID255');
  });
});

describe('modifierBitToCode', () => {
  it('maps the 8 modifier bits in HID order', () => {
    expect(MODIFIER_COUNT).toBe(8);
    expect(modifierBitToCode(0)).toBe('ControlLeft');
    expect(modifierBitToCode(1)).toBe('ShiftLeft');
    expect(modifierBitToCode(2)).toBe('AltLeft');
    expect(modifierBitToCode(3)).toBe('MetaLeft');
    expect(modifierBitToCode(4)).toBe('ControlRight');
    expect(modifierBitToCode(5)).toBe('ShiftRight');
    expect(modifierBitToCode(6)).toBe('AltRight');
    expect(modifierBitToCode(7)).toBe('MetaRight');
  });
});
