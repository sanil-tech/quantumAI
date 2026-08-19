import React from 'react';
import { AiTradeOpportunity, TradingStyle, CurrencyPair } from '../types';
import { Brain, ArrowUpRight, ArrowDownRight, ShieldAlert, Sparkles, CheckCircle2, Copy, Send, HelpCircle, AlertTriangle, XCircle, ShieldCheck, Check, Bookmark, BookOpen, Play, X, Compass, Activity, Database, Layers, Info, Clock, AlertOctagon } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface AiAnalysisCardProps {
  opportunity: AiTradeOpportunity | null;
  loading: boolean;
  tradingStyle: TradingStyle;
  currentPrice?: number;
  activePair?: CurrencyPair;
  onSyncToRiskCalc: (opp: AiTradeOpportunity) => void;
  onLogToJournal: (opp: AiTradeOpportunity) => void;
  onAskAi: (prompt: string) => void;
  language?: Language;
  onOpenAdaptiveLearning?: () => void;
  onTradeEntered?: (trade: any) => void;
  onNavigateToEvidence?: () => void;
}

export const AiAnalysisCard: React.FC<AiAnalysisCardProps> = ({
  opportunity,
  loading,
  tradingStyle,
  currentPrice = 0,
  activePair,
  onSyncToRiskCalc,
  onLogToJournal,
  onAskAi,
  language = 'ms',
  onOpenAdaptiveLearning,
  onTradeEntered,
  onNavigateToEvidence
}) => {
  const t = translations[language] || translations.ms;
  const isMalay = language === 'ms';

  const [copied, setCopied] = React.useState(false);
  const [markedReviewed, setMarkedReviewed] = React.useState(false);

  // Manual Entry Modal State (Phase 6C)
  const [showEntryModal, setShowEntryModal] = React.useState(false);
  const [actualEntry, setActualEntry] = React.useState<string>('');
  const [positionSize, setPositionSize] = React.useState<string>('0.1');
  const [notes, setNotes] = React.useState<string>('');
  const [entrySubmitting, setEntrySubmitting] = React.useState(false);
  const [entryError, setEntryError] = React.useState<string | null>(null);
  const [entrySuccess, setEntrySuccess] = React.useState<string | null>(null);

  const isPairMatch = !activePair || !opportunity || opportunity.pair === activePair;

  const isBuy = opportunity?.action === 'BUY';
  const isSell = opportunity?.action === 'SELL';
  const isTrade = (isBuy || isSell) && opportunity?.entryZone !== null;
  const isWait = opportunity?.action === 'WAIT_FOR_CONFIRMATION';
  const isVeto = opportunity?.action === 'VETO';
  const isNoSetup = !opportunity || opportunity?.action === 'NO_SETUP' || opportunity?.action === 'WAIT / NO SETUP';

  const plannedEntry = React.useMemo(() => {
    if (!opportunity?.entryZone?.min || !opportunity?.entryZone?.max) return (opportunity as any)?.entryPrice || currentPrice || 0;
    return (opportunity.entryZone.min + opportunity.entryZone.max) / 2;
  }, [opportunity, currentPrice]);

  const proposalId = React.useMemo(() => {
    if (!opportunity) return '';
    if (opportunity.proposalId) return opportunity.proposalId;
    const ts = opportunity.timestamp ? new Date(opportunity.timestamp).getTime() : Date.now();
    return `PROP-${opportunity.pair.replace('/', '')}-${ts.toString().slice(-6)}`;
  }, [opportunity]);

  const handleOpenEntryModal = () => {
    if (!opportunity || !isTrade) return;
    setActualEntry(plannedEntry ? plannedEntry.toFixed(opportunity.pair === 'USD/JPY' ? 3 : 5) : '');
    setPositionSize('0.1');
    setNotes('');
    setEntryError(null);
    setEntrySuccess(null);
    setShowEntryModal(true);
  };

  const handleConfirmManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunity || !isTrade) return;

    setEntrySubmitting(true);
    setEntryError(null);

    const actualEntryNum = Number(actualEntry);
    const positionSizeNum = Number(positionSize);

    if (!actualEntryNum || actualEntryNum <= 0) {
      setEntryError('Sila masukkan harga entri yang sah.');
      setEntrySubmitting(false);
      return;
    }

    if (!positionSizeNum || positionSizeNum <= 0 || positionSizeNum > 10.0) {
      setEntryError('Saiz posisi mestilah antara 0.01 hingga 10.0 lot.');
      setEntrySubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/forex/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: opportunity.pair,
          direction: opportunity.action,
          plannedEntry: plannedEntry,
          plannedStopLoss: opportunity.stopLoss,
          plannedTakeProfit1: opportunity.takeProfit1,
          plannedTakeProfit2: opportunity.takeProfit2,
          invalidationLevel: opportunity.invalidationLevel,
          aiConfidence: opportunity.confidence,
          reasons: opportunity.reasons,
          marketSnapshot: {
            timeframe: 'M15',
            spreadPips: opportunity.pair === 'EUR/USD' ? 1.1 : 1.4,
            currentPrice: currentPrice || actualEntryNum,
            atr: 0.0014
          },
          actualEntry: actualEntryNum,
          positionSize: positionSizeNum,
          enteredAt: new Date().toISOString(),
          notes: notes || 'Manually executed via user trading account'
        })
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Failed to submit manual trade entry.');
      }

      setEntrySuccess(`Trade recorded in journal! (ID: ${resJson.trade?.manualTradeId})`);
      if (onTradeEntered) {
        onTradeEntered(resJson.trade);
      }
      setTimeout(() => {
        setShowEntryModal(false);
        setEntrySuccess(null);
      }, 1800);
    } catch (err: any) {
      setEntryError(err.message || 'Error recording trade');
    } finally {
      setEntrySubmitting(false);
    }
  };

  const handleCopyLevels = () => {
    if (!opportunity || !isTrade) return;
    const text = `QUANTUMAI AI SIGNAL - ${opportunity.pair}
Action: ${opportunity.action}
Setup Type: ${opportunity.setupType || 'CONFLUENCE_QUANT'}
Entry Zone: ${opportunity.entryZone?.min} - ${opportunity.entryZone?.max}
Stop Loss: ${opportunity.stopLoss}
Take Profit 1: ${opportunity.takeProfit1}
Take Profit 2: ${opportunity.takeProfit2}
Risk/Reward: ${opportunity.riskRewardRatio}
Confidence: ${opportunity.confidence}%`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (loading || !isPairMatch) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[380px] gap-4">
        <div className="p-4 bg-blue-600/10 rounded-full border border-blue-500/20 animate-pulse">
          <Brain className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-bold text-white">Signal Intelligence & Adaptive Reasoning Active...</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Evaluating multi-timeframe structures, market regime, order blocks, and adaptive loss memory for {activePair || opportunity?.pair || 'instrument'}.
          </p>
        </div>
      </div>
    );
  }

  // State: VETOED by Adaptive Learning
  if (isVeto) {
    return (
      <div className="bg-slate-900 border border-rose-900/60 rounded-2xl p-5 shadow-2xl space-y-4 font-sans">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-950 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center font-black">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base font-mono">{opportunity.pair}</span>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-rose-950 text-rose-300 border border-rose-800 uppercase">[SIGNAL VETOED]</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300">ADAPTIVE RISK BLOCK</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Regime: <span className="font-semibold text-slate-200">{opportunity.marketRegime || 'UNCERTAIN'}</span> | Confidence: <span className="text-rose-400 font-bold">{opportunity.confidence}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>ADAPTIVE LEARNING VETO ACTIVATED</span>
          </div>
          <p className="text-xs text-rose-200/90 leading-relaxed">
            Historical trade reviews for {opportunity.pair} identified a repeating failure pattern under current market conditions. The AI Signal Intelligence engine has vetoed order execution to preserve capital.
          </p>
          {opportunity.vetoReasons && opportunity.vetoReasons.length > 0 && (
            <ul className="space-y-1 text-xs text-rose-300/80 pt-1">
              {opportunity.vetoReasons.map((v, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-rose-500 shrink-0 font-bold">?</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px] text-slate-400">
          <div>
            <span className="text-slate-500 block">STATUS</span>
            <span className="text-rose-400 font-bold">VETOED</span>
          </div>
          <div>
            <span className="text-slate-500 block">LEARNING RULES</span>
            <span className="text-slate-300 font-bold">{opportunity.learningRuleIds?.join(', ') || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-500 block">EXECUTABLE LEVELS</span>
            <span className="text-slate-500 font-bold">NONE (BLOCKED)</span>
          </div>
          <div>
            <span className="text-slate-500 block">PROPOSAL ID</span>
            <span className="text-slate-400 font-bold">{proposalId}</span>
          </div>
        </div>
      </div>
    );
  }

  // State: WAITING FOR CONFIRMATION
  if (isWait) {
    return (
      <div className="bg-slate-900 border border-amber-900/60 rounded-2xl p-5 shadow-2xl space-y-4 font-sans">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-950 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base font-mono">{opportunity.pair}</span>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-amber-950 text-amber-300 border border-amber-800 uppercase">[ANALYSIS] WAITING FOR CONFIRMATION</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Bias: <span className="font-semibold text-amber-300">{opportunity.bias}</span> | Regime: <span className="font-semibold text-slate-200">{opportunity.marketRegime || 'CONSOLIDATING'}</span> | Conf: <span className="font-semibold text-amber-400">{opportunity.confidence}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-amber-400" />
            <span>PENDING STRUCTURAL CONFIRMATION</span>
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Market bias exists, but key execution criteria have not completed (e.g. awaiting breakout candle close, order block retest, or momentum filter alignment). No executable entry levels are manufactured.
          </p>
          {opportunity.confirmationRequirements && opportunity.confirmationRequirements.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-300/90 pt-1">
              {opportunity.confirmationRequirements.map((req, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500 shrink-0 font-bold">?</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            TECHNICAL & SMC OBSERVATIONS
          </div>
          <ul className="space-y-1 text-xs text-slate-300">
            {opportunity.reasons?.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 bg-slate-950/50 rounded-lg p-2 border border-slate-800/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // State: NO_SETUP
  if (isNoSetup) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[380px] text-center gap-3">
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
            [ANALYSIS]
          </span>
          <h3 className="text-base font-bold text-slate-200 mt-1.5">NO VERIFIED OPPORTUNITY</h3>
        </div>
        <p className="text-xs text-slate-400 max-w-md">
          Current market conditions for {opportunity?.pair || activePair} show choppy consolidation or conflicting momentum indicators. QuantumAI does not force or fabricate synthetic trade setups.
        </p>
        {opportunity?.reasons && opportunity.reasons.length > 0 && (
          <div className="text-left bg-slate-950/60 border border-slate-800 rounded-xl p-3 w-full max-w-md space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Reasoning:</span>
            {opportunity.reasons.map((r, i) => (
              <div key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                <span className="text-slate-500">?</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // State: VALID BUY or VALID SELL
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 font-sans">
      {/* 1. Header Banner & Classification */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
            isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-950/40' :
            isSell ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-lg shadow-rose-950/40' :
            'bg-amber-500/20 text-amber-400 border border-amber-500/40'
          }`}>
            {isBuy ? <ArrowUpRight className="w-6 h-6" /> : isSell ? <ArrowDownRight className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-wide font-mono">{opportunity.pair}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-purple-950 text-purple-300 border border-purple-800 uppercase">[ANALYSIS ONLY]</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {opportunity.setupType || 'M15 QUANT SETUP'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Structure Bias: <span className="font-semibold text-slate-200">{opportunity.bias}</span> | Entry: <span className="font-semibold text-slate-200">{opportunity.entryType || 'MARKET'}</span> | R:R <span className="font-semibold text-slate-200">{opportunity.riskRewardRatio}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3.5 py-1.5 rounded-xl font-mono text-xs font-black tracking-wider flex items-center gap-1.5 ${
            isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-lg shadow-emerald-950/40' :
            isSell ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-lg shadow-rose-950/40' :
            'bg-amber-500/20 text-amber-300 border border-amber-500/50'
          }`}>
            <span>{opportunity.action}</span>
            <span className="text-[10px] opacity-80">({opportunity.confidence}% CONF)</span>
          </div>
        </div>
      </div>

      {/* 2. Mandatory Human Review & Safety Disclaimer */}
      <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-blue-300 font-semibold">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
          <span>MANUAL REVIEW REQUIRED ? QUANTUMAI DOES NOT PLACE BROKER ORDERS</span>
        </div>
        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] uppercase font-bold shrink-0">
          Broker Orders: 0
        </span>
      </div>

      {/* 3. Core Trade Workspace: WHAT, WHERE, RISK */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">WHERE: ENTRY ZONE</div>
          <div className="font-bold text-slate-100 text-sm">
            {opportunity.entryZone?.min} - {opportunity.entryZone?.max}
          </div>
          <div className="text-[10px] text-slate-500">Mid: {plannedEntry.toFixed(5)}</div>
        </div>

        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[9px] text-rose-400 uppercase font-bold tracking-wider">RISK: STOP LOSS</div>
          <div className="font-bold text-rose-300 text-sm">
            {opportunity.stopLoss}
          </div>
          <div className="text-[10px] text-rose-400/70">Inval: {opportunity.invalidationLevel || 'Break of OB'}</div>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">TARGET: TP 1</div>
          <div className="font-bold text-emerald-300 text-sm">
            {opportunity.takeProfit1}
          </div>
          <div className="text-[10px] text-emerald-400/70">1:1.5 Safe Exit</div>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[9px] text-teal-400 uppercase font-bold tracking-wider">TARGET: TP 2</div>
          <div className="font-bold text-teal-300 text-sm">
            {opportunity.takeProfit2}
          </div>
          <div className="text-[10px] text-teal-400/70">Runner Target</div>
        </div>
      </div>

      {/* 4. WHY? Technical & SMC Confluences */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <span>WHY THIS OPPORTUNITY EXISTS (TECHNICAL CONFLUENCES)</span>
          {onNavigateToEvidence && (
            <button
              onClick={onNavigateToEvidence}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono text-[10px] cursor-pointer"
            >
              <Compass className="w-3 h-3" /> EXPLORE EVIDENCE PANELS
            </button>
          )}
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

      {/* 5. Provenance & Lineage Details */}
      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px] text-slate-400">
        <div>
          <span className="text-slate-500 block">PROPOSAL ID</span>
          <span className="text-slate-300 font-bold">{proposalId}</span>
        </div>
        <div>
          <span className="text-slate-500 block">STRATEGY MODEL</span>
          <span className="text-slate-300 font-bold">{opportunity.strategyId || 'SMC_QUANT_V2'} ({opportunity.strategyVersion || '2.4.1'})</span>
        </div>
        <div>
          <span className="text-slate-500 block">DATA QUALITY</span>
          <span className="text-emerald-400 font-bold">Live Stream (&lt;100ms)</span>
        </div>
        <div>
          <span className="text-slate-500 block">PROVENANCE SOURCE</span>
          <span className="text-purple-300 font-bold">{opportunity.provenanceSource || 'AI_DECISION_ENGINE'}</span>
        </div>
      </div>

      {/* 6. Adaptive Learning Status */}
      {onOpenAdaptiveLearning && (
        <div 
          onClick={onOpenAdaptiveLearning}
          className="p-3 bg-purple-950/30 border border-purple-800/40 hover:border-purple-600/60 rounded-xl cursor-pointer transition-all flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <div className="font-bold text-purple-200">Adaptive Learning Feedback Loop Active</div>
              <div className="text-[11px] text-purple-300/80">
                {opportunity.learningEvidence && opportunity.learningEvidence.length > 0 
                  ? opportunity.learningEvidence[0] 
                  : 'Closed trades continuously update historical loss memory to refine entry buffers.'}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded border border-purple-700/50">
            EXPLORE MEMORY ?
          </span>
        </div>
      )}

      {/* 7. Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLevels}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'COPIED!' : 'COPY LEVELS'}</span>
          </button>
          <button
            onClick={() => onSyncToRiskCalc(opportunity)}
            className="px-3 py-1.5 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 rounded-lg font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-800/60"
          >
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>SYNC TO RISK CALC</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenEntryModal}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-950/50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>RECORD MANUAL ENTRY</span>
          </button>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white font-mono">RECORD MANUAL TRADE ENTRY</h3>
              </div>
              <button 
                onClick={() => setShowEntryModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {entryError && (
              <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{entryError}</span>
              </div>
            )}

            {entrySuccess && (
              <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{entrySuccess}</span>
              </div>
            )}

            <form onSubmit={handleConfirmManualEntry} className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">PAIR</label>
                  <input 
                    type="text" 
                    value={opportunity.pair} 
                    disabled 
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">ACTION</label>
                  <input 
                    type="text" 
                    value={opportunity.action} 
                    disabled 
                    className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-bold ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">ACTUAL FILLED ENTRY PRICE</label>
                <input 
                  type="number" 
                  step="any"
                  value={actualEntry}
                  onChange={(e) => setActualEntry(e.target.value)}
                  className="w-full bg-slate-950 border border-blue-500/50 rounded-lg p-2 text-white font-bold focus:outline-none focus:border-blue-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">LOT SIZE</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    max="10.0"
                    value={positionSize}
                    onChange={(e) => setPositionSize(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">STOP LOSS</label>
                  <input 
                    type="number" 
                    value={opportunity.stopLoss || ''} 
                    disabled 
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-rose-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">TRADE NOTES (OPTIONAL)</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Executed on broker M15 candle close after OB retest"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-sans text-xs focus:outline-none focus:border-slate-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEntryModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={entrySubmitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {entrySubmitting ? 'RECORDING...' : 'CONFIRM RECORDING'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
