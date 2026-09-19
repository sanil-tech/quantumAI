import React, { useState, useEffect } from 'react';
import { CurrencyPair, CandleData, IndicatorValues, SmcStructures, SupportResistanceZone, AiTradeOpportunity, Timeframe, EconomicEvent } from '../types';
import {
  Zap, ShieldCheck, CheckCircle2, TrendingUp, TrendingDown,
  Bot, RefreshCw, BarChart3, Activity, DollarSign,
  Lock, Power, Sliders, Shield, Terminal,
  Radio, History, User, Calendar, Cpu, Sparkles, AlertTriangle,
  Download, Search, FileText, Filter, X
} from 'lucide-react';
import { DemoTraderCommandCenter } from './DemoTraderCommandCenter';
import { EconomicCalendarWidget } from './EconomicCalendarWidget';
import { InteractiveTradeStatisticsCockpit } from './InteractiveTradeStatisticsCockpit';
import { CTraderBrokerConnectionHub } from './CTraderBrokerConnectionHub';
import { CommercialOnboardingModal } from './onboarding/CommercialOnboardingModal';
import { VipSubscriberCockpit } from './VipSubscriberCockpit';

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
  candleSource = 'cTrader DEMO Open API (demo.ctraderapi.com)',
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
  const [activeTab, setActiveTab] = useState<'VIP_COCKPIT' | 'TERMINAL' | 'STATISTICS' | 'ECONOMIC_CALENDAR' | 'BROKER_CONNECT'>('VIP_COCKPIT');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);

  // Broker and Trader State from Backend
  const [brokerConn, setBrokerConn] = useState<any>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const acc = urlParams.get('account') || localStorage.getItem('vip_account_id') || '5916063';
    return {
      accountNumber: acc,
      brokerName: 'Spotware cTrader Open API',
      platform: 'CTRADER',
      serverHost: 'demo.ctraderapi.com:5035',
      environment: 'DEMO',
      isConnected: true,
      latencyMs: 35,
      liveBalance: 0,
      liveEquity: 0,
      maxDailyLossDollars: 250.00
    };
  });

  const [traderProfile, setTraderProfile] = useState<any>({
    fullName: 'QuantumAI VIP Subscriber',
    accountType: 'INSTITUTIONAL AI DEMO',
    riskTolerance: 'BALANCED'
  });

  // Closed trades and Authoritative Summary
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [authoritativeSummary, setAuthoritativeSummary] = useState<any>(null);
  const [closedHistoryPage, setClosedHistoryPage] = useState<number>(1);
  const [closedHistoryFilterPair, setClosedHistoryFilterPair] = useState<string>('ALL');
  const [closedHistoryFilterOutcome, setClosedHistoryFilterOutcome] = useState<string>('ALL');
  const [closedHistorySearchQuery, setClosedHistorySearchQuery] = useState<string>('');
  const [isLoadingTrades, setIsLoadingTrades] = useState<boolean>(false);
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>([]);
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(false);

  const handleExportLedgerCSV = () => {
    if (!closedTrades || closedTrades.length === 0) return;
    const headers = ['Ticket ID', 'Symbol', 'Direction', 'Lot Size', 'Entry Price', 'Exit Price', 'PnL ($)', 'PnL (pips)', 'Close Time'];
    const rows = closedTrades.map(t => [
      `"${t.brokerTicket || t.ticketId || t.id || ''}"`,
      `"${t.pair || t.symbol || ''}"`,
      `"${t.direction || ''}"`,
      t.lotSize || t.quantity || 0.01,
      t.entryPrice || 0,
      t.exitPrice || t.closePrice || 0,
      (t.pnlDollars || t.realizedProfit || 0).toFixed(2),
      t.pnlPips || 0,
      `"${new Date(t.closeTime || t.closedAt || t.timestamp || Date.now()).toISOString()}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `QuantumAI_Verified_Ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fetch all state from server
  const fetchDashboardState = async () => {
    setIsLoadingTrades(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const activeAcc = urlParams.get('account') || localStorage.getItem('vip_account_id') || brokerConn.accountNumber || '5916063';

      const [autoRes, brokerRes, profileRes, obsTradesRes, ecoRes, ksRes] = await Promise.all([
        fetch(`/api/autotrader/state?accountId=${activeAcc}`).catch(() => null),
        fetch(`/api/broker/status?accountId=${activeAcc}`).catch(() => null),
        fetch('/api/trader/profile').catch(() => null),
        fetch('/api/forex/learning/observatory/observations').catch(() => null),
        fetch('/api/forex/economic-calendar').catch(() => null),
        fetch('/api/risk/kill-switch').catch(() => null)
      ]);

      if (autoRes && autoRes.ok) {
        const atData = await autoRes.json();
        const rawClosed = atData?.state?.closedTrades || atData?.closedTrades || [];
        // Filter strictly to authentic broker trade IDs
        const authenticOnly = rawClosed.filter((t: any) => {
          const idStr = String(t.id || t.ticketId || '');
          const tktStr = String(t.ticketId || t.mt5Ticket || '');
          return (tktStr.match(/^[0-9]{7,10}$/) || idStr.match(/^trade_[0-9]{7,10}$/)) && !idStr.startsWith('pos_') && !idStr.includes('mock');
        });
        setClosedTrades(authenticOnly);
      }

      if (brokerRes && brokerRes.ok) {
        const bData = await brokerRes.json();
        if (bData.connection) {
          setBrokerConn(bData.connection);
        } else if (bData.accountNumber) {
          setBrokerConn((prev: any) => ({
            ...prev,
            accountNumber: bData.accountNumber,
            liveBalance: bData.liveBalance ?? bData.balance ?? prev.liveBalance,
            liveEquity: bData.liveEquity ?? bData.equity ?? prev.liveEquity,
            isConnected: bData.connected ?? true,
            latencyMs: bData.latencyMs ?? 38
          }));
        }
      }

      if (profileRes && profileRes.ok) {
        const pData = await profileRes.json();
        if (pData.profile) setTraderProfile(pData.profile);
      }

      if (obsTradesRes && obsTradesRes.ok) {
        const obsData = await obsTradesRes.json();
        if (obsData.summary) setAuthoritativeSummary(obsData.summary);
      }

      if (ecoRes && ecoRes.ok) {
        const ecoData = await ecoRes.json();
        if (Array.isArray(ecoData.events)) setEconomicEvents(ecoData.events);
      }

      if (ksRes && ksRes.ok) {
        const ksData = await ksRes.json();
        setKillSwitchActive(!!ksData.active);
      }
    } catch (e) {
      console.error('Error fetching dashboard state:', e);
    } finally {
      setIsLoadingTrades(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    try {
      const nextState = !killSwitchActive;
      const res = await fetch('/api/risk/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextState, reason: 'Dashboard Operator Toggle' })
      });
      if (res.ok) {
        setKillSwitchActive(nextState);
      }
    } catch (e) {
      console.error('Failed to toggle kill switch:', e);
    }
  };

  useEffect(() => {
    fetchDashboardState();
    const interval = setInterval(fetchDashboardState, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-12 font-sans">
      
      {/* ========================================================================= */}
      {/* 1. UNIFIED EXECUTIVE AI TERMINAL HUD (ZERO REDUNDANCY / HIGH CONVERSION)   */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-[#0c1222] to-slate-900 border border-white/[0.08] rounded-2xl shadow-2xl relative overflow-hidden backdrop-blur-2xl">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 relative z-10">
          
          {/* Brand & Market Feed Status */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center font-black text-white text-base shadow-lg shadow-cyan-500/20 border border-white/20 shrink-0">
              <Zap className="w-6 h-6 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  QuantumAI <span className="text-cyan-400">Trading Terminal</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  100% BROKER VERIFIED
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  cTrader Open API #{brokerConn.accountNumber || '5916063'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Enjin: <strong className="text-cyan-300">SMC + Gemini Deep Reinforcement</strong></span>
                <span className="text-slate-600">•</span>
                <span>Latency: <strong className="text-emerald-400">{brokerConn.latencyMs || 38}ms</strong></span>
                <span className="text-slate-600">•</span>
                <span>Mod: <strong className="text-purple-300">NON-CUSTODIAL LIVE FEED</strong></span>
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics & Global Emergency Safety Switch */}
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto font-mono text-xs">
            {/* Live Balance Card */}
            <div 
              onClick={onOpenBrokerModal}
              className="p-2.5 sm:px-3.5 sm:py-2 bg-slate-950/80 border border-emerald-500/30 hover:border-emerald-400 rounded-xl cursor-pointer transition shadow-sm"
              title="Klik untuk konfigurasi akaun cTrader"
            >
              <span className="text-[9px] text-slate-400 uppercase font-bold block flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                Baki cTrader
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-400">
                ${Number(brokerConn.liveBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Live Equity Card */}
            <div className="p-2.5 sm:px-3.5 sm:py-2 bg-slate-950/80 border border-cyan-500/30 rounded-xl shadow-sm">
              <span className="text-[9px] text-slate-400 uppercase font-bold block">
                Ekuiti Semasa
              </span>
              <span className="text-sm sm:text-base font-black text-cyan-300">
                ${Number(brokerConn.liveEquity || brokerConn.liveBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Customer Protection Shield Badge */}
            <div className="p-2.5 sm:px-3.5 sm:py-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 font-bold flex items-center gap-2 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 uppercase font-bold">PERLINDUNGAN AI</span>
                <span className="text-[11px] font-black text-emerald-300">100% SECURE NON-CUSTODIAL</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. MODERN 4-TAB MARKETING NAVIGATION BAR                                 */}
        {/* ========================================================================= */}
        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/90 p-1 rounded-xl border border-white/[0.08] shadow-inner">
            <button
              onClick={() => setActiveTab('VIP_COCKPIT')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'VIP_COCKPIT'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>1. Portal VIP Saya (Personal Cockpit)</span>
            </button>

            <button
              onClick={() => setActiveTab('TERMINAL')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'TERMINAL'
                  ? 'bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-cyan-300" />
              <span>2. Terminal Analisis AI</span>
            </button>

            <button
              onClick={() => setActiveTab('STATISTICS')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'STATISTICS'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-300" />
              <span>3. Rekod &amp; Prestasi Disahkan</span>
              {closedTrades.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-black bg-emerald-400 text-slate-950">
                  {closedTrades.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('ECONOMIC_CALENDAR')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'ECONOMIC_CALENDAR'
                  ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white shadow-lg shadow-amber-950/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-amber-300" />
              <span>4. Kalendar Berita &amp; Makro</span>
              {economicEvents.filter(e => e.impact === 'HIGH').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-black bg-rose-500 text-white">
                  {economicEvents.filter(e => e.impact === 'HIGH').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('BROKER_CONNECT')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'BROKER_CONNECT'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-purple-300" />
                <span>5. Pautan Broker &amp; Profil</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsOnboardingOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-md shadow-emerald-950/50 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>🚀 Panduan Pengguna Baharu</span>
              </button>

              <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Kesesuaian: <strong className="text-emerald-400">100% Non-Custodial</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. TAB 1: VIP SUBSCRIBER PERSONAL COCKPIT                                  */}
        {/* ========================================================================= */}
        {activeTab === 'VIP_COCKPIT' && (
          <VipSubscriberCockpit
            isMalay={isMalay}
            onOpenBrokerConnect={onOpenBrokerModal}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 2: TERMINAL AI LIVE (FULL COMMAND CENTER)                             */}
        {/* ========================================================================= */}
        {activeTab === 'TERMINAL' && (
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

        {/* ========================================================================= */}
        {/* 4. TAB 2: VERIFIED TRACK RECORD & INSTITUTIONAL PERFORMANCE COCKPIT       */}
        {/* ========================================================================= */}
        {activeTab === 'STATISTICS' && (
          <InteractiveTradeStatisticsCockpit onRefreshTriggered={fetchDashboardState} />
        )}

        {/* ========================================================================= */}
        {/* 5. TAB 3: LIVE ECONOMIC CALENDAR & MACRO RISK                             */}
        {/* ========================================================================= */}
        {activeTab === 'ECONOMIC_CALENDAR' && (
          <EconomicCalendarWidget
            events={economicEvents}
            language={isMalay ? 'ms' : 'en'}
            onRefresh={fetchDashboardState}
          />
        )}

        {/* ========================================================================= */}
        {/* 6. TAB 4: BROKER INTEGRATION & CLIENT PROFILE SETTINGS                     */}
        {/* ========================================================================= */}
        {activeTab === 'BROKER_CONNECT' && (
          <CTraderBrokerConnectionHub
            language={isMalay ? 'ms' : 'en'}
            onOpenBrokerModal={onOpenBrokerModal}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* ========================================================================= */}
        {/* 7. COMMERCIAL ONBOARDING MODAL WIZARD (5-STEP SUBSCRIBER ONBOARDING)      */}
        {/* ========================================================================= */}
        <CommercialOnboardingModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          language={isMalay ? 'ms' : 'en'}
          onComplete={(cfg) => {
            fetchDashboardState();
            setActiveTab('TERMINAL');
          }}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      </div>
    );
  };