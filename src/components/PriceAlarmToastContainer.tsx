import React from 'react';
import { PriceAlarm } from '../types';
import { PAIR_CONFIGS } from '../lib/marketDataGenerator';
import { BellRing, X, ArrowUpRight, ArrowDownRight, Volume2 } from 'lucide-react';

interface PriceAlarmToastContainerProps {
  triggeredToasts: PriceAlarm[];
  onDismissToast: (id: string) => void;
}

export const PriceAlarmToastContainer: React.FC<PriceAlarmToastContainerProps> = ({
  triggeredToasts,
  onDismissToast,
}) => {
  if (triggeredToasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {triggeredToasts.map((toast) => {
        const dec = PAIR_CONFIGS[toast.pair]?.decimals || 5;
        const isAbove = toast.condition === 'ABOVE';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900/95 border-2 border-amber-500 shadow-2xl rounded-xl p-4 flex items-start justify-between gap-3 text-slate-100 animate-slide-in backdrop-blur-md"
          >
            <div className="flex gap-3 items-start">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/40 shrink-0 mt-0.5 animate-bounce">
                <BellRing className="w-5 h-5" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-sm text-amber-300">{toast.pair}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                      isAbove
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {isAbove ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    PRICE ALERT
                  </span>
                </div>

                <div className="text-base font-mono font-black text-white">
                  Target Level Reached: {toast.targetPrice.toFixed(dec)}
                </div>

                <div className="text-xs text-slate-300">
                  Market price has {isAbove ? 'risen above' : 'fallen below'} your preset target {toast.targetPrice.toFixed(dec)}.
                </div>

                {toast.note && (
                  <div className="text-xs text-amber-200/90 italic bg-amber-950/40 px-2 py-1 rounded border border-amber-800/40 mt-1">
                    "{toast.note}"
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => onDismissToast(toast.id)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition shrink-0"
              title="Dismiss Alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
