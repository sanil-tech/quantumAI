import React from 'react';
import { MultiTimeframeAnalysis } from '../types';
import { Clock, CheckCircle, TrendingUp, AlertCircle, Compass } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface MultiTimeframePanelProps {
  mtfData?: MultiTimeframeAnalysis;
  language?: Language;
}

export const MultiTimeframePanel: React.FC<MultiTimeframePanelProps> = ({ mtfData, language = 'ms' }) => {
  const t = translations[language] || translations.ms;

  if (!mtfData) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-1/3" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 bg-slate-800/60 rounded-xl" />
          <div className="h-24 bg-slate-800/60 rounded-xl" />
          <div className="h-24 bg-slate-800/60 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t.mtfTitle}</h3>
        </div>

        {/* Alignment Gauge */}
        <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700/60 text-xs">
          <span className="text-slate-400 font-medium">{t.confluenceScore}:</span>
          <span className="font-mono font-bold text-emerald-400">{mtfData.alignmentScore}%</span>
        </div>
      </div>

      {/* 3 Timeframe Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Higher Timeframe (D1/W1) */}
        <div className={`bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 space-y-2 border-l-2 ${
          mtfData.higherTimeframe.bias === 'BULLISH' ? 'border-l-emerald-500' : mtfData.higherTimeframe.bias === 'BEARISH' ? 'border-l-rose-500' : 'border-l-amber-500'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Higher TF (D1/W1)</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                mtfData.higherTimeframe.bias === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : mtfData.higherTimeframe.bias === 'BEARISH'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {mtfData.higherTimeframe.bias}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{mtfData.higherTimeframe.description}</p>
        </div>

        {/* Trend Timeframe (H4/H1) */}
        <div className={`bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 space-y-2 border-l-2 ${
          mtfData.trendTimeframe.bias === 'BULLISH' ? 'border-l-emerald-500' : mtfData.trendTimeframe.bias === 'BEARISH' ? 'border-l-rose-500' : 'border-l-amber-500'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trend TF (H4/H1)</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                mtfData.trendTimeframe.bias === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : mtfData.trendTimeframe.bias === 'BEARISH'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {mtfData.trendTimeframe.bias}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{mtfData.trendTimeframe.description}</p>
        </div>

        {/* Entry Timeframe (M15/M5) */}
        <div className={`bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 space-y-2 border-l-2 ${
          mtfData.entryTimeframe.bias === 'BULLISH' ? 'border-l-emerald-500' : mtfData.entryTimeframe.bias === 'BEARISH' ? 'border-l-rose-500' : 'border-l-amber-500'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Entry TF (M15/M5)</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                mtfData.entryTimeframe.bias === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : mtfData.entryTimeframe.bias === 'BEARISH'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {mtfData.entryTimeframe.bias}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{mtfData.entryTimeframe.description}</p>
        </div>
      </div>
    </div>
  );
};
