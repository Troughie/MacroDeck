import { describe, it, expect } from 'vitest';
import { isGenericDeviceName, findPnpNameByVidPid, PnpDeviceInfo } from './device-names';

describe('isGenericDeviceName', () => {
  it('flags generic names', () => {
    expect(isGenericDeviceName('HID Keyboard Device')).toBe(true);
    expect(isGenericDeviceName('USB Input Device')).toBe(true);
  });
  it('accepts real names', () => {
    expect(isGenericDeviceName('Keychron K2')).toBe(false);
  });
});

describe('findPnpNameByVidPid', () => {
  const pnp: PnpDeviceInfo[] = [
    {
      name: 'Keychron K2',
      instanceId: 'USB\\VID_3434&PID_0111&MI_00\\7&ABCDEF',
      hardwareIds: ['USB\\VID_3434&PID_0111&REV_0100'],
      isUsbRoot: false,
    },
    {
      name: 'HID Keyboard Device',
      instanceId: 'USB\\VID_1234&PID_5678\\6&1',
      hardwareIds: ['USB\\VID_1234&PID_5678'],
      isUsbRoot: false,
    },
  ];

  it('finds a real name by VID/PID', () => {
    expect(findPnpNameByVidPid(0x3434, 0x0111, pnp)).toBe('Keychron K2');
  });
  it('ignores generic matches', () => {
    expect(findPnpNameByVidPid(0x1234, 0x5678, pnp)).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(findPnpNameByVidPid(0x9999, 0x9999, pnp)).toBeNull();
  });

  it('prefers the USB root product name over generic child names', () => {
    // The real-world case: child HID nodes are generic ("HID Keyboard Device"),
    // but the USB composite root carries the product name (BusReportedDeviceDesc).
    const composite: PnpDeviceInfo[] = [
      {
        name: 'HID Keyboard Device',
        instanceId: 'HID\\VID_3554&PID_F503&MI_00\\A&36A18E15&0&0000',
        hardwareIds: ['HID\\VID_3554&PID_F503'],
        isUsbRoot: false,
      },
      {
        name: 'VGN Mouse 2.4G Receiver',
        instanceId: 'USB\\VID_3554&PID_F503\\8&218E5DAF&0&2',
        hardwareIds: ['USB\\VID_3554&PID_F503'],
        isUsbRoot: true,
      },
    ];
    expect(findPnpNameByVidPid(0x3554, 0xf503, composite)).toBe('VGN Mouse 2.4G Receiver');
  });

  it('falls back to a non-generic child name when the USB root name is generic', () => {
    const mixed: PnpDeviceInfo[] = [
      {
        name: 'USB Composite Device', // generic root
        instanceId: 'USB\\VID_1111&PID_2222\\8&ABC',
        hardwareIds: ['USB\\VID_1111&PID_2222'],
        isUsbRoot: true,
      },
      {
        name: 'Fancy Keeb Pro',
        instanceId: 'HID\\VID_1111&PID_2222&MI_00\\A&1',
        hardwareIds: ['HID\\VID_1111&PID_2222'],
        isUsbRoot: false,
      },
    ];
    expect(findPnpNameByVidPid(0x1111, 0x2222, mixed)).toBe('Fancy Keeb Pro');
  });
});
