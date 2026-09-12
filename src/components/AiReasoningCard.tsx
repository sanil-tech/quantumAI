import React from 'react';
import { Brain, Sparkles, ShieldCheck, BookOpen, AlertOctagon, Terminal } from 'lucide-react';
import { PostMortemReview } from '../types';

interface AiReasoningCardProps {
  latestDecision?: {
    pair: string;
    direction: 'BUY' | 'SELL';
    confidence: number;
    decision: 'CONFIRM' | 'VETO' | 'ADJUST';
    reasons: string[];
    vetoReason?: string;
  };
  postMortemReviews?: PostMortemReview[];
}

export const AiReasoningCard: React.FC<AiReasoningCardProps> = ({
  latestDecision,
  postMortemReviews = []
}) => {
  const latestLearnedRule = postMortemReviews[0];

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-700/50">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Hab Keputusan Gemini AI</h4>
            <p className="text-[10px] text-slate-400">Pengawal Risiko & Kelulusan Gred-A</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
          <Sparkles className="h-3 w-3 text-cyan-400" />
          Second Opinion Gate
        </div>
      </div>

      {/* Latest AI Reasoning Output */}
      {latestDecision ? (
        <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-2 font-mono text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200">
              {latestDecision.pair} ({latestDecision.direction})
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              latestDecision.decision === 'CONFIRM' 
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                : latestDecision.decision === 'VETO'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}>
              {latestDecision.decision} ({latestDecision.confidence}%)
            </span>
          </div>

          <div className="text-slate-400 text-[11px] leading-relaxed">
            {latestDecision.decision === 'VETO' && latestDecision.vetoReason ? (
              <span className="text-rose-400 flex items-start gap-1">
                <AlertOctagon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Veto: {latestDecision.vetoReason}
              </span>
            ) : (
              <ul className="space-y-1">
                {(latestDecision.reasons || []).slice(0, 2).map((r, i) => (
                  <li key={i} className="flex items-start gap-1 text-slate-300">
                    <span className="text-cyan-400 shrink-0">›</span> {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800 text-center font-mono text-[11px] text-slate-400">
          <Terminal className="h-4 w-4 mx-auto mb-1 text-slate-500" />
          Enjin Gemini AI bersiap sedia untuk mengesahkan setup Gred-A seterusnya.
        </div>
      )}

      {/* Adaptive Learning Feed */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
          <span className="flex items-center gap-1 text-cyan-400">
            <BookOpen className="h-3.5 w-3.5" /> Pembelajaran Adaptif Terkini
          </span>
          <span className="text-[10px] font-mono text-slate-500">Post-Mortem</span>
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
