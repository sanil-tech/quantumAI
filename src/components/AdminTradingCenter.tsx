import React, { useState, useEffect } from 'react';
import {
  Database, Server, ShieldCheck, Activity, RefreshCw, Download, Filter,
  Search, CheckCircle, AlertTriangle, XCircle, ArrowUpRight, ArrowDownRight,
  Clock, Eye, Layers, DollarSign, BarChart3, Bot, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Award, BookOpen, Lock, Cpu, Zap, Target
} from 'lucide-react';

export interface AdminTradingCenterProps {
  isMalay?: boolean;
}

export const AdminTradingCenter: React.FC<AdminTradingCenterProps> = ({ isMalay = false }) => {
  const [activeTab, setActiveTab] = useState<'TRADES' | 'PERFORMANCE' | 'LEARNING' | 'HEALTH'>('TRADES');

  // Filters state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState('');
  const [strategy, setStrategy] = useState('');
  const [outcome, setOutcome] = useState('');
  const [status, setStatus] = useState('');
  const [environment, setEnvironment] = useState('');
  const [broker, setBroker] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Data states
  const [tradesData, setTradesData] = useState<{ trades: any[]; total: number; totalPages: number }>({
    trades: [],
    total: 0,
    totalPages: 1
  });
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);

  // Selected trade detail modal state
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [tradeDetail, setTradeDetail] = useState<{ position: any; events: any[]; postMortem: any } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Performance state
  const [perfData, setPerfData] = useState<any>(null);
  const [isLoadingPerf, setIsLoadingPerf] = useState(false);

  // Learning records state
  const [learningData, setLearningData] = useState<{ records: any[]; total: number }>({ records: [], total: 0 });
  const [isLoadingLearning, setIsLoadingLearning] = useState(false);

  // Data Health state
  const [healthData, setHealthData] = useState<any>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<any>(null);

  // Fetch Trades
  const fetchTrades = async () => {
    setIsLoadingTrades(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (accountId) params.append('accountId', accountId);
      if (symbol) params.append('symbol', symbol);
      if (direction) params.append('direction', direction);
      if (strategy) params.append('strategy', strategy);
      if (outcome) params.append('outcome', outcome);
      if (status) params.append('status', status);
      if (environment) params.append('environment', environment);
      if (broker) params.append('broker', broker);
      if (search) params.append('search', search);
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const res = await fetch(`/api/admin/trades?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setTradesData({
          trades: data.trades || [],
          total: data.total || 0,
          totalPages: data.totalPages || 1
        });
      }
    } catch (e) {
      console.error('Failed to fetch admin trades:', e);
    } finally {
      setIsLoadingTrades(false);
    }
  };

  // Fetch Trade Detail
  const fetchTradeDetail = async (tradeId: string) => {
    setSelectedTradeId(tradeId);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/trades/${tradeId}`);
      const data = await res.json();
      if (data.success) {
        setTradeDetail({
          position: data.position,
          events: data.events || [],
          postMortem: data.postMortem
        });
      }
    } catch (e) {
      console.error('Failed to fetch trade detail:', e);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Fetch Performance
  const fetchPerformance = async () => {
    setIsLoadingPerf(true);
    try {
      const res = await fetch('/api/admin/performance');
      const data = await res.json();
      if (data.success) {
        setPerfData(data);
      }
    } catch (e) {
      console.error('Failed to fetch admin performance:', e);
    } finally {
      setIsLoadingPerf(false);
    }
  };

  // Fetch Learning
  const fetchLearning = async () => {
    setIsLoadingLearning(true);
    try {
      const res = await fetch('/api/admin/learning');
      const data = await res.json();
      if (data.success) {
        setLearningData({
          records: data.learningRecords || [],
          total: data.total || 0
        });
      }
    } catch (e) {
      console.error('Failed to fetch admin learning records:', e);
    } finally {
      setIsLoadingLearning(false);
    }
  };

  // Fetch Health
  const fetchHealth = async () => {
    setIsLoadingHealth(true);
    try {
      const res = await fetch('/api/admin/health');
      const data = await res.json();
      if (data.success) {
        setHealthData(data);
      }
    } catch (e) {
      console.error('Failed to fetch data health:', e);
    } finally {
      setIsLoadingHealth(false);
    }
  };

  // Trigger Reconciliation
  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch('/api/admin/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: broker || 'CTRADER' })
      });
      const data = await res.json();
      setReconcileResult(data);
      fetchHealth();
      fetchTrades();
    } catch (e: any) {
      alert('Reconciliation error: ' + e.message);
    } finally {
      setIsReconciling(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (accountId) params.append('accountId', accountId);
    if (symbol) params.append('symbol', symbol);
    if (direction) params.append('direction', direction);
    if (strategy) params.append('strategy', strategy);
    if (status) params.append('status', status);
    if (environment) params.append('environment', environment);
    if (broker) params.append('broker', broker);
    if (search) params.append('search', search);

    window.open(`/api/admin/trades/export?${params.toString()}`, '_blank');
  };

  useEffect(() => {
    if (activeTab === 'TRADES') fetchTrades();
    if (activeTab === 'PERFORMANCE') fetchPerformance();
    if (activeTab === 'LEARNING') fetchLearning();
    if (activeTab === 'HEALTH') fetchHealth();
  }, [activeTab, page, limit]);

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      {/* Top Header & Tab Navigation */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-[10px] font-bold rounded-full uppercase">
              PHASE 3 DATA GOVERNANCE &amp; AUDIT
            </span>
            <span className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1">
              <Database className="w-3.5 h-3.5" />
              PostgreSQL Source of Truth
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
            Admin Trading Center &amp; Data Governance
          </h1>
          <p className="text-xs text-slate-400">
            Pusat kawalan pangkalan data awan, sejarah trade lengkap, jejak audit acara, &amp; pemantauan kesihatan data.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('TRADES')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'TRADES' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Rekod Trade</span>
          </button>
          <button
            onClick={() => setActiveTab('PERFORMANCE')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'PERFORMANCE' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Prestasi</span>
          </button>
          <button
            onClick={() => setActiveTab('LEARNING')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'LEARNING' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Pembelajaran AI</span>
          </button>
          <button
            onClick={() => setActiveTab('HEALTH')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'HEALTH' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Kesihatan Data</span>
          </button>
        </div>
      </div>

      {/* TAB 1: REKOD TRADE & FILTERS */}
      {activeTab === 'TRADES' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Filter className="w-4 h-4 text-purple-400" />
                <span>Carian &amp; Tapisan Pangkalan Data (PostgreSQL Filter)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchTrades}
                  disabled={isLoadingTrades}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg transition flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoadingTrades ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Eksport CSV</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              {/* Search */}
              <div className="col-span-2 sm:col-span-2">
                <label className="text-[10px] text-slate-400 font-mono uppercase">Carian Penuh (ID, Simbol, Broker, Strategi)</label>
                <div className="relative mt-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Trade ID / Symbol / Idempotency..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Symbol */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Pasangan</label>
                <select
                  value={symbol}
                  onChange={e => setSymbol(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Semua Pasangan</option>
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="GBP/USD">GBP/USD</option>
                  <option value="AUD/USD">AUD/USD</option>
                  <option value="USD/JPY">USD/JPY</option>
                  <option value="XAU/USD">XAU/USD</option>
                  <option value="BTC/USD">BTC/USD</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Status Trade</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Semua Status</option>
                  <option value="OPEN">OPEN (Aktif)</option>
                  <option value="CLOSED">CLOSED (Selesai)</option>
                </select>
              </div>

              {/* Direction */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Arah (BUY/SELL)</label>
                <select
                  value={direction}
                  onChange={e => setDirection(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Semua Arah</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              {/* Outcome */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Keputusan (Win/Loss)</label>
                <select
                  value={outcome}
                  onChange={e => setOutcome(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Semua Outcome</option>
                  <option value="WIN">WIN (Profit)</option>
                  <option value="LOSS">LOSS (Rugi)</option>
                </select>
              </div>

              {/* Environment */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Persekitaran</label>
                <select
                  value={environment}
                  onChange={e => setEnvironment(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Semua Persekitaran</option>
                  <option value="DEMO">DEMO</option>
                  <option value="LIVE">LIVE</option>
                </select>
              </div>

              {/* Broker */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Broker</label>
                <select
                  value={broker}
                  onChange={e => setBroker(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">Semua Broker</option>
                  <option value="CTRADER">cTrader FIX</option>
                  <option value="PAPER">Simulasi Paper</option>
                  <option value="MT5">MetaTrader 5</option>
                </select>
              </div>

              {/* Date Start */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Tarikh Mula</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Date End */}
              <div>
                <label className="text-[10px] text-slate-400 font-mono uppercase">Tarikh Tamat</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Apply Filter Button */}
              <div className="col-span-2 flex items-end gap-2">
                <button
                  onClick={() => { setPage(1); fetchTrades(); }}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs transition"
                >
                  Tapis Rekod
                </button>
                <button
                  onClick={() => {
                    setStartDate(''); setEndDate(''); setAccountId(''); setSymbol('');
                    setDirection(''); setStrategy(''); setOutcome(''); setStatus('');
                    setEnvironment(''); setBroker(''); setSearch(''); setPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Trades Table */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-mono font-bold text-slate-300">
                Menunjukkan {tradesData.trades.length} daripada {tradesData.total} Rekod Pangkalan Data
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Baris/Muka:</span>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="bg-slate-950 border border-slate-800 rounded text-xs text-white px-2 py-1"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {isLoadingTrades ? (
              <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                <p>Mengambil rekod trade langsung daripada PostgreSQL Cloud Database...</p>
              </div>
            ) : tradesData.trades.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-1">
                <p className="font-bold text-slate-300">Tiada Rekod Trade Ditemui</p>
                <p>Cuba laraskan parameter tapisan atau carian pangkalan data di atas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 text-[10px] uppercase tracking-wider">
                      <th className="p-3">Trade ID</th>
                      <th className="p-3">Broker / Env</th>
                      <th className="p-3">Simbol / TF</th>
                      <th className="p-3">Arah</th>
                      <th className="p-3">Volume</th>
                      <th className="p-3">Harga Entry</th>
                      <th className="p-3">Harga Exit / Semasa</th>
                      <th className="p-3">SL / TP</th>
                      <th className="p-3">PnL ($) / Pips</th>
                      <th className="p-3">Reconciliation</th>
                      <th className="p-3">Masa Dibuka</th>
                      <th className="p-3">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tradesData.trades.map((t: any) => {
                      const isWin = (t.realizedProfit ?? 0) >= 0;
                      const isOpen = t.status === 'OPEN';
                      return (
                        <tr key={t.positionId} className="hover:bg-slate-950/50 transition">
                          <td className="p-3 font-bold text-white text-[11px] font-mono">
                            <span className="text-purple-300">{t.positionId}</span>
                            {t.idempotencyKey && (
                              <div className="text-[9px] text-slate-500 truncate max-w-[100px]" title={t.idempotencyKey}>
                                {t.idempotencyKey}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="text-slate-200 font-bold">{t.broker || 'PAPER'}</span>
                            <div className="text-[9px] text-slate-500">{t.environment || 'DEMO'}</div>
                          </td>
                          <td className="p-3">
                            <span className="text-cyan-300 font-extrabold">{t.symbol}</span>
                            <span className="text-[9px] text-slate-500 ml-1">({t.timeframe || 'M15'})</span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {t.direction}
                            </span>
                          </td>
                          <td className="p-3 text-slate-200 font-bold">{t.quantity} Lot</td>
                          <td className="p-3 text-slate-300">{t.entryPrice}</td>
                          <td className="p-3 text-slate-300">{t.closePrice || t.currentPrice || '-'}</td>
                          <td className="p-3 text-[10px] text-slate-400">
                            <div>SL: {t.stopLoss || '-'}</div>
                            <div>TP: {t.takeProfit || '-'}</div>
                          </td>
                          <td className="p-3 font-bold">
                            {isOpen ? (
                              <span className="text-amber-300 font-mono">OPEN (${t.unrealizedProfit || 0})</span>
                            ) : (
                              <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                                {isWin ? '+' : ''}${t.realizedProfit} ({t.pnlPips} pips)
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              t.reconciliationStatus === 'MATCHED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {t.reconciliationStatus || 'MATCHED'}
                            </span>
                          </td>
                          <td className="p-3 text-[10px] text-slate-400">
                            {t.openedAt ? new Date(t.openedAt).toLocaleString('ms-MY') : '-'}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => fetchTradeDetail(t.positionId)}
                              className="px-2.5 py-1 bg-purple-950 border border-purple-500/40 hover:bg-purple-900 text-purple-300 text-[10px] font-bold rounded flex items-center gap-1 transition"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspec</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-xs text-slate-400">
                Halaman {page} daripada {tradesData.totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= tradesData.totalPages}
                  onClick={() => setPage(p => Math.min(tradesData.totalPages, p + 1))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PERFORMANCES */}
      {activeTab === 'PERFORMANCE' && (
        <div className="space-y-4">
          {isLoadingPerf ? (
            <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
              <p>Memuat naik metrik prestasi daripada PostgreSQL database...</p>
            </div>
          ) : perfData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div className="text-xs text-slate-400 uppercase font-bold">Jumlah Trade / Win Rate</div>
                  <div className="text-2xl font-black text-white mt-1">{perfData.totalTrades} Trade</div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-bold">{perfData.winCount} Wins</span>
                    <span className="text-rose-400 font-bold">{perfData.lossCount} Losses</span>
                    <span className="text-cyan-300 font-bold">{perfData.totalTrades > 0 && perfData.winRatePercent !== null ? perfData.winRatePercent + '% WR' : 'N/A WR'}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div className="text-xs text-slate-400 uppercase font-bold">Keuntungan Bersih (Net PnL)</div>
                  <div className={`text-2xl font-black mt-1 ${perfData.totalPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${perfData.totalPnlDollars}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Total Pips: <strong className="text-slate-200">{perfData.totalPnlPips} pips</strong></div>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div className="text-xs text-slate-400 uppercase font-bold">Profit Factor</div>
                  <div className="text-2xl font-black text-amber-300 mt-1">{perfData.profitFactor}x</div>
                  <div className="mt-2 text-[10px] text-slate-400">Nisbah Gross Profit / Gross Loss</div>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div className="text-xs text-slate-400 uppercase font-bold">Best / Worst Pair</div>
                  <div className="mt-1 text-xs font-bold">
                    <div className="text-emerald-400">Best: {perfData.bestPair?.pair} ({perfData.bestPair?.winRatePercent}%)</div>
                    <div className="text-purple-300">Worst: {perfData.worstPair?.pair} ({perfData.worstPair?.winRatePercent}%)</div>
                  </div>
                </div>
              </div>

              {/* Pair Performance Matrix Table */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <h3 className="font-extrabold text-white text-sm tracking-tight flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                  <span>Prestasi Mengikut Pasangan Mata Wang (PostgreSQL Aggregation)</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 text-[10px] uppercase">
                        <th className="p-3">Simbol</th>
                        <th className="p-3">Jumlah Trade</th>
                        <th className="p-3">Win Rate %</th>
                        <th className="p-3">Net PnL ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {perfData.pairPerformance?.map((p: any) => (
                        <tr key={p.symbol} className="hover:bg-slate-950/50">
                          <td className="p-3 font-bold text-cyan-300">{p.symbol}</td>
                          <td className="p-3 text-slate-200">{p.totalTrades}</td>
                          <td className="p-3 font-bold text-emerald-400">{p.winRatePercent}%</td>
                          <td className={`p-3 font-bold ${p.netPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ${p.netPnlDollars}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 3: ADAPTIVE LEARNING */}
      {activeTab === 'LEARNING' && (
        <div className="space-y-4">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-white text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span>Rekod Pembelajaran AI &amp; Post-Mortem Reviews (PostgreSQL Governance)</span>
              </h3>
              <span className="text-xs font-mono text-cyan-400 font-bold">{learningData.total} Rekod Tersimpan</span>
            </div>

            {isLoadingLearning ? (
              <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                <p>Mengambil rekod post-mortem pembelajaran AI daripada pangkalan data...</p>
              </div>
            ) : learningData.records.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-mono">
                Tiada rekod post-mortem ditemui dalam pangkalan data.
              </div>
            ) : (
              <div className="space-y-3">
                {learningData.records.map((r: any) => (
                  <div key={r.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300 font-mono">Trade: {r.tradeId}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString('ms-MY') : ''}
                      </span>
                    </div>
                    <div className="text-xs text-slate-200 font-mono">
                      <strong className="text-rose-400">Punca Utama (Root Cause):</strong> {r.rootCause}
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      <strong className="text-cyan-300">Syor Adaptasi Rule:</strong> {r.adaptiveActionRecommended || r.adaptiveRuleCreated}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: DATA HEALTH DIAGNOSTICS */}
      {activeTab === 'HEALTH' && (
        <div className="space-y-4">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <h3 className="font-extrabold text-white text-base">
                  Diagnosis Kesihatan Data &amp; Integriti Pangkalan Data
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunReconciliation}
                  disabled={isReconciling}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                  <span>Jalankan Rekonsiliasi Broker</span>
                </button>
              </div>
            </div>

            {isLoadingHealth ? (
              <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                <p>Menjalankan ujian integriti pangkalan data cloud...</p>
              </div>
            ) : healthData ? (
              <div className="space-y-4 font-mono">
                {reconcileResult && (
                  <div className="p-3 bg-amber-950/60 border border-amber-500/40 rounded-xl text-xs text-amber-200">
                    <strong>Keputusan Rekonsiliasi Broker:</strong> {reconcileResult.reconciledCount} trade disemak. ({reconcileResult.matchedCount} MATCHED, {reconcileResult.mismatchCount} MISMATCH)
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Sambungan PostgreSQL</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${healthData.dbConnection === 'HEALTHY' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                      <span className="text-lg font-black text-white">{healthData.dbConnection}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Status: {healthData.persistenceStatus}</div>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Tuisan Terakhir DB</div>
                    <div className="mt-1 text-sm font-black text-cyan-300">
                      {healthData.lastDatabaseWrite ? new Date(healthData.lastDatabaseWrite).toLocaleString('ms-MY') : 'N/A'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Terakhir dikemaskini dari acara/trade</div>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Jumlah Acara &amp; Rekod</div>
                    <div className="mt-1 text-sm font-black text-purple-300">
                      {healthData.totalTrades} Trade | {healthData.learningRecordsCount} Post-Mortem
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">{healthData.openPositions} Position Aktif</div>
                  </div>
                </div>

                {/* Anomalies Panel */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <h4 className="text-xs font-extrabold text-amber-400 uppercase flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Laporan Semakan Anomali Data (Data Health Anomalies)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">Trade Duplikat</div>
                      <div className={`text-base font-bold ${healthData.anomalies?.duplicateTradesCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {healthData.anomalies?.duplicateTradesCount || 0}
                      </div>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">Orphan Position</div>
                      <div className={`text-base font-bold ${healthData.anomalies?.orphanPositionsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {healthData.anomalies?.orphanPositionsCount || 0}
                      </div>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">Orphan Learning</div>
                      <div className={`text-base font-bold ${healthData.anomalies?.orphanLearningRecordsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {healthData.anomalies?.orphanLearningRecordsCount || 0}
                      </div>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">Missing Events</div>
                      <div className={`text-base font-bold ${healthData.anomalies?.missingTradeEventsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {healthData.anomalies?.missingTradeEventsCount || 0}
                      </div>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">Missing Broker ID</div>
                      <div className={`text-base font-bold ${healthData.anomalies?.missingBrokerIdsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {healthData.anomalies?.missingBrokerIdsCount || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TRADE DETAIL MODAL */}
      {selectedTradeId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 font-sans shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">INSPEKSI LENGKAP TRADE PANGKALAN DATA</span>
                <h2 className="text-lg font-black text-white font-mono">{selectedTradeId}</h2>
              </div>
              <button
                onClick={() => { setSelectedTradeId(null); setTradeDetail(null); }}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs"
              >
                Tutup [X]
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                <p className="mt-2">Mengambil data trade lengkap daripada PostgreSQL...</p>
              </div>
            ) : tradeDetail && tradeDetail.position ? (
              <div className="space-y-4 font-mono text-xs">
                {/* Grid 30+ Fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div><span className="text-slate-500 text-[10px]">Trade / Pos ID:</span> <div className="font-bold text-purple-300 truncate">{tradeDetail.position.positionId}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Account ID:</span> <div className="font-bold text-white">{tradeDetail.position.accountId}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Broker / Env:</span> <div className="font-bold text-cyan-300">{tradeDetail.position.broker} ({tradeDetail.position.environment})</div></div>
                  <div><span className="text-slate-500 text-[10px]">Simbol / TF:</span> <div className="font-bold text-white">{tradeDetail.position.symbol} ({tradeDetail.position.timeframe || 'M15'})</div></div>
                  <div><span className="text-slate-500 text-[10px]">Arah / Volume:</span> <div className="font-bold text-white">{tradeDetail.position.direction} ({tradeDetail.position.quantity} Lot)</div></div>
                  <div><span className="text-slate-500 text-[10px]">Harga Entry:</span> <div className="font-bold text-white">{tradeDetail.position.entryPrice}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Harga Exit / Current:</span> <div className="font-bold text-white">{tradeDetail.position.closePrice || tradeDetail.position.currentPrice}</div></div>
                  <div><span className="text-slate-500 text-[10px]">SL / TP1 / TP2:</span> <div className="font-bold text-amber-300">{tradeDetail.position.stopLoss || '-'} / {tradeDetail.position.takeProfit || '-'} / {tradeDetail.position.takeProfit2 || '-'}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Realized PnL:</span> <div className="font-bold text-emerald-400">${tradeDetail.position.realizedProfit} ({tradeDetail.position.pnlPips} pips)</div></div>
                  <div><span className="text-slate-500 text-[10px]">Commission / Swap:</span> <div className="font-bold text-slate-300">${tradeDetail.position.commission || 0} / ${tradeDetail.position.swap || 0}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Status / Cause:</span> <div className="font-bold text-white">{tradeDetail.position.status} ({tradeDetail.position.closeReason || '-'})</div></div>
                  <div><span className="text-slate-500 text-[10px]">Reconciliation:</span> <div className="font-bold text-emerald-300">{tradeDetail.position.reconciliationStatus || 'MATCHED'}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Broker Order ID:</span> <div className="font-bold text-slate-300 truncate">{tradeDetail.position.brokerOrderId || '-'}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Broker Pos ID:</span> <div className="font-bold text-slate-300 truncate">{tradeDetail.position.brokerPositionId || '-'}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Broker Deal ID:</span> <div className="font-bold text-slate-300 truncate">{tradeDetail.position.brokerDealId || '-'}</div></div>
                  <div><span className="text-slate-500 text-[10px]">Idempotency Key:</span> <div className="font-bold text-slate-400 truncate">{tradeDetail.position.idempotencyKey || '-'}</div></div>
                </div>

                {/* Event Lifecycle Timeline */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="font-bold text-purple-300 text-xs uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Jejak Audit Acara Trade (Trade Event Lifecycle Timeline)</span>
                  </h4>
                  {tradeDetail.events.length === 0 ? (
                    <div className="text-slate-500 text-[11px]">Tiada acara spesifik direkodkan.</div>
                  ) : (
                    <div className="space-y-1.5 border-l-2 border-purple-500/40 pl-3">
                      {tradeDetail.events.map((e: any) => (
                        <div key={e.id} className="text-[11px] space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 font-bold rounded text-[9px]">{e.eventType}</span>
                            <span className="text-slate-400 text-[10px]">{e.timestamp ? new Date(e.timestamp).toLocaleString('ms-MY') : ''}</span>
                            <span className="text-slate-500 text-[10px]">Actor: {e.actor}</span>
                          </div>
                          {e.details && (
                            <pre className="text-[9px] bg-slate-900 p-1.5 rounded text-slate-300 overflow-x-auto">
                              {JSON.stringify(e.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Post-Mortem Learning Review */}
                {tradeDetail.postMortem && (
                  <div className="p-4 bg-purple-950/30 border border-purple-500/40 rounded-xl space-y-2">
                    <h4 className="font-bold text-purple-300 text-xs uppercase flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Hasil Post-Mortem Review &amp; Pembelajaran AI</span>
                    </h4>
                    <div className="text-xs text-slate-200">
                      <strong>Root Cause:</strong> {tradeDetail.postMortem.rootCause}
                    </div>
                    <div className="text-xs text-cyan-300">
                      <strong>Adaptive Action:</strong> {tradeDetail.postMortem.adaptiveActionRecommended || tradeDetail.postMortem.adaptiveRuleCreated}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs">
                Gagal memuat naik perincian trade.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
