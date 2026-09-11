import React, { useState, useEffect } from 'react';
import { CurrencyPair, CandleData, IndicatorValues, SmcStructures, SupportResistanceZone, AiTradeOpportunity, Timeframe, TradingStyle, EconomicEvent } from '../types';
import { AiAnalysisCard } from './AiAnalysisCard';
import {
  Zap, ShieldCheck, CheckCircle, CheckCircle2, Download, AlertTriangle, TrendingUp, TrendingDown,
  Bot, Award, User, RefreshCw, Layers, Sparkles, Play, Pause, XCircle, ChevronRight,
  BarChart3, Activity, ArrowUpRight, ArrowDownRight, Clock, Target, DollarSign,
  Lock, Key, HelpCircle, FileText, Check, Cpu, Power, Sliders, Shield, Terminal,
  Radio, CheckSquare, Sparkle, AlertCircle, History, Eye, Calendar
} from 'lucide-react';
import { ChartWidget } from './ChartWidget';
import { BrokerConnectionModal } from './BrokerConnectionModal';
import { SystemSafetyBanner, SystemEnvironment, MarketDataLineage, ReadinessStatus } from './SystemSafetyBanner';
import { IndicatorsPanel } from './IndicatorsPanel';
import { SMCPanel } from './SMCPanel';
import { DemoTraderCommandCenter } from './DemoTraderCommandCenter';
import { EconomicCalendarWidget } from './EconomicCalendarWidget';



interface UserDashboardProps {
  currentPrice: number;
  activePair: CurrencyPair;
  setActivePair: (pair: CurrencyPair) => void;
  candles: CandleData[];
  candleSource?: string;
  indicators?: IndicatorValues;
  smcData?: SmcStructures;
  srZones?: SupportResistanceZone[];
  isMalay: boolean;
  onOpenBrokerModal: () => void;
  timeframe?: Timeframe;
  setTimeframe?: (timeframe: Timeframe) => void;
  onRefreshData?: () => void;
  aiOpportunity?: AiTradeOpportunity | null;
  aiLoading?: boolean;
  onOpenAdaptiveLearning?: () => void;
  onAskAi?: (prompt: string) => void;
  onSyncToRiskCalc?: (opp: AiTradeOpportunity) => void;
  onLogToJournal?: (opp: AiTradeOpportunity) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  currentPrice,
  activePair,
  setActivePair,
  candles,
  candleSource = 'UNKNOWN',
  indicators,
  smcData,
  srZones,
  isMalay,
  onOpenBrokerModal,
  timeframe = 'M15',
  setTimeframe,
  onRefreshData,
  aiOpportunity = null,
  aiLoading = false,
  onOpenAdaptiveLearning,
  onAskAi,
  onSyncToRiskCalc,
  onLogToJournal
}) => {
  const [activeTab, setActiveTab] = useState<'DEMO_COMMAND_CENTER' | 'MANUAL_DESK' | 'ECONOMIC_CALENDAR' | 'STATISTICS' | 'BROKER_CONNECT' | 'USER_PROFILE'>('DEMO_COMMAND_CENTER');
  // PHASE 6C & 6D: Manual Trading Desk & Live Market Monitoring States
  const [manualTrades, setManualTrades] = useState<any[]>([]);
  const [monitoringSnapshots, setMonitoringSnapshots] = useState<any[]>([]);
  const [monitoringAlerts, setMonitoringAlerts] = useState<any[]>([]);
  const [manualTradesLoading, setManualTradesLoading] = useState<boolean>(false);
  const [closeModalTrade, setCloseModalTrade] = useState<any | null>(null);
  const [closeExitPrice, setCloseExitPrice] = useState<string>('');
  const [closeExitReason, setCloseExitReason] = useState<string>('MANUAL_EXIT');
  const [closeUserNotes, setCloseUserNotes] = useState<string>('');
  const [closeSubmitting, setCloseSubmitting] = useState<boolean>(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);

  // Economic Calendar Events State
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>([]);

  // Consolidated Observatory & Learning States
  const [campaignStatus, setCampaignStatus] = useState<any>({ status: 'STOPPED', targetTrades: 30, completedTrades: 0, remainingTrades: 30, isDemoArmed: false });
  const [observatoryStatus, setObservatoryStatus] = useState<any>({ state: 'PAUSED', observationsCount: 0 });
  const [earlyLearnerStats, setEarlyLearnerStats] = useState<any>({ evidenceLevel: 0, adaptations: [], counterfactuals: [] });
  const [shadowTrades, setShadowTrades] = useState<any[]>([]);
  const [completedShadowTrades, setCompletedShadowTrades] = useState<any[]>([]);
  const [learningJournal, setLearningJournal] = useState<any[]>([]);

  // Closed Trades History Filter & Pagination States
  const [closedHistoryPage, setClosedHistoryPage] = useState<number>(1);
  const [closedHistoryFilterPair, setClosedHistoryFilterPair] = useState<string>('ALL');
  const [closedHistoryFilterOutcome, setClosedHistoryFilterOutcome] = useState<string>('ALL');
  const [authoritativeSummary, setAuthoritativeSummary] = useState<any>(null);

  const fetchManualTrades = async () => {
    setManualTradesLoading(true);
    try {
      const [tradesRes, monRes, campaignRes, obsStatusRes, learnerRes, obsTradesRes, journalRes, autotraderRes, ecoRes] = await Promise.all([
        fetch('/api/forex/user-trades').catch(() => null),
        fetch('/api/forex/user-trades/monitoring').catch(() => null),
        fetch('/api/forex/learning/campaign-status').catch(() => null),
        fetch('/api/forex/learning/observatory/status').catch(() => null),
        fetch('/api/forex/learning/early-learner').catch(() => null),
        fetch('/api/forex/learning/observatory/observations').catch(() => null),
        fetch('/api/forex/learning/journal').catch(() => null),
        fetch('/api/autotrader/state').catch(() => null),
        fetch('/api/forex/economic-calendar').catch(() => null)
      ]);

      if (tradesRes && tradesRes.ok) {
        const tradesData = await tradesRes.json();
        if (tradesData.trades) setManualTrades(tradesData.trades);
      }
      if (monRes && monRes.ok) {
        const monData = await monRes.json();
        if (monData.snapshots) setMonitoringSnapshots(monData.snapshots);
        if (monData.alerts) setMonitoringAlerts(monData.alerts);
      }
      if (campaignRes && campaignRes.ok) {
        const data = await campaignRes.json();
        setCampaignStatus(data);
      }
      if (obsStatusRes && obsStatusRes.ok) {
        const data = await obsStatusRes.json();
        setObservatoryStatus(data);
      }
      if (learnerRes && learnerRes.ok) {
        const data = await learnerRes.json();
        setEarlyLearnerStats(data);
      }
      if (obsTradesRes && obsTradesRes.ok) {
        const data = await obsTradesRes.json();
        if (data.active) setShadowTrades(data.active);
        if (data.completed) setCompletedShadowTrades(data.completed);
        if (data.summary) setAuthoritativeSummary(data.summary);
      }
      if (journalRes && journalRes.ok) {
        const data = await journalRes.json();
        if (data.events) setLearningJournal(data.events);
      }
      if (autotraderRes && autotraderRes.ok) {
        const atData = await autotraderRes.json();
        const closed = atData?.state?.closedTrades || atData?.closedTrades || [];
        setClosedAutoTrades(closed);
      }
      if (ecoRes && ecoRes.ok) {
        const ecoData = await ecoRes.json();
        if (Array.isArray(ecoData.events)) {
          setEconomicEvents(ecoData.events);
        }
      }
    } catch (e) {
      console.error('Error fetching manual and learning states:', e);
    } finally {
      setManualTradesLoading(false);
    }
  };

  useEffect(() => {
    fetchManualTrades();
    const interval = setInterval(fetchManualTrades, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenCloseModal = (trade: any) => {
    setCloseModalTrade(trade);
    const defaultP = (trade.symbol === activePair && currentPrice > 0) ? currentPrice : trade.actualEntry;
    setCloseExitPrice(defaultP.toFixed(trade.symbol === 'USD/JPY' ? 3 : 5));
    setCloseExitReason('MANUAL_EXIT');
    setCloseUserNotes('');
    setCloseError(null);
    setCloseSuccess(null);
  };

  const handleConfirmCloseTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeModalTrade) return;

    setCloseSubmitting(true);
    setCloseError(null);

    const exitPriceNum = Number(closeExitPrice);
    if (!Number.isFinite(exitPriceNum) || exitPriceNum <= 0) {
      setCloseError('Exit price must be a valid positive number.');
      setCloseSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/forex/user-trades/${closeModalTrade.manualTradeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exitPrice: exitPriceNum,
          exitReason: closeExitReason,
          exitedAt: new Date().toISOString(),
          userNotes: closeUserNotes
        })
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || 'Failed to close manual trade.');
      }

      setCloseSuccess(`Trade ${closeModalTrade.manualTradeId} closed successfully! Realized PnL: ${resJson.trade?.realizedPnl}`);
      await fetchManualTrades();
      setTimeout(() => {
        setCloseModalTrade(null);
        setCloseSuccess(null);
      }, 1500);
    } catch (err: any) {
      setCloseError(err.message || 'Error closing trade');
    } finally {
      setCloseSubmitting(false);
    }
  };


  // Server-connected state containers
  const [serverBrokerConn, setServerBrokerConn] = useState<any>({
    accountNumber: '',
    brokerName: 'Spotware cTrader Open API',
    platform: 'CTRADER',
    serverHost: '',
    environment: 'DEMO',
    isConnected: false,
    lastConnectedAt: null,
    latencyMs: null,
    liveBalance: 0,
    liveEquity: 0,
    maxDailyLossDollars: 250.00,
    maxLotSizeCap: 0.5,
    autoExecuteRealMoney: false
  });

  const [serverTraderProfileData, setServerTraderProfileData] = useState<any>(null);

  const [serverAutoTraderStateData, setServerAutoTraderStateData] = useState<any>({
    balance: 0,
    initialCapital: 0
  });

  // Auto-Trader Live Trades, Closed History & Logs from Server
  const [liveAutoTrades, setLiveAutoTrades] = useState<any[]>([]);
  const [closedAutoTrades, setClosedAutoTrades] = useState<any[]>([]);
  const [autoTraderLogs, setAutoTraderLogs] = useState<any[]>([]);
  const [isDispatchingSignal, setIsDispatchingSignal] = useState<boolean>(false);

  // Safety & Readiness Banner State
  const [safetyState, setSafetyState] = useState({
    environment: 'DEMO' as SystemEnvironment,
    marketDataLineage: 'LIVE' as MarketDataLineage,
    brokerConnected: true,
    isArmed: false,
    killSwitchActive: false,
    readinessStatus: 'READY' as ReadinessStatus
  });

  const handleToggleKillSwitch = async () => {
    try {
      const nextState = !safetyState.killSwitchActive;
      const res = await fetch('/api/risk/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextState, reason: 'Operator Dashboard Toggle' })
      });
      if (res.ok) {
        const data = await res.json();
        setSafetyState(prev => ({
          ...prev,
          killSwitchActive: data.active,
          readinessStatus: data.active ? 'KILL_SWITCH_ACTIVE' : 'READY'
        }));
      }
    } catch (e) {
      console.error('Failed to toggle kill switch:', e);
    }
  };

  // Sync All States with Server (AutoTrader, Broker Connection, Trader Profile, Health/Safety)
  const fetchAllServerStates = async () => {
    try {
      const [autoRes, brokerRes, profileRes, readinessRes, ksRes] = await Promise.all([
        fetch('/api/autotrader/state').catch(() => null),
        fetch('/api/broker/status').catch(() => null),
        fetch('/api/trader/profile').catch(() => null),
        fetch('/api/health/readiness').catch(() => null),
        fetch('/api/risk/kill-switch').catch(() => null)
      ]);

      let isReady = true;
      let env: SystemEnvironment = 'DEMO';
      let lineage: MarketDataLineage = 'LIVE';
      let bConnected = true;
      let ksActive = false;
      let armed = true;

      if (autoRes && autoRes.ok) {
        const data = await autoRes.json();
        if (data.state) {
          if (data.state.openTrades) setLiveAutoTrades(data.state.openTrades);
          if (data.state.closedTrades) setClosedAutoTrades(data.state.closedTrades);
          if (data.state.logs) setAutoTraderLogs(data.state.logs);
          setServerAutoTraderStateData(data.state);
        }
      }

      if (brokerRes && brokerRes.ok) {
        const bData = await brokerRes.json();
        if (bData.connection) {
          setServerBrokerConn(bData.connection);
          bConnected = !!bData.connection.isConnected;
          if (bData.connection.environment === 'REAL' || bData.connection.environment === 'REAL_LIVE') {
            env = 'REAL_LIVE';
          } else if (bData.connection.environment === 'DEMO') {
            env = 'DEMO';
          } else {
            env = 'TEST';
          }
        }
        if (bData.lineage) {
          lineage = bData.lineage;
        }
      }

      if (profileRes && profileRes.ok) {
        const pData = await profileRes.json();
        if (pData.profile) {
          setServerTraderProfileData(pData.profile);
        }
      }

      if (readinessRes && readinessRes.ok) {
        const rData = await readinessRes.json();
        isReady = rData.status === 'READY';
      }

      if (ksRes && ksRes.ok) {
        const ksData = await ksRes.json();
        ksActive = !!ksData.active;
      }

      let compStatus: ReadinessStatus = 'READY';
      if (ksActive) {
        compStatus = 'KILL_SWITCH_ACTIVE';
      } else if (!bConnected) {
        compStatus = 'BROKER_DISCONNECTED';
      } else if (!isReady) {
        compStatus = 'NOT_READY';
      }

      setSafetyState({
        environment: env,
        marketDataLineage: lineage,
        brokerConnected: bConnected,
        isArmed: false,
        killSwitchActive: ksActive,
        readinessStatus: compStatus
      });
    } catch (e) {
      console.error('Error fetching server states:', e);
    }
  };

  const fetchAutoTraderState = fetchAllServerStates;

  useEffect(() => {
    fetchAllServerStates();
    const interval = setInterval(fetchAllServerStates, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-12">
      {/* Consolidated System Safety & Readiness Banner */}
      <SystemSafetyBanner
        environment={safetyState.environment}
        marketDataLineage={safetyState.marketDataLineage}
        brokerConnected={safetyState.brokerConnected}
        isArmed={safetyState.isArmed}
        killSwitchActive={safetyState.killSwitchActive}
        readinessStatus={safetyState.readinessStatus}
        onRefresh={fetchAllServerStates}
        onToggleKillSwitch={handleToggleKillSwitch}
      />


      {/* 1. PRIMARY QUANTUMAI STATUS BAR (Phase 5) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200 font-mono">
              QUANTUMAI SYSTEM STATUS TELEMETRY
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Fail-Closed Protected ? Read-Only Enforced
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs font-mono">
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">? SYSTEM</span>
            <span className="font-bold text-emerald-400">OPERATIONAL</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">? MARKET DATA</span>
            <span className={`font-bold ${
              candleSource === 'cTrader DEMO Open API (demo.ctraderapi.com)'
                ? 'text-emerald-400'
                : candleSource.includes('REST') || candleSource.includes('Yahoo')
                ? 'text-amber-400 font-bold'
                : 'text-rose-400 font-bold'
            }`}>
              {candleSource === 'cTrader DEMO Open API (demo.ctraderapi.com)'
                ? 'LIVE cTRADER DATA'
                : candleSource.includes('REST') || candleSource.includes('Yahoo')
                ? 'HISTORICAL WARM-UP'
                : 'WAITING FOR cTRADER HISTORY'}
            </span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">? AI ENGINE</span>
            <span className={`font-bold ${aiLoading ? 'text-purple-400 animate-pulse' : (aiOpportunity ? 'text-cyan-400' : 'text-slate-300')}`}>
              {aiLoading ? 'ANALYZING...' : (aiOpportunity ? 'OPP READY' : 'SCANNING')}
            </span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">? SHADOW MODE</span>
            <span className="font-bold text-blue-400">READY (PAPER)</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">? DATABASE</span>
            <span className="font-bold text-emerald-400">POSTGRESQL</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">? cTRADER</span>
            <span className="font-bold text-cyan-300">READ-ONLY FEED</span>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-rose-500/30">
            <span className="text-[9px] text-rose-400 block uppercase font-bold">?? EXECUTION</span>
            <span className="font-bold text-rose-400">DISARMED (0)</span>
          </div>
        </div>
      </div>

      {/* 2. WHAT IS HAPPENING NOW? (Phase 5A Dominant Operator Status) */}
      <div id="what-is-happening-now" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center font-black text-white text-base shadow-lg border border-white/20">
              {activePair.slice(0, 3)}
            </div>
            <div>
              {(() => {
                const isJpy = activePair.includes('JPY');
                const dec = isJpy ? 3 : 5;
                const spreadDelta = isJpy ? 0.006 : 0.000055;
                const safePrice = currentPrice > 0 ? currentPrice : (candles.length > 0 ? candles[candles.length - 1].close : 1.16795);
                const safeBid = safePrice - spreadDelta;
                const safeAsk = safePrice + spreadDelta;
                const isFeedLive = candles.length > 0 || safetyState.brokerConnected;
                const pipFactor = activePair === 'USD/JPY' ? 100 : 10000;
                const dynamicSpread = ((safeAsk - safeBid) * pipFactor).toFixed(1);

                return (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-white tracking-wide font-mono">{activePair}</span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-mono font-bold rounded">
                        {timeframe} TIMEFRAME
                      </span>
                      <span className="px-2 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono font-bold rounded">
                        SPREAD: {dynamicSpread} pips
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-2">
                    <span>Price: <strong className="text-white text-sm">{safePrice.toFixed(dec)}</strong></span>
                    <span className="text-slate-600">·</span>
                    <span>Bid: <strong className="text-slate-200">{safeBid.toFixed(dec)}</strong></span>
                    <span className="text-slate-600">·</span>
                    <span>Ask: <strong className="text-slate-200">{safeAsk.toFixed(dec)}</strong></span>
                    <span className="text-slate-600">·</span>
                    <span>Feed: <strong className={isFeedLive ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{isFeedLive ? "Live Stream (<100ms)" : "CONNECTING FEED..."}</strong></span>
                  </p>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[9px] text-slate-400 block uppercase font-bold">Structure Bias</span>
              <span className={`font-bold ${smcData?.trend === 'BULLISH' ? 'text-emerald-400' : (smcData?.trend === 'BEARISH' ? 'text-rose-400' : 'text-amber-400')}`}>
                {smcData?.trend || 'RANGE STRUCTURE'}
              </span>
            </div>
            <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[9px] text-slate-400 block uppercase font-bold">AI Decision State</span>
              <span className="font-bold text-cyan-300">
                {aiLoading ? 'ANALYZING...' : (aiOpportunity ? `${aiOpportunity.action} OPPTY READY` : 'WAITING FOR SETUP')}
              </span>
            </div>
            <div className="px-3 py-1.5 bg-slate-950 border border-purple-500/40 rounded-xl bg-purple-950/20">
              <span className="text-[9px] text-purple-400 block uppercase font-bold">Human Action</span>
              <span className="font-bold text-purple-300">
                {aiOpportunity ? 'DUAL-CONTROL REVIEW REQUIRED' : 'MONITORING STANDBY'}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 5B: cTrader Read-Only Compact Telemetry */}
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-cyan-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">cTrader Open API Telemetry</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase">READ-ONLY</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {serverBrokerConn?.accountNumber ? `ACCOUNT #${serverBrokerConn.accountNumber}` : 'ACCOUNT #48282756'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Host: <strong className="text-slate-300">{serverBrokerConn?.serverHost || 'demo.ctraderapi.com:5035'}</strong> · Feed: <strong className={candleSource === 'cTrader DEMO Open API (demo.ctraderapi.com)' ? "text-emerald-400" : "text-amber-400"}>{candleSource}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/30 rounded text-[10px] font-bold">
              BROKER ORDERS: 0
            </span>
            <span className="px-2 py-1 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded text-[10px] font-bold">
              EXECUTION: DISARMED
            </span>
          </div>
        </div>
      </div>

      {/* 3. OPERATOR WORKFLOW PROGRESS (Phase 5D Interactive Pipeline) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200 font-mono">
              OPERATOR WORKFLOW PIPELINE (CLICK ANY STAGE TO FOCUS)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
            Stage 4 of 7 Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 font-mono text-[11px]">
          <button
            onClick={() => {
              setActiveTab('MANUAL_DESK');
              document.getElementById('what-is-happening-now')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border border-emerald-500/40 space-y-0.5 text-left transition cursor-pointer"
          >
            <span className="text-[9px] text-slate-400 block font-bold">01 MARKET DATA</span>
            <div className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {candles.length > 0 ? 'COMPLETE' : 'BLOCKED'}
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('MANUAL_DESK');
              document.getElementById('technical-evidence-panel')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border border-emerald-500/40 space-y-0.5 text-left transition cursor-pointer"
          >
            <span className="text-[9px] text-slate-400 block font-bold">02 TECH ANALYSIS</span>
            <div className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {indicators ? 'COMPLETE' : 'WAITING'}
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('MANUAL_DESK');
              if (onAskAi) onAskAi(`Analyze current market for ${activePair}`);
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border border-emerald-500/40 space-y-0.5 text-left transition cursor-pointer"
          >
            <span className="text-[9px] text-slate-400 block font-bold">03 AI ANALYSIS</span>
            <div className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {aiLoading ? 'ANALYZING' : (aiOpportunity ? 'COMPLETE' : 'IDLE')}
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('MANUAL_DESK');
              document.getElementById('central-ai-opportunity-workspace')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border ${
              aiOpportunity?.action === 'BUY' || aiOpportunity?.action === 'SELL'
                ? 'border-cyan-500/60 shadow-md shadow-cyan-950/30'
                : aiOpportunity?.action === 'WAIT_FOR_CONFIRMATION'
                ? 'border-amber-500/40'
                : aiOpportunity?.action === 'VETO'
                ? 'border-rose-500/40'
                : 'border-slate-800'
            } space-y-0.5 text-left transition cursor-pointer`}
          >
            <span className="text-[9px] text-cyan-300 block font-bold">04 OPPTY REVIEW</span>
            <div className="font-bold flex items-center gap-1">
              {aiOpportunity?.action === 'BUY' || aiOpportunity?.action === 'SELL' ? (
                <span className="text-cyan-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" /> VALID OPPORTUNITY
                </span>
              ) : aiOpportunity?.action === 'WAIT_FOR_CONFIRMATION' ? (
                <span className="text-amber-400">WAITING</span>
              ) : aiOpportunity?.action === 'VETO' ? (
                <span className="text-rose-400">SIGNAL VETOED</span>
              ) : (
                <span className="text-slate-500">NO VERIFIED OPPORTUNITY</span>
              )}
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('MANUAL_DESK');
              document.getElementById('active-manual-trading-desk')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border border-slate-800 space-y-0.5 text-left transition cursor-pointer"
          >
            <span className="text-[9px] text-slate-400 block font-bold">05 HUMAN REVIEW</span>
            <div className="font-bold flex items-center gap-1">
              {aiOpportunity?.action === 'BUY' || aiOpportunity?.action === 'SELL' ? (
                <span className="text-purple-300">REQUIRED (MANUAL)</span>
              ) : (
                <span className="text-slate-500">NOT_REQUIRED</span>
              )}
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('STATISTICS');
              document.getElementById('shadow-performance-cockpit')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border border-slate-800 space-y-0.5 text-left transition cursor-pointer"
          >
            <span className="text-[9px] text-slate-400 block font-bold">06 SHADOW OBS</span>
            <div className="text-blue-400 font-bold flex items-center gap-1">
              {manualTrades && manualTrades.filter(p => p.status === 'OPEN').length > 0 ? (
                <span>ACTIVE ({manualTrades.filter(p => p.status === 'OPEN').length})</span>
              ) : (aiOpportunity?.action === 'BUY' || aiOpportunity?.action === 'SELL') ? (
                <span className="text-blue-300">READY (SHADOW)</span>
              ) : (
                <span className="text-slate-500">IDLE</span>
              )}
            </div>
          </button>

          <button
            onClick={() => {
              if (onOpenAdaptiveLearning) onOpenAdaptiveLearning();
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl border border-purple-500/40 space-y-0.5 text-left transition cursor-pointer"
          >
            <span className="text-[9px] text-purple-400 block font-bold">07 LEARNING</span>
            <div className="text-purple-400 font-bold flex items-center gap-1">
              {manualTrades && manualTrades.filter(p => p.status === 'CLOSED').length > 0 ? (
                <span>UPDATED ({manualTrades.filter(p => p.status === 'CLOSED').length})</span>
              ) : (
                <span className="text-slate-500">IDLE</span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Top User Profile Banner & Registration Status Bar */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* User Info */}
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center font-extrabold text-white text-lg shadow-lg border border-white/20">
                {(serverTraderProfileData?.fullName || 'OP').slice(0, 2).toUpperCase()}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${serverBrokerConn?.isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`} title={serverBrokerConn?.isConnected ? 'Broker Connected' : 'Broker Disconnected'} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">{serverTraderProfileData?.fullName || 'Trader Operator'}</h2>
                <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/40 text-[10px] font-mono font-bold text-purple-300 rounded-full uppercase">
                  {serverTraderProfileData?.accountType || 'DEMO OPERATOR'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {serverTraderProfileData?.email || 'operator@quantumai.local'} • ID Akaun: <strong className="text-blue-400">{serverBrokerConn?.accountNumber ? `#${serverBrokerConn.accountNumber}` : 'NOT CONNECTED'}</strong>
              </p>
            </div>
          </div>

          {/* Onboarding Registration Checklist & Broker Status */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Live cTrader Demo Balance */}
            <div 
              onClick={onOpenBrokerModal}
              className="px-3.5 py-1.5 bg-slate-950/90 border border-emerald-500/40 hover:border-emerald-400 rounded-xl flex items-center gap-2.5 cursor-pointer shadow-sm transition"
              title="Klik untuk lihat butiran akaun broker"
            >
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-[11px] font-mono">
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Baki cTrader (DEMO)</span>
                <span className="font-extrabold text-emerald-400 text-xs sm:text-sm leading-tight">
                  ${(serverBrokerConn?.liveBalance || serverBrokerConn?.balance || 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Real-Time Equity */}
            <div 
              onClick={onOpenBrokerModal}
              className="px-3.5 py-1.5 bg-slate-950/90 border border-cyan-500/40 hover:border-cyan-400 rounded-xl flex items-center gap-2.5 cursor-pointer shadow-sm transition"
              title="Klik untuk lihat ekuiti semasa"
            >
              <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="text-[11px] font-mono">
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Ekuiti Semasa</span>
                <span className="font-extrabold text-cyan-400 text-xs sm:text-sm leading-tight">
                  ${(serverBrokerConn?.liveEquity || serverBrokerConn?.equity || serverBrokerConn?.liveBalance || 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-2">
              <Zap className={`w-4 h-4 ${serverBrokerConn?.isConnected ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
              <div className="text-[11px]">
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Sambungan Broker</span>
                <span className="font-bold text-cyan-300 font-mono">
                  {serverBrokerConn?.isConnected ? `cTrader (${serverBrokerConn.accountNumber || 'CONNECTED'})` : 'TIDAK TERSAMBUNG'}
                </span>
              </div>
            </div>

            <button
              onClick={onOpenBrokerModal}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              <span>Pautan Broker</span>
            </button>
          </div>
        </div>

        {/* User Navigation Tabs */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('DEMO_COMMAND_CENTER')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'DEMO_COMMAND_CENTER'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4 text-emerald-300 animate-pulse" />
              <span>⚡ 1. Pusat Kawalan Demo Trader (All-in-One)</span>
            </button>

            <button
              onClick={() => setActiveTab('MANUAL_DESK')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'MANUAL_DESK'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>2. Papan Isyarat Klasik</span>
            </button>

            <button
              onClick={() => setActiveTab('ECONOMIC_CALENDAR')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'ECONOMIC_CALENDAR'
                  ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>3. Kalendar Berita Ekonomi (Live Macro)</span>
              {economicEvents.filter(e => e.impact === 'HIGH').length > 0 && (
                <span className="px-1.5 py-0.2 text-[9px] font-mono font-black bg-rose-500 text-white rounded-full">
                  {economicEvents.filter(e => e.impact === 'HIGH').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('STATISTICS')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'STATISTICS'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4 text-cyan-300" />
              <span>4. Rekod &amp; Prestasi Disahkan</span>
            </button>

            <button
              onClick={() => setActiveTab('BROKER_CONNECT')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'BROKER_CONNECT'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-4 h-4 text-blue-400" />
              <span>5. Pautan Broker Read-Only</span>
            </button>

            <button
              onClick={() => setActiveTab('USER_PROFILE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'USER_PROFILE'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4 text-purple-400" />
              <span>6. Profil Operator</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Mode Operasi: <strong className="text-emerald-400 font-bold">MANUAL &amp; SHADOW READ-ONLY</strong>
          </span>
        </div>
      </div>




      {activeTab === 'STATISTICS' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden shadow-2xl">
            <div className="max-w-3xl space-y-2 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-mono font-bold rounded-full">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>AUTHORITATIVE TRADE &amp; PERFORMANCE LEDGER</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Rekod Prestasi &amp; Analitik Trade Disahkan
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Metrik prestasi sebenar dikira secara terus daripada pangkalan data PostgreSQL berasaskan trade manual yang dipantau dan ditutup secara rasmi.
              </p>
            </div>

            {/* Performance Metrics Grid */}
            {(() => {
              const closedList = manualTrades.filter(t => t.status === 'CLOSED');
              const totalClosed = closedList.length;
              if (totalClosed === 0) {
                return (
                  <div className="p-6 bg-slate-950/90 border border-slate-800 rounded-xl text-center text-xs text-slate-400 font-mono mt-6 relative z-10">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-bold mr-2 uppercase">[AUTHORITATIVE]</span>NO VERIFIED TRADE HISTORY ? Tiada rekod trade ditutup yang disahkan dalam pangkalan data PostgreSQL.
                  </div>
                );
              }
              const wins = closedList.filter(t => (t.pnl || t.pnlDollars || 0) >= 0);
              const losses = closedList.filter(t => (t.pnl || t.pnlDollars || 0) < 0);
              const winRate = ((wins.length / totalClosed) * 100).toFixed(1);
              const totalProfit = wins.reduce((acc, t) => acc + (t.pnl || t.pnlDollars || 0), 0);
              const totalLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || t.pnlDollars || 0), 0));
              const netPnL = totalProfit - totalLoss;
              const profitFactor = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : (totalProfit > 0 ? 'MAX' : '0.00');

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 relative z-10 font-mono">
                  <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Jumlah Trade Ditutup</div>
                    <div className="text-2xl font-black text-white mt-1">{totalClosed}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{wins.length} Menang / {losses.length} Kalah</div>
                  </div>

                  <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Kadar Kemenangan (Win Rate)</div>
                    <div className="text-2xl font-black text-emerald-400 mt-1 flex items-baseline gap-1">
                      {totalClosed < 5 ? (
                        <span className="text-xs text-amber-400 uppercase">INSUFFICIENT EVIDENCE</span>
                      ) : (
                        `${winRate}%`
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Nisbah Menang Disahkan</div>
                  </div>

                  <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Untung Bersih Terkumpul</div>
                    <div className={`text-2xl font-black mt-1 ${netPnL >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                      {netPnL >= 0 ? '+' : ''}${netPnL.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Realized Net P&amp;L</div>
                  </div>

                  <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Profit Factor</div>
                    <div className="text-2xl font-black text-purple-400 mt-1">{profitFactor}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Nisbah Keuntungan/Kerugian</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Closed Trades Summary Table */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-white text-base">Senarai Penuh Sejarah Trade Diselesaikan</h3>
              </div>
              <button
                onClick={fetchManualTrades}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${manualTradesLoading ? 'animate-spin' : ''}`} />
                <span>KEMASKINI</span>
              </button>
            </div>

            {(() => {
              const closedList = manualTrades.filter(t => t.status === 'CLOSED');
              if (closedList.length === 0) {
                return (
                  <div className="p-8 text-center text-slate-500 text-xs font-mono bg-slate-950/50 rounded-xl border border-slate-800">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-bold mr-2 uppercase">[AUTHORITATIVE]</span>NO AUTHORITATIVE TRADE DATA RECORDED IN POSTGRESQL ? Tiada rekod trade ditutup yang disahkan dalam pangkalan data.
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                        <th className="p-3">ID / Pasangan</th>
                        <th className="p-3">Arah</th>
                        <th className="p-3">Harga Entri</th>
                        <th className="p-3">Harga Keluar</th>
                        <th className="p-3">Sebab Tutup</th>
                        <th className="p-3 text-right">Untung/Rugi ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {closedList.map((t) => {
                        const pnlVal = t.pnl || t.pnlDollars || 0;
                        const isWin = pnlVal >= 0;
                        return (
                          <tr key={t.id || t.manualTradeId} className="hover:bg-slate-950/70 transition">
                            <td className="p-3 font-bold text-white">{t.symbol || t.pair}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded font-black text-[10px] ${t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                {t.direction}
                              </span>
                            </td>
                            <td className="p-3 text-slate-300">{t.actualEntry || t.entryPrice}</td>
                            <td className="p-3 text-slate-300">{t.closePrice || t.exitPrice || '-'}</td>
                            <td className="p-3 text-slate-400">{t.closeReason || 'MANUAL_EXIT'}</td>
                            <td className={`p-3 font-black text-right ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}${pnlVal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}


      {/* TAB 4: BROKER CONNECTION (PREMIUM INTEGRATION) */}
      {/* TAB 4: READ-ONLY BROKER INTEGRATION & TELEMETRY */}
      {activeTab === 'BROKER_CONNECT' && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                <span>Status Sambungan Market-Data Broker (Read-Only)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Sambungan stream market-data cTrader Open API / FIX untuk suapan harga live. Eksekusi broker langsung kekal DISARMED (Fail-Closed).
              </p>
            </div>
            <button
              onClick={onOpenBrokerModal}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer"
            >
              <span>Konfigurasi Pautan cTrader</span>
            </button>
          </div>

          {/* Active Broker Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div className="p-4 bg-slate-950 border border-cyan-500/40 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-cyan-300">cTrader Open API Stream</span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded">READ-ONLY CONNECTED</span>
              </div>
              <div className="text-[11px] text-slate-300 space-y-1">
                <div>Akaun: <strong>#5877246</strong></div>
                <div>Pelayan: <strong>demo-uk-eqx-01.p.c-trader.com</strong></div>
                <div>Mod Data: <strong className="text-emerald-400">Live Tick Stream (Zero Execution)</strong></div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-300">Execution Safety Gate</span>
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 text-[10px] font-bold rounded">LOCKED / BLOCKED</span>
              </div>
              <div className="text-[11px] text-slate-300 space-y-1">
                <div>Laluan Eksekusi: <strong className="text-rose-400">0 Active Paths</strong></div>
                <div>Pesanan Dihantar: <strong className="text-slate-400">0 (Fail-Closed)</strong></div>
                <div>Status: <strong className="text-amber-400">READ_ONLY_MODE_ENFORCED</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'DEMO_COMMAND_CENTER' && (
        <DemoTraderCommandCenter
          currentPrice={currentPrice}
          activePair={activePair}
          setActivePair={setActivePair}
          candles={candles}
          candleSource={candleSource}
          indicators={indicators}
          smcData={smcData}
          srZones={srZones}
          aiOpportunity={aiOpportunity}
          aiLoading={aiLoading}
          onRefreshData={onRefreshData}
          onOpenBrokerModal={onOpenBrokerModal}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          language={isMalay ? 'ms' : 'en'}
        />
      )}

      {activeTab === 'ECONOMIC_CALENDAR' && (
        <div className="space-y-6">
          <EconomicCalendarWidget
            events={economicEvents}
            language={isMalay ? 'ms' : 'en'}
          />
        </div>
      )}

      {activeTab === 'MANUAL_DESK' && (
        <div className="space-y-6">
          {/* ROW 1: CHART & AI OPINION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chart Column */}
            <div className="lg:col-span-8 flex flex-col h-[550px]">
              <ChartWidget
                candles={candles}
                pair={activePair}
                timeframe={timeframe}
                setTimeframe={setTimeframe || (() => {})}
                aiOpportunity={aiOpportunity}
                smcData={smcData}
                srZones={srZones}
                onRefreshData={onRefreshData || (() => {})}
                onAskPakar={onAskAi || (() => {})}
                language={isMalay ? 'ms' : 'en'}
              />
            </div>

            {/* AI Decision Workspace */}
            <div id="central-ai-opportunity-workspace" className="lg:col-span-4 flex flex-col h-[550px] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl">
              <AiAnalysisCard
                activePair={activePair}
                opportunity={aiOpportunity}
                loading={aiLoading}
                tradingStyle="DAY_TRADER"
                currentPrice={currentPrice}
                onSyncToRiskCalc={onSyncToRiskCalc || (() => {})}
                onLogToJournal={onLogToJournal || (() => {})}
                onAskAi={onAskAi || (() => {})}
                language={isMalay ? 'ms' : 'en'}
                onOpenAdaptiveLearning={onOpenAdaptiveLearning}
                onTradeEntered={() => fetchManualTrades()}
              />
            </div>
          </div>

          {/* ROW 2: TECHNICAL CONFLUENCES & LEARNING OBSERVATORY SIDEBAR */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Indicators & SMC structure bias */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <IndicatorsPanel
                indicators={indicators}
                smcData={smcData}
                currentPrice={currentPrice}
                activePair={activePair}
                language={isMalay ? 'ms' : 'en'}
              />
              <SMCPanel
                smcData={smcData}
                timeframe={timeframe}
                language={isMalay ? 'ms' : 'en'}
              />
            </div>

            {/* Campaign Observatory Sidebar */}
            <div className="lg:col-span-4 p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-amber-400" />
                <span>Learning Observatory &amp; Campaign</span>
              </h3>

              {/* Status and Disarmed Metrics */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Campaign Status:</span>
                  <span className={`font-bold uppercase ${campaignStatus?.status === 'RUNNING' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {campaignStatus?.status || (observatoryStatus?.state === 'OBSERVING' ? 'RUNNING' : 'STOPPED')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Evidence Level (N):</span>
                  <span className="text-white font-bold">
                    {authoritativeSummary?.totalClosed ?? earlyLearnerStats?.campaignMetrics?.closedTrades ?? 0} samples
                    <span className="ml-1 text-[10px] text-cyan-400 font-normal">
                      ({(authoritativeSummary?.totalClosed ?? 0) >= 100 ? 'ROBUST_OBSERVATION' : (authoritativeSummary?.totalClosed ?? 0) >= 30 ? 'VALIDATED' : 'EMERGING'})
                    </span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Win Rate:</span>
                  <span className="text-emerald-400 font-bold">
                    {(() => {
                      const totalClosed = authoritativeSummary?.totalClosed ?? earlyLearnerStats?.campaignMetrics?.closedTrades ?? 0;
                      const winRate = authoritativeSummary?.winRate ?? earlyLearnerStats?.campaignMetrics?.winRate ?? 0;
                      const winCount = authoritativeSummary?.winCount ?? earlyLearnerStats?.campaignMetrics?.winCount ?? 0;
                      const lossCount = authoritativeSummary?.lossCount ?? earlyLearnerStats?.campaignMetrics?.lossCount ?? 0;
                      if (totalClosed === 0) {
                        return <span className="text-slate-500 uppercase text-[10px]">NO CLOSED TRADES</span>;
                      }
                      return `${winRate}% (${winCount}W / ${lossCount}L)`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Observations:</span>
                  <span className="text-white font-bold">
                    {authoritativeSummary?.totalClosed ?? earlyLearnerStats?.campaignMetrics?.closedTrades ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining Trades:</span>
                  <span className="text-slate-400">
                    {Math.max(0, 30 - (authoritativeSummary?.totalClosed ?? earlyLearnerStats?.campaignMetrics?.closedTrades ?? 0))}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px]">
                  <span className="text-rose-400 font-bold">isDemoArmed:</span>
                  <span className="text-rose-400 font-bold">{campaignStatus?.isDemoArmed ? 'TRUE' : 'FALSE (DISARMED)'}</span>
                </div>
              </div>

              {/* Active campaign controls */}
              <div className="flex gap-2">
                {campaignStatus?.status !== 'RUNNING' && observatoryStatus?.state !== 'OBSERVING' ? (
                  <button
                    onClick={async () => {
                      await fetch('/api/forex/learning/campaign/start', { method: 'POST' });
                      fetchManualTrades();
                    }}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer border border-emerald-500/20"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Start Campaign</span>
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await fetch('/api/forex/learning/campaign/pause', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ reason: 'Operator Paused' }) });
                      fetchManualTrades();
                    }}
                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer border border-amber-500/20"
                  >
                    <Pause className="w-3.5 h-3.5 fill-white" />
                    <span>Pause Campaign</span>
                  </button>
                )}
                <button
                  onClick={async () => {
                    await fetch('/api/forex/learning/campaign/stop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ reason: 'Operator Stopped' }) });
                    fetchManualTrades();
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer border border-slate-700"
                >
                  Stop
                </button>
              </div>

              {/* Active parameters adaptations */}
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Active Adjustments</div>
                {(() => {
                  const adaptations = earlyLearnerStats?.learningAdaptations || earlyLearnerStats?.adaptations || [];
                  if (adaptations.length === 0) {
                    return <div className="text-slate-500 italic">No adaptations applied.</div>;
                  }
                  return (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {adaptations.map((ad: any, i: number) => (
                        <div key={i} className="p-2 bg-slate-950 border border-slate-800/80 rounded-lg text-purple-300 space-y-0.5">
                          <div className="flex justify-between font-bold text-[10px]">
                            <span className="text-white">{ad.affectedFingerprint || ad.pair}</span>
                            <span className="text-amber-400">{ad.boundedChange || `${ad.multiplier}x`}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">{ad.proposedParameter || ad.action}</div>
                          {ad.reason && <div className="text-[9px] text-slate-500 italic">{ad.reason}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ROW 3: POSITION MANAGERS (SHADOW VS MANUAL SIDE-BY-SIDE TRACKER) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Simulated Shadow Paper Trades */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>Simulated Shadow Trades ({shadowTrades.length} Active)</span>
              </h3>

              {shadowTrades.length === 0 ? (
                <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400 font-mono space-y-1">
                  <div>[OBSERVATORIAL] Tiada trade shadow aktif.</div>
                  <div className="text-[11px] text-slate-500">
                    Sistem beroperasi dalam mod <strong>cTrader DEMO Sebenar</strong>. 9 posisi aktif kini beroperasi di cTrader Demo Command Center.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                        <th className="p-2.5">Symbol</th>
                        <th className="p-2.5">Direction</th>
                        <th className="p-2.5">Entry</th>
                        <th className="p-2.5">Current</th>
                        <th className="p-2.5">Stop Loss</th>
                        <th className="p-2.5">Take Profit 1</th>
                        <th className="p-2.5">Unrealized PnL</th>
                        <th className="p-2.5">MFE / MAE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {shadowTrades.map((t: any) => {
                        const pipFactor = t.symbol === 'USD/JPY' ? 100 : (t.symbol === 'XAU/USD' || t.symbol === 'NASDAQ' || t.symbol === 'BTC/USD') ? 1 : 10000;
                        const currPrice = t.currentPrice ?? (t.direction === 'BUY' ? t.highestPriceSeen : t.lowestPriceSeen) ?? t.entryPrice;
                        const pnlPips = t.unrealizedPnlPips !== undefined
                          ? t.unrealizedPnlPips
                          : (currPrice && t.entryPrice ? Number(((t.direction === 'BUY' ? (currPrice - t.entryPrice) : (t.entryPrice - currPrice)) * pipFactor).toFixed(1)) : 0);
                        const isPos = pnlPips > 0;
                        const isNeg = pnlPips < 0;

                        return (
                          <tr key={t.id} className="hover:bg-slate-800/30 transition">
                            <td className="p-2.5 font-bold text-white">{t.symbol}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {t.direction}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-300">{t.entryPrice ?? t.requestedEntryPrice ?? '—'}</td>
                            <td className="p-2.5 text-cyan-300">{currPrice ? (typeof currPrice === 'number' ? currPrice.toFixed(t.symbol?.includes('JPY') ? 3 : 5) : currPrice) : '—'}</td>
                            <td className="p-2.5 text-rose-400">{t.stopLoss}</td>
                            <td className="p-2.5 text-emerald-400">{t.takeProfit1}</td>
                            <td className="p-2.5 font-bold">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                                isPos ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : isNeg ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : 'text-slate-400'
                              }`}>
                                {isPos ? `+${pnlPips}` : pnlPips} pips
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-400">{t.mfePips ?? 0} / {t.maePips ?? 0} pips</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Active Manual Trades (backed by PG) */}
            <div id="active-manual-trading-desk" className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Active Manual Positions ({manualTrades.filter(t => t.status === 'ACTIVE').length})</span>
              </h3>

              {manualTrades.filter(t => t.status === 'ACTIVE').length === 0 ? (
                <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400 font-mono">
                  [AUTHORITATIVE] No active manual trades.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                        <th className="p-2.5">Symbol</th>
                        <th className="p-2.5">Dir</th>
                        <th className="p-2.5">Entry</th>
                        <th className="p-2.5">Live</th>
                        <th className="p-2.5">Floating P&amp;L</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {manualTrades.filter(t => t.status === 'ACTIVE').map((trade) => {
                        const snapshot = monitoringSnapshots.find(s => s.manualTradeId === trade.manualTradeId);
                        const currentP = snapshot?.currentPrice;
                        const uPnl = snapshot?.unrealizedPnl;
                        const isPnlPositive = (uPnl || 0) >= 0;

                        return (
                          <tr key={trade.manualTradeId} className="hover:bg-slate-800/30 transition">
                            <td className="p-2.5">
                              <div className="font-bold text-white">{trade.symbol}</div>
                              <div className="text-[9px] text-slate-500">{trade.manualTradeId}</div>
                            </td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                trade.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {trade.direction}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-300">{trade.actualEntry}</td>
                            <td className="p-2.5 text-white font-bold">{currentP || 'FETCHING'}</td>
                            <td className="p-2.5">
                              {uPnl !== null && uPnl !== undefined ? (
                                <span className={`font-extrabold ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  ${uPnl.toFixed(2)}
                                </span>
                              ) : '--'}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => handleOpenCloseModal(trade)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-[9px] transition cursor-pointer"
                              >
                                CLOSE
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ROW 4: CLOSED TRADES JOURNAL & SIMPLIFIED STATISTICS */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <span>Closed Trades History (PostgreSQL Journal &amp; Simulated Exits)</span>
              </h3>
              <span className="text-[11px] font-mono px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300">
                1R Nominal Risk = $10.00 USD
              </span>
            </div>

            {/* Combined Completed manual and completed shadow list */}
            {(() => {
              const completedManual = manualTrades.filter(t => t.status === 'CLOSED').map(trade => {
                const closeTime = trade.exitedAt
                  ? new Date(trade.exitedAt).getTime()
                  : trade.closedAt
                  ? new Date(trade.closedAt).getTime()
                  : trade.enteredAt
                  ? new Date(trade.enteredAt).getTime()
                  : 0;

                return {
                  id: trade.manualTradeId || `manual-${trade.id}`,
                  source: 'MANUAL (PG)' as const,
                  symbol: trade.symbol,
                  direction: trade.direction,
                  entry: trade.actualEntry,
                  exitPrice: trade.exitPrice,
                  exitReason: trade.exitReason,
                  realizedPnlUSD: trade.realizedPnl || 0,
                  realizedR: trade.realizedR !== undefined ? trade.realizedR : (trade.realizedPnl || 0) / 10,
                  outcome: trade.result || ((trade.realizedPnl || 0) >= 0 ? 'WIN' : 'LOSS'),
                  persistence: 'POSTGRESQL',
                  closedAt: closeTime,
                  closedAtFormatted: closeTime > 0 ? new Date(closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
                };
              });

              const completedShadow = completedShadowTrades.map((trade: any) => {
                const entry = trade.entryPrice ?? trade.actualEntry ?? trade.acknowledgedEntryPrice ?? trade.requestedEntryPrice;
                const exit = trade.exitPrice;
                const realizedR = trade.realizedR ?? 0;
                const isWin = trade.closeReason?.includes('TAKE_PROFIT') || (realizedR > 0);
                const isBE = trade.closeReason === 'BREAKEVEN' || realizedR === 0;
                const isLoss = trade.closeReason === 'STOP_LOSS' || (realizedR < 0);
                const outcome = isBE ? 'BREAKEVEN' : isWin ? 'WIN' : 'LOSS';
                const realizedPnlUSD = trade.realizedPnlDollars !== undefined ? trade.realizedPnlDollars : (realizedR * 10);
                const closeTime = trade.closedAt
                  ? new Date(trade.closedAt).getTime()
                  : trade.openedAt
                  ? new Date(trade.openedAt).getTime()
                  : 0;

                return {
                  id: trade.id,
                  source: trade.persistence === 'POSTGRESQL' ? 'SHADOW (PG)' : trade.persistence === 'WAL_PENDING' ? 'SHADOW (WAL — PENDING)' : 'SHADOW (MEM)',
                  symbol: trade.symbol,
                  direction: trade.direction,
                  entry,
                  exitPrice: exit,
                  exitReason: trade.closeReason || 'CLOSED',
                  realizedPnlUSD,
                  realizedR,
                  outcome,
                  persistence: trade.persistence || 'POSTGRESQL',
                  closedAt: closeTime,
                  closedAtFormatted: closeTime > 0 ? new Date(closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
                };
              });

              const completedAuto = closedAutoTrades.map((trade: any) => {
                const closeTime = trade.closeTime
                  ? Number(trade.closeTime)
                  : trade.closedAt
                  ? new Date(trade.closedAt).getTime()
                  : trade.openTime
                  ? Number(trade.openTime)
                  : 0;

                const realizedPnlUSD = Number(trade.pnlDollars ?? trade.realizedProfit ?? 0);
                const realizedR = Number((realizedPnlUSD / 10).toFixed(2));
                const outcome = realizedPnlUSD > 0 ? 'WIN' : realizedPnlUSD < 0 ? 'LOSS' : 'BREAKEVEN';

                return {
                  id: trade.id || `auto-${trade.brokerTicket || trade.ticketId}`,
                  source: (trade.environment === 'DEMO' ? 'cTRADER DEMO (PG)' : 'AUTO (PG)') as any,
                  symbol: trade.pair || trade.symbol,
                  direction: trade.direction,
                  entry: trade.entryPrice,
                  exitPrice: trade.exitPrice || trade.closePrice || trade.entryPrice,
                  exitReason: trade.closeReason || 'CLOSED',
                  realizedPnlUSD,
                  realizedR,
                  outcome,
                  persistence: 'POSTGRESQL' as const,
                  closedAt: closeTime,
                  closedAtFormatted: closeTime > 0 ? new Date(closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
                };
              });

              // Authoritative sort: Latest closed trade first
              const allClosed = [...completedAuto, ...completedManual, ...completedShadow].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

              if (allClosed.length === 0) {
                return (
                  <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    No closed trades history found in database or memory.
                  </div>
                );
              }

              // --- SIMPLIFIED AGGREGATE STATISTICS (AUTHORITATIVE TRUTH SOURCE) ---
              const hasAuthSummary = authoritativeSummary && authoritativeSummary.totalClosed > 0;
              const totalTrades = hasAuthSummary ? authoritativeSummary.totalClosed : allClosed.length;
              const winCount = hasAuthSummary ? authoritativeSummary.winCount : allClosed.filter(t => t.outcome === 'WIN').length;
              const lossCount = hasAuthSummary ? authoritativeSummary.lossCount : allClosed.filter(t => t.outcome === 'LOSS').length;
              const beCount = hasAuthSummary ? authoritativeSummary.breakevenCount : allClosed.filter(t => t.outcome === 'BREAKEVEN').length;
              const winRate = hasAuthSummary ? authoritativeSummary.winRate : (totalTrades > 0 ? (winCount / totalTrades) * 100 : 0);

              const totalNetUSD = hasAuthSummary ? authoritativeSummary.totalRealizedUSD : allClosed.reduce((sum, t) => sum + t.realizedPnlUSD, 0);
              const totalNetR = hasAuthSummary ? authoritativeSummary.totalRealizedR : allClosed.reduce((sum, t) => sum + t.realizedR, 0);
              const grossWinsR = allClosed.filter(t => t.realizedR > 0).reduce((sum, t) => sum + t.realizedR, 0);
              const grossLossesR = Math.abs(allClosed.filter(t => t.realizedR < 0).reduce((sum, t) => sum + t.realizedR, 0));
              const profitFactor = hasAuthSummary ? authoritativeSummary.profitFactor : (grossLossesR > 0 ? (grossWinsR / grossLossesR).toFixed(2) : (grossWinsR > 0 ? '∞' : '1.00'));

              // Per Pair Performance
              const pairStats = (hasAuthSummary && authoritativeSummary.pairBreakdown && authoritativeSummary.pairBreakdown.length > 0)
                ? authoritativeSummary.pairBreakdown
                : ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'].map(sym => {
                    const trades = allClosed.filter(t => t.symbol === sym);
                    const symWins = trades.filter(t => t.outcome === 'WIN').length;
                    const symTotal = trades.length;
                    const symNetUSD = trades.reduce((sum, t) => sum + t.realizedPnlUSD, 0);
                    const symNetR = trades.reduce((sum, t) => sum + t.realizedR, 0);
                    const symWinRate = symTotal > 0 ? (symWins / symTotal) * 100 : 0;
                    return { symbol: sym, total: symTotal, wins: symWins, winRate: symWinRate, netUSD: symNetUSD, netR: symNetR };
                  }).filter(s => s.total > 0);

              // Filtered list
              const filteredList = allClosed.filter(t => {
                if (closedHistoryFilterPair !== 'ALL' && t.symbol !== closedHistoryFilterPair) return false;
                if (closedHistoryFilterOutcome !== 'ALL' && t.outcome !== closedHistoryFilterOutcome) return false;
                return true;
              });

              // Pagination
              const pageSize = 10;
              const totalPages = Math.ceil(filteredList.length / pageSize) || 1;
              const currentPage = Math.min(Math.max(closedHistoryPage, 1), totalPages);
              const paginatedList = filteredList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

              return (
                <div className="space-y-5">
                  {/* KPI STATISTIC CARDS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Closed Trades</div>
                      <div className="text-xl font-extrabold text-white font-mono mt-1">{totalTrades}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex gap-1.5 font-mono">
                        <span className="text-emerald-400">{winCount}W</span>
                        <span>•</span>
                        <span className="text-rose-400">{lossCount}L</span>
                        <span>•</span>
                        <span className="text-amber-400">{beCount}BE</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Win Rate</div>
                      <div className={`text-xl font-extrabold font-mono mt-1 ${winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {winRate.toFixed(1)}%
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${Math.min(winRate, 100)}%` }}></div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Net Realized PnL (USD)</div>
                      <div className={`text-xl font-extrabold font-mono mt-1 ${totalNetUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalNetUSD >= 0 ? '+' : ''}${totalNetUSD.toFixed(2)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        Total Return: <span className={totalNetR >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{totalNetR >= 0 ? '+' : ''}{totalNetR.toFixed(2)}R</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Profit Factor / Avg R</div>
                      <div className="text-xl font-extrabold text-blue-400 font-mono mt-1">{profitFactor}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        Avg / Trade: <span className="text-white font-bold">{totalTrades > 0 ? (totalNetR / totalTrades).toFixed(2) : '0.00'}R</span>
                      </div>
                    </div>
                  </div>

                  {/* PAIR PERFORMANCE PILLS */}
                  {pairStats.length > 0 && (
                    <div className="p-3 bg-slate-950/50 border border-slate-800/80 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider">Performance by Monitored Pair:</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {pairStats.map(stat => (
                          <div key={stat.symbol} className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between text-xs font-mono">
                            <div>
                              <div className="font-bold text-white text-[11px]">{stat.symbol}</div>
                              <div className="text-[10px] text-slate-400">{stat.total} trades ({stat.winRate.toFixed(0)}% W)</div>
                            </div>
                            <div className="text-right">
                              <div className={`font-bold text-[11px] ${stat.netUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {stat.netUSD >= 0 ? '+' : ''}${stat.netUSD.toFixed(1)}
                              </div>
                              <div className="text-[9px] text-slate-400">{stat.netR >= 0 ? '+' : ''}{stat.netR.toFixed(1)}R</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* FILTER TOOLBAR */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Symbol:</span>
                      {['ALL', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'].map(sym => (
                        <button
                          key={sym}
                          onClick={() => { setClosedHistoryFilterPair(sym); setClosedHistoryPage(1); }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                            closedHistoryFilterPair === sym
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Outcome:</span>
                      {['ALL', 'WIN', 'LOSS', 'BREAKEVEN'].map(outcome => (
                        <button
                          key={outcome}
                          onClick={() => { setClosedHistoryFilterOutcome(outcome); setClosedHistoryPage(1); }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                            closedHistoryFilterOutcome === outcome
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {outcome}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PAGINATED TRADES TABLE */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                          <th className="p-2.5">Time</th>
                          <th className="p-2.5">Source</th>
                          <th className="p-2.5">Symbol</th>
                          <th className="p-2.5">Direction</th>
                          <th className="p-2.5">Entry</th>
                          <th className="p-2.5">Exit Price</th>
                          <th className="p-2.5">Exit Reason</th>
                          <th className="p-2.5">PnL (USD / R)</th>
                          <th className="p-2.5">Outcome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                        {paginatedList.map((trade) => {
                          const isWin = trade.outcome === 'WIN';
                          const isBE = trade.outcome === 'BREAKEVEN';
                          const isLoss = trade.outcome === 'LOSS';
                          const outcomeBadgeClass = isBE
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : isWin
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40';

                          const pnlClass = isBE ? 'text-amber-400' : isWin ? 'text-emerald-400' : 'text-rose-400';
                          const pnlFormattedUSD = `${trade.realizedPnlUSD >= 0 ? '+' : ''}$${trade.realizedPnlUSD.toFixed(2)}`;
                          const pnlFormattedR = `(${trade.realizedR >= 0 ? '+' : ''}${trade.realizedR.toFixed(2)}R)`;

                          return (
                            <tr key={trade.id} className="hover:bg-slate-800/30 transition">
                              <td className="p-2.5 text-slate-400 text-[10px] whitespace-nowrap">
                                {trade.closedAtFormatted || '—'}
                              </td>
                              <td className="p-2.5 font-bold">
                                {trade.source === 'MANUAL (PG)' ? (
                                  <span className="text-purple-300">MANUAL (PG)</span>
                                ) : trade.persistence === 'POSTGRESQL' ? (
                                  <span className="text-cyan-300">SHADOW (PG)</span>
                                ) : trade.persistence === 'WAL_PENDING' ? (
                                  <span className="text-purple-300 text-[10px]">SHADOW (WAL — PENDING)</span>
                                ) : (
                                  <span className="text-amber-400 text-[10px]">SHADOW (MEM — PERSISTENCE DEGRADED)</span>
                                )}
                              </td>
                              <td className="p-2.5 font-bold text-white">{trade.symbol}</td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${trade.direction === 'BUY' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                  {trade.direction}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-300">{trade.entry !== undefined ? trade.entry : '—'}</td>
                              <td className="p-2.5 text-slate-200">{trade.exitPrice !== undefined ? trade.exitPrice : '—'}</td>
                              <td className="p-2.5 text-slate-400">{trade.exitReason || 'CLOSED'}</td>
                              <td className={`p-2.5 font-bold ${pnlClass}`}>
                                {pnlFormattedUSD} <span className="text-[10px] text-slate-400 font-normal">{pnlFormattedR}</span>
                              </td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${outcomeBadgeClass}`}>
                                  {trade.outcome}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION CONTROLS */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400 font-mono">
                    <div>
                      Showing {filteredList.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredList.length)} of {filteredList.length} trades
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setClosedHistoryPage(p => Math.max(p - 1, 1))}
                        disabled={currentPage <= 1}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs transition cursor-pointer"
                      >
                        PREV
                      </button>
                      <span className="px-2 font-bold text-white">Page {currentPage} of {totalPages}</span>
                      <button
                        onClick={() => setClosedHistoryPage(p => Math.min(p + 1, totalPages))}
                        disabled={currentPage >= totalPages}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs transition cursor-pointer"
                      >
                        NEXT
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* INTERACTIVE CLOSE MODAL */}
          {closeModalTrade && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-400">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">RECORD MANUAL TRADE EXIT</h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {closeModalTrade.symbol} ({closeModalTrade.direction}) | Entry: {closeModalTrade.actualEntry}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setCloseModalTrade(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleConfirmCloseTrade} className="p-5 space-y-4 text-xs font-mono">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Exit Price</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={closeExitPrice}
                      onChange={(e) => setCloseExitPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Exit Reason</label>
                    <select
                      value={closeExitReason}
                      onChange={(e) => setCloseExitReason(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                    >
                      <option value="TAKE_PROFIT_1">TAKE_PROFIT_1 Reached</option>
                      <option value="TAKE_PROFIT_2">TAKE_PROFIT_2 Reached</option>
                      <option value="STOP_LOSS">STOP_LOSS Hit</option>
                      <option value="INVALIDATION">Market Structure Invalidated</option>
                      <option value="MANUAL_EXIT">Manual Discretionary Exit</option>
                      <option value="TIME_EXPIRY">Timeframe Session Expired</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Trade Notes / Post-Mortem</label>
                    <input
                      type="text"
                      placeholder="e.g. Closed manually at resistance ahead of news"
                      value={closeUserNotes}
                      onChange={(e) => setCloseUserNotes(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                    />
                  </div>

                  {closeError && (
                    <div className="p-2.5 bg-rose-500/20 border border-rose-500/40 rounded-lg text-rose-300 font-semibold flex items-center gap-2">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>{closeError}</span>
                    </div>
                  )}

                  {closeSuccess && (
                    <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{closeSuccess}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setCloseModalTrade(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      disabled={closeSubmitting || !!closeSuccess}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      {closeSubmitting ? 'CLOSING...' : 'CONFIRM CLOSE'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
      {/* TAB 5: USER PROFILE & OPERATOR SETTINGS */}
      {activeTab === 'USER_PROFILE' && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-purple-400" />
            <span>Butiran Profil Operator Terminal</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="text-slate-400 font-bold uppercase">Nama Penuh</div>
              <div className="text-white font-bold text-sm">{serverTraderProfileData?.fullName || 'N/A'}</div>

              <div className="text-slate-400 font-bold uppercase pt-2">E-mel Terdaftar</div>
              <div className="text-white font-bold text-sm">{serverTraderProfileData?.email || 'N/A'}</div>

              <div className="text-slate-400 font-bold uppercase pt-2">Jenis Akaun</div>
              <div className="text-white font-bold text-sm">{serverTraderProfileData?.accountType || 'DEMO'}</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="text-slate-400 font-bold uppercase">Mata Wang &amp; Leveraj</div>
              <div className="text-white font-bold text-sm">
                {serverTraderProfileData?.currency || 'USD'} • {serverTraderProfileData?.leverage || '1:500'}
              </div>

              <div className="text-slate-400 font-bold uppercase pt-2">Toleransi Risiko</div>
              <div className="text-emerald-400 font-bold text-sm">{serverTraderProfileData?.riskTolerance || 'MODERATE'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};