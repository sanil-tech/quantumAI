import React from 'react';
import { SmcStructures, Timeframe } from '../types';
import { Layers, Zap, ArrowRight, ShieldCheck, CornerDownRight } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface SMCPanelProps {
  smcData?: SmcStructures;
  timeframe: Timeframe;
  language?: Language;
}

export const SMCPanel: React.FC<SMCPanelProps> = ({ smcData, timeframe, language = 'ms' }) => {
  const t = translations[language] || translations.ms;

  if (!smcData) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg animate-pulse min-h-[220px]" />
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t.smcTitle}</h3>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 font-semibold">
            CLIENT CHART ANALYTICS
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-400 font-semibold">{timeframe} Active View</span>
      </div>

      {/* Grid of SMC Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Order Blocks */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Institutional Order Blocks
          </span>

          {smcData.orderBlocks.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No active unmitigated Order Blocks detected on this timeframe.</p>
          ) : (
            <div className="space-y-1.5">
              {smcData.orderBlocks.map((ob) => (
                <div
                  key={ob.id}
                  className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                    ob.type === 'BULLISH'
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{ob.type} OB</span>
                    <span className="font-mono text-[11px] opacity-90">
                      {ob.low.toFixed(5)} - {ob.high.toFixed(5)}
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 font-mono">
                    {ob.mitigated ? 'Mitigated' : 'UNMITIGATED'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fair Value Gaps (FVG) */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <CornerDownRight className="w-3.5 h-3.5 text-blue-400" /> Fair Value Gaps (FVGs)
          </span>

          {smcData.fairValueGaps.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No unfilled Fair Value Gaps in active range.</p>
          ) : (
            <div className="space-y-1.5">
              {smcData.fairValueGaps.map((fvg) => (
                <div
                  key={fvg.id}
                  className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                    fvg.type === 'BULLISH_FVG'
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{fvg.type === 'BULLISH_FVG' ? 'Bullish Imbalance' : 'Bearish Imbalance'}</span>
                    <span className="font-mono text-[11px] opacity-90">
                      {fvg.bottom.toFixed(5)} - {fvg.top.toFixed(5)}
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 font-mono text-amber-400 font-bold">
                    UNFILLED
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Structure Breaks (BOS & CHOCH) & Sweeps */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2 col-span-1 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Market Structure & Liquidity Sweeps
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Break of Structure (BOS)</span>
              <span className="font-mono font-bold text-white text-xs block mt-0.5">
                {smcData.lastBos ? `${smcData.lastBos.type} @ ${smcData.lastBos.price.toFixed(5)}` : 'No Recent BOS'}
              </span>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Change of Character (CHOCH)</span>
              <span className="font-mono font-bold text-white text-xs block mt-0.5">
                {smcData.lastChoch ? `${smcData.lastChoch.type} @ ${smcData.lastChoch.price.toFixed(5)}` : 'No Recent CHOCH'}
              </span>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Active Liquidity Sweeps</span>
              <span className="font-mono font-bold text-amber-300 text-xs block mt-0.5">
                {smcData.liquiditySweeps.length > 0 ? `${smcData.liquiditySweeps.length} Stop Hunts Detected` : 'Liquidity Clean'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
