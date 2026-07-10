import { getDeviceList, Device } from 'usb';
import { KeyboardDevice } from '../../src/types/macro.types';
import { buildDeviceKey, isBootKeyboardInterface, InterfaceDescLike } from './usb-device-id';
import { loadPnpDevices, findPnpNameByVidPid } from './device-names';

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

    result.push({
      id: key,
      name,
      deviceType: 'keyboard',
      vendorId,
      productId,
      isKeyboard: true,
      isConnected: true,
      isSelected: key === selectedDeviceKey,
    });
  }

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
