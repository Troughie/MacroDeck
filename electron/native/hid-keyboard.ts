import { usb, findByIds, Interface, InEndpoint } from 'usb';
import type { Endpoint } from 'usb';
import { diffBootReports, KeyDelta } from './boot-report';
import { isBootKeyboardInterface } from './usb-device-id';

// Reading uses libusb's default backend. Once a keyboard is dedicated (its
// driver swapped to WinUSB by winusb-driver.ts), node-usb can open and claim it
// directly — no backend switch is required.

// How many times to auto-restart polling after a recoverable endpoint error
// before giving up and surfacing it to the caller. The counter resets whenever a
// report is received, so only sustained failures stop the reader.
const MAX_POLL_RESTARTS = 5;

// How long to wait for libusb's 'end' event (in-flight transfers canceled) after a
// poll error before giving up on the lightweight restart and escalating to a full
// device re-open. Some errors (e.g. LIBUSB_ERROR_NOT_FOUND on a wedged handle)
// never emit 'end', which used to leave the poll dead forever → stuck key.
const END_WATCHDOG_MS = 500;

export interface KeyboardReader {
  // Resolves once the USB interfaces are released and the device handle is closed.
  // Awaiting this matters before a driver swap / device re-enumeration: if the
  // app still holds the WinUSB handle, Windows can't tear the device down, and
  // the user is forced to physically unplug/replug it.
  close(): Promise<void>;
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
      // Per-interface claim/detach failure — skip this interface. This is not a
      // fatal error (another interface may claim). onError is reserved for the
      // fatal "poll died" case so the caller can distinguish and re-open. If no
      // interface can be claimed, we throw below and the caller retries.
      console.warn('[hid-keyboard] interface claim failed:', (err as Error).message);
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
    let dataCount = 0;

    inEp.on('data', (data: Buffer) => {
      if (data.length < 8) return; // Phase 1: 8-byte boot keyboard report only
      restarts = 0; // healthy traffic resets the recovery budget
      // DEBUG: log the first reports so we can see whether the poll delivers the
      // key-up after a key-down, or dies after the first report.
      if (dataCount < 30) {
        console.log(
          `[hid-keyboard] data #${++dataCount} len=${data.length} bytes=${data.subarray(0, 8).toString('hex')}`,
        );
      }
      const cur = Uint8Array.from(data.subarray(0, 8));
      for (const delta of diffBootReports(prev, cur)) onDelta(delta);
      prev = cur;
    });

    inEp.on('error', (err: Error) => {
      // DEBUG: capture the exact libusb error + state at the moment the poll dies.
      console.warn(
        `[hid-keyboard] poll error: "${err.message}" errno=${(err as any).errno} closed=${closed} restarts=${restarts}`,
      );
      if (closed) return;

      // Fire exactly one recovery path. Fast path: node-usb emits 'end' once it
      // finishes canceling transfers → lightweight poll restart. Fallback: if 'end'
      // never arrives (a wedged handle), a watchdog escalates to a full re-open via
      // onError so the reader can't stay silently dead.
      let settled = false;

      inEp.once('end', () => {
        if (settled || closed) return;
        settled = true;
        if (restarts >= MAX_POLL_RESTARTS) {
          console.error('[hid-keyboard] poll restarts exhausted → surfacing to onError (self-heal)');
          onError(err);
          return;
        }
        restarts++;
        console.warn(`[hid-keyboard] restarting poll, attempt ${restarts}/${MAX_POLL_RESTARTS}`);
        try {
          inEp.startPoll(3, inEp.descriptor.wMaxPacketSize);
        } catch (restartErr) {
          console.error('[hid-keyboard] restart threw:', (restartErr as Error).message);
          onError(restartErr as Error);
        }
      });

      setTimeout(() => {
        if (settled || closed) return;
        settled = true;
        console.error(`[hid-keyboard] no "end" within ${END_WATCHDOG_MS}ms of error → self-heal re-open`);
        onError(err);
      }, END_WATCHDOG_MS);
    });

    inEp.startPoll(3, inEp.descriptor.wMaxPacketSize);
  }

  return {
    async close() {
      closed = true;
      console.log(`[hid-keyboard] close() start — releasing ${claimed.length} interface(s)`);
      // Release each claimed interface and WAIT for libusb's callback before
      // closing the device — release(closeEndpoints, cb) is asynchronous, and
      // closing / letting Windows re-enumerate while a transfer is still being
      // torn down leaves the WinUSB handle open (forcing a physical replug).
      await Promise.all(
        claimed.map(
          (iface) =>
            new Promise<void>((resolve) => {
              try {
                iface.release(true, () => resolve());
              } catch {
                resolve();
              }
            }),
        ),
      );
      try { device.close(); } catch (err) { console.warn('[hid-keyboard] device.close() threw:', (err as Error).message); }
      console.log('[hid-keyboard] close() done');
    },
  };
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
