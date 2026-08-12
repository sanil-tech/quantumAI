import React, { useState } from 'react';
import { CurrencyPair, Timeframe, TradingStyle, IndicatorValues, SmcStructures, AiTradeOpportunity } from '../types';
import { Bot, Sparkles, Send, ShieldAlert, TrendingUp, Compass, MessageSquare, Zap, Cpu, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Language, translations } from '../lib/translations';
import { evaluateSetupValidity } from '../lib/setupValidator';

interface PakarTraderPanelProps {
  pair: CurrencyPair;
  timeframe: Timeframe;
  tradingStyle: TradingStyle;
  currentPrice: number;
  opportunity: AiTradeOpportunity | null;
  indicators?: IndicatorValues;
  smcData?: SmcStructures;
  onAskPakar: (query: string) => void;
  language?: Language;
}

export const PakarTraderPanel: React.FC<PakarTraderPanelProps> = ({
  pair,
  timeframe,
  tradingStyle,
  currentPrice,
  opportunity,
  indicators,
  smcData,
  onAskPakar,
  language = 'ms'
}) => {
  const t = translations[language] || translations.ms;
  const [quickInput, setQuickInput] = useState('');

  const handleAsk = (customQuery?: string) => {
    const query = customQuery || quickInput;
    if (!query.trim()) return;
    onAskPakar(query);
    setQuickInput('');
  };

  const isMalay = language === 'ms';
  const validity = evaluateSetupValidity(opportunity, currentPrice, indicators);

  const quickPrompts = isMalay ? [
    { label: "⚡ Analisis Isyarat ", prompt: `Analisis penuh persediaan ${pair} pada TF ${timeframe}. Adakah peluang Buy atau Sell?` },
    { label: "🎯 Zon Order Block & FVG", prompt: `Di manakah zon Order Block dan Fair Value Gap (FVG) terdekat untuk ${pair}?` },
    { label: "❌ Status Keabsahan Setup", prompt: `Adakah setup ${pair} ini masih sah atau dah terbatal (obsolete)? Terangkan secara terperinci.` },
    { label: "🛡️ Cadangan Stop Loss & R:R", prompt: `Berapa Stop Loss dan Take Profit yang paling selamat untuk ${pair} sekarang?` }
  ] : [
    { label: "⚡ Full Trade Analysis", prompt: `Perform a full technical & SMC breakdown for ${pair} on ${timeframe}.` },
    { label: "🎯 Demand & Supply Zones", prompt: `Where are the key Order Blocks and FVGs for ${pair} right now?` },
    { label: "❌ Setup Validity Status", prompt: `Is the current ${pair} setup valid or obsolete/invalidated? Explain why.` },
    { label: "🛡️ Stop Loss & R:R Advice", prompt: `What is the ideal Stop Loss and Risk-to-Reward setup for ${pair}?` }
  ];

  const decimals = pair === 'USD/JPY' ? 3 : (pair === 'XAU/USD' || pair === 'NASDAQ' || pair === 'BTC/USD') ? 2 : 5;

  return (
    <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Subtle background glow effect */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg shadow-blue-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full animate-ping" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                {isMalay ? 'Pakar Trader Forex AI Quantum' : 'Pakar Trader AI Desk Chief'}
              </h3>
              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-mono font-bold rounded-full uppercase">
                {language === 'ms' ? 'ONLINE LIVE' : 'ONLINE LIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {isMalay ? 'Pembantu Desk Dagangan Kuantitatif & SMC Interaktif' : 'Quantitative Analysis & Smart Money Concepts Chief'}
            </p>
          </div>
        </div>

        {/* Live Market Badge */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono shrink-0">
          <Cpu className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          <span className="text-slate-400">{pair}:</span>
          <span className="text-emerald-400 font-bold">{currentPrice.toFixed(decimals)}</span>
          <span className="text-slate-500">({timeframe})</span>
        </div>
      </div>

      {/* Live AI Pakar Recommendation Brief */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Bias Box */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isMalay ? 'Bias Trend Utama' : 'Primary Trend Bias'}
          </span>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-bold ${
              opportunity?.bias === 'BULLISH' ? 'text-emerald-400' : opportunity?.bias === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'
            }`}>
              {opportunity?.bias || 'ANALYZING...'}
            </span>
            <span className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
              {opportunity?.confidence ? `${opportunity.confidence}% Conf.` : '85% Conf.'}
            </span>
          </div>
        </div>

        {/* Signal Box */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isMalay ? 'Cadangan Tindakan' : 'Recommended Action'}
          </span>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-bold ${
              opportunity?.action === 'BUY' ? 'text-emerald-400' : opportunity?.action === 'SELL' ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {opportunity?.action || 'WAIT FOR SET-UP'}
            </span>
            <span className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
              {tradingStyle}
            </span>
          </div>
        </div>

        {/* Technical Confluence */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isMalay ? 'Indikator / SMC Confluence' : 'Indicators & SMC State'}
          </span>
          <div className="text-xs text-slate-300 truncate">
            RSI: <strong className="text-white">{indicators?.rsi || '54'}</strong> | SuperTrend: <strong className="text-blue-400">{indicators?.superTrend?.trend || 'BULLISH'}</strong>
          </div>
        </div>
      </div>

      {/* Setup Validity Status Banner */}
      <div className={`mt-3 p-3 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${
        !validity.isValid ? 'bg-rose-950/40 border-rose-500/80 text-rose-200' : 'bg-slate-950/60 border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center gap-2">
          {!validity.isValid ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <div>
            <span className="font-bold text-white block">
              {isMalay ? validity.badgeTextMs : validity.badgeTextEn}
            </span>
            <span className="text-[11px] text-slate-300">
              {isMalay ? validity.invalidationReasonMs : validity.invalidationReasonEn}
            </span>
          </div>
        </div>

        {!validity.isValid && (
          <button
            onClick={() => handleAsk(`Mengapa setup ${pair} ini terbatal (obsolete)?`)}
            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-bold shrink-0 transition"
          >
            {isMalay ? 'Penjelasan Pakar' : 'Ask Why'}
          </button>
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            {isMalay ? 'Tanya Soalan Kepada Pakar Trader AI:' : 'Ask Pakar Trader AI Anything:'}
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {isMalay ? 'Boleh tanya dalam Bahasa Melayu / English' : 'Fluent in Malay & English'}
          </span>
        </div>

        {/* Quick Question Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleAsk(qp.prompt)}
              className="p-2 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 text-slate-300 hover:text-white rounded-xl text-left text-xs transition flex items-center justify-between group"
            >
              <span className="truncate">{qp.label}</span>
              <Send className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition shrink-0 ml-1" />
            </button>
          ))}
        </div>

        {/* Input Field */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder={isMalay ? `Taip soalan untuk ${pair} (cth: "Sebab apa buy?", "Impak NFP?", "Risk $10,000")` : `Ask Pakar Trader about ${pair}...`}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 shadow-inner"
          />
          <button
            onClick={() => handleAsk()}
            disabled={!quickInput.trim()}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-blue-600/20"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isMalay ? 'Tanya' : 'Ask'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
