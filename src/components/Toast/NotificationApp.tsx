import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, Loader2, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'loading' | 'error' | 'info' | 'volume';

interface NotifData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  icon?: string;
  duration?: number;
  currentValue?: number;   // giá trị hiện tại (sau hành động)
  previousValue?: number;  // giá trị trước đó
  unit?: string;           // '%', 'dB', v.v. — mặc định '%'
  maxValue?: number;       // giá trị tối đa để tính thanh — mặc định 100
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  success: { accent: '#22c55e', border: 'rgba(34,197,94,0.3)', icon: <CheckCircle2 size={16} style={{ color: '#22c55e' }} /> },
  error: { accent: '#ef4444', border: 'rgba(239,68,68,0.3)', icon: <AlertCircle size={16} style={{ color: '#ef4444' }} /> },
  info: { accent: '#3b82f6', border: 'rgba(59,130,246,0.3)', icon: <Info size={16} style={{ color: '#60a5fa' }} /> },
  loading: { accent: '#3b82f6', border: 'rgba(59,130,246,0.3)', icon: <Loader2 size={16} style={{ color: '#60a5fa' }} className="animate-spin" /> },
  volume: { accent: '#f8f8f8', border: 'rgba(248,248,248,0.15)', icon: null },
};

// ─── Windows OSD style volume notification ───────────────────────────────────

function VolumeOSD({ notif, onDismiss }: { notif: NotifData; onDismiss: (id: string) => void }) {
  const { currentValue = 0, maxValue = 100 } = notif;
  const pct = Math.round((currentValue / maxValue) * 100);
  const isMuted = currentValue === 0;

  useEffect(() => {
    if (!notif.duration || notif.duration === 0) return;
    const timer = setTimeout(() => onDismiss(notif.id), notif.duration);
    return () => clearTimeout(timer);
  }, [notif.duration, notif.id, onDismiss]);

  // Volume icon based on level
  const volumeIcon = isMuted ? '🔇' : pct > 66 ? '🔊' : pct > 33 ? '🔉' : '🔈';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(30, 30, 30, 0.95)',
        backdropFilter: 'blur(40px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '16px 24px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
        pointerEvents: 'none',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        minWidth: 320,
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: 36, flexShrink: 0 }}>
        {volumeIcon}
      </div>

      {/* Volume bar + text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* App name */}
        {notif.message && (
          <div style={{
            color: '#9ca3af',
            fontSize: 11,
            fontWeight: 500,
            marginBottom: 8,
            textAlign: 'center',
          }}>
            {notif.message}
          </div>
        )}

        {/* Volume bar */}
        <div style={{
          height: 6,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 8,
        }}>
          <motion.div
            initial={{ width: `${Math.round(((notif.previousValue ?? currentValue) / maxValue) * 100)}%` }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{
              height: '100%',
              background: isMuted ? '#6b7280' : '#f8f8f8',
              borderRadius: 3,
            }}
          />
        </div>

        {/* Percentage */}
        <div style={{
          textAlign: 'center',
          color: isMuted ? '#9ca3af' : '#f8f8f8',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {currentValue}%
        </div>
      </div>
    </motion.div>
  );
}

// ─── Value bar (thanh giá trị hiện tại) ──────────────────────────────────────

function ValueBar({ notif, accent }: { notif: NotifData; accent: string }) {
  const { currentValue, previousValue, unit = '%', maxValue = 100 } = notif;
  if (currentValue === undefined) return null;

  const pct = Math.round((currentValue / maxValue) * 100);
  const isMuted = currentValue === 0;
  const delta = previousValue !== undefined ? currentValue - previousValue : undefined;
  const isUp = delta !== undefined && delta > 0;
  const isDown = delta !== undefined && delta < 0;

  const barColor = isMuted ? '#64748b' : accent;
  const deltaColor = isUp ? '#4ade80' : isDown ? '#f87171' : '#94a3b8';
  const deltaLabel = delta === undefined
    ? null
    : isMuted
      ? '🔇 muted'
      : `${isUp ? '▲ +' : '▼ '}${delta}${unit}`;

  return (
    <div style={{ padding: '0 14px 8px 16px' }}>
      {/* Current value + delta badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        {previousValue !== undefined && (
          <span style={{ fontSize: 10, color: '#64748b' }}>
            Trước: {previousValue}{unit}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {deltaLabel && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: deltaColor,
              background: isMuted
                ? 'rgba(100,116,139,0.15)'
                : isUp
                  ? 'rgba(34,197,94,0.12)'
                  : 'rgba(239,68,68,0.12)',
              padding: '1px 6px',
              borderRadius: 6,
            }}>
              {deltaLabel}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: isMuted ? '#64748b' : accent }}>
            {currentValue}{unit}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div style={{
        height: 4,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <motion.div
          initial={{ width: `${Math.round(((previousValue ?? currentValue) / maxValue) * 100)}%` }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ height: '100%', background: barColor, borderRadius: 3 }}
        />
      </div>
    </div>
  );
}

// ─── Single notification ──────────────────────────────────────────────────────

function NotifItem({ notif, onDismiss }: { notif: NotifData; onDismiss: (id: string) => void }) {
  const cfg = TYPE_CONFIG[notif.type];
  const [progress, setProgress] = useState(100);
  const [hovered, setHovered] = useState(false);

  const isCustomIcon = notif.icon && (notif.icon.startsWith('data:') || notif.icon.startsWith('http'));
  const hasValueBar = notif.currentValue !== undefined;

  useEffect(() => {
    if (!notif.duration || notif.duration === 0) return;
    const start = Date.now();
    const total = notif.duration;
    let raf: number;
    const tick = () => {
      if (hovered) { raf = requestAnimationFrame(tick); return; }
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / total) * 100);
      setProgress(pct);
      if (pct > 0) raf = requestAnimationFrame(tick);
      else onDismiss(notif.id);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [notif.duration, notif.id, hovered, onDismiss]);

  const handleMouseEnter = () => {
    setHovered(true);
    (window as any).electronAPI?._ipc?.send?.('notif:set-interactive', true);
  };
  const handleMouseLeave = () => {
    setHovered(false);
    (window as any).electronAPI?._ipc?.send?.('notif:set-interactive', false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.88, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        background: 'rgba(15, 15, 30, 0.92)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${cfg.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`,
        cursor: notif.type !== 'loading' ? 'pointer' : 'default',
      }}
      onClick={() => notif.type !== 'loading' && onDismiss(notif.id)}
    >
      {/* Left accent */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: cfg.accent, borderRadius: '14px 0 0 14px',
      }} />

      {/* Content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px 10px 16px' }}>
        {/* Icon */}
        <div style={{ flexShrink: 0, marginTop: 1 }}>
          {notif.icon ? (
            isCustomIcon ? (
              <img src={notif.icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 4 }} />
            ) : (
              <span style={{ fontSize: 20, lineHeight: 1 }}>{notif.icon}</span>
            )
          ) : cfg.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: notif.message ? 3 : 0 }}>
            {notif.title}
          </p>
          {notif.message && (
            <p style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.4 }}>{notif.message}</p>
          )}
        </div>

        {/* Close / spinner */}
        {notif.type === 'loading' ? (
          <Loader2 size={13} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }} className="animate-spin" />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(notif.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2, flexShrink: 0, marginTop: 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Value bar — hiện khi có currentValue */}
      {hasValueBar && <ValueBar notif={notif} accent={cfg.accent} />}

      {/* Progress bar (countdown) */}
      {notif.duration && notif.duration > 0 && (
        <div style={{
          height: 2,
          margin: hasValueBar ? '0 14px 6px' : '0 14px 8px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: cfg.accent, borderRadius: 2,
            width: `${progress}%`, transition: 'width 0.016s linear',
          }} />
        </div>
      )}
    </motion.div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function NotificationApp() {
  const [notifs, setNotifs] = useState<NotifData[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
  }, []);

  // Once the queue empties, tell the main process to hide the overlay window.
  // The window is transparent + always-on-top, so leaving it visible while empty
  // keeps the GPU compositing it every frame for nothing. sendNotification()
  // shows it again (showInactive) when the next notification arrives.
  useEffect(() => {
    if (notifs.length === 0) {
      (window as any).electronAPI?._ipc?.send?.('notif:empty');
    }
  }, [notifs.length]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const ipc = (window as any).electronAPI;

    const unsubShow = ipc.notif?.onShow?.((data: NotifData) => {
      setNotifs(prev => {
        const exists = prev.find(n => n.id === data.id);
        if (exists) return prev.map(n => n.id === data.id ? { ...n, ...data } : n);
        return [...prev, data];
      });
    });

    const unsubDismiss = ipc.notif?.onDismiss?.((id: string) => {
      dismiss(id);
    });

    const unsubUpdate = ipc.notif?.onUpdate?.((data: { id: string } & Partial<NotifData>) => {
      const { id, ...updates } = data;
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
      if (updates.type && updates.type !== 'loading' && updates.duration) {
        setTimeout(() => dismiss(id), updates.duration);
      }
    });

    return () => {
      unsubShow?.();
      unsubDismiss?.();
      unsubUpdate?.();
    };
  }, [dismiss]);

  return (
    <>
      {/* Regular notifications - bottom right */}
      <div style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        left: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}>
        <AnimatePresence mode="popLayout">
          {notifs.filter(n => n.type !== 'volume').map(n => (
            <div key={n.id} style={{ pointerEvents: 'auto' }}>
              <NotifItem notif={n} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Volume OSD - center screen */}
      <AnimatePresence>
        {notifs.filter(n => n.type === 'volume').map(n => (
          <VolumeOSD key={n.id} notif={n} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </>
  );
}