import React, { useState, useEffect, useCallback } from 'react';
import { Brain, ShieldAlert, CheckCircle2, Zap, X, AlertTriangle } from 'lucide-react';

export interface AutoTraderToastEvent {
  id: string;
  type: 'SL_HIT' | 'TP_HIT' | 'EXECUTE' | 'POST_MORTEM' | 'WARNING';
  pair: string;
  title: string;
  message: string;
  pnlDollars?: number;
  adaptiveRule?: string;
  timestamp: string;
}

export const AutoTraderToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<AutoTraderToastEvent[]>([]);

  // Sound chime helper
  const playNotificationAudio = useCallback((type: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (type === 'SL_HIT') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
      } else if (type === 'TP_HIT') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.12);
      }

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (_) {}
  }, []);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const customEvent = event as CustomEvent<AutoTraderToastEvent>;
      if (!customEvent.detail) return;

      const newToast = customEvent.detail;
      playNotificationAudio(newToast.type);

      setToasts(prev => [newToast, ...prev.slice(0, 4)]);

      // Auto dismiss after 12 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 12000);
    };

    window.addEventListener('QUANTUM_AUTO_NOTIFY', handleNotification);
    return () => {
      window.removeEventListener('QUANTUM_AUTO_NOTIFY', handleNotification);
    };
  }, [playNotificationAudio]);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => {
        const isLoss = toast.type === 'SL_HIT';
        const isWin = toast.type === 'TP_HIT';
        const isPostMortem = toast.type === 'POST_MORTEM' || Boolean(toast.adaptiveRule);

        const borderColor = isLoss
          ? 'border-rose-500/80 bg-rose-950/90'
          : isWin
          ? 'border-emerald-500/80 bg-emerald-950/90'
          : isPostMortem
          ? 'border-purple-500/80 bg-purple-950/90'
          : 'border-blue-500/80 bg-blue-950/90';

        const iconBg = isLoss
          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
          : isWin
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
          : isPostMortem
          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
          : 'bg-blue-500/20 text-blue-400 border-blue-500/40';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto border-2 shadow-2xl rounded-xl p-4 flex items-start justify-between gap-3 text-slate-100 animate-slide-in backdrop-blur-md ${borderColor}`}
          >
            <div className="flex gap-3 items-start w-full">
              <div className={`p-2.5 rounded-lg border shrink-0 mt-0.5 animate-pulse ${iconBg}`}>
                {isLoss && <ShieldAlert className="w-5 h-5" />}
                {isWin && <CheckCircle2 className="w-5 h-5" />}
                {isPostMortem && <Brain className="w-5 h-5" />}
                {!isLoss && !isWin && !isPostMortem && <Zap className="w-5 h-5" />}
              </div>

              <div className="space-y-1.5 w-full">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-xs text-white bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                      {toast.pair}
                    </span>
                    <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700 text-slate-300">
                      {toast.type.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{toast.timestamp}</span>
                </div>

                <div className="text-sm font-bold text-white leading-tight">
                  {toast.title}
                </div>

                {toast.message && (
                  <div className="text-xs text-slate-200/90 leading-snug font-medium">
                    {toast.message}
                  </div>
                )}

                {toast.adaptiveRule && (
                  <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-purple-500/40 text-xs text-purple-200 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-purple-300">
                      <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>🧠 PERATURAN ADAPTIF TERKINI:</span>
                    </div>
                    <p className="text-[11px] leading-normal text-slate-300 italic">
                      {toast.adaptiveRule}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded transition shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
