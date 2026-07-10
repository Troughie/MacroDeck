import { usb, findByIds, Interface, InEndpoint } from 'usb';
import type { Endpoint } from 'usb';
import { diffBootReports, KeyDelta } from './boot-report';

export interface KeyboardReader {
  close(): void;
}

// Opens a keyboard already bound to WinUSB and streams key deltas.
// Throws if the device is missing or no interrupt IN endpoint can be claimed
// (typically because the device is not WinUSB-bound yet).
// If claim succeeds for some interfaces but a later interface's setup fails,
// onError is called for that interface and polling continues on the rest.
export function openKeyboardReader(
  vendorId: number,
  productId: number,
  onDelta: (delta: KeyDelta) => void,
  onError: (err: Error) => void,
): KeyboardReader {
  const device = findByIds(vendorId, productId);
  if (!device) {
    throw new Error(`USB device ${hex4(vendorId)}:${hex4(productId)} not found`);
  }

  device.open();

  const claimed: Interface[] = [];
  const polling: InEndpoint[] = [];
  const prevByAddress = new Map<number, Uint8Array | null>();

  for (const iface of device.interfaces ?? []) {
    const inEp = iface.endpoints.find(
      (ep: Endpoint) =>
        ep.direction === 'in' &&
        ep.transferType === usb.LIBUSB_TRANSFER_TYPE_INTERRUPT,
    ) as InEndpoint | undefined;
    if (!inEp) continue;

    try {
      // On Windows, detaching the kernel driver is unsupported and throws; ignore.
      try {
        if (iface.isKernelDriverActive()) iface.detachKernelDriver();
      } catch {
        /* Windows / WinUSB: no-op */
      }

      iface.claim();
      claimed.push(iface);
      prevByAddress.set(inEp.address, null);

      inEp.on('data', (data: Buffer) => {
        if (data.length < 8) return; // Phase 1: 8-byte boot keyboard report only
        const prev = prevByAddress.get(inEp.address) ?? null;
        const cur = Uint8Array.from(data.subarray(0, 8));
        for (const delta of diffBootReports(prev, cur)) onDelta(delta);
        prevByAddress.set(inEp.address, cur);
      });
      inEp.on('error', (err: Error) => onError(err));
      inEp.startPoll(3, inEp.descriptor.wMaxPacketSize);
      polling.push(inEp);
    } catch (err) {
      onError(err as Error);
    }
  }

  if (polling.length === 0) {
    for (const iface of claimed) {
      try { iface.release(true, () => { /* ignore */ }); } catch { /* ignore */ }
    }
    try { device.close(); } catch { /* ignore */ }
    throw new Error('No interrupt IN endpoint claimed - is the device WinUSB-bound?');
  }

  return {
    close() {
      for (const iface of claimed) {
        try { iface.release(true, () => { /* ignore */ }); } catch { /* ignore */ }
      }
      try { device.close(); } catch { /* ignore */ }
    },
  };
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
