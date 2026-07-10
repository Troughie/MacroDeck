import { usb, findByIds, Interface, InEndpoint } from 'usb';
import type { Endpoint } from 'usb';
import { diffBootReports, KeyDelta } from './boot-report';
import { isBootKeyboardInterface } from './usb-device-id';

// How many times to auto-restart polling after a recoverable endpoint error
// before giving up and surfacing it to the caller. The counter resets whenever a
// report is received, so only sustained failures stop the reader.
const MAX_POLL_RESTARTS = 5;

export interface KeyboardReader {
  close(): void;
}

// Opens a keyboard already bound to WinUSB and streams key deltas.
//
// Only the HID boot-keyboard interface (class 0x03 / subclass 0x01 / protocol
// 0x01) is claimed. A composite keyboard's other interfaces (consumer/media,
// vendor) deliver different report formats and can raise LIBUSB_ERROR_IO when
// polled, so they are skipped in Phase 1.
//
// Transient endpoint errors (common on Windows/WinUSB) are recovered by
// restarting the poll; they do not tear down the reader. onError is only called
// if recovery is exhausted or an interface fails to claim.
//
// Throws if the device is missing or no boot-keyboard interrupt IN endpoint can
// be claimed (typically because the device is not WinUSB-bound yet).
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
  let closed = false;

  for (const iface of device.interfaces ?? []) {
    const descriptor = iface.descriptor;
    if (!descriptor || !isBootKeyboardInterface(descriptor)) continue;

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
      pollEndpoint(inEp);
    } catch (err) {
      onError(err as Error);
    }
  }

  if (claimed.length === 0) {
    try { device.close(); } catch { /* ignore */ }
    throw new Error('No boot keyboard interface claimed - is the device WinUSB-bound?');
  }

  // Starts and keeps polling one interrupt IN endpoint, recovering from transient
  // errors by restarting the poll after libusb finishes canceling in-flight
  // transfers (the 'end' event).
  function pollEndpoint(inEp: InEndpoint): void {
    let prev: Uint8Array | null = null;
    let restarts = 0;

    inEp.on('data', (data: Buffer) => {
      if (data.length < 8) return; // Phase 1: 8-byte boot keyboard report only
      restarts = 0; // healthy traffic resets the recovery budget
      const cur = Uint8Array.from(data.subarray(0, 8));
      for (const delta of diffBootReports(prev, cur)) onDelta(delta);
      prev = cur;
    });

    inEp.on('error', (err: Error) => {
      if (closed) return;
      // node-usb stops polling on error and emits 'end' once transfers cancel.
      inEp.once('end', () => {
        if (closed) return;
        if (restarts >= MAX_POLL_RESTARTS) {
          onError(err);
          return;
        }
        restarts++;
        try {
          inEp.startPoll(3, inEp.descriptor.wMaxPacketSize);
        } catch (restartErr) {
          onError(restartErr as Error);
        }
      });
    });

    inEp.startPoll(3, inEp.descriptor.wMaxPacketSize);
  }

  return {
    close() {
      closed = true;
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
