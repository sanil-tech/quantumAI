import React from 'react';
import { Brain, Sparkles, ShieldCheck, BookOpen, AlertOctagon, Terminal } from 'lucide-react';
import { PostMortemReview } from '../types';

interface AiReasoningCardProps {
  latestDecision?: {
    pair: string;
    direction: 'BUY' | 'SELL';
    timeframe?: string;
    confidence: number;
    decision: 'CONFIRM' | 'VETO' | 'ADJUST';
    reasons: string[];
    vetoReason?: string;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit1?: number;
    takeProfit2?: number;
    source?: string;
  };
  postMortemReviews?: PostMortemReview[];
  engineName?: string;
  selectedPair?: string;
  onOpenAdaptiveLearning?: () => void;
}

export const AiReasoningCard: React.FC<AiReasoningCardProps> = ({
  latestDecision,
  postMortemReviews = [],
  engineName = 'Hab Keputusan Base44 InvokeLLM',
  selectedPair,
  onOpenAdaptiveLearning
}) => {
  const latestLearnedRule = postMortemReviews[0];

  return (
    <div className="rounded-xl border border-cyan-800/40 bg-slate-900/95 p-4 shadow-xl backdrop-blur-md space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-700/50 shadow-sm shadow-cyan-950/50">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>{engineName}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            </h4>
            <p className="text-[10px] text-slate-400 font-mono">Pengawal Risiko &amp; Kelulusan Gred-A (Base44 Intelligence)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAdaptiveLearning && (
            <button
              id="ai-card-weekly-review-btn"
              onClick={onOpenAdaptiveLearning}
              className="px-3 py-1 bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950/60 cursor-pointer transition border border-cyan-400/40 ring-1 ring-cyan-500/20 animate-pulse"
              title="Buka Enjin Pembelajaran Adaptif AI & Jalankan Ulangkaji Mingguan Base44 (~380 Token)"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>📚 Ulangkaji Mingguan Base44</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 shadow-sm">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            Base44 Gate
          </div>
        </div>
      </div>

      {/* Latest AI Reasoning Output */}
      {latestDecision ? (
        <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2.5 font-mono text-[11px]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-white text-xs">
                {latestDecision.pair} ({latestDecision.direction})
              </span>
              {latestDecision.timeframe && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800/60">
                  {latestDecision.timeframe}
                </span>
              )}
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
              latestDecision.decision === 'CONFIRM' 
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm shadow-emerald-950/50' 
                : latestDecision.decision === 'VETO'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}>
              {latestDecision.decision} ({latestDecision.confidence}%)
            </span>
          </div>

          {/* Compact Price Levels if available */}
          {latestDecision.entryPrice !== undefined && (
            <div className="grid grid-cols-3 gap-1.5 text-[10px] bg-slate-900/80 p-2 rounded border border-slate-800 text-center">
              <div>
                <span className="text-slate-400 font-semibold">Entri: </span>
                <span className="text-white font-bold">{latestDecision.entryPrice}</span>
              </div>
              <div>
                <span className="text-rose-300 font-semibold">SL: </span>
                <span className="text-rose-400 font-bold">{latestDecision.stopLoss}</span>
              </div>
              <div>
                <span className="text-emerald-300 font-semibold">TP1: </span>
                <span className="text-emerald-400 font-bold">{latestDecision.takeProfit1}</span>
              </div>
            </div>
          )}

          <div className="text-slate-300 text-[11px] leading-relaxed">
            {latestDecision.decision === 'VETO' && latestDecision.vetoReason ? (
              <span className="text-rose-400 flex items-start gap-1 bg-rose-950/30 p-2 rounded border border-rose-800/50">
                <AlertOctagon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Veto Risiko: {latestDecision.vetoReason}</span>
              </span>
            ) : (
              <ul className="space-y-1.5">
                {(latestDecision.reasons || []).slice(0, 4).map((r, i) => {
                  const isAiOpinion = r.includes('Base44') || r.includes('Second Opinion') || r.includes('Gemini');
                  return (
                    <li key={i} className={`flex items-start gap-1.5 ${isAiOpinion ? 'text-cyan-200 font-bold' : 'text-slate-300'}`}>
                      <span className={`${isAiOpinion ? 'text-cyan-400' : 'text-slate-500'} shrink-0 mt-0.5`}>›</span>
                      <span>{r}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-slate-950/60 p-3.5 border border-slate-800 text-center font-mono text-[11px] text-slate-400 space-y-1">
          <Terminal className="h-4 w-4 mx-auto mb-1 text-cyan-400" />
          <div className="text-slate-300 font-bold">
            Tiada Setup Gred-A aktif untuk {selectedPair || 'pair ini'}.
          </div>
          <div className="text-[10px] text-slate-500">
            Enjin Base44 InvokeLLM dalam mod rehat penjimatan token — <strong className="text-emerald-400 font-bold">0 token terpakai</strong>.
          </div>
        </div>
      )}

      {/* Adaptive Learning Feed */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5 flex-wrap gap-2">
          <span className="flex items-center gap-1 text-cyan-400">
            <BookOpen className="h-3.5 w-3.5" /> Pembelajaran Adaptif Terkini
          </span>
          {onOpenAdaptiveLearning ? (
            <button
              onClick={onOpenAdaptiveLearning}
              className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 underline cursor-pointer flex items-center gap-1"
            >
              <span>[Buka Ulangkaji Base44 →]</span>
            </button>
          ) : (
            <span className="text-[10px] font-mono text-slate-500">Post-Mortem</span>
          )}
        </div>

        {latestLearnedRule ? (
          <div className="rounded bg-slate-950/80 p-2 border border-slate-800/80 text-[10px] font-mono text-slate-300">
            <div className="text-indigo-400 font-bold mb-0.5">{latestLearnedRule.pair}:</div>
            <p className="text-slate-300 leading-tight">
              {latestLearnedRule.adaptiveRuleMs || latestLearnedRule.adaptiveRuleEn || 'Tiada peraturan kegagalan direkodkan.'}
            </p>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-slate-500 text-center">
            Memori sifar ralat. Peraturan adaptif aktif.
          </div>
        )}
      </div>
    </div>
  );
};
