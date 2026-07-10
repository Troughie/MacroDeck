import { describe, it, expect } from 'vitest';
import { buildDeviceKey, parseDeviceKey, isBootKeyboardInterface } from './usb-device-id';

describe('buildDeviceKey / parseDeviceKey', () => {
  it('builds an uppercase VID/PID key', () => {
    expect(buildDeviceKey(0x3434, 0x0111)).toBe('usb:VID_3434&PID_0111');
  });
  it('pads to 4 hex digits', () => {
    expect(buildDeviceKey(0x5e, 0x7)).toBe('usb:VID_005E&PID_0007');
  });
  it('round-trips', () => {
    expect(parseDeviceKey(buildDeviceKey(0x3434, 0x0111))).toEqual({
      vendorId: 0x3434,
      productId: 0x0111,
    });
  });
  it('returns null for a bad key', () => {
    expect(parseDeviceKey('not-a-key')).toBeNull();
  });
});

describe('isBootKeyboardInterface', () => {
  it('is true for HID/boot/keyboard', () => {
    expect(isBootKeyboardInterface({
      bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x01,
    })).toBe(true);
  });
  it('is false for a mouse interface', () => {
    expect(isBootKeyboardInterface({
      bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x02,
    })).toBe(false);
  });
  it('is false for a non-HID interface', () => {
    expect(isBootKeyboardInterface({
      bInterfaceClass: 0x08, bInterfaceSubClass: 0x00, bInterfaceProtocol: 0x00,
    })).toBe(false);
  });
});
