import { getDeviceList, Device } from 'usb';
import { KeyboardDevice } from '../../src/types/macro.types';
import { buildDeviceKey, isBootKeyboardInterface, derivePrimaryType, InterfaceDescLike } from './usb-device-id';
import { loadPnpDevices, findPnpNameByVidPid } from './device-names';
import { getDriverService } from './winusb-driver';

// Lists connected USB devices that expose an HID boot-keyboard interface.
export async function listUsbKeyboards(selectedDeviceKey: string): Promise<KeyboardDevice[]> {
  const devices = getDeviceList();
  const pnp = await loadPnpDevices();
  const seen = new Set<string>();
  const result: KeyboardDevice[] = [];

  for (const device of devices) {
    const ifaces = interfaceDescriptors(device);
    if (!ifaces.some(isBootKeyboardInterface)) continue;

    const vendorId = device.deviceDescriptor.idVendor;
    const productId = device.deviceDescriptor.idProduct;
    const key = buildDeviceKey(vendorId, productId);
    if (seen.has(key)) continue;
    seen.add(key);

    const name = findPnpNameByVidPid(vendorId, productId, pnp)
      ?? `Keyboard ${hex4(vendorId)}:${hex4(productId)}`;

    // Interfaces alone can't distinguish a keyboard from a mouse (both expose the
    // same set), so the primary type is decided mostly by the product name. A
    // device named like a mouse (e.g. "VGN Mouse 2.4G Receiver") is tagged Mouse
    // even though it advertises a keyboard interface, while a real keyboard
    // ("Keychron K6") stays Keyboard despite advertising a mouse interface.
    const primaryType = derivePrimaryType(name, ifaces);
    const isKeyboard = primaryType === 'keyboard';

    result.push({
      id: key,
      name,
      deviceType: primaryType,
      inputTags: [primaryType],
      vendorId,
      productId,
      isKeyboard,
      isConnected: true,
      isSelected: key === selectedDeviceKey,
    });
  }

  // Detect which keyboards are already bound to WinUSB (dedicated). Runs in
  // parallel; a null service leaves the device as 'normal'.
  await Promise.all(result.map(async (dev) => {
    const service = await getDriverService(dev.vendorId, dev.productId);
    dev.driverState = service && /^winusb$/i.test(service) ? 'dedicated' : 'normal';
  }));

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function interfaceDescriptors(device: Device): InterfaceDescLike[] {
  try {
    const config = device.configDescriptor;
    if (!config) return [];
    // configDescriptor.interfaces is InterfaceDescriptor[][] (alt settings nested).
    return config.interfaces.flat().map((iface: any) => ({
      bInterfaceClass: iface.bInterfaceClass,
      bInterfaceSubClass: iface.bInterfaceSubClass,
      bInterfaceProtocol: iface.bInterfaceProtocol,
    }));
  } catch {
    return [];
  }
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase();
}
