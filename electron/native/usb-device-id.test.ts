import { describe, it, expect } from 'vitest';
import {
  buildDeviceKey, parseDeviceKey, isBootKeyboardInterface,
  isBootMouseInterface, derivePrimaryType,
} from './usb-device-id';

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

describe('isBootMouseInterface', () => {
  it('is true for HID/boot/mouse', () => {
    expect(isBootMouseInterface({
      bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x02,
    })).toBe(true);
  });
  it('is false for a keyboard interface', () => {
    expect(isBootMouseInterface({
      bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x01,
    })).toBe(false);
  });
});

describe('derivePrimaryType', () => {
  // Real interfaces observed on this machine — both a keyboard and a mouse device
  // advertise BOTH a boot keyboard and a boot mouse interface, so the name is the
  // deciding factor.
  const keychronK6 = [
    { bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x01 }, // kb
    { bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x02 }, // mouse
  ];
  const vgnReceiver = [
    { bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x01 }, // kb
    { bInterfaceClass: 0x03, bInterfaceSubClass: 0x00, bInterfaceProtocol: 0x00 }, // hid
    { bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x02 }, // mouse
  ];

  it('tags a real keyboard as keyboard despite a mouse interface', () => {
    expect(derivePrimaryType('Keychron K6', keychronK6)).toBe('keyboard');
  });

  it('tags a mouse-named receiver as mouse despite a keyboard interface', () => {
    expect(derivePrimaryType('VGN Mouse 2.4G Receiver', vgnReceiver)).toBe('mouse');
  });

  it('lets an explicit keyboard name win over mouse/receiver words', () => {
    expect(derivePrimaryType('Logi Keyboard Receiver', vgnReceiver)).toBe('keyboard');
  });

  it('falls back to interfaces when the name is unhelpful', () => {
    expect(derivePrimaryType('Keyboard 05AC:024F', keychronK6)).toBe('keyboard');
    expect(derivePrimaryType(null, [
      { bInterfaceClass: 0x03, bInterfaceSubClass: 0x01, bInterfaceProtocol: 0x02 },
    ])).toBe('mouse');
  });

  it('falls back to hid for a non keyboard/mouse HID', () => {
    expect(derivePrimaryType('Some Gadget', [
      { bInterfaceClass: 0x03, bInterfaceSubClass: 0x00, bInterfaceProtocol: 0x00 },
    ])).toBe('hid');
  });
});
