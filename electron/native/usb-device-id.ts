export function buildDeviceKey(vendorId: number, productId: number): string {
  return `usb:VID_${hex4(vendorId)}&PID_${hex4(productId)}`;
}

export function parseDeviceKey(key: string): { vendorId: number; productId: number } | null {
  const match = /^usb:VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})$/.exec(key);
  if (!match) return null;
  return {
    vendorId: parseInt(match[1], 16),
    productId: parseInt(match[2], 16),
  };
}

export interface InterfaceDescLike {
  bInterfaceClass: number;
  bInterfaceSubClass: number;
  bInterfaceProtocol: number;
}

// HID class (0x03), Boot subclass (0x01), Keyboard protocol (0x01).
export function isBootKeyboardInterface(iface: InterfaceDescLike): boolean {
  return iface.bInterfaceClass === 0x03
    && iface.bInterfaceSubClass === 0x01
    && iface.bInterfaceProtocol === 0x01;
}

// HID class (0x03), Boot subclass (0x01), Mouse protocol (0x02).
export function isBootMouseInterface(iface: InterfaceDescLike): boolean {
  return iface.bInterfaceClass === 0x03
    && iface.bInterfaceSubClass === 0x01
    && iface.bInterfaceProtocol === 0x02;
}

export type InputTag = 'keyboard' | 'mouse' | 'hid';

// Interface descriptors ALONE cannot tell a keyboard from a mouse: real devices
// of both kinds advertise the same interface set. Verified on this machine:
//   Keychron K6 (keyboard):        IF kb + IF mouse
//   VGN Mouse 2.4G Rcv (mouse):    IF kb + IF hid + IF mouse
// Both expose a boot keyboard AND a boot mouse interface. So a combo dongle chip
// (shared across keyboard/mouse models) looks identical to a real keyboard.
//
// The product name (iProduct — what Windows Settings shows) is the deciding
// signal. We return a SINGLE primary type:
//   1. name explicitly says "keyboard"                               -> 'keyboard'
//      (so a "... Keyboard Receiver" isn't misread as a mouse below)
//   2. name says it's a pointing device (mouse/trackball/receiver)   -> 'mouse'
//   3. otherwise, has a boot keyboard interface                      -> 'keyboard'
//   4. otherwise, has a boot mouse interface                         -> 'mouse'
//   5. otherwise any HID                                             -> 'hid'
const KEYBOARD_NAME_RE = /\b(keyboard|keeb|keypad)\b/i;
const MOUSE_NAME_RE = /\b(mouse|trackball|trackpad|touchpad|receiver)\b/i;

export function derivePrimaryType(
  name: string | null | undefined,
  ifaces: InterfaceDescLike[],
): InputTag {
  if (name && KEYBOARD_NAME_RE.test(name)) return 'keyboard';
  if (name && MOUSE_NAME_RE.test(name)) return 'mouse';
  if (ifaces.some(isBootKeyboardInterface)) return 'keyboard';
  if (ifaces.some(isBootMouseInterface)) return 'mouse';
  return 'hid';
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
