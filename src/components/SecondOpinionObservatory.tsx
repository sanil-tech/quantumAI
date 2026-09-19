import React, { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  ShieldCheck,
  ShieldAlert,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  Cpu,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Clock,
  ExternalLink,
  Info,
  Sliders,
  DollarSign,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Lock,
  ZapOff
} from 'lucide-react';

export interface SecondOpinionObservation {
  id: string;
  signalId: string;
  symbol: string;
  timeframe: string;
  dataMode: 'LIVE' | 'DEMO' | 'PAPER' | 'BACKTEST' | 'SYNTHETIC';
  dataLineage: 'LIVE' | 'HISTORICAL' | 'SYNTHETIC' | 'SHADOW' | 'UNKNOWN';

  quantumAiDirection: 'BUY' | 'SELL' | 'NEUTRAL';
  quantumAiConfidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  executionEligibilityAtReview?: string;

  openAiReview: 'PASS' | 'REVIEW' | 'REJECT' | 'UNAVAILABLE';
  openAiIndependentBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  openAiConfidence: number;
  agreement: 'AGREE' | 'PARTIAL' | 'DISAGREE';
  contradictionLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  economicRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  riskFlags: string[];
  keyConcerns: string[];
  invalidationConcerns: string[];

  secondOpinionModel: string;
  latencyMs: number;
  economicContextSupplied?: {
    currency?: string;
    event?: string;
    impact?: string;
    scheduledAt?: string;
    minutesUntil?: number;
    previous?: string | number | null;
    forecast?: string | number | null;
    actual?: string | number | null;
  } | null;

  outcomeStatus: 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'CLOSED_BREAKEVEN' | 'UNMATCHED';
  realizedProfit?: number;
  pnlPips?: number;
  closedAt?: string;
  brokerOrderId?: string;
  brokerPositionId?: string;
  correlationMethod?: string;
  dataQualityFlags?: string[];

  createdAt: string;
  updatedAt: string;
  secondOpinionAt: string;
}

export interface PipelineHealthDiagnostic {
  secondOpinionEnabled: boolean;
  secondOpinionMode: string;
  observationPersistenceHealthy: boolean;
  observationCount: number;
  latestObservationAt: string | null;
  latestObservationSignalId: string | null;
  unmatchedOutcomeCount: number;
  openObservationCount: number;
  lastCorrelationAt: string | null;
  openAiUnavailableCount: number;
  runtime: {
    enabled: boolean;
    mode: string;
    modelConfigured: boolean;
    apiKeyPresent: boolean;
    executionAuthority: false;
  };
}

export interface ObservationSummaryMetrics {
  totalObservations: number;
  openObservations: number;
  closedObservations: number;
  unmatchedObservations: number;
  openAiUnavailableObservations: number;
  agreementBreakdown: {
    agree: number;
    partial: number;
    disagree: number;
  };
  reviewBreakdown: {
    pass: number;
    review: number;
    reject: number;
    unavailable: number;
  };
  economicRiskBreakdown: {
    low: number;
    medium: number;
    high: number;
    unknown: number;
  };
  outcomeBreakdown: {
    open: number;
    win: number;
    loss: number;
    breakeven: number;
    unmatched: number;
  };
  datasetLineage: {
    live: number;
    historical: number;
    shadow: number;
    synthetic: number;
    unknown: number;
  };
}

export interface SecondOpinionObservatoryProps {
  isMalay?: boolean;
}

export const SecondOpinionObservatory: React.FC<SecondOpinionObservatoryProps> = ({
  isMalay = false
}) => {
  const [health, setHealth] = useState<PipelineHealthDiagnostic | null>(null);
  const [summary, setSummary] = useState<ObservationSummaryMetrics | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [observations, setObservations] = useState<SecondOpinionObservation[]>([]);
  const [totalObsCount, setTotalObsCount] = useState<number>(0);
  const [selectedObservation, setSelectedObservation] = useState<SecondOpinionObservation | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [autoRefreshSecs, setAutoRefreshSecs] = useState<number>(30);

  // Filters State (Default Lineage = LIVE)
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('ALL');
  const [filterAgreement, setFilterAgreement] = useState<string>('ALL');
  const [filterReview, setFilterReview] = useState<string>('ALL');
  const [filterEconomicRisk, setFilterEconomicRisk] = useState<string>('ALL');
  const [filterOutcome, setFilterOutcome] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  const getAdminKey = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_api_key') || 'admin_demo_key_88';
    }
    return 'admin_demo_key_88';
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    const adminKey = getAdminKey();
    const headers: Record<string, string> = {
      'x-admin-key': adminKey,
      'Authorization': `Bearer ${adminKey}`
    };

    try {
      // 1. Health Endpoint
      const healthRes = await fetch('/api/admin/second-opinion/health', { headers });
      if (healthRes.status === 401 || healthRes.status === 403) {
        setIsUnauthorized(true);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
      const healthData = await healthRes.json();
      if (healthData.success && healthData.health) {
        setHealth(healthData.health);
      }

      // 2. Summary Endpoint
      const summaryRes = await fetch('/api/admin/second-opinion/observations/summary', { headers });
      const summaryData = await summaryRes.json();
      if (summaryData.success && summaryData.summary) {
        setSummary(summaryData.summary);
      }

      // 3. Analytics Endpoint (LIVE lineage default)
      const analyticsRes = await fetch('/api/admin/second-opinion/analytics?dataLineage=LIVE', { headers });
      const analyticsData = await analyticsRes.json();
      if (analyticsData.success && analyticsData.report) {
        setAnalytics(analyticsData.report);
      }

      // 4. Query Observations with Filters
      const queryParams = new URLSearchParams();
      queryParams.set('dataMode', 'LIVE');
      queryParams.set('limit', String(pageSize));
      queryParams.set('offset', String((currentPage - 1) * pageSize));

      if (filterSymbol !== 'ALL') queryParams.set('symbol', filterSymbol);
      if (filterTimeframe !== 'ALL') queryParams.set('timeframe', filterTimeframe);
      if (filterAgreement !== 'ALL') queryParams.set('agreement', filterAgreement);
      if (filterReview !== 'ALL') queryParams.set('review', filterReview);
      if (filterEconomicRisk !== 'ALL') queryParams.set('economicRisk', filterEconomicRisk);
      if (filterOutcome !== 'ALL') queryParams.set('outcomeStatus', filterOutcome);

      const obsRes = await fetch(`/api/admin/second-opinion/observations?${queryParams.toString()}`, { headers });
      const obsData = await obsRes.json();
      if (obsData.success && Array.isArray(obsData.observations)) {
        setObservations(obsData.observations);
        setTotalObsCount(obsData.total || 0);
      }

      setLastRefreshedAt(new Date());
      setIsUnauthorized(false);
    } catch (err: any) {
      console.error('[SecondOpinionObservatory] Fetch error:', err);
      setError(err.message || 'DATA TEMPORARILY UNAVAILABLE');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentPage, filterSymbol, filterTimeframe, filterAgreement, filterReview, filterEconomicRisk, filterOutcome]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling mechanism (30-60s or off)
  useEffect(() => {
    if (autoRefreshSecs <= 0) return;
    const interval = setInterval(() => {
      loadData(true);
    }, autoRefreshSecs * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSecs, loadData]);

  if (isUnauthorized) {
    return (
      <div className="p-8 bg-slate-900 border border-rose-500/30 rounded-2xl text-center space-y-4 max-w-2xl mx-auto my-12">
        <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-white">
          {isMalay ? 'Akses Terhad (Admin Sahaja)' : 'Access Restricted (Super-Admin / Admin Only)'}
        </h2>
        <p className="text-xs text-slate-400">
          {isMalay
            ? 'Kunci API Pentadbir sah atau sesi Super-Admin diperlukan untuk melihat balai cerap Second Opinion ini.'
            : 'A valid Administrative API key or authorized Super-Admin token is required to inspect the Second Opinion Observatory.'}
        </p>
        <button
          onClick={() => loadData()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition"
        >
          {isMalay ? 'Cuba Semula' : 'Retry Verification'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16 font-sans text-slate-100">
      {/* ========================================================================= */}
      {/* 1. HEADER */}
      {/* ========================================================================= */}
      <div className="p-6 bg-slate-900/95 border border-cyan-500/30 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold rounded-full uppercase flex items-center gap-1">
              <Eye className="w-3 h-3 text-cyan-400" />
              QUANTUMAI
            </span>
            <span className="px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold rounded-full uppercase flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              OBSERVATION MODE
            </span>
            <span className="px-2.5 py-0.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold rounded-full uppercase flex items-center gap-1">
              <ZapOff className="w-3 h-3 text-rose-400" />
              EXECUTION AUTHORITY: OFF
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-2 flex items-center gap-2.5">
            Second Opinion Observatory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            LIVE observational intelligence for independent AI review
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Dataset Lineage Disclaimer Badge */}
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-400 hidden sm:block">
            <span className="text-emerald-400 font-bold">● LIVE dataset only</span>
            <span className="mx-2 text-slate-600">|</span>
            <span>Historical ~200 trades isolated</span>
          </div>

          {/* Auto-Refresh Select */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-mono text-[11px]">Auto:</span>
            <select
              value={autoRefreshSecs}
              onChange={(e) => setAutoRefreshSecs(Number(e.target.value))}
              className="bg-transparent text-cyan-300 font-mono text-xs focus:outline-none cursor-pointer"
            >
              <option value={0} className="bg-slate-900 text-slate-300">Off</option>
              <option value={30} className="bg-slate-900 text-slate-300">30s</option>
              <option value={60} className="bg-slate-900 text-slate-300">60s</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={() => loadData()}
            disabled={isLoading || isRefreshing}
            className="px-4 py-2 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Observatory'}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-500/50 rounded-xl flex items-center justify-between text-rose-200 text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-semibold">DATA TEMPORARILY UNAVAILABLE:</span>
            <span className="font-mono">{error}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PIPELINE HEALTH CARD */}
      {/* ========================================================================= */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
              SECOND OPINION PIPELINE HEALTH
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {lastRefreshedAt ? `Checked: ${lastRefreshedAt.toLocaleTimeString()}` : 'Checking...'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3 font-mono text-xs">
          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Enabled</div>
            <div className="mt-1 font-bold flex items-center gap-1.5">
              {health?.runtime?.enabled ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> YES
                </span>
              ) : (
                <span className="text-slate-500">○ NO</span>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Mode</div>
            <div className="mt-1 font-bold text-amber-300">
              {health?.secondOpinionMode || 'OBSERVATION'}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Model</div>
            <div className="mt-1 font-bold text-cyan-300 truncate" title="gpt-4o-mini">
              {health?.runtime?.modelConfigured ? 'gpt-4o-mini' : 'DEFAULT'}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">API Key</div>
            <div className="mt-1 font-bold">
              {health?.runtime?.apiKeyPresent ? (
                <span className="text-emerald-400">● AVAILABLE</span>
              ) : (
                <span className="text-rose-400">○ MISSING</span>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Execution Authority</div>
            <div className="mt-1 font-bold text-rose-400 flex items-center gap-1">
              <span>● FALSE</span>
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Persistence</div>
            <div className="mt-1 font-bold">
              {health?.observationPersistenceHealthy ? (
                <span className="text-emerald-400">● HEALTHY</span>
              ) : (
                <span className="text-rose-400">○ DEGRADED</span>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Latest Observation</div>
            <div className="mt-1 font-bold text-slate-300 truncate" title={health?.latestObservationAt || 'None'}>
              {health?.latestObservationAt ? new Date(health.latestObservationAt).toLocaleTimeString() : '—'}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div className="text-slate-500 text-[10px] uppercase">Last Correlation</div>
            <div className="mt-1 font-bold text-slate-300 truncate" title={health?.lastCorrelationAt || 'None'}>
              {health?.lastCorrelationAt ? new Date(health.lastCorrelationAt).toLocaleTimeString() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TOP KPI CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">LIVE Observations</div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-cyan-300 font-mono">
            {isLoading ? '—' : summary?.totalObservations ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">Genuine market candidates</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">OPEN (Awaiting Close)</div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-amber-300 font-mono">
            {isLoading ? '—' : summary?.openObservations ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">Active in-flight signals</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">CLOSED (Correlated)</div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-300 font-mono">
            {isLoading ? '—' : summary?.closedObservations ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            W: {summary?.outcomeBreakdown?.win ?? 0} | L: {summary?.outcomeBreakdown?.loss ?? 0} | BE: {summary?.outcomeBreakdown?.breakeven ?? 0}
          </div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">UNMATCHED</div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-purple-300 font-mono">
            {isLoading ? '—' : summary?.unmatchedObservations ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">No broker execution match</div>
        </div>

        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">OpenAI Unavailable</div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-300 font-mono">
            {isLoading ? '—' : summary?.openAiUnavailableObservations ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">Timeouts / network fail-closed</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. OBSERVATION LIFECYCLE DIAGRAM */}
      {/* ========================================================================= */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl shadow">
        <div className="text-xs font-bold text-slate-400 font-mono uppercase mb-3 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          Observation Provenance & Lifecycle Trace (Read-Only)
        </div>
        <div className="flex items-center justify-between gap-1 overflow-x-auto py-2 text-[11px] font-mono text-center min-w-[700px]">
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-cyan-400 font-bold">1. LIVE SIGNAL</div>
            <div className="text-slate-500 text-[10px]">Market Data Tick</div>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-emerald-400 font-bold">2. VALIDATED</div>
            <div className="text-slate-500 text-[10px]">Signal Validation Gate</div>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-purple-400 font-bold">3. SECOND OPINION</div>
            <div className="text-slate-500 text-[10px]">OpenAI Review</div>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-amber-400 font-bold">4. PERSISTED</div>
            <div className="text-slate-500 text-[10px]">Disk & Index Storage</div>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-indigo-400 font-bold">5. BROKER LINK</div>
            <div className="text-slate-500 text-[10px]">Order / Position ID</div>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-rose-400 font-bold">6. TRADE CLOSED</div>
            <div className="text-slate-500 text-[10px]">cTrader EventBus</div>
          </div>
          <span className="text-slate-600 font-bold">→</span>
          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl flex-1">
            <div className="text-teal-400 font-bold">7. CORRELATED</div>
            <div className="text-slate-500 text-[10px]">P/L & Realized Pips</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. ANALYTICAL DISTRIBUTIONS (AGREEMENT, REVIEW, ECONOMIC, CONFIDENCE) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Agreement Analysis */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center justify-between">
              <span>Agreement Distribution</span>
              <span className="text-[10px] text-slate-500">QuantumAI ↔ OpenAI</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Observational alignment only (No composite winner)</p>

            <div className="space-y-2 mt-4 text-xs font-mono">
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-emerald-400 font-bold">AGREE</span>
                <span className="text-slate-200">{summary?.agreementBreakdown?.agree ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-amber-400 font-bold">PARTIAL</span>
                <span className="text-slate-200">{summary?.agreementBreakdown?.partial ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-rose-400 font-bold">DISAGREE</span>
                <span className="text-slate-200">{summary?.agreementBreakdown?.disagree ?? 0}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-800">
            Note: Disagreement is preserved for empirical study.
          </div>
        </div>

        {/* OpenAI Review Breakdown */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center justify-between">
              <span>OpenAI Review</span>
              <span className="text-[10px] text-slate-500">Categories</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Observational classifications (Non-blocking)</p>

            <div className="space-y-2 mt-4 text-xs font-mono">
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-emerald-400 font-bold">PASS</span>
                <span className="text-slate-200">{summary?.reviewBreakdown?.pass ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-amber-400 font-bold">REVIEW</span>
                <span className="text-slate-200">{summary?.reviewBreakdown?.review ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-rose-400 font-bold">REJECT</span>
                <span className="text-slate-200">{summary?.reviewBreakdown?.reject ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-slate-400 font-bold">UNAVAILABLE</span>
                <span className="text-slate-200">{summary?.reviewBreakdown?.unavailable ?? 0}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-800">
            Zero execution authority enforced.
          </div>
        </div>

        {/* Economic Risk Distribution */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center justify-between">
              <span>Economic Risk</span>
              <span className="text-[10px] text-slate-500">Context</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Macro environment during signal evaluation</p>

            <div className="space-y-2 mt-4 text-xs font-mono">
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-emerald-400 font-bold">LOW</span>
                <span className="text-slate-200">{summary?.economicRiskBreakdown?.low ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-amber-400 font-bold">MEDIUM</span>
                <span className="text-slate-200">{summary?.economicRiskBreakdown?.medium ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-rose-400 font-bold">HIGH</span>
                <span className="text-slate-200">{summary?.economicRiskBreakdown?.high ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 font-bold">UNKNOWN</span>
                <span className="text-slate-200">{summary?.economicRiskBreakdown?.unknown ?? 0}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-800">
            Event risk != directional trade signal.
          </div>
        </div>

        {/* QuantumAI Confidence Distribution */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center justify-between">
              <span>QuantumAI Confidence</span>
              <span className="text-[10px] text-slate-500">Buckets</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Primary Gemini multi-agent confidence</p>

            <div className="space-y-2 mt-4 text-xs font-mono">
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-indigo-300">90% — 100%</span>
                <span className="text-slate-200">{analytics?.confidenceBreakdown?.['90-100']?.totalCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-cyan-300">80% — 89%</span>
                <span className="text-slate-200">{analytics?.confidenceBreakdown?.['80-89']?.totalCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-amber-300">70% — 79%</span>
                <span className="text-slate-200">{analytics?.confidenceBreakdown?.['70-79']?.totalCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-slate-400">&lt; 70%</span>
                <span className="text-slate-200">{analytics?.confidenceBreakdown?.['below-70']?.totalCount ?? 0}</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-800">
            No confidence averaging with OpenAI.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. DATA QUALITY PANEL */}
      {/* ========================================================================= */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              DATA QUALITY & INTEGRITY AUDIT FLAGS
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500">Deterministic verification layer</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 font-mono text-[11px]">
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Missing Signal ID</div>
            <div className="mt-1 font-bold text-slate-300">0</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Missing Broker Link</div>
            <div className="mt-1 font-bold text-slate-300">0</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Unmatched Outcome</div>
            <div className="mt-1 font-bold text-purple-300">{summary?.unmatchedObservations ?? 0}</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Non-Live Lineage</div>
            <div className="mt-1 font-bold text-slate-300">0</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">OpenAI Unavailable</div>
            <div className="mt-1 font-bold text-rose-300">{summary?.openAiUnavailableObservations ?? 0}</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Missing Macro Info</div>
            <div className="mt-1 font-bold text-slate-300">{summary?.economicRiskBreakdown?.unknown ?? 0}</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Stale Review (&gt;24h)</div>
            <div className="mt-1 font-bold text-slate-300">0</div>
          </div>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-slate-500 text-[9px] uppercase">Duplicate Signal</div>
            <div className="mt-1 font-bold text-slate-300">0</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. FILTERS BAR */}
      {/* ========================================================================= */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300 font-mono">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span>Filters (LIVE Dataset):</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
          {/* Symbol Filter */}
          <select
            value={filterSymbol}
            onChange={(e) => { setFilterSymbol(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Pair: ALL</option>
            <option value="EUR/USD">EUR/USD</option>
            <option value="GBP/USD">GBP/USD</option>
            <option value="USD/JPY">USD/JPY</option>
            <option value="AUD/USD">AUD/USD</option>
            <option value="USD/CAD">USD/CAD</option>
            <option value="EUR/JPY">EUR/JPY</option>
            <option value="GBP/JPY">GBP/JPY</option>
            <option value="XAU/USD">XAU/USD</option>
          </select>

          {/* Timeframe Filter */}
          <select
            value={filterTimeframe}
            onChange={(e) => { setFilterTimeframe(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">TF: ALL</option>
            <option value="M1">M1</option>
            <option value="M5">M5</option>
            <option value="M15">M15</option>
            <option value="H1">H1</option>
            <option value="H4">H4</option>
            <option value="D1">D1</option>
          </select>

          {/* Agreement Filter */}
          <select
            value={filterAgreement}
            onChange={(e) => { setFilterAgreement(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Agreement: ALL</option>
            <option value="AGREE">AGREE</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="DISAGREE">DISAGREE</option>
          </select>

          {/* OpenAI Review Filter */}
          <select
            value={filterReview}
            onChange={(e) => { setFilterReview(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Review: ALL</option>
            <option value="PASS">PASS</option>
            <option value="REVIEW">REVIEW</option>
            <option value="REJECT">REJECT</option>
            <option value="UNAVAILABLE">UNAVAILABLE</option>
          </select>

          {/* Economic Risk Filter */}
          <select
            value={filterEconomicRisk}
            onChange={(e) => { setFilterEconomicRisk(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Econ Risk: ALL</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>

          {/* Outcome Filter */}
          <select
            value={filterOutcome}
            onChange={(e) => { setFilterOutcome(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Outcome: ALL</option>
            <option value="OPEN">OPEN</option>
            <option value="CLOSED_WIN">CLOSED_WIN</option>
            <option value="CLOSED_LOSS">CLOSED_LOSS</option>
            <option value="CLOSED_BREAKEVEN">CLOSED_BREAKEVEN</option>
            <option value="UNMATCHED">UNMATCHED</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 8. RECENT LIVE OBSERVATIONS TABLE */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
              RECENT LIVE OBSERVATIONS
            </h2>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Total: {totalObsCount} observations
          </div>
        </div>

        {observations.length === 0 ? (
          /* ========================================================================= */
          /* 9. EMPTY STATE (NON-FABRICATED) */
          /* ========================================================================= */
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
              <Eye className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              NO LIVE OBSERVATIONS YET
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              The observation pipeline is configured and healthy, but no genuine LIVE second-opinion observation has been recorded yet during active market hours.
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl inline-block text-xs font-mono text-left space-y-1">
              <div className="text-emerald-400 font-bold">STRUCTURAL VERIFICATION: PASS</div>
              <div className="text-amber-400 font-bold">LIVE EMPIRICAL OBSERVATION: NOT YET OBSERVED</div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="p-3">Time</th>
                  <th className="p-3">Pair</th>
                  <th className="p-3">TF</th>
                  <th className="p-3">QuantumAI</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">OpenAI</th>
                  <th className="p-3">Bias</th>
                  <th className="p-3">Agreement</th>
                  <th className="p-3">Contradiction</th>
                  <th className="p-3">Econ Risk</th>
                  <th className="p-3">Outcome</th>
                  <th className="p-3">P/L ($)</th>
                  <th className="p-3">Pips</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {observations.map((obs) => {
                  const timeFormatted = obs.createdAt
                    ? new Date(obs.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '—';

                  const isBuy = obs.quantumAiDirection === 'BUY';
                  const isSell = obs.quantumAiDirection === 'SELL';

                  const isAgree = obs.agreement === 'AGREE';
                  const isPartial = obs.agreement === 'PARTIAL';
                  const isDisagree = obs.agreement === 'DISAGREE';

                  const isPass = obs.openAiReview === 'PASS';
                  const isReview = obs.openAiReview === 'REVIEW';
                  const isReject = obs.openAiReview === 'REJECT';
                  const isUnavail = obs.openAiReview === 'UNAVAILABLE';

                  const isWin = obs.outcomeStatus === 'CLOSED_WIN';
                  const isLoss = obs.outcomeStatus === 'CLOSED_LOSS';
                  const isOpen = obs.outcomeStatus === 'OPEN';
                  const isUnmatched = obs.outcomeStatus === 'UNMATCHED';

                  return (
                    <tr
                      key={obs.id || obs.signalId}
                      onClick={() => setSelectedObservation(obs)}
                      className="hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="p-3 text-slate-400 whitespace-nowrap">{timeFormatted}</td>
                      <td className="p-3 font-bold text-white whitespace-nowrap">{obs.symbol}</td>
                      <td className="p-3 text-slate-400 whitespace-nowrap">{obs.timeframe}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            isBuy ? 'bg-emerald-500/20 text-emerald-400' : isSell ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {obs.quantumAiDirection}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-200 whitespace-nowrap">
                        {Math.round(obs.quantumAiConfidence)}%
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            isPass ? 'bg-emerald-500/20 text-emerald-400' : isReview ? 'bg-amber-500/20 text-amber-400' : isReject ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {obs.openAiReview}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 whitespace-nowrap">{obs.openAiIndependentBias}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            isAgree ? 'bg-emerald-500/20 text-emerald-400' : isPartial ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {obs.agreement}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 whitespace-nowrap">{obs.contradictionLevel}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            obs.economicRisk === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : obs.economicRisk === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {obs.economicRisk}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            isWin ? 'bg-emerald-500/20 text-emerald-400' : isLoss ? 'bg-rose-500/20 text-rose-400' : isOpen ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-300'
                          }`}
                        >
                          {obs.outcomeStatus}
                        </span>
                      </td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        {obs.realizedProfit !== undefined ? (
                          <span className={obs.realizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {obs.realizedProfit >= 0 ? `+$${obs.realizedProfit.toFixed(2)}` : `-$${Math.abs(obs.realizedProfit).toFixed(2)}`}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        {obs.pnlPips !== undefined ? (
                          <span className={obs.pnlPips >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {obs.pnlPips >= 0 ? `+${obs.pnlPips.toFixed(1)}` : `${obs.pnlPips.toFixed(1)}`}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedObservation(obs); }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[10px] font-bold"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalObsCount > pageSize && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalObsCount)} of {totalObsCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5 inline" /> Prev
              </button>
              <span className="text-slate-300">Page {currentPage}</span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage * pageSize >= totalObsCount}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded disabled:opacity-40"
              >
                Next <ChevronRight className="w-3.5 h-3.5 inline" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 10. OBSERVATION DETAIL MODAL / DRAWER */}
      {/* ========================================================================= */}
      {selectedObservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-y-auto font-sans p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 font-mono text-xs font-bold rounded">
                    {selectedObservation.symbol}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 font-mono text-xs rounded">
                    {selectedObservation.timeframe}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 font-mono text-xs rounded">
                    {selectedObservation.dataMode}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-white mt-2 font-mono">
                  Observation Detail: {selectedObservation.signalId}
                </h3>
              </div>
              <button
                onClick={() => setSelectedObservation(null)}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Sections Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* Section A: QuantumAI Primary Signal */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-cyan-400 font-bold uppercase text-[11px] border-b border-slate-800/80 pb-1">
                  1. QuantumAI Primary Signal
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Direction:</span>
                  <span className="font-bold text-white">{selectedObservation.quantumAiDirection}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Confidence:</span>
                  <span className="font-bold text-slate-200">{Math.round(selectedObservation.quantumAiConfidence)}%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Entry Price:</span>
                  <span className="text-slate-300">{selectedObservation.entryPrice ?? '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Stop Loss:</span>
                  <span className="text-rose-400">{selectedObservation.stopLoss ?? '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Take Profit:</span>
                  <span className="text-emerald-400">{selectedObservation.takeProfit ?? '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Eligibility at Review:</span>
                  <span className="text-amber-300">{selectedObservation.executionEligibilityAtReview || 'WAITING_FOR_ENTRY'}</span>
                </div>
              </div>

              {/* Section B: OpenAI Independent Review */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-purple-400 font-bold uppercase text-[11px] border-b border-slate-800/80 pb-1">
                  2. OpenAI Independent Review
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Review Classification:</span>
                  <span className="font-bold text-white">{selectedObservation.openAiReview}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Independent Bias:</span>
                  <span className="font-bold text-slate-200">{selectedObservation.openAiIndependentBias}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Agreement:</span>
                  <span className="text-emerald-400">{selectedObservation.agreement}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Contradiction Level:</span>
                  <span className="text-slate-300">{selectedObservation.contradictionLevel}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Model:</span>
                  <span className="text-slate-400">{selectedObservation.secondOpinionModel}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Latency:</span>
                  <span className="text-cyan-300">{selectedObservation.latencyMs}ms</span>
                </div>
              </div>

              {/* Section C: Economic Context Supplied */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-amber-400 font-bold uppercase text-[11px] border-b border-slate-800/80 pb-1">
                  3. Economic Context Supplied
                </div>
                {selectedObservation.economicContextSupplied ? (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-500">Event:</span>
                      <span className="text-slate-200">{selectedObservation.economicContextSupplied.event || 'None'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-500">Currency / Impact:</span>
                      <span className="text-amber-300">
                        {selectedObservation.economicContextSupplied.currency || '—'} ({selectedObservation.economicContextSupplied.impact || 'LOW'})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-500">Minutes Until:</span>
                      <span className="text-slate-300">{selectedObservation.economicContextSupplied.minutesUntil ?? '—'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Prev / Forecast / Actual:</span>
                      <span className="text-slate-400">
                        {selectedObservation.economicContextSupplied.previous ?? 'UNAVAILABLE'} / {selectedObservation.economicContextSupplied.forecast ?? 'UNAVAILABLE'} / {selectedObservation.economicContextSupplied.actual ?? 'UNAVAILABLE'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 py-3 text-center">No high-impact economic event active</div>
                )}
              </div>

              {/* Section D: Broker Correlation & Realized Outcome */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-emerald-400 font-bold uppercase text-[11px] border-b border-slate-800/80 pb-1">
                  4. Broker Correlation & Realized Outcome
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Outcome Status:</span>
                  <span className="font-bold text-white">{selectedObservation.outcomeStatus}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Realized Profit ($):</span>
                  <span className="font-bold text-emerald-400">
                    {selectedObservation.realizedProfit !== undefined ? `$${selectedObservation.realizedProfit.toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Realized Pips:</span>
                  <span className="text-slate-200">
                    {selectedObservation.pnlPips !== undefined ? `${selectedObservation.pnlPips.toFixed(1)} pips` : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-900">
                  <span className="text-slate-500">Broker Order ID:</span>
                  <span className="text-slate-400">{selectedObservation.brokerOrderId || 'None (Unmatched)'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Broker Position ID:</span>
                  <span className="text-slate-400">{selectedObservation.brokerPositionId || 'None'}</span>
                </div>
              </div>
            </div>

            {/* Section E: Provenance & Data Quality Flags */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-xs">
              <div className="text-slate-400 font-bold uppercase text-[11px] border-b border-slate-800/80 pb-1">
                5. Data Provenance & Integrity Flags
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                <div>
                  <span className="text-slate-500 block text-[10px]">Data Mode:</span>
                  <span className="text-slate-200 font-bold">{selectedObservation.dataMode}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Data Lineage:</span>
                  <span className="text-slate-200 font-bold">{selectedObservation.dataLineage}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Quality Flags:</span>
                  <span className="text-slate-300">
                    {selectedObservation.dataQualityFlags && selectedObservation.dataQualityFlags.length > 0
                      ? selectedObservation.dataQualityFlags.join(', ')
                      : 'None (Clean)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Observed At:</span>
                  <span className="text-slate-300">{new Date(selectedObservation.secondOpinionAt || selectedObservation.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Modal Close Button */}
            <div className="text-right">
              <button
                onClick={() => setSelectedObservation(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
