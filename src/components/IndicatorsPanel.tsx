import React, { useState } from 'react';
import { IndicatorValues, SmcStructures, MultiTimeframeAnalysis, AiTradeOpportunity } from '../types';
import { Activity, Gauge, BarChart3, Waves, ShieldAlert, CheckCircle2, GitCommit } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface IndicatorsPanelProps {
  indicators?: IndicatorValues;
  smcData?: SmcStructures;
  mtfAnalysis?: MultiTimeframeAnalysis;
  opportunity?: AiTradeOpportunity | null;
  currentPrice?: number;
  activePair?: string;
  language?: Language;
}

export const IndicatorsPanel: React.FC<IndicatorsPanelProps> = ({
  indicators,
  smcData,
  mtfAnalysis,
  opportunity,
  currentPrice = 1.0835,
  activePair = 'EUR/USD',
  language = 'ms'
}) => {
  const [activeTab, setActiveTab] = useState<'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'VOLUME'>('TREND');
  const t = translations[language] || translations.ms;

  if (!indicators) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg animate-pulse min-h-[220px]" />
    );
  }

  const getRsiBadge = (rsi: number) => {
    if (rsi >= 70) return <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold">{t.overbought}</span>;
    if (rsi <= 30) return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">{t.oversold}</span>;
    return <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium">{t.neutral}</span>;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 h-full flex flex-col justify-between">
      {/* Header & Category Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t.technicalIndicators}</h3>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 font-semibold">
            CLIENT CHART ANALYTICS
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs flex-wrap">
          <button
            onClick={() => setActiveTab('TREND')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              activeTab === 'TREND' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trend
          </button>
          <button
            onClick={() => setActiveTab('MOMENTUM')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              activeTab === 'MOMENTUM' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Momentum
          </button>
          <button
            onClick={() => setActiveTab('VOLATILITY')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              activeTab === 'VOLATILITY' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Volatility
          </button>
          <button
            onClick={() => setActiveTab('VOLUME')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              activeTab === 'VOLUME' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Volume
          </button>
          <button
            onClick={() => setActiveTab('FLOW')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 ${
              activeTab === 'FLOW' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40' : 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>{language === 'ms' ? 'Aliran Pengesahan' : 'Confirmation Flow'}</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Trend Indicators */}
      {activeTab === 'TREND' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">EMA 20 / 50</span>
            <div className="font-mono font-bold text-white">
              {indicators.ema20.toFixed(5)} / {indicators.ema50.toFixed(5)}
            </div>
            <span className="text-[10px] text-blue-400 block font-medium">
              {indicators.ema20 > indicators.ema50 ? 'Bullish Alignment' : 'Bearish Alignment'}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">EMA 200 Trend Filter</span>
            <div className="font-mono font-bold text-slate-200">{indicators.ema200.toFixed(5)}</div>
            <span className="text-[10px] text-slate-400 block">Baseline Support/Res</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">SuperTrend (10,3)</span>
            <div className="font-mono font-bold text-white">{indicators.superTrend.value.toFixed(5)}</div>
            <span className={`text-[10px] font-bold ${indicators.superTrend.trend === 'BULLISH' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {indicators.superTrend.trend}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">ADX Trend Strength</span>
            <div className="font-mono font-bold text-white">{indicators.adx.adx}</div>
            <span className="text-[10px] text-amber-400 font-bold uppercase">{indicators.adx.trendStrength}</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1 col-span-2 sm:col-span-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Ichimoku Kumo Cloud</span>
              <span className={`text-[10px] font-bold ${indicators.ichimoku.cloudState === 'BULLISH_CLOUD' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {indicators.ichimoku.cloudState}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-slate-300 pt-1">
              <div>Tenkan: {indicators.ichimoku.tenkanSen.toFixed(5)}</div>
              <div>Kijun: {indicators.ichimoku.kijunSen.toFixed(5)}</div>
              <div>Span A: {indicators.ichimoku.senkouSpanA.toFixed(5)}</div>
              <div>Span B: {indicators.ichimoku.senkouSpanB.toFixed(5)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Momentum Indicators */}
      {activeTab === 'MOMENTUM' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">RSI (14)</span>
              {getRsiBadge(indicators.rsi)}
            </div>
            <div className="font-mono font-bold text-2xl text-white">{indicators.rsi}</div>
            {indicators.rsiDivergence && indicators.rsiDivergence !== 'NONE' && (
              <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1 mt-1">
                <ShieldAlert className="w-3 h-3" /> {indicators.rsiDivergence} DIVERGENCE DETECTED
              </span>
            )}
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">MACD Histogram</span>
            <div className={`font-mono font-bold text-xl ${indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {indicators.macd.histogram.toFixed(5)}
            </div>
            <span className="text-[10px] text-slate-400 block">MACD Line: {indicators.macd.macdLine.toFixed(5)}</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Stochastic RSI</span>
            <div className="font-mono font-bold text-white">
              %K: {indicators.stochRsi.k} / %D: {indicators.stochRsi.d}
            </div>
            <span className="text-[10px] text-slate-400 block">Crossover Momentum</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Commodity Channel Index (CCI)</span>
            <div className="font-mono font-bold text-white">{indicators.cci}</div>
            <span className="text-[10px] text-slate-400 block">Cyclical Extremes</span>
          </div>
        </div>
      )}

      {/* Tab 3: Volatility */}
      {activeTab === 'VOLATILITY' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">ATR (14) Volatility</span>
            <div className="font-mono font-bold text-xl text-white">{(indicators.atr * 10000).toFixed(1)} Pips</div>
            <span className="text-[10px] text-slate-400 block">Raw Value: {indicators.atr.toFixed(5)}</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1 sm:col-span-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Bollinger Bands (20,2)</span>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs text-white pt-1">
              <div>Upper: <span className="text-emerald-400">{indicators.bollingerBands.upper.toFixed(5)}</span></div>
              <div>Middle: <span className="text-slate-300">{indicators.bollingerBands.middle.toFixed(5)}</span></div>
              <div>Lower: <span className="text-rose-400">{indicators.bollingerBands.lower.toFixed(5)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Volume & Participation */}
      {activeTab === 'VOLUME' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">VWAP (Volume Weighted Avg Price)</span>
            <div className="font-mono font-bold text-xl text-white">{indicators.vwap.toFixed(5)}</div>
            <span className="text-[10px] text-blue-400 block">Institutional Benchmark Level</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">On-Balance Volume (OBV)</span>
            <div className="font-mono font-bold text-xl text-white">{indicators.obv.toLocaleString()}</div>
            <span className="text-[10px] text-slate-400 block">Volume Pressure Accumulation</span>
          </div>
        </div>
      )}
    </div>
  );
};
