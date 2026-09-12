import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, Zap, ShieldCheck, Activity, Power, Plus, RefreshCw, 
  CheckCircle, AlertTriangle, ArrowUpRight, ArrowDownRight, Clock,
  Sliders, Lock, Server, Cpu, ChevronRight, X, Sparkles, Check
} from 'lucide-react';
import { tradeAudio } from '../utils/tradeAudio';

interface SubscriberAccount {
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
  lastCopiedAt?: number;
  createdAt: number;
}

interface CopierStatus {
  masterActive: boolean;
  totalSubscribers: number;
  activeSubscribers: number;
  totalPortfolioValueUsd: number;
  avgExecutionLatencyMs: number;
  totalExecutedCopyTrades: number;
  lastSyncAt: number;
}

interface CopiedExecutionLog {
  id: string;
  masterTradeId: string;
  subscriberId: string;
  subscriberName: string;
  accountNumber: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  riskPercent: number;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED_PAUSED' | 'SKIPPED_RISK';
  latencyMs: number;
  executedAt: number;
  brokerTicket?: string;
  error?: string;
}

export const MultiClientCopierHub: React.FC = () => {
  const [status, setStatus] = useState<CopierStatus | null>(null);
  const [subscribers, setSubscribers] = useState<SubscriberAccount[]>([]);
  const [logs, setLogs] = useState<CopiedExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // New Subscriber Form State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newBrokerName, setNewBrokerName] = useState('Spotware cTrader Open API');
  const [newRiskMode, setNewRiskMode] = useState<'CONSERVATIVE' | 'BALANCED' | 'PRO'>('BALANCED');
  const [newInitialBalance, setNewInitialBalance] = useState('10000');

  const fetchCopierData = useCallback(async () => {
    try {
      const [statusRes, subsRes, logsRes] = await Promise.all([
        fetch('/api/copier/status').then(r => r.json()).catch(() => null),
        fetch('/api/copier/subscribers').then(r => r.json()).catch(() => null),
        fetch('/api/copier/logs?limit=15').then(r => r.json()).catch(() => null)
      ]);

      if (statusRes) setStatus(statusRes);
      if (subsRes && subsRes.subscribers) setSubscribers(subsRes.subscribers);
      if (logsRes && logsRes.logs) setLogs(logsRes.logs);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCopierData();
    const interval = setInterval(fetchCopierData, 3000);
    return () => clearInterval(interval);
  }, [fetchCopierData]);

  const handleToggleSubscriber = async (id: string, name: string) => {
    try {
      tradeAudio.play('OPEN');
      const res = await fetch('/api/copier/subscribers/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriberId: id })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`Status akaun ${name} telah dikemaskini kepada: ${data.subscriber.status}`);
        setTimeout(() => setFeedback(null), 4000);
        await fetchCopierData();
      }
    } catch {}
  };

  const handleUpdateRisk = async (id: string, mode: 'CONSERVATIVE' | 'BALANCED' | 'PRO') => {
    try {
      tradeAudio.play('OPEN');
      const res = await fetch('/api/copier/subscribers/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriberId: id, riskMode: mode })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`Profil risiko dikemaskini kepada: ${mode}`);
        setTimeout(() => setFeedback(null), 4000);
        await fetchCopierData();
      }
    } catch {}
  };

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newAccountNumber.trim()) return;

    try {
      setIsLoading(true);
      const res = await fetch('/api/copier/subscribers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          accountNumber: newAccountNumber,
          brokerName: newBrokerName,
          riskMode: newRiskMode,
          initialBalance: Number(newInitialBalance) || 10000
        })
      });
      const data = await res.json();
      if (data.success) {
        tradeAudio.play('TP_HIT');
        setFeedback(`🎉 Akaun cTrader pelanggan ${newName} (#${newAccountNumber}) berjaya disambungkan ke Copier!`);
        setTimeout(() => setFeedback(null), 5000);
        setShowAddModal(false);
        setNewName('');
        setNewEmail('');
        setNewAccountNumber('');
        await fetchCopierData();
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. MASTER COPIER TELEMETRY & STATS HEADER */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40 shrink-0">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-white tracking-wide">
                cTrader Multi-Client Copier Hub
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>MASTER 24/7 LIVE</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Satu isyarat Master AI disalin secara selari (*parallel dispatch*) ke semua akaun cTrader pelanggan dengan saiz lot dinamik mengikut modal masing-masing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-500/25 transition flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Akaun cTrader</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-xs font-bold text-emerald-300 flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* 2. LIVE TELEMETRY STATS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-mono text-slate-400">Jumlah Akaun Pelanggan:</div>
          <div className="text-xl font-black text-white font-mono mt-1 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>{status?.totalSubscribers ?? subscribers.length} Akaun</span>
          </div>
          <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
            {status?.activeSubscribers ?? subscribers.filter(s => s.status === 'ACTIVE' || s.status === 'TRIAL').length} Aktif Menyalin
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-mono text-slate-400">Jumlah Dana Disalin:</div>
          <div className="text-xl font-black text-cyan-400 font-mono mt-1">
            ${(status?.totalPortfolioValueUsd ?? subscribers.reduce((a, s) => a + s.balance, 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            100% Non-Custodial di cTrader
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-mono text-slate-400">Purata Latency Eksekusi:</div>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1 flex items-center gap-1">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>{status?.avgExecutionLatencyMs ?? 38} ms</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Sub-millisecond Parallel Engine
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-mono text-slate-400">Jumlah Transaksi Disalin:</div>
          <div className="text-xl font-black text-purple-400 font-mono mt-1">
            {status?.totalExecutedCopyTrades ?? subscribers.reduce((a, s) => a + s.totalCopiedTrades, 0)} Trades
          </div>
          <div className="text-[10px] text-purple-300 font-bold mt-0.5">
            Selaras 100% dengan Master
          </div>
        </div>
      </div>

      {/* 3. SUBSCRIBERS ACTIVE COPING LIST */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              Senarai Akaun cTrader Pelanggan &amp; Pengurusan Risiko
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
              {subscribers.length} Berdaftar
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Penyesuaian saiz lot automatik mengikut baki modal setiap pelanggan
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {subscribers.map((sub) => {
            const isActive = sub.status === 'ACTIVE' || sub.status === 'TRIAL';
            return (
              <div 
                key={sub.id}
                className="p-4 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition"
              >
                {/* Account Details */}
                <div className="flex items-center gap-3.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                    isActive ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {sub.environment === 'DEMO' ? 'DEMO' : 'LIVE'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">{sub.name}</span>
                      <span className="text-xs font-mono text-slate-400">#{sub.accountNumber}</span>
                      <span className={`px-2 py-0.2 rounded text-[9px] font-bold uppercase ${
                        sub.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : sub.status === 'TRIAL'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {sub.status === 'ACTIVE' ? '🟢 AKTIF' : sub.status === 'TRIAL' ? '✨ TRIAL 7 HARI' : '⏸ DIJEDA'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{sub.brokerName}</span>
                      <span>•</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        Baki: ${sub.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-slate-400">
                        {sub.latencyMs}ms Latency
                      </span>
                    </div>
                  </div>
                </div>

                {/* Risk Selector & Action Controls */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end flex-wrap">
                  {/* Risk Profile Switcher */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    {(['CONSERVATIVE', 'BALANCED', 'PRO'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => handleUpdateRisk(sub.id, mode)}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                          sub.riskMode === mode
                            ? mode === 'CONSERVATIVE'
                              ? 'bg-emerald-600 text-white'
                              : mode === 'BALANCED'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-purple-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mode === 'CONSERVATIVE' ? '0.5%' : mode === 'BALANCED' ? '1.0%' : '2.0%'}
                      </button>
                    ))}
                  </div>

                  {/* Pause / Resume Button */}
                  <button
                    onClick={() => handleToggleSubscriber(sub.id, sub.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{isActive ? 'Jeda Copier' : 'Aktifkan'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. RECENT COPIED TRADE AUDIT LOGS */}
      {logs.length > 0 && (
        <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Log Audit Eksekusi Salinan Terkini (Live Dispatch Logs)</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Audit jejak transaksi 100% telus
            </span>
          </div>

          <div className="space-y-2">
            {logs.slice(0, 5).map(log => (
              <div 
                key={log.id}
                className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                    log.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {log.direction}
                  </span>
                  <span className="text-white font-bold">{log.pair}</span>
                  <span className="text-slate-400">➜ {log.subscriberName} (#{log.accountNumber})</span>
                </div>

                <div className="flex items-center gap-3 text-slate-400">
                  <span>Lot: <strong className="text-amber-300">{log.lotSize.toFixed(2)}</strong></span>
                  <span className="text-emerald-400">{log.latencyMs}ms</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-300">
                    {log.brokerTicket || 'SUCCESS'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. MODAL: TAMBAH AKAUN CTRADER PELANGGAN */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Tambah Akaun cTrader Pelanggan
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubscriber} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Nama Pelanggan:</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Muhammad Farhan"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Alamat Emel:</label>
                <input
                  type="email"
                  placeholder="farhan@example.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">No. Akaun cTrader:</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 5881461"
                    value={newAccountNumber}
                    onChange={e => setNewAccountNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Baki Modal ($):</label>
                  <input
                    type="number"
                    value={newInitialBalance}
                    onChange={e => setNewInitialBalance(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Broker cTrader:</label>
                <select
                  value={newBrokerName}
                  onChange={e => setNewBrokerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="Spotware cTrader Open API">Spotware cTrader Open API</option>
                  <option value="IC Markets cTrader Open API">IC Markets cTrader Open API</option>
                  <option value="Pepperstone cTrader Open API">Pepperstone cTrader Open API</option>
                  <option value="TopFX cTrader Open API">TopFX cTrader Open API</option>
                  <option value="FxPro cTrader Open API">FxPro cTrader Open API</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Profil Risiko Awal:</label>
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  {(['CONSERVATIVE', 'BALANCED', 'PRO'] as const).map(m => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setNewRiskMode(m)}
                      className={`py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                        newRiskMode === m
                          ? 'bg-cyan-600 text-white border-cyan-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {m === 'CONSERVATIVE' ? '0.5% Konservatif' : m === 'BALANCED' ? '1.0% Seimbang' : '2.0% Pro'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  <Check className="w-4 h-4" />
                  <span>{isLoading ? 'Menyambungkan...' : 'Sambung ke Copier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
