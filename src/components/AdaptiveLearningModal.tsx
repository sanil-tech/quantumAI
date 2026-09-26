import React, { useState, useEffect } from 'react';
import { PostMortemReview, CurrencyPair, Timeframe } from '../types';
import { Brain, X, Sparkles, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, RefreshCw, Award, Target, Activity, Zap, Compass, BarChart3, Fingerprint } from 'lucide-react';
import { Language } from '../lib/translations';

interface AdaptiveLearningModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: Language;
  activePair?: CurrencyPair;
  activeTimeframe?: Timeframe;
  currentPrice?: number;
}

export const AdaptiveLearningModal: React.FC<AdaptiveLearningModalProps> = ({
  isOpen,
  onClose,
  language = 'ms',
  activePair = 'EUR/USD',
  activeTimeframe = 'M15',
  currentPrice = 1.0835
}) => {
  const isMalay = language === 'ms';
  const [activeTab, setActiveTab] = useState<'PATTERN_ANALYSIS' | 'POST_MORTEM_HUB'>('PATTERN_ANALYSIS');

  // Post-Mortem States
  const [reviews, setReviews] = useState<PostMortemReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'LOSS' | 'WIN'>('ALL');
  const [analyzingTrade, setAnalyzingTrade] = useState<boolean>(false);
  const [runningHomework, setRunningHomework] = useState<boolean>(false);
  const [homeworkData, setHomeworkData] = useState<any>(null);

  // User Entry Pattern AI Analysis States
  const [patternLoading, setPatternLoading] = useState<boolean>(false);
  const [traderDNA, setTraderDNA] = useState<any>(null);

  const fetchLessons = async () => {
    setLoadingReviews(true);
    try {
      const res = await fetch('/api/forex/post-mortem-lessons');
      const data = await res.json();
      if (data.reviews) {
        setReviews(data.reviews);
      }
    } catch (err) {
      console.error('Fetch post-mortem lessons error:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const fetchEntryPatternAnalysis = async () => {
    setPatternLoading(true);
    try {
      const res = await fetch('/api/forex/ai-entry-pattern-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: activePair,
          timeframe: activeTimeframe
        })
      });
      const data = await res.json();
      if (data.success) {
        setTraderDNA(data);
      }
    } catch (err) {
      console.error('Fetch entry pattern analysis error:', err);
    } finally {
      setPatternLoading(false);
    }
  };

  const handleRunHomeworkSession = async () => {
    setRunningHomework(true);
    try {
      const res = await fetch('/api/forex/ai-homework-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: activePair })
      });
      const data = await res.json();
      if (data.success) {
        setHomeworkData(data);
        fetchLessons();
      }
    } catch (err) {
      console.error('Run homework session error:', err);
    } finally {
      setRunningHomework(false);
    }
  };

  const handleSyncPostgresLearning = async () => {
    setAnalyzingTrade(true);
    try {
      const res = await fetch('/api/forex/learning/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        await fetchLessons();
        await fetchEntryPatternAnalysis();
      }
    } catch (err) {
      console.error('Sync learning error:', err);
    } finally {
      setAnalyzingTrade(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLessons();
      fetchEntryPatternAnalysis();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredReviews = reviews.filter((r) => {
    if (filter === 'LOSS') return r.outcome === 'LOSS';
    if (filter === 'WIN') return r.outcome === 'WIN';
    return true;
  });

  const totalLosses = reviews.filter((r) => r.outcome === 'LOSS').length;
  const totalWins = reviews.filter((r) => r.outcome === 'WIN').length;

  const dna = traderDNA?.traderDNA || traderDNA;
  const keyFlaws = isMalay ? (traderDNA?.keyEntryFlawsMs || dna?.keyEntryFlawsMs) : (traderDNA?.keyEntryFlawsEn || dna?.keyEntryFlawsEn);
  const topStrengths = isMalay ? (traderDNA?.topStrengthsMs || dna?.topStrengthsMs) : (traderDNA?.topStrengthsEn || dna?.topStrengthsEn);
  const adaptiveRecs = isMalay ? (traderDNA?.adaptiveRecommendationsMs || dna?.adaptiveRecommendationsMs) : (traderDNA?.adaptiveRecommendationsEn || dna?.adaptiveRecommendationsEn);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-5 relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/40 text-cyan-300 rounded-xl shadow-lg shrink-0">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">
                  {isMalay ? 'Enjin Pembelajaran Adaptif AI (Base44 InvokeLLM)' : 'AI Adaptive Learning Engine (Base44 InvokeLLM)'}
                </h3>
                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold rounded-full">
                  BASE44 ADAPTIVE ENGINE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isMalay
                  ? 'Ulangkaji prestasi mingguan, pengesanan corak kerugian & pemantapan setup (Penjimatan Token Aktif: ~380 token/sesi)'
                  : 'Weekly performance review, loss pattern detection & setup tuning (Token-Saving Active: ~380 tokens/session)'}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunHomeworkSession}
              disabled={runningHomework}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg border border-cyan-400/30"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${runningHomework ? 'animate-spin' : ''}`} />
              <span>{runningHomework ? (isMalay ? 'Ulangkaji Base44...' : 'Analyzing...') : (isMalay ? '📚 Ulangkaji Mingguan Base44' : '📚 Base44 Weekly Review')}</span>
            </button>

            <button
              onClick={handleSyncPostgresLearning}
              disabled={analyzingTrade}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow border border-slate-700"
              title="Segerak & Nilai Semula Semua Trade Tertutup dari PostgreSQL"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyzingTrade ? 'animate-spin' : ''}`} />
              <span>{analyzingTrade ? (isMalay ? 'Menyegerak DB...' : 'Syncing DB...') : (isMalay ? '🔄 Segerak Trade PostgreSQL' : '🔄 Sync PostgreSQL Trades')}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('PATTERN_ANALYSIS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'PATTERN_ANALYSIS'
                ? 'bg-purple-600 text-white shadow-lg border border-purple-400/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Fingerprint className="w-4 h-4 text-purple-300" />
            <span>{isMalay ? '🧬 Analisis Corak Entri & Profil AI' : '🧬 User Entry Pattern & DNA'}</span>
          </button>

          <button
            onClick={() => setActiveTab('POST_MORTEM_HUB')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'POST_MORTEM_HUB'
                ? 'bg-purple-600 text-white shadow-lg border border-purple-400/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Brain className="w-4 h-4 text-purple-300" />
            <span>{isMalay ? '📚 Hub Memori Post-Mortem AI' : '📚 AI Post-Mortem Memory Hub'}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-purple-300 font-mono font-bold">
              {reviews.length}
            </span>
          </button>
        </div>

        {/* TAB 1: USER ENTRY PATTERN ANALYSIS & CONTINUOUS LEARNING */}
        {activeTab === 'PATTERN_ANALYSIS' && (
          <div className="space-y-4">
            {/* AI Trader DNA Fingerprint Banner */}
            <div className="bg-gradient-to-r from-purple-950/80 via-slate-950 to-indigo-950/80 border border-purple-500/30 rounded-2xl p-4 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center font-black text-purple-300 text-lg shadow">
                    {(dna?.totalTrades ?? 0) > 0 ? (dna?.overallGrade || '-') : '-'}
                  </div>
                  <div>
                    <span className="text-[10px] text-purple-300 font-mono font-bold uppercase tracking-wider block">
                      {isMalay ? 'Profil & Arketip Entri Pedagang:' : 'Trader Entry Archetype:'}
                    </span>
                    <h4 className="text-base font-extrabold text-white flex items-center gap-2 flex-wrap">
                      <span>{dna?.archetype || (isMalay ? 'Belum Ada Data Posisi Tertutup' : 'No Closed Trade Data')}</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono rounded-full font-bold">
                        {(dna?.totalTrades ?? 0) > 0
                          ? `Win Rate: ${Number(dna?.winRate ?? 0).toFixed(1)}% (${dna?.winCount ?? totalWins}W / ${dna?.lossCount ?? totalLosses}L)`
                          : `Win Rate: - (0W / 0L)`}
                      </span>
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono rounded-full font-bold">
                        ✓ PostgreSQL: {dna?.totalTrades ?? (totalWins + totalLosses)} Posisi
                      </span>
                    </h4>
                  </div>
                </div>

                <button
                  onClick={() => fetchEntryPatternAnalysis()}
                  disabled={patternLoading}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${patternLoading ? 'animate-spin' : ''}`} />
                  <span>{patternLoading ? (isMalay ? 'Menganalisis...' : 'Analyzing...') : (isMalay ? 'Kemaskini Analisis AI' : 'Refresh AI Analysis')}</span>
                </button>
              </div>

              {/* 4 Core Competency Scores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                {/* Precision Score */}
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
                    <span>{isMalay ? 'Ketepatan Entri' : 'Entry Precision'}</span>
                    <Target className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold text-white">
                      {dna?.precisionScore != null ? `${dna.precisionScore}%` : '-'}
                    </span>
                    <span className="text-[10px] text-blue-400 font-bold">
                      {dna?.precisionScore != null ? (dna.precisionScore >= 75 ? 'HIGH' : dna.precisionScore >= 50 ? 'MODERATE' : 'LOW') : '-'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${dna?.precisionScore ?? 0}%` }} />
                  </div>
                </div>

                {/* Risk Discipline Score */}
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
                    <span>{isMalay ? 'Disiplin Risiko' : 'Risk Discipline'}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold text-white">
                      {dna?.riskDisciplineScore != null ? `${dna.riskDisciplineScore}%` : '-'}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold">
                      {dna?.riskDisciplineScore != null ? (dna.riskDisciplineScore >= 80 ? 'EXCELLENT' : dna.riskDisciplineScore >= 60 ? 'GOOD' : 'FAIR') : '-'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${dna?.riskDisciplineScore ?? 0}%` }} />
                  </div>
                </div>

                {/* Emotional Control Score */}
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
                    <span>{isMalay ? 'Kawalan Emosi' : 'Emotional Control'}</span>
                    <Compass className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold text-white">
                      {dna?.emotionalControlScore != null ? `${dna.emotionalControlScore}%` : '-'}
                    </span>
                    <span className="text-[10px] text-amber-400 font-bold">
                      {dna?.emotionalControlScore != null ? (dna.emotionalControlScore >= 70 ? 'GOOD' : dna.emotionalControlScore >= 50 ? 'FAIR' : 'LOW') : '-'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${dna?.emotionalControlScore ?? 0}%` }} />
                  </div>
                </div>

                {/* Confluence Score */}
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
                    <span>{isMalay ? 'Nisbah Konfluens' : 'Confluence Ratio'}</span>
                    <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold text-white">
                      {dna?.confluenceScore != null ? `${dna.confluenceScore}%` : '-'}
                    </span>
                    <span className="text-[10px] text-purple-400 font-bold">
                      {dna?.confluenceScore != null ? (dna.confluenceScore >= 75 ? 'STRONG' : dna.confluenceScore >= 50 ? 'MODERATE' : 'WEAK') : '-'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${dna?.confluenceScore ?? 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Continuous Learning AI Insights (Flaws vs Strengths vs Adaptive Recommendations) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Flaws Identified */}
              <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-rose-300 border-b border-rose-500/20 pb-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{isMalay ? 'Kelemahan Corak Entri Dikesan:' : 'Recurring Entry Flaws:'}</span>
                </div>
                <ul className="space-y-2 text-slate-300">
                  {keyFlaws && keyFlaws.length > 0 ? (
                    keyFlaws.map((flaw: string, idx: number) => (
                      <li key={idx} className="p-2 bg-slate-950/80 rounded-xl border border-rose-500/20 flex items-start gap-2 text-[11px] leading-relaxed">
                        <span className="text-rose-400 font-bold shrink-0">#{idx + 1}</span>
                        <span>{flaw}</span>
                      </li>
                    ))
                  ) : (
                    <li className="p-2 text-slate-500 italic text-[11px]">
                      {isMalay ? 'Tiada corak kelemahan dikesan atau belum ada data trade.' : 'No recurring flaws detected or awaiting trade data.'}
                    </li>
                  )}
                </ul>
              </div>

              {/* Strengths */}
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-emerald-300 border-b border-emerald-500/20 pb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{isMalay ? 'Kekuatan Entri Utama Anda:' : 'Top Entry Strengths:'}</span>
                </div>
                <ul className="space-y-2 text-slate-300">
                  {topStrengths && topStrengths.length > 0 ? (
                    topStrengths.map((str: string, idx: number) => (
                      <li key={idx} className="p-2 bg-slate-950/80 rounded-xl border border-emerald-500/20 flex items-start gap-2 text-[11px] leading-relaxed">
                        <span className="text-emerald-400 font-bold shrink-0">#{idx + 1}</span>
                        <span>{str}</span>
                      </li>
                    ))
                  ) : (
                    <li className="p-2 text-slate-500 italic text-[11px]">
                      {isMalay ? 'Kekuatan entri akan dikira automatik apabila ada data posisi.' : 'Entry strengths will be computed once positions are recorded.'}
                    </li>
                  )}
                </ul>
              </div>

              {/* Actionable Adaptive Guidance */}
              <div className="bg-purple-950/20 border border-purple-500/30 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-purple-300 border-b border-purple-500/20 pb-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{isMalay ? 'Bimbingan Adaptif AI Berterusan:' : 'AI Adaptive Coaching:'}</span>
                </div>
                <ul className="space-y-2 text-slate-300">
                  {adaptiveRecs && adaptiveRecs.length > 0 ? (
                    adaptiveRecs.map((rec: string, idx: number) => (
                      <li key={idx} className="p-2 bg-slate-950/80 rounded-xl border border-purple-500/20 flex items-start gap-2 text-[11px] leading-relaxed">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))
                  ) : (
                    <li className="p-2 text-slate-500 italic text-[11px]">
                      {isMalay ? 'Panduan bimbingan sedia ada untuk posisi baru.' : 'Coaching recommendations available for active positions.'}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI POST-MORTEM & HOMEWORK HUB */}
        {activeTab === 'POST_MORTEM_HUB' && (
          <div className="space-y-4">
            {/* AI Homework & Self-Study Report (if run) */}
            {homeworkData && (
              <div className="bg-gradient-to-br from-cyan-950/80 via-slate-950 to-blue-950/80 border border-cyan-500/40 rounded-2xl p-4 space-y-3.5 text-xs shadow-xl">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-cyan-400 animate-pulse" />
                    <h4 className="font-bold text-white text-sm">
                      {isMalay ? '🎓 Laporan Ulangkaji Mingguan & Pemantapan Setup (Base44)' : '🎓 Weekly Review & Setup Optimization Report (Base44)'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono text-[10px] rounded-full font-bold">
                      {homeworkData.provider || 'Base44 InvokeLLM Intelligence'}
                    </span>
                    <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px] rounded-full font-bold">
                      ✓ AutoTrader Updated
                    </span>
                  </div>
                </div>

                {/* Executive Summary */}
                {homeworkData.executiveSummaryMs && (
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-cyan-500/30 text-cyan-100 text-[11px] leading-relaxed flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-cyan-300 block mb-0.5">
                        {isMalay ? 'Ringkasan Eksekutif Prestasi:' : 'Executive Summary:'}
                      </span>
                      <p>{homeworkData.executiveSummaryMs}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase">Trade Diteliti</span>
                    <span className="text-white font-bold text-sm">{homeworkData.tradesReviewedCount} Trades</span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase">Win Rate Ulangkaji</span>
                    <span className="text-emerald-400 font-bold text-sm">{homeworkData.winRate}%</span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase">Net PnL Trade</span>
                    <span className={`font-bold text-sm ${homeworkData.netPnLDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ${homeworkData.netPnLDollars}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase">Penggunaan Token</span>
                    <span className="text-cyan-400 font-bold text-sm">~{homeworkData.tokensUsedEstimate || 380} Token</span>
                  </div>
                </div>

                {/* Mistakes vs Winning Setups */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-3 space-y-1.5">
                    <span className="font-bold text-rose-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      {isMalay ? 'Kesilapan / Punca Loss Diteliti:' : 'Key Losses Identified:'}
                    </span>
                    <ul className="space-y-1 text-slate-300 list-disc list-inside text-[11px]">
                      {homeworkData.keyMistakesMs?.map((m: string, idx: number) => (
                        <li key={idx} className="leading-tight">{m}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 space-y-1.5">
                    <span className="font-bold text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {isMalay ? 'Pola Kemenangan Terbaik (Winning Setups):' : 'Top Winning Setups:'}
                    </span>
                    <ul className="space-y-1 text-slate-300 list-disc list-inside text-[11px]">
                      {homeworkData.winningPatternsMs?.map((w: string, idx: number) => (
                        <li key={idx} className="leading-tight">{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Generated Adaptive Rules */}
                <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 space-y-2">
                  <span className="font-bold text-purple-200 text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    {isMalay ? 'Peraturan Adaptif Baharu Enjin AI AutoTrader:' : 'Newly Deployed Adaptive Rules:'}
                  </span>
                  <div className="space-y-1.5">
                    {homeworkData.generatedAdaptiveRulesMs?.map((rule: string, idx: number) => (
                      <div key={idx} className="p-2 bg-slate-900/90 rounded-lg border border-purple-500/20 font-mono text-[11px] text-purple-200 flex items-start gap-2">
                        <span className="text-amber-400 font-bold shrink-0">#{idx + 1}</span>
                        <p className="leading-tight">{rule}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Setup Tuning Recommendations */}
                {homeworkData.setupTuningRecommendationsMs && (
                  <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3 space-y-2">
                    <span className="font-bold text-cyan-200 text-xs flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      {isMalay ? 'Cadangan Pemantapan Setup & Parameter (Base44 Tuning):' : 'Setup & Parameter Tuning Recommendations:'}
                    </span>
                    <div className="space-y-1.5">
                      {homeworkData.setupTuningRecommendationsMs.map((tuning: string, idx: number) => (
                        <div key={idx} className="p-2 bg-slate-900/90 rounded-lg border border-cyan-500/20 font-mono text-[11px] text-cyan-200 flex items-start gap-2">
                          <span className="text-cyan-400 font-bold shrink-0">#{idx + 1}</span>
                          <p className="leading-tight">{tuning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Learning System Overview Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  {isMalay ? 'Jumlah Post-Mortem Direkod' : 'Total Post-Mortems Analyzed'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-lg">{reviews.length} Trades</span>
                  <Award className="w-5 h-5 text-purple-400" />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  {isMalay ? 'Punca Kerugian Dipelajari' : 'Loss Lessons Retained'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-rose-400 text-lg">{totalLosses} Lessons</span>
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  {isMalay ? 'Status Memori AI Aktiv' : 'Adaptive AI Status'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-400 text-sm">ACTIVE & LEARNING</span>
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-300">
                {isMalay ? 'Log Analisis Post-Mortem & Peraturan Adaptif:' : 'Post-Mortem Log & Learned Rules:'}
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => setFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    filter === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  Semua ({reviews.length})
                </button>
                <button
                  onClick={() => setFilter('LOSS')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    filter === 'LOSS' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  Losing Trades ({totalLosses})
                </button>
                <button
                  onClick={() => setFilter('WIN')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    filter === 'WIN' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  Winning Trades ({totalWins})
                </button>
              </div>
            </div>

            {/* List of Post-Mortem Cards */}
            <div className="space-y-3.5 max-h-[45vh] overflow-y-auto pr-1">
              {loadingReviews ? (
                <div className="p-8 text-center text-slate-500 text-xs font-mono animate-pulse">
                  {isMalay ? 'Mengambil data memori pembelajaran AI...' : 'Fetching AI adaptive memory logs...'}
                </div>
              ) : filteredReviews.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs border border-slate-800 rounded-xl bg-slate-950">
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-bold mr-2 uppercase">[AUTHORITATIVE]</span>
                    <span className="font-bold text-slate-300">NO PERSISTED LEARNING DATA IN POSTGRESQL</span>
                    <p className="text-[11px] text-slate-500 mt-1">{isMalay ? 'Tiada rekod post-mortem disahkan dalam pangkalan data. Selesaikan trade di Papan Isyarat Manual untuk menjana analisis adaptif.' : 'Zero post-mortem reviews recorded yet. Close a manual trade to trigger automated post-mortem learning.'}</p>
                  </div>
                </div>
              ) : (
                filteredReviews.map((item) => {
                  const isLoss = item.outcome === 'LOSS';
                  const dateStr = new Date(item.timestamp).toLocaleString(isMalay ? 'ms-MY' : 'en-US', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border space-y-3 relative overflow-hidden text-xs transition ${
                        isLoss
                          ? 'bg-slate-950/90 border-rose-500/30 shadow-rose-950/20'
                          : 'bg-slate-950/90 border-emerald-500/30 shadow-emerald-950/20'
                      }`}
                    >
                      {/* Top Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 ${
                            isLoss ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            {isLoss ? <XCircle className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {item.outcome} • {item.direction} {item.pair}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                            item.provenance === 'REAL_TRADE' || item.authority === 'POSTGRESQL' || (!item.provenance && item.tradeId)
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : item.provenance === 'HISTORICAL_BACKTEST' || item.authority === 'BACKTEST_ENGINE'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                              : item.provenance === 'SYNTHETIC_SIMULATION'
                              ? 'bg-orange-950/80 text-orange-300 border border-orange-800'
                              : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                          }`}>
                            {item.provenance === 'REAL_TRADE' || (!item.provenance && item.tradeId)
                              ? 'REAL TRADE (PG)'
                              : item.provenance === 'HISTORICAL_BACKTEST'
                              ? '1-YR BACKTEST'
                              : item.provenance === 'SYNTHETIC_SIMULATION'
                              ? 'SYNTHETIC SIM'
                              : 'SHADOW OBS'}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            Entry: {item.entryPrice} | Exit: {item.exitPrice}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-bold ${item.pnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.pnlDollars >= 0 ? '+' : ''}${item.pnlDollars.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{dateStr}</span>
                        </div>
                      </div>

                      {/* Root Cause Analysis */}
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                          <AlertTriangle className={`w-3.5 h-3.5 ${isLoss ? 'text-amber-400' : 'text-emerald-400'}`} />
                          {isMalay ? 'Punca Utama (Root Cause Analysis):' : 'Root Cause Analysis:'}
                        </span>
                        <p className="text-slate-300 leading-relaxed font-sans text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                          {isMalay ? item.rootCauseMs : item.rootCauseEn}
                        </p>
                      </div>

                      {/* Learned Adaptive Rule Box */}
                      <div className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-3 space-y-1 text-purple-200">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                          {isMalay ? 'Peraturan Adaptif Dicipta untuk Entri Seterusnya:' : 'Adaptive Rule Adopted for Next Entries:'}
                        </span>
                        <p className="font-mono text-xs font-semibold text-purple-100">
                          {isMalay ? item.adaptiveRuleMs : item.adaptiveRuleEn}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              {isMalay
                ? 'Sistem AI Quantum terus belajar dari setiap corak entri untuk mengurangkan risiko kerugian berulang.'
                : 'AI Quantum continuously learns from user entry habits to eliminate repetitive losses.'}
            </span>
          </div>
          <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-[10px] font-mono font-bold shrink-0">
            AUTONOMOUS LEARNING ACTIVE
          </span>
        </div>
      </div>
    </div>
  );
};


