import React from 'react';
import { AiTradeOpportunity, TradingStyle } from '../types';
import { Brain, ArrowUpRight, ArrowDownRight, ShieldAlert, Sparkles, CheckCircle2, Copy, Send, HelpCircle, AlertTriangle, XCircle, ShieldCheck, Check, Bookmark, BookOpen } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface AiAnalysisCardProps {
  opportunity: AiTradeOpportunity | null;
  loading: boolean;
  tradingStyle: TradingStyle;
  currentPrice?: number;
  onSyncToRiskCalc: (opp: AiTradeOpportunity) => void;
  onLogToJournal: (opp: AiTradeOpportunity) => void;
  onAskAi: (prompt: string) => void;
  language?: Language;
  onOpenAdaptiveLearning?: () => void;
}

export const AiAnalysisCard: React.FC<AiAnalysisCardProps> = ({
  opportunity,
  loading,
  tradingStyle,
  currentPrice = 0,
  onSyncToRiskCalc,
  onLogToJournal,
  onAskAi,
  language = 'ms',
  onOpenAdaptiveLearning,
}) => {
  const t = translations[language] || translations.ms;
  const isMalay = language === 'ms';

  const [copied, setCopied] = React.useState(false);
  const [markedReviewed, setMarkedReviewed] = React.useState(false);

  const handleCopyLevels = () => {
    if (!opportunity) return;
    const text = `QUANTUMAI AI SIGNAL - ${opportunity.pair}
Action: ${opportunity.action}
Entry Zone: ${opportunity.entryZone.min} - ${opportunity.entryZone.max}
Stop Loss: ${opportunity.stopLoss}
Take Profit 1: ${opportunity.takeProfit1}
Take Profit 2: ${opportunity.takeProfit2}
Risk/Reward: ${opportunity.riskRewardRatio}
Confidence: ${opportunity.confidence}%`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[380px] gap-4">
        <div className="p-4 bg-blue-600/10 rounded-full border border-blue-500/20 animate-pulse">
          <Brain className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-bold text-white">AI Quantitative Reasoning Engine Active...</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Evaluating multi-timeframe candle structures, EMAs, RSI divergence, Order Blocks, and macroeconomic conditions.
          </p>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[380px] text-center gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <h3 className="text-sm font-bold text-slate-200">MARKET DATA UNAVAILABLE / NO SETUP</h3>
        <p className="text-xs text-slate-400 max-w-md">
          Awaiting validated real market feed candles from Yahoo Finance. QuantumAI does not fabricate synthetic trade setups.
        </p>
      </div>
    );
  }

  const isBuy = opportunity.action === 'BUY';
  const isSell = opportunity.action === 'SELL';
  const isWait = !isBuy && !isSell;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${
            isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
            isSell ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
            'bg-amber-500/20 text-amber-400 border border-amber-500/40'
          }`}>
            {isBuy ? <ArrowUpRight className="w-5 h-5" /> : isSell ? <ArrowDownRight className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-wide">{opportunity.pair}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300 border border-slate-700">
                M15 SETUP
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Bias: <span className="font-semibold text-slate-200">{opportunity.bias}</span> | RR: <span className="font-semibold text-slate-200">{opportunity.riskRewardRatio}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-xl font-mono text-xs font-black tracking-wider flex items-center gap-1.5 ${
            isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-lg shadow-emerald-950/40' :
            isSell ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-lg shadow-rose-950/40' :
            'bg-amber-500/20 text-amber-300 border border-amber-500/50'
          }`}>
            {opportunity.action}
            <span className="text-[10px] opacity-80">({opportunity.confidence}%)</span>
          </div>
        </div>
      </div>

      {/* Manual Signal Notice */}
      <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-blue-300 font-semibold">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
          <span>MANUAL EXECUTION ONLY ? QuantumAI does not place trades.</span>
        </div>
        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] uppercase font-bold shrink-0">
          Broker Orders: 0
        </span>
      </div>

      {/* Trade Levels Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Entry Zone</div>
          <div className="font-bold text-slate-100 text-sm mt-0.5">
            {opportunity.entryZone?.min} ? {opportunity.entryZone?.max}
          </div>
        </div>

        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-2.5">
          <div className="text-[10px] text-rose-400 uppercase font-semibold">Stop Loss</div>
          <div className="font-bold text-rose-300 text-sm mt-0.5">
            {opportunity.stopLoss}
          </div>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-2.5">
          <div className="text-[10px] text-emerald-400 uppercase font-semibold">Take Profit 1</div>
          <div className="font-bold text-emerald-300 text-sm mt-0.5">
            {opportunity.takeProfit1}
          </div>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-2.5">
          <div className="text-[10px] text-teal-400 uppercase font-semibold">Take Profit 2</div>
          <div className="font-bold text-teal-300 text-sm mt-0.5">
            {opportunity.takeProfit2}
          </div>
        </div>
      </div>

      {/* Adaptive Learning Evidence */}
      {onOpenAdaptiveLearning && (
        <div 
          onClick={onOpenAdaptiveLearning}
          className="bg-purple-950/30 hover:bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 cursor-pointer transition flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <span className="font-bold text-purple-200">ADAPTIVE LEARNING: ACTIVE</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Past trade lessons memory actively applied to SL buffer and entry evaluation.
              </p>
            </div>
          </div>
          <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold">
            VIEW LESSONS dY" 
          </span>
        </div>
      )}

      {/* Technical Confluence Evidence */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Technical &amp; SMC Evidence
        </div>
        <ul className="space-y-1 text-xs text-slate-300 font-medium">
          {opportunity.reasons?.map((reason, i) => (
            <li key={i} className="flex items-start gap-2 bg-slate-950/50 rounded-lg p-2 border border-slate-800/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action Buttons for Manual Trading */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
        <button
          onClick={handleCopyLevels}
          className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition border border-slate-700"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-blue-400" />}
          <span>{copied ? 'LEVELS COPIED!' : 'COPY LEVELS'}</span>
        </button>

        <button
          onClick={() => onLogToJournal(opportunity)}
          className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow-lg shadow-blue-900/30"
        >
          <Bookmark className="w-4 h-4" />
          <span>LOG IN JOURNAL</span>
        </button>

        <button
          onClick={() => setMarkedReviewed(!markedReviewed)}
          className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition border ${
            markedReviewed 
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' 
              : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-slate-400" />
          <span>{markedReviewed ? 'REVIEWED' : 'MARK AS REVIEWED'}</span>
        </button>
      </div>
    </div>
  );
};
