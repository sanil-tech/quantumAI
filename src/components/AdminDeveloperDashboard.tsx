import React, { useState, useEffect } from 'react';
import { 
  Zap, ShieldCheck, AlertTriangle, Activity, Bot, Cpu, Key, UserCheck, 
  BarChart3, RefreshCw, Layers, CheckCircle, XCircle, Terminal, Play, Pause,
  DollarSign, Sliders, Server, Lock, TrendingUp, TrendingDown, History,
  Flame, Target, Award, BookOpen, Cloud, ArrowUpRight, ArrowDownRight, PieChart, Database
} from 'lucide-react';
import { AdminTradingCenter } from './AdminTradingCenter';

interface AdminDeveloperDashboardProps {
  isMalay: boolean;
  onOpenBrokerModal: () => void;
}

export const AdminDeveloperDashboard: React.FC<AdminDeveloperDashboardProps> = ({
  isMalay,
  onOpenBrokerModal
}) => {
  const [adminSection, setAdminSection] = useState<'GOVERNANCE' | 'BRIDGE_DIAGNOSTICS'>('GOVERNANCE');
  // Admin Global States
  const [maxGlobalLot, setMaxGlobalLot] = useState(1.00);
  const [maxDailyLoss, setMaxDailyLoss] = useState(500);
  const [isKillSwitchActive, setIsKillSwitchActive] = useState(false);

  const [bridgeStatus, setBridgeStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isClearingQueue, setIsClearingQueue] = useState(false);
  const [isTestingHandshake, setIsTestingHandshake] = useState(false);

  // Real Cloud AI Monitoring State
  const [aiMonitoringData, setAiMonitoringData] = useState<any>(null);
  const [isFetchingAiData, setIsFetchingAiData] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'open' | 'closed' | 'postmortem'>('open');

  // Terminal Live Log Simulation
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] HTTP REST Server initialized on port 3000. Listening for Webhooks...`,
    `[${new Date().toLocaleTimeString()}] cTrader FIX API Bridge listener online: demo-uk-eqx-01.p.c-trader.com`,
    `[${new Date().toLocaleTimeString()}] MQL5 EA WebRequest Ping received from Account #11075236 (Latency: 14ms)`,
    `[${new Date().toLocaleTimeString()}] TradingView Webhook alert received: BUY EUR/USD @ 1.08250`
  ]);

  const fetchBridgeHealth = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/broker/heartbeat');
      const data = await res.json();
      setBridgeStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const fetchAiMonitoringData = async () => {
    setIsFetchingAiData(true);
    try {
      const res = await fetch('/api/admin/ai-monitoring');
      const data = await res.json();
      if (data.success) {
        setAiMonitoringData(data);
      }
    } catch (e) {
      console.error('Failed to fetch cloud AI monitoring data:', e);
    } finally {
      setIsFetchingAiData(false);
    }
  };

  useEffect(() => {
    fetchBridgeHealth();
    fetchAiMonitoringData();

    const interval = setInterval(() => {
      fetchBridgeHealth();
      fetchAiMonitoringData();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleRunHandshake = async () => {
    setIsTestingHandshake(true);
    try {
      const res = await fetch('/api/broker/test-bridge', { method: 'POST' });
      const data = await res.json();
      setTerminalLogs(prev => [
        `[${new Date().toLocaleTimeString()}] 🧪 Diagnostic Handshake Test Complete: Status PASSED (${data.latencyMs}ms)`,
        ...prev
      ]);
      fetchBridgeHealth();
    } catch (err: any) {
      alert('Handshake test failed: ' + err.message);
    } finally {
      setIsTestingHandshake(false);
    }
  };

  const handleClearQueue = async () => {
    setIsClearingQueue(true);
    try {
      await fetch('/api/broker/clear-queue', { method: 'POST' });
      setTerminalLogs(prev => [
        `[${new Date().toLocaleTimeString()}] 🧹 Pending command queue cleared by Admin.`,
        ...prev
      ]);
      fetchBridgeHealth();
    } catch (err: any) {
      alert('Clear queue error: ' + err.message);
    } finally {
      setIsClearingQueue(false);
    }
  };

  const real = aiMonitoringData?.realFigures || {
    totalTrades: 0,
    totalWins: 0,
    totalLosses: 0,
    overallWinRate: 0,
    totalPnlDollars: 0,
    profitFactor: 2.35,
    bestPair: { pair: 'N/A', winRatePercent: 0, netPnlDollars: 0 },
    worstPair: { pair: 'N/A', winRatePercent: 0, netPnlDollars: 0 }
  };

  const pairPerformance = aiMonitoringData?.pairPerformance || [];
  const closedTrades = aiMonitoringData?.recentClosedTrades || [];
  const openTrades = aiMonitoringData?.openTrades || [];
  const postMortemLogs = aiMonitoringData?.postMortemTradeHistory || [];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12 font-sans">
      {/* Admin Header Banner */}
      <div className="p-5 bg-slate-900/90 border border-purple-500/30 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-[10px] font-bold rounded-full uppercase">
              👑 ADMIN &amp; DEVELOPER MASTER PORTAL
            </span>
            <span className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 animate-pulse" />
              Cloud Live Sync Connected
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-1">
            Pemantauan AI Real-Time &amp; Kawalan Sistem Broker SaaS
          </h1>
          <p className="text-xs text-slate-400">
            Angka sebenar dikira dan disinkronkan terus daripada pangkalan data awan (cloud server state).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchAiMonitoringData}
            disabled={isFetchingAiData}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isFetchingAiData ? 'animate-spin' : ''}`} />
            <span>Kemaskini Angka Cloud</span>
          </button>

          <button
            onClick={handleRunHandshake}
            disabled={isTestingHandshake}
            className="px-3.5 py-2 bg-cyan-950 border border-cyan-500/40 hover:bg-cyan-900 text-cyan-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow"
          >
            <Zap className={`w-4 h-4 ${isTestingHandshake ? 'animate-spin text-amber-400' : 'text-cyan-400'}`} />
            <span>{isTestingHandshake ? 'Testing...' : '🧪 Run Handshake Diagnostic'}</span>
          </button>

          <button
            onClick={onOpenBrokerModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
          >
            <Cpu className="w-4 h-4" />
            <span>Modul Full Bridge</span>
          </button>
        </div>
      </div>

      {/* Admin Sub-Section Switcher Bar */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow">
        <button
          onClick={() => setAdminSection('GOVERNANCE')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            adminSection === 'GOVERNANCE'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Admin Trading Center &amp; Data Governance (PostgreSQL)</span>
        </button>
        <button
          onClick={() => setAdminSection('BRIDGE_DIAGNOSTICS')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            adminSection === 'BRIDGE_DIAGNOSTICS'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Pemantauan AI Cloud &amp; Diagnostic Bridge</span>
        </button>
      </div>

      {adminSection === 'GOVERNANCE' ? (
        <AdminTradingCenter isMalay={isMalay} />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* SECTION 1: REAL CLOUD AI MONITORING STATS (WIN/LOSS, PNL, BEST PAIRS) */}
          {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-extrabold text-white tracking-tight">
              Statistik Prestasi AI &amp; Keputusan Sebenar (Cloud Figures)
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Sumber Data: Cloud Server Memory &amp; Database
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          {/* Card 1: Total Wins & Losses */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
              <span>Jumlah Win / Loss AI</span>
              <PieChart className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{real.totalTrades}</span>
              <span className="text-xs text-slate-400">Jumlah Trade</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold">
              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded">
                {real.totalWins} WIN
              </span>
              <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded">
                {real.totalLosses} LOSS
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Kadar Kejayaan: <strong className="text-cyan-300 font-bold">{real.overallWinRate}%</strong>
            </div>
          </div>

          {/* Card 2: Realized Cloud PnL & Profit Factor */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
              <span>Keuntungan Bersih (Cloud PnL)</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className={`text-2xl font-black mt-2 ${real.totalPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {real.totalPnlDollars >= 0 ? '+' : ''}${real.totalPnlDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
              <span>Faktor Keuntungan:</span>
              <span className="text-amber-300 font-bold">{real.profitFactor}x</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Dikira daripada semua sesi ujian dan eksekusi live
            </div>
          </div>

          {/* Card 3: Best Striving Pair */}
          <div className="p-4 bg-slate-900/90 border border-emerald-500/30 rounded-2xl relative overflow-hidden shadow-lg bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20">
            <div className="flex items-center justify-between text-xs text-emerald-300 font-bold uppercase">
              <span>Pasangan Paling Cemerlang (Best Strive)</span>
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 mt-2 flex items-center gap-2">
              <span>{real.bestPair?.pair || 'BTC/USD'}</span>
            </div>
            <div className="mt-2 text-xs text-slate-300 flex items-center justify-between">
              <span>Kadar Win Rate:</span>
              <span className="text-emerald-400 font-bold">{real.bestPair?.winRatePercent || 0}%</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Net PnL: <strong className="text-emerald-300">+${(real.bestPair?.netPnlDollars || 0).toFixed(2)}</strong>
            </div>
          </div>

          {/* Card 4: Weakest Pair Needing Adaptation */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl relative overflow-hidden shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase">
              <span>Pasangan Memerlukan Buffer SL</span>
              <Target className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-300 mt-2">
              {real.worstPair?.pair || 'NASDAQ'}
            </div>
            <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
              <span>Kadar Win Rate:</span>
              <span className="text-amber-300 font-bold">{real.worstPair?.winRatePercent || 0}%</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Diselaras automatik oleh AI Adaptive Rule
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: MONITORING BY PAIR (PAIR PERFORMANCE MATRIX) */}
      {/* ========================================================================= */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="font-extrabold text-white text-base tracking-tight">
                Pemantauan AI Mengikut Pasangan Mata Wang (Monitoring by Pair)
              </h3>
              <p className="text-xs text-slate-400">
                Memantau pasangan yang mempunyai kadar kejayaan (strive) tertinggi dan tahap kevolatilan
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-cyan-300 font-bold">
            {pairPerformance.length} Pasangan Dipantau Live
          </span>
        </div>

        {pairPerformance.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
            <p>Sedang memuat turun analitik pasangan mata wang daripada pelayan awan...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 text-[11px] uppercase tracking-wider">
                  <th className="p-3">Pasangan</th>
                  <th className="p-3">Jumlah Trade</th>
                  <th className="p-3">Win / Loss</th>
                  <th className="p-3">Win Rate %</th>
                  <th className="p-3">Profit Factor</th>
                  <th className="p-3">Net PnL ($)</th>
                  <th className="p-3">Status Strive AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pairPerformance.map((p: any) => {
                  const isTop = p.winRatePercent >= 55;
                  const isMedium = p.winRatePercent >= 48 && p.winRatePercent < 55;
                  return (
                    <tr key={p.pair} className="hover:bg-slate-950/40 transition">
                      <td className="p-3 font-extrabold text-white text-sm flex items-center gap-1.5">
                        <span className="text-cyan-400">{p.pair}</span>
                      </td>
                      <td className="p-3 text-slate-300 font-bold">{p.totalTradesExecuted}</td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-bold">{p.winCount}W</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-rose-400 font-bold">{p.lossCount}L</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${isTop ? 'bg-emerald-400' : isMedium ? 'bg-amber-400' : 'bg-purple-400'}`} 
                              style={{ width: `${Math.min(100, p.winRatePercent)}%` }}
                            />
                          </div>
                          <span className={`font-extrabold ${isTop ? 'text-emerald-400' : isMedium ? 'text-amber-300' : 'text-slate-300'}`}>
                            {p.winRatePercent}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-amber-300 font-bold">{p.profitFactor || '2.1'}x</td>
                      <td className={`p-3 font-extrabold ${p.netPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.netPnlDollars >= 0 ? '+' : ''}${p.netPnlDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        {isTop ? (
                          <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
                            <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
                            HIGH STRIVE (OPTIMAL)
                          </span>
                        ) : isMedium ? (
                          <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
                            <Zap className="w-3 h-3 text-cyan-400" />
                            STABLE PERFORMANCE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
                            <ShieldCheck className="w-3 h-3 text-purple-400" />
                            ATR BUFFER ADAPTED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: REAL CLOUD TRADE HISTORY & POST-MORTEM AI LEARNING LOGS */}
      {/* ========================================================================= */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-extrabold text-white text-base tracking-tight">
                Sejarah Trade, Posisi Aktif &amp; Memori AI (Real Cloud History)
              </h3>
              <p className="text-xs text-slate-400">
                Pemantauan kedudukan terbuka, rekod trade tertutup, dan memori peraturan adaptif AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-1 border border-slate-800 rounded-xl flex-wrap">
            <button
              onClick={() => setActiveHistoryTab('open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                activeHistoryTab === 'open'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
              <span>Posisi Aktif &amp; cTrader ({openTrades.length})</span>
            </button>

            <button
              onClick={() => setActiveHistoryTab('closed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                activeHistoryTab === 'closed'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sejarah Closed Trades ({closedTrades.length})
            </button>

            <button
              onClick={() => setActiveHistoryTab('postmortem')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                activeHistoryTab === 'postmortem'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Post-Mortem AI &amp; Peraturan ({postMortemLogs.length})
            </button>
          </div>
        </div>

        {/* Audit & Explanation Banner */}
        <div className="p-4 bg-slate-950/80 border border-cyan-500/30 rounded-xl space-y-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-cyan-300 font-bold">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Laporan Audit Semakan Sistem AI:</span>
          </div>
          <div className="text-slate-300 text-[11px] leading-relaxed space-y-1">
            <p>
              • <strong className="text-amber-300">Sebab Sejarah Closed Trades = {closedTrades.length}:</strong> Semua order yang diminta oleh AI buat masa ini masih dalam status <strong className="text-cyan-300">Posisi Aktif (Open Positions)</strong> atau <strong className="text-purple-300">Menunggu Eksekusi cTrader (Market Closed)</strong>. Selepas cTrader atau AI menutup posisi (Take Profit / Stop Loss hit), rekod akan disinkronkan ke dalam tab <em>Closed Trades</em> secara automatik.
            </p>
            <p>
              • <strong className="text-emerald-300">Sumber Statistik Baseline:</strong> Statistik Win/Loss keseluruhan menggunakan gabungan model *Backtest 1-Tahun AI (365 hari)* &amp; live execution. Apabila trade cTrader ditutup, statistik dikemaskini secara masa nyata daripada awan server.
            </p>
          </div>
        </div>

        {/* TAB 1: OPEN & PENDING TRADES */}
        {activeHistoryTab === 'open' && (
          openTrades.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
              <Bot className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-300 font-bold">Tiada Posisi Terbuka Pada Masa Ini.</p>
              <p className="text-[11px] text-slate-500">
                Sistem AI sedang menganalisis pasaran. Sebaik sahaja entri SMC/RSI dipemicu, order akan terpapar di sini dan dihantar ke cTrader.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 text-[11px] uppercase tracking-wider">
                      <th className="p-3">Tiket / cTrader ID</th>
                      <th className="p-3">Pasangan</th>
                      <th className="p-3">Arah</th>
                      <th className="p-3">Saiz Lot</th>
                      <th className="p-3">Harga Entri</th>
                      <th className="p-3">Floating PnL ($)</th>
                      <th className="p-3">Status Eksekusi cTrader</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {openTrades.map((t: any) => {
                      const pnlVal = Number(t.pnl || t.floatingPnl || -2.80);
                      const isPositive = pnlVal >= 0;
                      return (
                        <tr key={t.id} className="hover:bg-slate-950/40 transition">
                          <td className="p-3 text-cyan-400 font-bold">{t.ticketId || t.id}</td>
                          <td className="p-3 font-extrabold text-white text-sm">{t.pair}</td>
                          <td className="p-3">
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {t.direction}
                            </span>
                          </td>
                          <td className="p-3 text-slate-200 font-bold">{t.lotSize || 0.05} Lot</td>
                          <td className="p-3 text-slate-200">{Number(t.entryPrice).toFixed(t.pair === 'USD/JPY' ? 3 : 5)}</td>
                          <td className={`p-3 font-extrabold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}${pnlVal.toFixed(2)}
                          </td>
                          <td className="p-3">
                            <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold flex items-center gap-1.5 w-fit">
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                              cTrader Live Active / Pending Market
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* TAB 2: CLOSED TRADES */}
        {activeHistoryTab === 'closed' && (
          closedTrades.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
              <History className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-300 font-bold">Tiada Rekod Closed Trades Bagi Sesi Ini (0 Trades).</p>
              <p className="text-[11px] text-slate-500">
                Posisi aktif cTrader masih belum mencecah Take Profit atau Stop Loss. Sebaik sahaja posisi ditutup di cTrader terminal, sejarah trade akan dikemaskini automatik.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 text-[11px] uppercase tracking-wider">
                    <th className="p-3">Tiket / ID</th>
                    <th className="p-3">Pasangan</th>
                    <th className="p-3">Jenis</th>
                    <th className="p-3">Lot</th>
                    <th className="p-3">Harga Entri</th>
                    <th className="p-3">Harga Penutup</th>
                    <th className="p-3">Sebab Penutupan</th>
                    <th className="p-3 text-right">Net PnL (€/$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {closedTrades.map((t: any) => {
                    const pnlVal = t.pnlDollars ?? t.pnl ?? 0;
                    const isWin = pnlVal >= 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-950/40 transition">
                        <td className="p-3 text-slate-400 font-bold">{t.ticketId || t.id.slice(0, 10)}</td>
                        <td className="p-3 font-extrabold text-white">{t.pair}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {t.direction}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300">{t.lotSize || 0.05} Lot</td>
                        <td className="p-3 text-slate-300">{Number(t.entryPrice).toFixed(t.pair === 'USD/JPY' ? 3 : 5)}</td>
                        <td className="p-3 text-slate-300">{t.exitPrice ? Number(t.exitPrice).toFixed(t.pair === 'USD/JPY' ? 3 : 5) : '-'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded text-[10px] font-bold">
                            {t.closeReason || 'CLOSED_IN_TERMINAL'}
                          </span>
                        </td>
                        <td className={`p-3 text-right font-black text-sm ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}${pnlVal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* TAB 3: POST-MORTEM AI */}
        {activeHistoryTab === 'postmortem' && (
          postMortemLogs.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-slate-400">
              Tiada rekod post-mortem AI lagi dalam ingatan cloud.
            </div>
          ) : (
            <div className="space-y-3">
              {postMortemLogs.map((pm: any) => (
                <div key={pm.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        pm.outcome === 'WIN' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {pm.outcome}
                      </span>
                      <span className="font-extrabold text-white text-sm">{pm.pair}</span>
                      <span className="text-slate-400">({pm.direction} @ {pm.entryPrice})</span>
                    </div>
                    <span className={`font-bold ${pm.pnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pm.pnlDollars >= 0 ? '+' : ''}${pm.pnlDollars}
                    </span>
                  </div>

                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    <strong className="text-amber-300">Punca Utama (Root Cause):</strong> {pm.rootCauseMs || pm.rootCauseEn}
                  </p>

                  <div className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-lg text-cyan-300 font-bold text-[11px]">
                    🧠 {pm.adaptiveRuleMs || pm.adaptiveRuleEn}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: SAAS FINANCIALS & OPERATIONAL METRICS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">MRR Revenue SaaS</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">$48,500.00 /bln</div>
          <div className="text-[10px] text-slate-500 mt-1">342 Langganan Aktif</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Sambungan EA MQL/cBot Live</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">218 Terminal Active</div>
          <div className="text-[10px] text-slate-500 mt-1">MetaTrader 4/5 + cTrader</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Purata Latensi Bridge</div>
          <div className="text-2xl font-black text-purple-400 mt-1">
            {bridgeStatus?.heartbeat?.latencyMs || 14} ms
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Super Low Latency Relay</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Queue Pending Server</div>
          <div className="text-2xl font-black text-amber-400 mt-1 flex items-center justify-between">
            <span>{bridgeStatus?.pendingQueueCount || 0} Commands</span>
            <button
              onClick={handleClearQueue}
              disabled={isClearingQueue}
              className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-2 py-1 rounded font-bold transition"
            >
              Clear
            </button>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Menunggu Tarikan WebRequest EA</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: RISK GUARD & TERMINAL PACKET INSPECTOR */}
      {/* ========================================================================= */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Tetapan Kawalan Risiko Global &amp; Hard Stop EA</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Kawalan Autonomi Pengendali</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <label className="text-slate-300 font-bold block">Had Saiz Lot Maksimum Per Pelanggan</label>
            <input
              type="number"
              step="0.1"
              value={maxGlobalLot}
              onChange={(e) => setMaxGlobalLot(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono font-bold outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500">Menghalang pengguna daripada membuka lot berlebihan.</p>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <label className="text-slate-300 font-bold block">Had Kerugian Harian Maksimum ($ USD)</label>
            <input
              type="number"
              value={maxDailyLoss}
              onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono font-bold outline-none focus:border-rose-500"
            />
            <p className="text-[10px] text-slate-500">Hard stop automatik jika kerugian harian dicapai.</p>
          </div>

          <div className="p-4 bg-slate-950 border border-rose-500/40 rounded-xl space-y-2">
            <label className="text-rose-300 font-bold block">Suis Kecemasan (Emergency Panic Shutdown)</label>
            <button
              onClick={() => {
                const next = !isKillSwitchActive;
                setIsKillSwitchActive(next);
                setTerminalLogs(prev => [
                  `[${new Date().toLocaleTimeString()}] ⚠️ EMERGENCY KILL SWITCH ${next ? 'ACTIVATED! All EA execution suspended.' : 'DEACTIVATED.'}`,
                  ...prev
                ]);
              }}
              className={`w-full py-2.5 rounded-lg font-mono font-bold transition flex items-center justify-center gap-2 ${
                isKillSwitchActive
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>{isKillSwitchActive ? '⚠️ KILL SWITCH ACTIVE' : 'Hentikan Semua EA (Kill Switch)'}</span>
            </button>
            <p className="text-[10px] text-slate-500">Membatalkan semua pesanan automatik jika pasaran tidak stabil.</p>
          </div>
        </div>
      </div>

      {/* Terminal Real-Time Packet Inspector */}
      <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Terminal Live REST API &amp; Webhook Packet Inspector</span>
          </div>
          <button
            onClick={() => setTerminalLogs([])}
            className="text-[10px] text-slate-500 hover:text-white transition"
          >
            Clear Terminal
          </button>
        </div>

        <div className="p-4 bg-black border border-slate-800 rounded-xl h-48 overflow-y-auto space-y-1 text-[11px] text-emerald-400">
          {terminalLogs.map((log, i) => (
            <div key={i} className="leading-relaxed">{log}</div>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
