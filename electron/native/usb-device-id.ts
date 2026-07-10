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

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
