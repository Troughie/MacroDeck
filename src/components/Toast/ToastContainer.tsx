import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import { useToastStore, Toast, ToastType } from '../../stores/toastStore';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ToastType, {
  icon: React.ReactNode;
  accent: string;
  bg: string;
  border: string;
}> = {
  success: {
    icon: <CheckCircle2 size={16} className="text-green-400" />,
    accent: '#22c55e',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.25)',
  },
  error: {
    icon: <AlertCircle size={16} className="text-red-400" />,
    accent: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
  },
  info: {
    icon: <Info size={16} className="text-blue-400" />,
    accent: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
  },
  loading: {
    icon: <Loader2 size={16} className="text-blue-400 animate-spin" />,
    accent: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
  },
};

// ─── Single Toast ─────────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToastStore();
  const config = TYPE_CONFIG[toast.type];
  const [progress, setProgress] = useState(100);

  // Progress bar countdown
  useEffect(() => {
    if (!toast.duration || toast.duration === 0) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration!) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [toast.duration]);

  const isCustomIcon = toast.icon && (
    toast.icon.startsWith('data:') || toast.icon.startsWith('http')
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className="relative overflow-hidden rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] cursor-pointer select-none"
      style={{
        background: '#1a1a2e',
        border: `1px solid ${config.border}`,
        minWidth: 280,
        maxWidth: 360,
      }}
      onClick={() => toast.type !== 'loading' && dismiss(toast.id)}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ background: config.accent }}
      />

      {/* Content */}
      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {toast.icon ? (
            isCustomIcon ? (
              <img src={toast.icon} alt="" className="w-5 h-5 object-contain rounded" />
            ) : (
              <span style={{ fontSize: 18, lineHeight: 1 }}>{toast.icon}</span>
            )
          ) : (
            config.icon
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-text-primary text-sm font-semibold leading-tight">{toast.title}</p>
          {toast.message && (
            <p className="text-text-muted text-xs mt-0.5 leading-relaxed">{toast.message}</p>
          )}
        </div>

        {/* Close button (not for loading) */}
        {toast.type !== 'loading' && (
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
            className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors mt-0.5"
          >
            <X size={13} />
          </button>
        )}

        {/* Loading spinner (extra) */}
        {toast.type === 'loading' && (
          <div className="flex-shrink-0 mt-0.5">
            <Loader2 size={14} className="text-blue-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Progress bar */}
      {toast.duration && toast.duration > 0 && (
        <div className="h-0.5 mx-4 mb-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: config.accent }}
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.016, ease: 'linear' }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts } = useToastStore();

  return (
    <div
      className="fixed z-[99999] flex flex-col gap-2 pointer-events-none"
      style={{
        bottom: 20,
        right: 20,
        maxWidth: 360,
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
