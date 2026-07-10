import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, MousePointer2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useKeyboardStore } from '../../stores/keyboardStore';
import { KeyboardDevice } from '../../types/macro.types';

export function KeyboardSelector() {
  const { devices, selectedDeviceId, isLoading, error, loadDevices, selectDevice } = useKeyboardStore();

  useEffect(() => {
    loadDevices();
  }, []);

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
              onSelect={() => selectDevice(device.id)}
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
  onSelect: () => void;
}

function DeviceCard({ device, isSelected, onSelect }: DeviceCardProps) {
  const isKeyboardDevice = device.deviceType !== 'mouse' && device.isKeyboard !== false;
  const DeviceIcon = isKeyboardDevice ? Keyboard : MousePointer2;
  const deviceTag = isKeyboardDevice ? 'Keyboard' : 'Mouse';

  return (
    <motion.div
      layout
      className={`
        relative p-3 rounded-lg border transition-all duration-150
        ${isKeyboardDevice ? 'cursor-pointer' : 'cursor-default'}
        ${isSelected
          ? 'border-accent-blue bg-accent-blue/10'
          : 'border-border bg-bg-card hover:border-border-hover hover:bg-bg-hover'
        }
      `}
      onClick={isKeyboardDevice ? onSelect : undefined}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
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
          <span className={`
            text-[10px] px-1.5 py-0.5 rounded font-mono
            ${isKeyboardDevice ? 'bg-accent-blue/15 text-accent-blue' : 'bg-yellow-500/15 text-yellow-400'}
          `}>
            {deviceTag}
          </span>
          {/* Interface badge — helps user pick the right one when a device has multiple HID interfaces */}
          {device.interfaceNumber !== undefined && device.interfaceNumber >= 0 && (
            <span className={`
              text-[10px] px-1.5 py-0.5 rounded font-mono
              ${!isKeyboardDevice
                ? 'bg-yellow-500/15 text-yellow-400'
                : device.interfaceNumber === 0
                  ? 'bg-accent-green/15 text-accent-green'
                  : 'bg-text-muted/15 text-text-muted'}
            `}>
              {!isKeyboardDevice
                ? `IF ${device.interfaceNumber}`
                : device.interfaceNumber === 0
                  ? 'Keyboard'
                  : `IF ${device.interfaceNumber}`}
            </span>
          )}
        </div>

        {(device.vendorId > 0 || device.productId > 0) && (
          <p className="text-text-muted text-xs mt-1 font-mono">
            {device.vendorId.toString(16).padStart(4, '0').toUpperCase()}:
            {device.productId.toString(16).padStart(4, '0').toUpperCase()}
          </p>
        )}
      </div>

      {/* Set as macro device button */}
      {isKeyboardDevice && !isSelected && (
        <button
          className="mt-2 w-full text-xs text-accent-blue hover:text-accent-blue-glow 
                     border border-accent-blue/30 hover:border-accent-blue/60 
                     rounded-md py-1 transition-colors"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          Set as Macro Keyboard
        </button>
      )}

      {isKeyboardDevice && isSelected && (
        <div className="mt-2 w-full text-xs text-accent-blue text-center 
                        border border-accent-blue/30 rounded-md py-1 bg-accent-blue/5">
          ✓ Active Macro Device
        </div>
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
