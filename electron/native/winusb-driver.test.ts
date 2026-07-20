import { describe, it, expect } from 'vitest';
import { buildDedicateArgs, parseOemInf, isSuccessExit, buildRestoreScript } from './winusb-driver';

describe('buildDedicateArgs', () => {
  it('builds wdi-simple WinUSB (type 0) args with 0x-prefixed 4-hex VID/PID', () => {
    expect(buildDedicateArgs(0x3554, 0xf503)).toEqual([
      '--vid', '0x3554', '--pid', '0xF503', '--type', '0',
      '--name', 'MacroDeck Keyboard (WinUSB)',
    ]);
  });

  it('pads short ids and honours a custom name', () => {
    expect(buildDedicateArgs(0x5e, 0x7, 'My KB')).toEqual([
      '--vid', '0x005E', '--pid', '0x0007', '--type', '0',
      '--name', 'My KB',
    ]);
  });

  it('appends --dest when an extraction dir is given', () => {
    expect(buildDedicateArgs(0x3554, 0xf503, undefined, 'C:\\Temp\\drv')).toEqual([
      '--vid', '0x3554', '--pid', '0xF503', '--type', '0',
      '--name', 'MacroDeck Keyboard (WinUSB)', '--dest', 'C:\\Temp\\drv',
    ]);
  });
});

describe('isSuccessExit', () => {
  it('treats 0 as success', () => {
    expect(isSuccessExit(0)).toBe(true);
  });

  it('treats 3010 (ERROR_SUCCESS_REBOOT_REQUIRED) as success', () => {
    // pnputil /delete-driver commonly returns 3010; the driver change already
    // happened, Windows just wants a re-enumeration/reboot to finish.
    expect(isSuccessExit(3010)).toBe(true);
  });

  it('treats other codes and null as failure', () => {
    expect(isSuccessExit(1)).toBe(false);
    expect(isSuccessExit(-3)).toBe(false);
    expect(isSuccessExit(null)).toBe(false);
  });
});

describe('buildRestoreScript', () => {
  const script = buildRestoreScript(0x3554, 0xf503);

  it('matches the device by padded 4-hex VID/PID', () => {
    expect(script).toContain(`InstanceId -like '*VID_3554&PID_F503*'`);
  });

  it('deletes the WinUSB oem inf package', () => {
    expect(script).toContain('pnputil /delete-driver');
    expect(script).toMatch(/oem\\d\+\\\.inf/); // the -match regex literal
  });

  it('removes the device node then rescans to force a software replug', () => {
    expect(script).toContain('pnputil /remove-device');
    expect(script).toContain('pnputil /scan-devices');
    // remove must come before the rescan that re-detects it
    expect(script.indexOf('/remove-device')).toBeLessThan(script.indexOf('/scan-devices'));
  });

  it('deletes the driver package before removing the node', () => {
    expect(script.indexOf('/delete-driver')).toBeLessThan(script.indexOf('/remove-device'));
  });

  it('always exits 0 (best-effort restore)', () => {
    expect(script.trimEnd().endsWith('exit 0')).toBe(true);
  });
});

describe('parseOemInf', () => {
  it('extracts the oemXX.inf name from a DriverInfPath / pnputil string', () => {
    expect(parseOemInf('oem42.inf')).toBe('oem42.inf');
    expect(parseOemInf('Published Name: oem7.inf\r\n')).toBe('oem7.inf');
  });

  it('lower-cases the match', () => {
    expect(parseOemInf('OEM123.INF')).toBe('oem123.inf');
  });

  it('returns null when no oem inf is present', () => {
    expect(parseOemInf('keyboard.inf')).toBeNull();
    expect(parseOemInf('')).toBeNull();
    expect(parseOemInf(null)).toBeNull();
    expect(parseOemInf(undefined)).toBeNull();
  });
});
