import React from 'react';
import { AiTradeOpportunity, TradingStyle } from '../types';
import { Brain, ArrowUpRight, ArrowDownRight, ShieldAlert, Sparkles, CheckCircle2, Copy, Send, HelpCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Language, translations } from '../lib/translations';
import { evaluateSetupValidity } from '../lib/setupValidator';

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

  const [isExecutingSignal, setIsExecutingSignal] = React.useState(false);
  const [signalResultMsg, setSignalResultMsg] = React.useState<string | null>(null);

  const handleSendSignalToCtrader = async () => {
    if (!opportunity || opportunity.action === 'WAIT / NO SETUP') return;
    setIsExecutingSignal(true);
    setSignalResultMsg(null);
    try {
      const entryPriceVal = currentPrice || (opportunity.entryZone ? Number(((opportunity.entryZone.min + opportunity.entryZone.max) / 2).toFixed(5)) : 1.0850);
      const lotSizeVal = 0.10;

      const res = await fetch('/api/autotrader/trade/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: opportunity.pair,
          direction: opportunity.action,
          entryPrice: entryPriceVal,
          stopLoss: opportunity.stopLoss,
          takeProfit1: opportunity.takeProfit1,
          takeProfit2: opportunity.takeProfit2,
          lotSize: lotSizeVal,
          setupId: `ai-signal-${opportunity.pair.replace('/', '')}-${Date.now()}`
        })
      });
      const data = await res.json();
      if (data.success) {
        const msg = isMalay
          ? `🚀 ISYARAT AI BERJAYA DIHANTAR KE CTRADER!\n\n• Pasangan: ${opportunity.pair}\n• Arahan: ${opportunity.action} (0.10 Lot)\n• Harga Entry: ${entryPriceVal}\n• SL: ${opportunity.stopLoss} | TP1: ${opportunity.takeProfit1}\n• Tiket cTrader: #${data.mt5Ticket}\n\nIsyarat AI kini dimasukkan ke dalam Pending Queue cTrader FIX API / Open API Bridge (Akaun #5877246). Robot cTrader cBot akan melaksanakan pesanan ini!`
          : `🚀 AI SIGNAL SUCCESSFULLY DISPATCHED TO CTRADER!\n\n• Pair: ${opportunity.pair}\n• Direction: ${opportunity.action} (0.10 Lot)\n• Entry Price: ${entryPriceVal}\n• SL: ${opportunity.stopLoss} | TP1: ${opportunity.takeProfit1}\n• cTrader Ticket: #${data.mt5Ticket}\n\nAI Signal queued in cTrader FIX API / Open API Bridge (A/C #5877246). QuantumAI cBot will execute this order!`;

        setSignalResultMsg(isMalay ? `✅ Isyarat ${opportunity.action} ${opportunity.pair} dihantar ke cTrader (Tiket #${data.mt5Ticket})` : `✅ Signal ${opportunity.action} ${opportunity.pair} dispatched to cTrader (Ticket #${data.mt5Ticket})`);
        alert(msg);

        window.dispatchEvent(new CustomEvent('QUANTUM_AUTO_NOTIFY', {
          detail: {
            id: `exec_ai_${Date.now()}`,
            type: 'EXECUTE',
            pair: opportunity.pair,
            title: `🚀 cTrader Signal Dispatched: ${opportunity.action} ${opportunity.pair}`,
            message: `Ticket #${data.mt5Ticket} queued for cTrader cBot execution on A/C #5877246.`,
            timestamp: new Date().toLocaleTimeString('ms-MY', { hour12: false })
          }
        }));
      } else {
        setSignalResultMsg(`❌ Ralat: ${data.error || 'Gagal menghantar isyarat'}`);
      }
    } catch (err: any) {
      setSignalResultMsg(`❌ Error: ${err.message}`);
    } finally {
      setIsExecutingSignal(false);
    }
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-400 text-center flex flex-col items-center justify-center min-h-[380px] gap-3">
        <Brain className="w-10 h-10 text-slate-600" />
        <p className="text-sm">No analysis loaded. Select a currency pair to trigger the AI analysis engine.</p>
      </div>
    );
  }

  const isBuy = opportunity.bias === 'BULLISH' || opportunity.action === 'BUY';
  const isSell = opportunity.bias === 'BEARISH' || opportunity.action === 'SELL';

  const validity = evaluateSetupValidity(opportunity, currentPrice);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5 relative overflow-hidden backdrop-blur-sm h-full flex flex-col justify-between">
      {/* Background Subtle Gradient Glow */}
      <div
        className={`absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none ${
          isBuy ? 'bg-emerald-500' : isSell ? 'bg-rose-500' : 'bg-blue-500'
        }`}
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600 rounded-lg shadow text-white">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.marketNarrative}</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {tradingStyle}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{t.probSetup} ({opportunity.pair})</p>
          </div>
        </div>

        {/* Sync & Log Quick Actions */}
        <div className="flex items-center gap-1.5">
          <button
            id="ai-sync-risk-btn"
            onClick={() => onSyncToRiskCalc(opportunity)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 hover:text-white rounded-md text-xs font-semibold transition flex items-center gap-1 shadow-sm"
            title={t.syncRiskCalc}
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">{t.syncRiskCalc}</span>
          </button>
          <button
            id="ai-log-journal-btn"
            onClick={() => onLogToJournal(opportunity)}
            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold transition flex items-center gap-1 shadow-sm"
            title={t.journalLog}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.journalLog}</span>
          </button>
        </div>
      </div>

      {/* Current Bias Block */}
      <div className={`p-4 rounded-xl border transition ${
        isBuy
          ? 'bg-slate-800/50 border-emerald-500/30'
          : isSell
          ? 'bg-slate-800/50 border-rose-500/30'
          : 'bg-slate-800/50 border-slate-700'
      }`}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-slate-400 font-medium">{t.currentMarketBias}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            isBuy
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : isSell
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-slate-700 text-slate-300'
          }`}>
            {opportunity.bias} ({opportunity.action})
          </span>
        </div>

        <div className="text-3xl font-bold font-mono text-white flex items-baseline gap-1">
          {opportunity.confidence}<span className="text-lg font-normal text-slate-400">%</span>
          <span className="text-xs font-sans font-normal text-slate-400 ml-auto">
            {t.riskReward} <span className="font-mono font-bold text-white">{opportunity.riskRewardRatio}</span>
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${isBuy ? 'bg-emerald-500' : isSell ? 'bg-rose-500' : 'bg-blue-500'}`}
            style={{ width: `${opportunity.confidence}%` }}
          />
        </div>
      </div>

      {/* AI Reasoning List */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" /> {t.aiConfluenceReasoning}
        </h4>
        <ul className="text-xs space-y-2 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          {opportunity.reasons.map((reason, idx) => (
            <li key={idx} className="flex items-start gap-2 text-slate-300 leading-snug">
              <span className={`font-bold mt-0.5 ${isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-blue-400'}`}>•</span>
              <span className="text-slate-300">{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Setup Invalidation / Obsolete Alert Card (Pakar Trader Invalidation Engine) */}
      {!validity.isValid ? (
        <div className="bg-rose-950/40 border-2 border-rose-500/80 rounded-xl p-4 space-y-2.5 shadow-lg shadow-rose-950/50">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold text-xs rounded-lg flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              {isMalay ? validity.badgeTextMs : validity.badgeTextEn}
            </span>
            <span className="text-[10px] font-bold uppercase text-rose-400 tracking-wider">PAKAR TRADER WARNING</span>
          </div>

          <p className="text-xs text-rose-200 font-semibold leading-relaxed">
            {isMalay ? validity.invalidationReasonMs : validity.invalidationReasonEn}
          </p>

          <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-amber-300 font-mono flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span><strong>Nasihat Pakar Trader:</strong> {isMalay ? validity.recommendedActionMs : validity.recommendedActionEn}</span>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
          <span className="text-emerald-400 font-mono font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {isMalay ? validity.badgeTextMs : validity.badgeTextEn}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Real-time Validation Active</span>
        </div>
      )}

      {/* Suggested Trade Setup Card */}
      <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {t.actionableSetup}
          </h4>
          <span className="text-[11px] font-mono text-slate-400">
            {t.invalidation}: <span className="text-rose-400 font-bold">{opportunity.invalidationLevel}</span>
          </span>
        </div>

        {/* News & Adaptive Learning Status Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2 flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px]">{t.newsProtectionActive}</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold">
              {t.safeForEntry}
            </span>
          </div>

          <div
            onClick={onOpenAdaptiveLearning}
            className="bg-purple-950/30 border border-purple-500/30 hover:border-purple-500/60 rounded-lg p-2 flex items-center justify-between text-purple-200 cursor-pointer transition"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 animate-pulse" />
              <span className="text-[11px] font-semibold">{isMalay ? 'Memori Pembelajaran AI' : 'AI Adaptive Memory'}</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-mono font-bold">
              {isMalay ? 'PENGARAHAN RUGI DIGUNAKAN' : 'LESSONS APPLIED'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
          <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">{t.entryZone}</span>
            <span className="text-white font-bold text-sm block">
              {opportunity.entryZone.min} - {opportunity.entryZone.max}
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">{t.stopLoss}</span>
            <span className="text-rose-400 font-bold text-sm block">{opportunity.stopLoss}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">{t.takeProfit1}</span>
            <span className="text-emerald-400 font-bold text-sm block">{opportunity.takeProfit1}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">{t.takeProfit2}</span>
            <span className="text-emerald-400 font-bold text-sm block">{opportunity.takeProfit2}</span>
          </div>
        </div>

        {/* Direct cTrader AI Signal Dispatch Button */}
        {opportunity && opportunity.action !== 'WAIT / NO SETUP' && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSendSignalToCtrader}
              disabled={isExecutingSignal}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/30 border border-emerald-400/40 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4 text-emerald-200 animate-pulse" />
              <span>
                {isExecutingSignal
                  ? (isMalay ? 'Penghantaran Isyarat ke cTrader...' : 'Dispatching Signal to cTrader...')
                  : (isMalay ? `🚀 Hantar Isyarat ${opportunity.action} ${opportunity.pair} ke Akaun cTrader (#5877246)` : `🚀 Send ${opportunity.action} ${opportunity.pair} AI Signal to cTrader A/C #5877246`)}
              </span>
            </button>
            {signalResultMsg && (
              <p className="mt-2 text-[11px] font-mono text-center text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 rounded-lg py-1.5 px-2">
                {signalResultMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Rationale & Disclaimer */}
      <div className="space-y-2 pt-1 border-t border-slate-800/80">
        <p className="text-[11px] text-slate-400 italic leading-relaxed">
          <span className="font-semibold text-slate-300">{t.probabilityRationale}:</span> {opportunity.probabilityNotes}
        </p>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-[10px] text-slate-400 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{opportunity.disclaimer}</span>
          </div>
          <button
            onClick={() => onAskAi(`Explain why stop loss is set at ${opportunity.stopLoss} and TP at ${opportunity.takeProfit1}`)}
            className="text-blue-400 hover:underline flex items-center gap-1 text-[11px] font-medium shrink-0"
          >
            <HelpCircle className="w-3 h-3" /> {t.explainSlTp}
          </button>
        </div>
      </div>
    </div>
  );
};
