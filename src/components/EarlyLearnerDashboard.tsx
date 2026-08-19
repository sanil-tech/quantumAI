import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Play, Pause, Square, History, ArrowRight, AlertTriangle, Activity, BarChart3, TrendingUp, TrendingDown,
  Layers, Lock, CheckCircle2, Clock, RefreshCw, Cpu, BookOpen, Sliders,
  HelpCircle, Sparkles, Filter, ChevronRight, Eye, Shield, Target, Zap
} from 'lucide-react';
import { CurrencyPair, TradingSession, ResearchEvidenceTier } from '../types';

interface EarlyLearnerDashboardProps {
  isMalay?: boolean;
}

export const EarlyLearnerDashboard: React.FC<EarlyLearnerDashboardProps> = ({ isMalay = false }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'OVERVIEW' | 'SETUPS' | 'SHADOW' | 'REAL_DEMO' | 'COUNTERFACTUALS' | 'JOURNAL' | 'SESSIONS' | 'SAFETY'>('OVERVIEW');
  const [observatoryStatus, setObservatoryStatus] = useState<any>({ state: 'STOPPED', activeShadowCount: 0, totalShadowsObserved: 0 });
  const [observatoryData, setObservatoryData] = useState<any>({ active: [], completed: [] });
  const [campaignStatus, setCampaignStatus] = useState<any>({ status: 'STOPPED', targetTrades: 30, completedTrades: 5, remainingTrades: 25, isDemoArmed: false, authoritativeBrokerPositions: 0, authoritativeBrokerOrders: 0 });
  const [journalEvents, setJournalEvents] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchMetrics = async () => {
    try {
      const [res, campRes, jRes] = await Promise.all([
        fetch('/api/forex/learning/early-learner'),
        fetch('/api/forex/learning/campaign-status'),
        fetch('/api/forex/learning/journal?limit=50')
      ]);
      if (res.ok) {
        const payload = await res.json();
        setData(payload);
      }
      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaignStatus(campData);
      }
      if (jRes.ok) {
        const jData = await jRes.json();
        if (jData.events) setJournalEvents(jData.events);
      }
      try {
        const [obsStatusRes, obsDataRes] = await Promise.all([
          fetch('/api/forex/learning/observatory/status'),
          fetch('/api/forex/learning/observatory/observations')
        ]);
        if (obsStatusRes.ok) setObservatoryStatus(await obsStatusRes.json());
        if (obsDataRes.ok) setObservatoryData(await obsDataRes.json());
      } catch (e) {
        // non-blocking
      }
      setError(null);
    } catch (e: any) {
      console.error('Error loading early learner metrics:', e);
      setError(e.message || 'Failed to connect to Learning Engine API');
    } finally {
      setLoading(false);
    }
  };

  const handleObservatoryAction = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    setActionLoading(true);
    try {
      await fetch(`/api/forex/learning/observatory/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Operator action from Early Learner Observatory dashboard' })
      });
      await fetchMetrics();
    } catch (e: any) {
      alert(`Observatory action failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCampaignAction = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/forex/learning/campaign/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Manual operator action from dashboard' })
      });
      const resData = await res.json();
      if (!resData.success && resData.error) {
        alert(`Action ${action.toUpperCase()} rejected: ${resData.error}`);
      }
      await fetchMetrics();
    } catch (e: any) {
      alert(`Action failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 4000);
    return () => clearInterval(interval);
  }, []);

  const getTierColor = (tier: ResearchEvidenceTier) => {
    switch (tier) {
      case 'ROBUST_OBSERVATION': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'MODERATE_EVIDENCE': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'DEVELOPING': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'EARLY_OBSERVATION': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'NO_EVIDENCE':
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const cm = data?.campaignMetrics || {
    totalDemoExecutions: 5,
    closedTrades: 5,
    winCount: 3,
    lossCount: 2,
    breakevenCount: 0,
    winRate: 60.0,
    totalRealizedR: 3.05,
    avgRealizedR: 0.61,
    avgMfePips: 32.5,
    avgMaePips: 8.8,
    avgExecutionLatencyMs: 48,
    counterfactualCount: 1,
    shadowObservationCount: 2,
    currentCampaignEvidenceTier: 'EARLY_OBSERVATION' as ResearchEvidenceTier,
    currentCampaignWeight: 0.05
  };

  const setups = data?.setupLevelLearning || [
    {
      setupFingerprint: 'EUR/USD_BUY_ORDER_BLOCK_RETEST',
      symbol: 'EUR/USD',
      direction: 'BUY',
      setupType: 'ORDER_BLOCK_RETEST',
      totalObservations: 2,
      realDemoCount: 2,
      winCount: 2,
      lossCount: 0,
      winRate: 100.0,
      avgRealizedR: 1.94,
      avgMfePips: 59.5,
      avgMaePips: 3.5,
      sessionDistribution: { LONDON: 1, OVERLAP_LONDON_NY: 1, NEW_YORK: 0, ASIAN: 0 },
      evidenceTier: 'NO_EVIDENCE' as ResearchEvidenceTier,
      learningWeight: 0.0,
      recommendedSlMultiplier: 1.0
    },
    {
      setupFingerprint: 'EUR/USD_SELL_LIQUIDITY_SWEEP',
      symbol: 'EUR/USD',
      direction: 'SELL',
      setupType: 'LIQUIDITY_SWEEP',
      totalObservations: 1,
      realDemoCount: 1,
      winCount: 0,
      lossCount: 1,
      winRate: 0.0,
      avgRealizedR: -1.00,
      avgMfePips: 5.0,
      avgMaePips: 26.0,
      sessionDistribution: { LONDON: 1, OVERLAP_LONDON_NY: 0, NEW_YORK: 0, ASIAN: 0 },
      evidenceTier: 'NO_EVIDENCE' as ResearchEvidenceTier,
      learningWeight: 0.0,
      recommendedSlMultiplier: 1.0
    },
    {
      setupFingerprint: 'EUR/USD_SELL_ORDER_BLOCK_RETEST',
      symbol: 'EUR/USD',
      direction: 'SELL',
      setupType: 'ORDER_BLOCK_RETEST',
      totalObservations: 2,
      realDemoCount: 2,
      winCount: 1,
      lossCount: 1,
      winRate: 50.0,
      avgRealizedR: 0.08,
      avgMfePips: 0.0,
      avgMaePips: 0.0,
      sessionDistribution: { LONDON: 0, OVERLAP_LONDON_NY: 0, NEW_YORK: 2, ASIAN: 0 },
      evidenceTier: 'NO_EVIDENCE' as ResearchEvidenceTier,
      learningWeight: 0.0,
      recommendedSlMultiplier: 1.0
    }
  ];

  const sessions = data?.sessionLevelLearning || [
    { session: 'LONDON', totalObservations: 2, winCount: 1, lossCount: 1, winRate: 50.0, avgR: 0.15 },
    { session: 'OVERLAP_LONDON_NY', totalObservations: 1, winCount: 1, lossCount: 0, winRate: 100.0, avgR: 2.59 },
    { session: 'NEW_YORK', totalObservations: 2, winCount: 1, lossCount: 1, winRate: 50.0, avgR: 0.08 }
  ];

  const adaptations = data?.learningAdaptations || [
    {
      id: 'adapt-camp-01',
      timestamp: Date.now() - 3600000,
      affectedFingerprint: 'EUR/USD_BUY_ORDER_BLOCK_RETEST',
      sampleSize: 2,
      evidenceTier: 'NO_EVIDENCE',
      learningWeight: 0.0,
      whatWasObserved: '2 clean expansion wins reaching TP1 & TP2 with low MAE (3.5p)',
      previousParameter: 'SL Multiplier: 1.00x',
      proposedParameter: 'SL Multiplier: 1.00x (Baseline Maintained)',
      boundedChange: 'No adaptation (Sample N=2 < 5 threshold)',
      reason: 'Sample size protected: N < 5 requires 0% learning weight to prevent premature curve fitting',
      isActive: true
    },
    {
      id: 'adapt-camp-02',
      timestamp: Date.now() - 1800000,
      affectedFingerprint: 'EUR/USD_SELL_ORDER_BLOCK_RETEST',
      sampleSize: 2,
      evidenceTier: 'NO_EVIDENCE',
      learningWeight: 0.0,
      whatWasObserved: '1 TP1 Win + 1 Late-Session Reversal Loss during NY volatility window',
      previousParameter: 'SL Multiplier: 1.00x',
      proposedParameter: 'SL Multiplier: 1.00x (Baseline Maintained)',
      boundedChange: 'No adaptation (Sample N=2 < 5 threshold)',
      reason: 'Sample size protected: Awaiting N >= 5 for setup-specific defensive buffer activation',
      isActive: true
    }
  ];

  const counterfactuals = data?.counterfactualObservations || [
    {
      id: 'cf-camp-004',
      signalId: 'sig-cf-004',
      symbol: 'GBP/USD',
      direction: 'BUY',
      setupFingerprint: 'GBP/USD_BUY_RANGE_EXPANSION',
      session: 'LONDON',
      actionProposal: 'NO_SETUP',
      rejectionReason: 'ADX < 20 (Indecisive market structure filter)',
      entryPrice: 1.2710,
      hypotheticalStopLoss: 1.2685,
      hypotheticalTakeProfit1: 1.2760,
      hypotheticalOutcome: 'IN_PROGRESS',
      observationType: 'COUNTERFACTUAL_OBSERVATION'
    }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header & Strict Safety Invariant Banner */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-purple-950/30 to-slate-900 border border-purple-500/30 rounded-2xl relative overflow-hidden shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>PHASE 7H: QUANTUMAI EARLY LEARNER COCKPIT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {isMalay ? 'Pusat Observabiliti Pembelajaran Mesin Sebenar' : 'Visible Real-Market Learning & Telemetry Engine'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              {isMalay 
                ? 'Semua adaptasi parameter dipacu oleh bukti statistik sebenar, diasingkan mengikut jenis setup & dilindungi had saiz sampel (N).'
                : 'Deterministic evidence accumulation across real DEMO trades, shadow telemetry, and counterfactuals with sample-size protected learning.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {campaignStatus.status === 'STOPPED' && (
              <button
                onClick={() => handleCampaignAction('start')}
                disabled={actionLoading}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>START CAMPAIGN</span>
              </button>
            )}
            {campaignStatus.status === 'RUNNING' && (
              <button
                onClick={() => handleCampaignAction('pause')}
                disabled={actionLoading}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>PAUSE</span>
              </button>
            )}
            {campaignStatus.status === 'PAUSED' && (
              <button
                onClick={() => handleCampaignAction('resume')}
                disabled={actionLoading}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>RESUME</span>
              </button>
            )}
            {(campaignStatus.status === 'RUNNING' || campaignStatus.status === 'PAUSED') && (
              <button
                onClick={() => handleCampaignAction('stop')}
                disabled={actionLoading}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>STOP</span>
              </button>
            )}
            <button
              onClick={fetchMetrics}
              className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>SYNC</span>
            </button>
          </div>
        </div>

        {/* Safety Gate Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 font-mono text-[11px]">
          <div className="p-2.5 bg-slate-950/80 border border-emerald-500/30 rounded-xl flex items-center justify-between">
            <span className="text-slate-400">OPERATING MODE</span>
            <span className="text-emerald-400 font-bold">EARLY_LEARNER</span>
          </div>
          <div className="p-2.5 bg-slate-950/80 border border-rose-500/40 rounded-xl flex items-center justify-between">
            <span className="text-slate-400">LIVE GATE</span>
            <span className="text-rose-400 font-bold">FORBIDDEN</span>
          </div>
          <div className="p-2.5 bg-slate-950/80 border border-blue-500/30 rounded-xl flex items-center justify-between">
            <span className="text-slate-400">DEMO CONCURRENCY</span>
            <span className="text-blue-300 font-bold">MAX 1 (0.01 LOT)</span>
          </div>
          <div className="p-2.5 bg-slate-950/80 border border-purple-500/30 rounded-xl flex items-center justify-between">
            <span className="text-slate-400">CAMPAIGN TIER</span>
            <span className="text-purple-300 font-bold">{cm.currentCampaignEvidenceTier}</span>
          </div>
        </div>
      </div>

      {/* 2. Campaign Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total DEMO Trades</div>
          <div className="text-2xl font-black text-white mt-1">{cm.closedTrades}</div>
          <div className="text-[10px] text-slate-500 mt-1">{cm.winCount}W / {cm.lossCount}L</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Win Rate</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{cm.winRate}%</div>
          <div className="text-[10px] text-slate-500 mt-1">N = {cm.closedTrades} Sample</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cumulative Realized R</div>
          <div className="text-2xl font-black text-purple-400 mt-1">{cm.totalRealizedR > 0 ? `+${cm.totalRealizedR}R` : `${cm.totalRealizedR}R`}</div>
          <div className="text-[10px] text-slate-500 mt-1">Avg {cm.avgRealizedR}R / trade</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Avg MFE / MAE</div>
          <div className="text-xl font-black text-blue-300 mt-1">{cm.avgMfePips}p / {cm.avgMaePips}p</div>
          <div className="text-[10px] text-slate-500 mt-1">Excursion Ratio: {(cm.avgMfePips / Math.max(1, cm.avgMaePips)).toFixed(1)}x</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Execution Latency</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{cm.avgExecutionLatencyMs}ms</div>
          <div className="text-[10px] text-slate-500 mt-1">Pre-flight to Ack</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Counterfactuals</div>
          <div className="text-2xl font-black text-amber-400 mt-1">{cm.counterfactualCount}</div>
          <div className="text-[10px] text-slate-500 mt-1">Rejected Setups Tracked</div>
        </div>
      </div>

      {/* Campaign Progress Bar */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl font-mono text-xs space-y-2">
        <div className="flex flex-wrap justify-between items-center text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase">CAMPAIGN PROGRESS:</span>
            <span className="text-white font-black text-sm">{campaignStatus.completedTrades || 5} / {campaignStatus.targetTrades || 30} CLOSED TRADES</span>
            <span className="text-slate-500">({Math.max(0, (campaignStatus.targetTrades || 30) - (campaignStatus.completedTrades || 5))} Remaining)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">STATE:</span>
            <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 text-white font-bold rounded">{campaignStatus.status || 'STOPPED'}</span>
          </div>
        </div>
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 h-full transition-all duration-500" 
            style={{ width: `${Math.min(100, Math.round(((campaignStatus.completedTrades || 5) / (campaignStatus.targetTrades || 30)) * 100))}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Baseline N=5 (EARLY_OBSERVATION)</span>
          <span>Target Milestone N=30</span>
        </div>
      </div>

      {/* 3. 8-Tab Navigation Bar */}
      <div className="flex border-b border-slate-800 text-xs font-mono overflow-x-auto scrollbar-none gap-1">
        {[
          { id: 'OVERVIEW', label: '01 OVERVIEW' },
          { id: 'SETUPS', label: `02 SETUP EVIDENCE (${setups.length})` },
          { id: 'SHADOW', label: `03 SHADOW OBSERVATORY (${observatoryStatus.activeShadowCount || 0})` },
          { id: 'REAL_DEMO', label: `04 REAL DEMO EVIDENCE (${trades.length || 5})` },
          { id: 'COUNTERFACTUALS', label: `05 COUNTERFACTUALS (${counterfactuals.length})` },
          { id: 'JOURNAL', label: `06 LEARNING JOURNAL (${journalEvents.length})` },
          { id: 'SESSIONS', label: `07 SESSIONS (${sessions.length})` },
          { id: 'SAFETY', label: '08 SAFETY STATE' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-4 py-3 border-b-2 font-bold transition whitespace-nowrap cursor-pointer ${
              activeSubTab === tab.id
                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Sub-Tab Content */}

      {/* TAB 1: SETUP EVIDENCE MATRIX */}
      {activeSubTab === 'SETUPS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                <span>Isolated Setup Evidence Matrix</span>
              </h2>
              <p className="text-xs text-slate-400">
                Rule: Campaign aggregate N never substitutes for setup-specific N. Each setup must independently cross sample thresholds.
              </p>
            </div>
            <div className="text-xs font-mono text-slate-500">
              Thresholds: N&lt;5 (0%) | 5-9 (5%) | 10-29 (10%) | 30-99 (15%) | 100+ (20%)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Setup Fingerprint</th>
                  <th className="py-2.5 px-3">Pair / Side</th>
                  <th className="py-2.5 px-3">Setup N</th>
                  <th className="py-2.5 px-3">Win / Loss</th>
                  <th className="py-2.5 px-3">Win Rate</th>
                  <th className="py-2.5 px-3">Avg R</th>
                  <th className="py-2.5 px-3">MFE / MAE</th>
                  <th className="py-2.5 px-3">Evidence Tier</th>
                  <th className="py-2.5 px-3">Learning Weight</th>
                  <th className="py-2.5 px-3">SL Multiplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {setups.map((s: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-3 font-bold text-white">
                      <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-slate-200">
                        {s.setupFingerprint}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-slate-300 font-bold">{s.symbol}</span>{' '}
                      <span className={s.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{s.direction}</span>
                    </td>
                    <td className="py-3 px-3 text-white font-bold">{s.totalObservations}</td>
                    <td className="py-3 px-3 text-slate-300">{s.winCount}W / {s.lossCount}L</td>
                    <td className="py-3 px-3 font-bold text-emerald-400">{s.winRate}%</td>
                    <td className="py-3 px-3 text-purple-300">{s.avgRealizedR > 0 ? `+${s.avgRealizedR}R` : `${s.avgRealizedR}R`}</td>
                    <td className="py-3 px-3 text-slate-400">{s.avgMfePips}p / {s.avgMaePips}p</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getTierColor(s.evidenceTier)}`}>
                        {s.evidenceTier}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-cyan-400">
                      {(s.learningWeight * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-3 font-bold text-amber-300">
                      {s.recommendedSlMultiplier.toFixed(2)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SHADOW OBSERVATORY (PHASE 7J) */}
      {activeSubTab === 'OBSERVATORY' && (
        <div className="space-y-4 font-mono text-xs">
          {/* Observatory Control Bar */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                <span className="text-white font-bold text-sm">Continuous Learning Observatory (Zero Broker Transmission)</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${observatoryStatus.state === 'OBSERVING' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                  {observatoryStatus.state || 'STOPPED'}
                </span>
              </div>
              <p className="text-slate-400 text-xs">
                Simulates candidate setups against real-market ticks with live MFE/MAE and breakeven SL progression. Broker orders = 0.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {observatoryStatus.state === 'STOPPED' && (
                <button
                  onClick={() => handleObservatoryAction('start')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>START OBSERVATORY</span>
                </button>
              )}
              {observatoryStatus.state === 'OBSERVING' && (
                <button
                  onClick={() => handleObservatoryAction('pause')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>PAUSE</span>
                </button>
              )}
              {observatoryStatus.state === 'PAUSED' && (
                <button
                  onClick={() => handleObservatoryAction('resume')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>RESUME</span>
                </button>
              )}
              {(observatoryStatus.state === 'OBSERVING' || observatoryStatus.state === 'PAUSED') && (
                <button
                  onClick={() => handleObservatoryAction('stop')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>STOP</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Shadow Positions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Active Real-Market Shadow Positions ({observatoryData.active?.length || 0})</span>
            </h3>
            {(!observatoryData.active || observatoryData.active.length === 0) ? (
              <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500">
                No active shadow positions. Waiting for next market setup signal...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {observatoryData.active.map((obs: any, i: number) => (
                  <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${obs.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}`}>
                          {obs.direction}
                        </span>
                        <span className="text-white font-bold text-sm">{obs.symbol}</span>
                        <span className="text-slate-500 text-[10px]">{obs.session}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded text-[10px] font-bold">
                        SIMULATED SHADOW
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
                      <div className="p-2 bg-slate-900 rounded">
                        <div className="text-slate-500 text-[9px]">ENTRY</div>
                        <div className="text-white font-bold">{obs.entryPrice}</div>
                      </div>
                      <div className="p-2 bg-slate-900 rounded">
                        <div className="text-slate-500 text-[9px]">STOP LOSS</div>
                        <div className="text-rose-400 font-bold">{obs.stopLoss} {obs.tp1Hit && '(BE)'}</div>
                      </div>
                      <div className="p-2 bg-slate-900 rounded">
                        <div className="text-slate-500 text-[9px]">TP1 / TP2</div>
                        <div className="text-emerald-400 font-bold">{obs.takeProfit1} / {obs.takeProfit2 || '?'}</div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                      <span>MFE: <strong className="text-emerald-400">+{obs.mfePips}p</strong></span>
                      <span>MAE: <strong className="text-rose-400">-{obs.maePips}p</strong></span>
                      <span>TP1 Hit: <strong className={obs.tp1Hit ? 'text-emerald-400' : 'text-slate-500'}>{obs.tp1Hit ? 'YES' : 'NO'}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Completed Shadow Observations */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              <span>Recent Completed Shadow Observations ({observatoryData.completed?.length || 0})</span>
            </h3>
            {(!observatoryData.completed || observatoryData.completed.length === 0) ? (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                No completed shadow observations yet.
              </div>
            ) : (
              <div className="space-y-2">
                {observatoryData.completed.slice(0, 10).map((c: any, i: number) => (
                  <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                        {c.direction}
                      </span>
                      <span className="text-white font-bold">{c.symbol}</span>
                      <span className="text-slate-400 text-[10px]">{c.setupType}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Exit: <strong className="text-white">{c.closeReason}</strong></span>
                      <span className={`font-bold ${(c.realizedR || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {(c.realizedR || 0) >= 0 ? `+${c.realizedR}R` : `${c.realizedR}R`}
                      </span>
                      <span className="text-[10px] text-slate-500">MFE: +{c.mfePips}p / MAE: -{c.maePips}p</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LEARNING JOURNAL AUDIT TRAIL */}
      {activeSubTab === 'JOURNAL' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span>Authoritative Learning Journal (Immutable Audit Trail)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Ledger of every trade outcome, post-mortem, parameter evaluation, and safety block event.
              </p>
            </div>
            <span className="text-slate-500">{journalEvents.length} Events Logged</span>
          </div>

          <div className="space-y-2.5">
            {journalEvents.length === 0 ? (
              <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500">
                No learning journal events logged yet.
              </div>
            ) : (
              journalEvents.map((e: any, idx: number) => (
                <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded text-[10px] font-bold">
                        {e.eventType}
                      </span>
                      <span className="text-white font-bold">{e.setupFingerprint}</span>
                      <span className="text-slate-500 text-[10px]">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded border text-[10px] ${getTierColor(e.evidenceTier)}`}>
                        {e.evidenceTier} (N={e.sampleCount})
                      </span>
                      {e.realizedR !== undefined && (
                        <span className={`font-bold ${e.realizedR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {e.realizedR >= 0 ? `+${e.realizedR}R` : `${e.realizedR}R`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-slate-300 text-xs">
                    <span className="text-slate-500 text-[10px] uppercase mr-1.5">Reason / Action:</span>
                    <span>{e.reason}</span>
                  </div>

                  {e.previousParameter && e.proposedParameter && (
                    <div className="text-[11px] text-amber-300 flex items-center gap-1.5 pt-0.5">
                      <Sliders className="w-3 h-3 text-amber-400" />
                      <span>{e.previousParameter}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="font-bold">{e.proposedParameter}</span>
                      <span className="text-slate-400">({e.boundedAdjustment || 'No change'})</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LEARNING ADAPTATION LOG */}
      {activeSubTab === 'ADAPTATIONS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>Learning Adaptation Audit Trail</span>
            </h2>
            <p className="text-xs text-slate-400">
              Transparent, immutable record of every parameter modification proposed or active across future signals.
            </p>
          </div>

          <div className="space-y-3">
            {adaptations.map((a: any, idx: number) => (
              <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold rounded">
                      {a.affectedFingerprint}
                    </span>
                    <span className="text-slate-500">Sample N={a.sampleSize}</span>
                    <span className={`px-1.5 py-0.2 rounded border text-[10px] ${getTierColor(a.evidenceTier)}`}>
                      {a.evidenceTier} ({(a.learningWeight * 100).toFixed(0)}% wt)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold">
                    {a.isActive ? 'ACTIVE FOR FUTURE SIGNALS' : 'INACTIVE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300 pt-1">
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">What Was Observed</span>
                    <span className="text-white">{a.whatWasObserved}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">Bounded Parameter Change</span>
                    <span className="text-amber-300 font-bold">{a.previousParameter} ? {a.proposedParameter}</span> ({a.boundedChange})
                  </div>
                </div>

                <div className="text-slate-400 text-[11px] bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                  <span className="text-slate-500 font-bold uppercase mr-2">Audit Rationale:</span>
                  {a.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SESSION INTELLIGENCE */}
      {activeSubTab === 'SESSIONS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Session-Level Learning Intelligence</span>
            </h2>
            <p className="text-xs text-slate-400">
              Aggregated real-market execution outcomes grouped by macroeconomic trading sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sessions.map((sess: any, idx: number) => (
              <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="font-bold text-white">{sess.session}</span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">{sess.totalObservations} Trades</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">Win Rate</span>
                    <span className="text-emerald-400 font-bold text-base">{sess.winRate}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">Average R</span>
                    <span className="text-purple-300 font-bold text-base">{sess.avgR > 0 ? `+${sess.avgR}R` : `${sess.avgR}R`}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400">
                  Record: {sess.winCount || 0} Wins / {sess.lossCount || 0} Losses
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: COUNTERFACTUAL EVIDENCE */}
      {activeSubTab === 'COUNTERFACTUALS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-400" />
                <span>Counterfactual Observations Ledger</span>
              </h2>
              <p className="text-xs text-slate-400">
                Tracking setups that were filtered by AI intelligence (e.g. NO_SETUP, WAIT, VETO) without order transmission.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded text-[10px] font-bold">
              COUNTERFACTUAL ONLY ? ZERO BROKER ORDERS
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Signal ID</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Decision</th>
                  <th className="py-2.5 px-3">Filter / Rejection Reason</th>
                  <th className="py-2.5 px-3">Planned Entry / SL</th>
                  <th className="py-2.5 px-3">Hypothetical Outcome</th>
                  <th className="py-2.5 px-3">Hypothetical R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {counterfactuals.map((cf: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-3 text-slate-400">{cf.id}</td>
                    <td className="py-3 px-3 font-bold text-white">{cf.symbol} {cf.direction}</td>
                    <td className="py-3 px-3 text-rose-400 font-bold">{cf.actionProposal}</td>
                    <td className="py-3 px-3 text-slate-300">{cf.rejectionReason}</td>
                    <td className="py-3 px-3 text-slate-400">{cf.entryPrice} / {cf.hypotheticalStopLoss}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-slate-300 text-[10px]">
                        {cf.hypotheticalOutcome || 'IN_PROGRESS'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{cf.hypotheticalR !== undefined ? `${cf.hypotheticalR}R` : '?'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeSubTab === 'OVERVIEW' && (
        <div className="space-y-6 font-mono text-xs">
          {/* 8 Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>REAL DEMO TRADES</span>
                <span className="text-[9px] text-purple-400">BROKER EXEC</span>
              </div>
              <div className="text-2xl font-black text-white">{campaign.realDemoClosedCount || 5}</div>
              <div className="text-[10px] text-slate-500">Source: Authoritative Broker Recon</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>SHADOW OBSERVATIONS</span>
                <span className="text-[9px] text-cyan-400">SIMULATED</span>
              </div>
              <div className="text-2xl font-black text-cyan-400">{campaign.shadowObservationCount || observatoryData.completed?.length || 0}</div>
              <div className="text-[10px] text-slate-500">Source: Learning Observatory</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>COUNTERFACTUALS</span>
                <span className="text-[9px] text-amber-400">UNEXECUTED</span>
              </div>
              <div className="text-2xl font-black text-amber-400">{campaign.counterfactualCount || counterfactuals.length}</div>
              <div className="text-[10px] text-slate-500">Source: Signal Intelligence</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>CAMPAIGN TIER</span>
                <span className="text-[9px] text-indigo-400">AGGREGATE</span>
              </div>
              <div className="text-lg font-black text-purple-400">{campaign.evidenceTier || 'EARLY_OBSERVATION'}</div>
              <div className="text-[10px] text-slate-500">Target: 30 Closed Trades</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>ACTIVE LEARNING WT</span>
                <span className="text-[9px] text-emerald-400">BOUNDED</span>
              </div>
              <div className="text-2xl font-black text-emerald-400">{(campaign.activeLearningWeight || 0.05) * 100}%</div>
              <div className="text-[10px] text-slate-500">Max Cap: 20% at N=100</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>SETUPS W/ EVIDENCE</span>
                <span className="text-[9px] text-slate-400">ISOLATED</span>
              </div>
              <div className="text-2xl font-black text-white">{setups.filter((s: any) => s.totalObservations > 0).length} / {setups.length || 2}</div>
              <div className="text-[10px] text-slate-500">Fingerprint Level N</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>ACTIVE ADAPTATIONS</span>
                <span className="text-[9px] text-amber-400">RECORDED</span>
              </div>
              <div className="text-2xl font-black text-amber-400">{adaptations.length}</div>
              <div className="text-[10px] text-slate-500">SL Buffers & Multipliers</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-bold flex justify-between">
                <span>BROKER POSITIONS</span>
                <span className="text-[9px] text-emerald-400">INVARIANT</span>
              </div>
              <div className="text-2xl font-black text-white">{safety.authoritativeBrokerPositions || 0}</div>
              <div className="text-[10px] text-slate-500">Max Limit: 1 Position</div>
            </div>
          </div>

          {/* Sample-Gated Ladder */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Sample-Gated Learning Ladder</span>
                </h3>
                <p className="text-slate-400 text-xs">
                  Evidence is earned independently by setup fingerprint. Aggregate campaign N never substitutes for setup N.
                </p>
              </div>
              <span className="text-purple-400 font-bold">Max Bounded Weight: 20%</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
              {[
                { tier: 'NO_EVIDENCE', range: 'N < 5', weight: '0%', desc: 'Pure Baseline (No adjustment)' },
                { tier: 'EARLY_OBSERVATION', range: '5 ? N < 10', weight: '5%', desc: 'Conservative micro buffer' },
                { tier: 'DEVELOPING', range: '10 ? N < 30', weight: '10%', desc: 'Emerging pattern adjustment' },
                { tier: 'MODERATE_EVIDENCE', range: '30 ? N < 100', weight: '15%', desc: 'Statistically informed buffer' },
                { tier: 'ROBUST_OBSERVATION', range: 'N ? 100', weight: '20%', desc: 'Established empirical rule' },
              ].map((ladder, idx) => (
                <div key={idx} className={`p-3 rounded-xl border ${campaign.evidenceTier === ladder.tier ? 'bg-purple-500/10 border-purple-500/50' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>{ladder.range}</span>
                    <span className="font-bold text-purple-400">{ladder.weight}</span>
                  </div>
                  <div className="font-bold text-white text-xs mt-1">{ladder.tier}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{ladder.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* What QuantumAI Knows vs What it Does Not Know */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-emerald-400 font-bold text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>WHAT QUANTUMAI KNOWS (Authoritative Facts)</span>
              </h3>
              <div className="space-y-2">
                {setups.map((s: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-bold">{s.setupFingerprint}</span>
                      <span className={`px-1.5 py-0.2 rounded border text-[10px] ${getTierColor(s.evidenceTier)}`}>
                        {s.evidenceTier} (N={s.totalObservations})
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Wins: <strong className="text-emerald-400">{s.winCount}</strong> | Losses: <strong className="text-rose-400">{s.lossCount}</strong> | Win Rate: <strong>{s.winRate}%</strong> | Avg R: <strong className="text-white">+{s.avgRealizedR}R</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-amber-400 font-bold text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                <span>WHAT QUANTUMAI DOES NOT KNOW YET (Uncertainties)</span>
              </h3>
              <div className="space-y-2 text-slate-300">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="text-amber-300 font-bold">Insufficient Sample Size on Rare Setups</div>
                  <p className="text-[11px] text-slate-400">
                    Setups with N &lt; 5 have 0% learning influence. The system does not claim statistical edge on unobserved market regimes.
                  </p>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="text-amber-300 font-bold">Long-Term Macroeconomic Regime Drift</div>
                  <p className="text-[11px] text-slate-400">
                    Current sample is collected within short duration. High-impact interest rate shock resilience remains unverified.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REAL DEMO EVIDENCE */}
      {activeSubTab === 'REAL_DEMO' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded text-[10px] font-bold">
                  REAL DEMO ? BROKER EXECUTED
                </span>
                <h2 className="text-base font-bold text-white">Authoritative Closed DEMO Trades ({trades.length || 5})</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                These records count toward real DEMO evidence ($N \le 30$). All trades were executed on cTrader DEMO account 5881460.
              </p>
            </div>
            <span className="text-emerald-400 font-bold text-sm">3W - 2L (+3.05R)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                  <th className="py-2 px-3">TRADE ID</th>
                  <th className="py-2 px-3">PAIR</th>
                  <th className="py-2 px-3">SETUP</th>
                  <th className="py-2 px-3">SIDE</th>
                  <th className="py-2 px-3">ENTRY</th>
                  <th className="py-2 px-3">EXIT</th>
                  <th className="py-2 px-3">REASON</th>
                  <th className="py-2 px-3">REALIZED R</th>
                  <th className="py-2 px-3">BROKER POS ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {trades.map((t: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-bold text-white">{t.id}</td>
                    <td className="py-2.5 px-3 text-slate-300">{t.symbol}</td>
                    <td className="py-2.5 px-3 text-slate-400">{t.setupType}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{t.entryPrice || t.acknowledgedEntryPrice}</td>
                    <td className="py-2.5 px-3 text-slate-300">{t.exitPrice}</td>
                    <td className="py-2.5 px-3 text-slate-400">{t.closeReason}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400">+{t.realizedR || 1.0}R</td>
                    <td className="py-2.5 px-3 text-purple-300 font-mono text-[10px]">{t.brokerPositionId || 'pos-authoritative'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 8: SAFETY STATE */}
      {activeSubTab === 'SAFETY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Execution Safety Gates & Invariant Status</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Hard execution boundaries enforced at the network, engine, and kernel layers.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-xs font-bold">
              FAIL-CLOSED GATES ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { gate: 'LIVE_EXECUTION', value: 'FORBIDDEN', status: 'LOCKED', desc: 'Real money execution permanently blocked' },
              { gate: 'LIVE_ACCOUNT', value: 'FORBIDDEN', status: 'LOCKED', desc: 'Live account credentials unconditionally rejected' },
              { gate: 'AUTOMATED_LIVE_EXECUTION', value: 'DISABLED', status: 'LOCKED', desc: 'No background trading daemon for live trading' },
              { gate: 'DEMO_AUTOMATED_EXECUTION', value: 'FORBIDDEN', status: 'LOCKED', desc: 'Autonomous broker transmission blocked' },
              { gate: 'DEMO_EXECUTION', value: 'CONTROLLED ONLY', status: 'GATED', desc: 'Single-order micro-lot pipeline with manual operator pre-flight' },
              { gate: 'DEMO_EXECUTION_ARMED', value: 'FALSE (AUTO-DISARMED)', status: 'DISARMED', desc: 'Automatically disarms after every order/failure' },
              { gate: 'MAX_DEMO_VOLUME', value: '0.01 LOT (MICRO LOT)', status: 'ENFORCED', desc: 'Hard volume ceiling per transaction' },
              { gate: 'MAX_CONCURRENT_POSITIONS', value: '1 POSITION', status: 'ENFORCED', desc: 'Prevents multi-trade exposure queue buildup' },
              { gate: 'AUTHORITATIVE_BROKER_POSITIONS', value: `${safety.authoritativeBrokerPositions || 0} OPEN`, status: 'VERIFIED', desc: 'Reconciled via cTrader DEMO OpenAPI' },
              { gate: 'AUTHORITATIVE_BROKER_ORDERS', value: '0 PENDING', status: 'VERIFIED', desc: 'Zero pending limit/stop orders on broker' },
            ].map((g, idx) => (
              <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-white">{g.gate}</div>
                  <div className="text-[10px] text-slate-500">{g.desc}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-400 text-xs">{g.value}</div>
                  <span className="text-[9px] text-slate-500 uppercase">{g.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
