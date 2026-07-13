import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, MousePointer2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useKeyboardStore } from '../../stores/keyboardStore';
import { KeyboardDevice } from '../../types/macro.types';

export function KeyboardSelector() {
  const {
    devices, selectedDeviceId, isLoading, error, loadDevices,
    driverToolAvailable, dedicatingId, refreshDriverStatus, dedicateDevice, undedicateDevice,
  } = useKeyboardStore();

  useEffect(() => {
    loadDevices();
    refreshDriverStatus();
  }, []);

  // Count how many actual keyboards are present, to warn before capturing the
  // only one (which would leave the user unable to type into Windows).
  const keyboardCount = devices.filter(
    (d) => d.deviceType !== 'mouse' && d.isKeyboard !== false,
  ).length;

  const formatFailure = (
    action: string,
    tool: string,
    result: { error?: string; exitCode?: number | null; log?: string },
  ) => {
    const detail = [
      result.error ?? 'unknown error',
      result.exitCode != null ? `(exit ${result.exitCode})` : '',
      result.log ? `\n\n--- ${tool} log ---\n${result.log.slice(-1200)}` : '',
    ].filter(Boolean).join(' ');
    return `Could not ${action}: ${detail}`;
  };

  // Single toggle: a normal keyboard becomes the macro keyboard (dedicate); the
  // dedicated one is released back to Windows.
  const handleToggle = async (device: KeyboardDevice) => {
    if (device.driverState === 'dedicated') {
      await releaseKeyboard(device);
    } else {
      await makeMacroKeyboard(device);
    }
  };

  const makeMacroKeyboard = async (device: KeyboardDevice) => {
    if (keyboardCount <= 1) {
      const proceed = window.confirm(
        `"${device.name}" appears to be your only keyboard.\n\n` +
        `Making it your macro keyboard swaps its driver to WinUSB, so it STOPS ` +
        `typing into Windows until you release it. You should have a second ` +
        `keyboard connected before continuing.\n\n` +
        `Continue anyway?`,
      );
      if (!proceed) return;
    }

    // Only one macro keyboard at a time: release any other dedicated one first.
    const previous = devices.find(
      (d) => d.driverState === 'dedicated' && d.id !== device.id,
    );
    if (previous) {
      const released = await undedicateDevice(previous.id);
      if (!released.ok) {
        window.alert(formatFailure(`release "${previous.name}" first`, 'pnputil', released));
        return;
      }
    }

    const result = await dedicateDevice(device.id);
    if (!result.ok) {
      window.alert(formatFailure('set macro keyboard', 'wdi-simple', result));
      return;
    }
    // Don't reload the device list here: Windows is still re-enumerating the
    // just-swapped device, so a driver-state query would race and flicker. The
    // store already applied the optimistic 'dedicated' state.
    window.alert(
      `"${device.name}" is now your macro keyboard (WinUSB).\n\n` +
      `Windows re-detects it automatically — give it a few seconds. ` +
      `If it doesn't respond, unplug and replug it once.`,
    );
  };

  const releaseKeyboard = async (device: KeyboardDevice) => {
    const result = await undedicateDevice(device.id);
    if (!result.ok) {
      window.alert(formatFailure('release keyboard', 'pnputil', result));
      return;
    }
    window.alert(
      `"${device.name}" released — its normal keyboard driver is restored.\n\n` +
      `It re-enumerates automatically (no unplug needed); give Windows a few ` +
      `seconds. Only replug it if it still doesn't type after that.`,
    );
  };

  return (
    <div className="panel h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <Keyboard size={16} className="text-accent-blue" />
        <span className="text-text-primary font-medium text-sm flex-1">Keyboards</span>
        <button
          onClick={loadDevices}
          disabled={isLoading}
          className="btn-ghost p-1.5"
          title="Refresh devices"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Device List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <RefreshCw size={20} className="text-text-muted animate-spin" />
            <span className="text-text-muted text-xs">Scanning devices...</span>
          </div>
        ) : error ? (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Keyboard size={24} className="text-text-muted" />
            <span className="text-text-muted text-xs text-center">No keyboards found</span>
          </div>
        ) : (
          devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              isSelected={device.id === selectedDeviceId}
              driverToolAvailable={driverToolAvailable}
              isBusy={dedicatingId === device.id}
              onToggle={() => handleToggle(device)}
            />
          ))
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-text-muted text-xs leading-relaxed">
          Select a keyboard to use as your dedicated macro device.
        </p>
      </div>
    </div>
  );
}

// ─── Device Card ──────────────────────────────────────────────────────────────

interface DeviceCardProps {
  device: KeyboardDevice;
  isSelected: boolean;
  driverToolAvailable: boolean;
  isBusy: boolean;
  onToggle: () => void;
}

function DeviceCard({
  device, isSelected, driverToolAvailable, isBusy, onToggle,
}: DeviceCardProps) {
  const isKeyboardDevice = device.deviceType !== 'mouse' && device.isKeyboard !== false;
  const DeviceIcon = isKeyboardDevice ? Keyboard : MousePointer2;
  // Prefer the real per-interface tags; fall back to the coarse type for older
  // data that predates inputTags.
  const tags = device.inputTags && device.inputTags.length > 0
    ? device.inputTags
    : [isKeyboardDevice ? 'keyboard' : 'mouse'] as Array<'keyboard' | 'mouse' | 'hid'>;
  const isDedicated = device.driverState === 'dedicated';

  return (
    <motion.div
      layout
      className={`
        relative p-3 rounded-lg border transition-all duration-150 cursor-default
        ${isSelected
          ? 'border-accent-blue bg-accent-blue/10'
          : 'border-border bg-bg-card hover:border-border-hover hover:bg-bg-hover'
        }
      `}
      whileHover={{ scale: 1.01 }}
    >
      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          layoutId="selected-indicator"
          className="absolute top-2 right-2"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          <CheckCircle2 size={14} className="text-accent-blue" />
        </motion.div>
      )}

      {/* Device icon */}
      <div className={`
        w-8 h-8 rounded-lg flex items-center justify-center mb-2
        ${isSelected ? 'bg-accent-blue/20' : 'bg-bg-secondary'}
      `}>
        <DeviceIcon size={16} className={isSelected ? 'text-accent-blue' : 'text-text-secondary'} />
      </div>

      {/* Device info */}
      <div>
        <p className={`text-xs font-medium leading-tight mb-1 ${isSelected ? 'text-accent-blue' : 'text-text-primary'}`}>
          {device.name}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          {device.isConnected ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
              <span className="text-text-muted text-xs">Connected</span>
            </>
          ) : (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted" />
              <span className="text-text-muted text-xs">Disconnected</span>
            </>
          )}
          {/* One tag per real HID interface. A combo device (e.g. a receiver with
              both a keyboard and a mouse interface) shows both, so the tags match
              the hardware even when the product name says otherwise. */}
          {tags.map((tag) => (
            <span
              key={tag}
              className={`
                text-[10px] px-1.5 py-0.5 rounded font-mono capitalize
                ${tag === 'keyboard'
                  ? 'bg-accent-blue/15 text-accent-blue'
                  : tag === 'mouse'
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'bg-text-muted/15 text-text-muted'}
              `}
            >
              {tag}
            </span>
          ))}
        </div>

        {(device.vendorId > 0 || device.productId > 0) && (
          <p className="text-text-muted text-xs mt-1 font-mono">
            {device.vendorId.toString(16).padStart(4, '0').toUpperCase()}:
            {device.productId.toString(16).padStart(4, '0').toUpperCase()}
          </p>
        )}
      </div>

      {/* Single toggle: dedicate a normal keyboard as the macro device (swaps its
          driver to WinUSB so it stops typing into Windows and MacroDeck reads it),
          or release the dedicated one back to the normal Windows driver. */}
      {isKeyboardDevice && (
        isDedicated ? (
          <button
            className="mt-2 w-full text-xs text-yellow-400 hover:text-yellow-300
                       border border-yellow-500/30 hover:border-yellow-500/60
                       rounded-md py-1 transition-colors disabled:opacity-50"
            disabled={isBusy}
            onClick={onToggle}
          >
            {isBusy ? 'Releasing…' : 'Release to Windows'}
          </button>
        ) : (
          <button
            className="mt-2 w-full text-xs text-accent-green hover:text-accent-green
                       border border-accent-green/30 hover:border-accent-green/60
                       rounded-md py-1 transition-colors disabled:opacity-50
                       disabled:cursor-not-allowed"
            disabled={isBusy || !driverToolAvailable}
            title={!driverToolAvailable ? 'WinUSB driver tool not available' : undefined}
            onClick={onToggle}
          >
            {isBusy ? 'Setting up…' : 'Set as Macro Keyboard'}
          </button>
        )
      )}

      {!isKeyboardDevice && (
        <div className="mt-2 w-full text-xs text-text-muted text-center
                        border border-border rounded-md py-1 bg-bg-secondary">
          Input device
        </div>
      )}
    </motion.div>
  );
}
