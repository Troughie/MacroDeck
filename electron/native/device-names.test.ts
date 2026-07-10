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
    },
    {
      name: 'HID Keyboard Device',
      instanceId: 'USB\\VID_1234&PID_5678\\6&1',
      hardwareIds: ['USB\\VID_1234&PID_5678'],
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
});
