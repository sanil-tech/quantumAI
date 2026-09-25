import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ShieldAlert, Zap, TrendingUp, TrendingDown,
  Activity, DollarSign, Lock, Power, Sliders, RefreshCw,
  AlertCircle, CheckCircle2, ChevronRight, BarChart3, Radio,
  Clock, Award, ArrowUpRight, ArrowDownRight, ExternalLink,
  SlidersHorizontal, Check, AlertTriangle, Play, Pause, XOctagon, Brain
} from 'lucide-react';
import { CurrencyPair } from '../types';

interface VipSubscriberCockpitProps {
  initialAccountId?: string;
  isMalay?: boolean;
  onOpenBrokerConnect?: () => void;
  onOpenAdaptiveLearning?: () => void;
}

interface SubscriberData {
  id: string;
  name: string;
  email: string;
  accountNumber: string;
  ctidTraderAccountId: number;
  environment: 'DEMO' | 'LIVE';
  brokerName: string;
  riskMode: 'CONSERVATIVE' | 'BALANCED' | 'PRO';
  riskPercent: number;
  status: 'ACTIVE' | 'PAUSED' | 'TRIAL' | 'EXPIRED';
  balance: number;
  equity: number;
  connected: boolean;
  latencyMs: number;
  totalCopiedTrades: number;
}

interface PerformanceData {
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  totalPnlDollars: number;
  totalPnlPips: number;
  profitFactor: number;
  totalTrades: number;
}

interface PositionData {
  positionId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  unrealizedProfit?: number;
  pnlPips?: number;
  status: 'OPEN' | 'CLOSED';
  openedAt?: string;
  setupId?: string;
  why_direction?: string;
}

export const VipSubscriberCockpit: React.FC<VipSubscriberCockpitProps> = ({
  initialAccountId = '5916063',
  isMalay = true,
  onOpenBrokerConnect,
  onOpenAdaptiveLearning
}) => {
  const [accountId, setAccountId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('account') || localStorage.getItem('vip_account_id') || initialAccountId;
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [subscriber, setSubscriber] = useState<SubscriberData | null>(null);
  const [accountSummary, setAccountSummary] = useState<any>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [openPositions, setOpenPositions] = useState<PositionData[]>([]);
  const [closedPositions, setClosedPositions] = useState<PositionData[]>([]);
  const [marketRadar, setMarketRadar] = useState<any>({ scannerActive: true, recentSetups: [] });
  const [isRiskModalOpen, setIsRiskModalOpen] = useState<boolean>(false);
  const [riskModeInput, setRiskModeInput] = useState<'CONSERVATIVE' | 'BALANCED' | 'PRO'>('BALANCED');
  const [riskPercentInput, setRiskPercentInput] = useState<number>(1.0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchCockpitData = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/subscriber/cockpit?accountId=${accountId}`);
      const data = await res.json();
      if (data && data.success) {
        setSubscriber(data.subscriber);
        setAccountSummary(data.accountSummary);
        setPerformance(data.performance);
        setOpenPositions(data.openPositions || []);
        setClosedPositions(data.closedPositions || []);
        setMarketRadar(data.marketRadar || { scannerActive: true, recentSetups: [] });
        if (data.subscriber) {
          setRiskModeInput(data.subscriber.riskMode || 'BALANCED');
          setRiskPercentInput(data.subscriber.riskPercent || 1.0);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch VIP cockpit data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchCockpitData();
    const interval = setInterval(fetchCockpitData, 5000);
    return () => clearInterval(interval);
  }, [fetchCockpitData]);

  const handleToggleCopy = async () => {
    const nextStatus = subscriber?.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      setActionLoading('toggle');
      const res = await fetch('/api/subscriber/toggle-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, status: nextStatus })
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', isMalay ? json.message : `Copy-trading ${nextStatus === 'ACTIVE' ? 'Activated' : 'Paused'}`);
        await fetchCockpitData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveRisk = async () => {
    try {
      setActionLoading('risk');
      const res = await fetch('/api/subscriber/risk-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, riskMode: riskModeInput, riskPercent: riskPercentInput })
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', isMalay ? 'Tetapan risiko berjaya disimpan!' : 'Risk settings saved!');
        setIsRiskModalOpen(false);
        await fetchCockpitData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEmergencyClose = async () => {
    if (!window.confirm(isMalay ? 'Adakah anda pasti mahu menutup SEMUA posisi aktif pada akaun anda?' : 'Are you sure you want to close ALL open positions on your account?')) {
      return;
    }
    try {
      setActionLoading('closeAll');
      const res = await fetch('/api/subscriber/emergency-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', json.message);
        await fetchCockpitData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseSinglePosition = async (positionId: string, symbol: string) => {
    if (!window.confirm(isMalay ? `Tutup posisi ${symbol} awal sekarang? Rekod sebenar akan disimpan ke akaun anda.` : `Close position ${symbol} early now? Real record will be logged to your account.`)) {
      return;
    }
    try {
      setActionLoading(`close_${positionId}`);
      const res = await fetch('/api/subscriber/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, positionId })
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', json.message);
        await fetchCockpitData();
      } else {
        showToast('error', json.message || 'Gagal menutup posisi.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3.5 rounded-2xl border flex items-center gap-3 shadow-2xl backdrop-blur-xl animate-fade-in ${
          toastMessage.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200' : 'bg-red-950/90 border-red-500/60 text-red-200'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
          <span className="text-sm font-semibold">{toastMessage.text}</span>
        </div>
      )}

      {/* Header VIP Hero Cockpit */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900 via-[#0e1628] to-emerald-950/40 border border-emerald-500/25 p-5 sm:p-7 lg:p-8 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
              <span className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-black uppercase tracking-wider rounded-full flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                VIP CLIENT PORTAL
              </span>
              <span className="text-xs font-mono text-slate-300 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-white/[0.08]">
                Akaun: #{accountId}
              </span>
              <button
                onClick={() => {
                  const newAcc = prompt(isMalay ? 'Masukkan Nombor Akaun cTrader anda (cth: 5916063):' : 'Enter your cTrader Account Number (e.g. 5916063):', accountId);
                  if (newAcc && newAcc.trim()) {
                    const clean = newAcc.trim();
                    setAccountId(clean);
                    localStorage.setItem('vip_account_id', clean);
                    window.history.replaceState(null, '', `/?account=${clean}`);
                  }
                }}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer font-bold"
              >
                [{isMalay ? 'Tukar Akaun' : 'Switch Account'}]
              </button>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              {subscriber?.name || `VIP Trader #${accountId}`}
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
              {isMalay 
                ? 'Portal pelaksanaan peribadi. Semua data posisi dan ekuiti adalah terasing secara khusus bagi akaun cTrader anda.'
                : 'Isolated client execution portal. All positions and equity data are strictly scoped to your cTrader account.'}
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {onOpenBrokerConnect && (
              <button
                onClick={onOpenBrokerConnect}
                className="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-indigo-400" />
                <span>{isMalay ? 'Sambung cTrader' : 'Connect cTrader'}</span>
              </button>
            )}
            <button
              onClick={handleToggleCopy}
              disabled={actionLoading === 'toggle'}
              className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer ${
                subscriber?.status === 'ACTIVE'
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30'
              }`}
            >
              {subscriber?.status === 'ACTIVE' ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>{isMalay ? 'Jeda Salinan' : 'Pause Copying'}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>{isMalay ? 'Aktifkan Salinan' : 'Resume Copying'}</span>
                </>
              )}
            </button>

            {onOpenAdaptiveLearning && (
              <button
                onClick={onOpenAdaptiveLearning}
                className="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/40 flex items-center gap-2 transition-all shadow-lg shadow-cyan-950/60 cursor-pointer active:scale-95"
                title="Buka Enjin Pembelajaran Adaptif AI & Jalankan Ulangkaji Mingguan Base44"
              >
                <Brain className="w-4 h-4 text-cyan-300 animate-pulse" />
                <span>{isMalay ? '📚 Ulangkaji AI' : '📚 AI Review'}</span>
              </button>
            )}

            <button
              onClick={() => setIsRiskModalOpen(true)}
              className="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              <span>{isMalay ? 'Risiko' : 'Risk'}</span>
            </button>

            {openPositions.length > 0 && (
              <button
                onClick={handleEmergencyClose}
                disabled={actionLoading === 'closeAll'}
                className="px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 flex items-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <XOctagon className="w-4 h-4 text-rose-400" />
                <span>{isMalay ? 'Tutup Semua' : 'Close All'}</span>
              </button>
            )}

            <button
              onClick={fetchCockpitData}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
              title="Segarkan Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Account Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-7 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/70 rounded-2xl p-4 border border-white/[0.08] shadow-inner">
            <span className="text-[10px] text-slate-400 uppercase font-black block mb-1">
              {isMalay ? 'Baki Akaun (Balance)' : 'Live Balance'}
            </span>
            <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
              ${accountSummary?.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1.5 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Disahkan cTrader
            </span>
          </div>

          <div className="bg-slate-950/70 rounded-2xl p-4 border border-white/[0.08] shadow-inner">
            <span className="text-[10px] text-slate-400 uppercase font-black block mb-1">
              {isMalay ? 'Ekuiti Semasa (Equity)' : 'Live Equity'}
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-tight">
              ${accountSummary?.equity?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <span className="text-[11px] text-slate-400 mt-1.5 block font-mono">
              Floating: <strong className={accountSummary?.floatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{accountSummary?.floatingPnl >= 0 ? `+$${accountSummary?.floatingPnl}` : `-$${Math.abs(accountSummary?.floatingPnl || 0)}`}</strong>
            </span>
          </div>

          <div className="bg-slate-950/70 rounded-2xl p-4 border border-white/[0.08] shadow-inner">
            <span className="text-[10px] text-slate-400 uppercase font-black block mb-1">
              {isMalay ? 'Status Salinan AI' : 'AI Copier Status'}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${subscriber?.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-base sm:text-lg font-black text-white uppercase">
                {subscriber?.status || 'ACTIVE'}
              </span>
            </div>
            <span className="text-[11px] text-cyan-400 mt-1.5 block font-mono font-bold">
              Mod: {subscriber?.riskMode || 'BALANCED'} ({subscriber?.riskPercent || 1.0}%)
            </span>
          </div>

          <div className="bg-slate-950/70 rounded-2xl p-4 border border-white/[0.08] shadow-inner">
            <span className="text-[10px] text-slate-400 uppercase font-black block mb-1">
              {isMalay ? 'Sambungan Open API' : 'Open API 2.0'}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span className="text-base sm:text-lg font-black text-white">TERHUBUNG</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1.5 block font-mono">
              Latensi: <strong className="text-emerald-400">{subscriber?.latencyMs || 35}ms</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Live Positions & Personal Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: My Active Live Positions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/80 border border-white/[0.08] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    {isMalay ? 'Posisi Terbuka Akaun Saya' : 'My Live Open Positions'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isMalay ? 'Trade yang sedang aktif disalin pada akaun cTrader anda' : 'Currently active positions on your cTrader account'}
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-800 text-slate-200 border border-white/[0.08]">
                {openPositions.length} {isMalay ? 'Aktif' : 'Active'}
              </span>
            </div>

            {openPositions.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl bg-slate-950/50 border border-dashed border-slate-800">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-200">
                  {isMalay ? 'Tiada Posisi Terbuka Pada Akaun Anda' : 'No Open Positions On Your Account'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
                  {isMalay 
                    ? 'Sistem AI Scanner sedang memantau pasaran 24/7. Apabila setup berkualiti tinggi (CONFIRM ≥75% atau ADJUST ≥64%) dikesan, posisi akan disalin secara automatik.'
                    : 'The AI Scanner is observing the market 24/7. High probability setups will be automatically copied here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {openPositions.map((pos) => {
                  const isBuy = pos.direction === 'BUY';
                  return (
                    <div
                      key={pos.positionId}
                      className="p-4 rounded-2xl bg-slate-950/80 border border-white/[0.08] hover:border-cyan-500/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xs shadow-sm ${
                          isBuy ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}>
                          {pos.direction}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-base text-white">{pos.symbol}</span>
                            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 font-mono font-bold">
                              {pos.quantity} Lots
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            Entri: <span className="text-slate-200 font-bold">{pos.entryPrice}</span> | SL: <span className="text-rose-400 font-bold">{pos.stopLoss}</span> | TP: <span className="text-emerald-400 font-bold">{pos.takeProfit}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-right">
                          <div className={`text-base font-black font-mono ${(pos.unrealizedProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {(pos.unrealizedProfit || 0) >= 0 ? '+' : ''}${pos.unrealizedProfit || '0.00'}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {pos.pnlPips || 0} pips
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-xl text-xs font-black uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                          COPIED
                        </span>

                        <button
                          type="button"
                          onClick={() => handleCloseSinglePosition(pos.positionId, pos.symbol)}
                          disabled={actionLoading === `close_${pos.positionId}`}
                          className="px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 hover:border-rose-400 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                          title={isMalay ? "Tutup posisi ini awal mengikut harga pasaran sebenar" : "Close this position early at market price"}
                        >
                          {actionLoading === `close_${pos.positionId}` ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-300" />
                          ) : (
                            <XOctagon className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span>{isMalay ? 'Tutup' : 'Close'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Personal Performance History Ledger */}
          <div className="bg-slate-900/80 border border-white/[0.08] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    {isMalay ? 'Sejarah Prestasi Akaun Saya' : 'My Account Trade History'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isMalay ? 'Rekod trade yang telah selesai ditutup pada akaun anda' : 'Closed trade execution logs for your account'}
                  </p>
                </div>
              </div>
            </div>

            {closedPositions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                {isMalay ? 'Tiada sejarah trade tertutup ditemui untuk akaun ini.' : 'No closed trades recorded yet for this account.'}
              </div>
            ) : (
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-black">
                      <th className="pb-3 pl-2">Pair</th>
                      <th className="pb-3">Side</th>
                      <th className="pb-3">Lot</th>
                      <th className="pb-3">Entry</th>
                      <th className="pb-3">Exit</th>
                      <th className="pb-3 text-right pr-2">Profit (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {closedPositions.slice(0, 8).map((trade, idx) => {
                      const profitVal = trade.realizedProfit ?? trade.unrealizedProfit ?? 0;
                      const isProfit = profitVal >= 0;
                      const exitPrice = trade.closePrice || trade.currentPrice || trade.entryPrice;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 pl-2 font-bold text-white">{trade.symbol}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                              trade.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {trade.direction}
                            </span>
                          </td>
                          <td className="py-3 text-slate-300 font-bold">{trade.quantity}</td>
                          <td className="py-3 text-slate-400">{trade.entryPrice}</td>
                          <td className="py-3 text-slate-400">{exitPrice}</td>
                          <td className={`py-3 text-right pr-2 font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? `+$${Number(profitVal).toFixed(2)}` : `-$${Math.abs(Number(profitVal)).toFixed(2)}`}
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

        {/* Right 1 Col: Performance Metrics & AI Confluence Feed */}
        <div className="space-y-6">
          {/* Performance Card */}
          <div className="bg-slate-900/80 border border-white/[0.08] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl backdrop-blur-xl">
            <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <span>{isMalay ? 'Metrik Prestasi Peribadi' : 'Personal Performance Metrics'}</span>
            </h3>

            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/[0.08]">
                <div className="text-[10px] text-slate-400 font-black uppercase mb-1">{isMalay ? 'Kadar Kemenangan (Win Rate)' : 'Personal Win Rate'}</div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  {performance?.winRatePercent || 0}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  {performance?.winCount || 0} Win · {performance?.lossCount || 0} Loss
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/[0.08]">
                <div className="text-[10px] text-slate-400 font-black uppercase mb-1">{isMalay ? 'Jumlah Keuntungan Bersih' : 'Net Realized Profit'}</div>
                <div className={`text-2xl sm:text-3xl font-black font-mono ${(performance?.totalPnlDollars || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(performance?.totalPnlDollars || 0) >= 0 ? `+$${performance?.totalPnlDollars}` : `-$${Math.abs(performance?.totalPnlDollars || 0)}`}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Pips: {performance?.totalPnlPips || 0} pips
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/[0.08]">
                <div className="text-[10px] text-slate-400 font-black uppercase mb-1">{isMalay ? 'Faktor Keuntungan (Profit Factor)' : 'Profit Factor'}</div>
                <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                  {performance?.profitFactor || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Jumlah Trade: {performance?.totalTrades || 0}
                </div>
              </div>
            </div>
          </div>

          {/* AI Scanner Radar Context (Read-Only) */}
          <div className="bg-slate-900/80 border border-white/[0.08] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
                <span>{isMalay ? 'Radar Analisis AI' : 'AI Market Intelligence'}</span>
              </h3>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-black border border-emerald-500/30">
                24/7 ACTIVE
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              {isMalay
                ? 'AI memproses pasangan Forex & aset setiap minit menggunakan Smart Money Concepts (SMC) & zon Order Block institusi.'
                : 'AI scans Forex pairs & assets every minute utilizing Smart Money Concepts (SMC) & Institutional Order Blocks.'}
            </p>

            <div className="space-y-2.5">
              {(marketRadar?.recentSetups || []).slice(0, 3).map((s: any, idx: number) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/[0.08] text-xs">
                  <div className="flex items-center justify-between font-black">
                    <span className="text-white text-sm">{s.pair}</span>
                    <span className={`px-2 py-0.5 rounded-md font-mono ${s.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {s.direction} ({s.confidence}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {s.reasoning || s.educationalLesson || 'Confluence pengesahan volum institusi dan zon mitigasi SMC.'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Risk Settings Modal */}
      {isRiskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                {isMalay ? 'Konfigurasi Risiko Peribadi' : 'Personal Risk Configuration'}
              </h3>
              <button
                onClick={() => setIsRiskModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              {isMalay 
                ? 'Sesuaikan saiz risiko trade yang disalin ke akaun cTrader anda mengikut profil modal anda.'
                : 'Configure how copied trades scale according to your personal risk tolerance.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {isMalay ? 'Mod Profil Risiko' : 'Risk Profile Mode'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CONSERVATIVE', 'BALANCED', 'PRO'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setRiskModeInput(mode)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                        riskModeInput === mode
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/20'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {isMalay ? 'Peratus Risiko Setiap Posisi (%)' : 'Risk Percentage Per Trade (%)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="5.0"
                  value={riskPercentInput}
                  onChange={(e) => setRiskPercentInput(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Cadangan: 1.0% - 2.0% per trade untuk kawalan drawdown optimum.
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsRiskModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveRisk}
                disabled={actionLoading === 'risk'}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/25"
              >
                Simpan Tetapan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
