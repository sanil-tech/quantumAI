import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, Power, Activity, Server, Users, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Key, Lock, Cpu, Globe, Database,
  Sliders, Play, Pause, Zap, Terminal, BarChart3, Filter, Search,
  ArrowUpRight, ArrowDownRight, Layers, Eye, Radio, ExternalLink
} from 'lucide-react';

interface TenantItem {
  tenantId: string;
  connectionId?: string;
  accountNumber: string;
  brokerName: string;
  connectionType: string;
  environment: string;
  isActive: boolean;
  totalOrders: number;
  openPositions: number;
  closedPositions: number;
  netPnl: number;
  createdAt?: string;
  updatedAt?: string;
}

interface TelemetryData {
  socketHealth: 'ONLINE' | 'OFFLINE';
  socketEndpoint: string;
  latencyMs: number;
  activePlatform: string;
  brokerName: string;
  accountNumber: string;
  serverHost: string;
  environment: string;
  liveBalance: number;
  liveEquity: number;
  globalOrdersCount: number;
  globalVolumeLots: number;
  openPositionsCount: number;
  totalClosedTrades: number;
  totalPnlDollars: number;
  executionGate: 'ARMED' | 'DISARMED';
  isKillSwitchActive: boolean;
  killSwitchState?: {
    isGlobalArmed: boolean;
    disarmedAt?: string;
    reason?: string;
    tenantStates?: Record<string, { isArmed: boolean; disarmedAt?: string; reason?: string }>;
  };
  lastHeartbeat: string;
  serverUptimeSeconds: number;
}

interface SuperAdminDashboardProps {
  isMalay: boolean;
  onOpenBrokerModal?: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  isMalay,
  onOpenBrokerModal
}) => {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnvironment, setFilterEnvironment] = useState<'ALL' | 'DEMO' | 'LIVE'>('ALL');
  
  // Kill Switch Modal State
  const [showKillModal, setShowKillModal] = useState(false);
  const [killModalTarget, setKillModalTarget] = useState<'GLOBAL' | string>('GLOBAL');
  const [killStep, setKillStep] = useState<1 | 2>(1);
  const [killReason, setKillReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [isProcessingKill, setIsProcessingKill] = useState(false);

  // Admin API key
  const getAdminKey = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_api_key') || 'admin_demo_key_88';
    }
    return 'admin_demo_key_88';
  };

  const fetchSuperAdminData = async () => {
    setIsLoading(true);
    try {
      const adminKey = getAdminKey();
      const headers = {
        'x-admin-key': adminKey,
        'Authorization': `Bearer ${adminKey}`
      };

      // Fetch tenants
      const [tenantsRes, telemetryRes] = await Promise.all([
        fetch('/api/admin/tenants', { headers }).then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/admin/telemetry', { headers }).then(r => r.json()).catch(() => ({ success: false }))
      ]);

      if (tenantsRes?.success && tenantsRes?.tenants) {
        setTenants(tenantsRes.tenants);
      }
      if (telemetryRes?.success && telemetryRes?.telemetry) {
        setTelemetry(telemetryRes.telemetry);
      }
    } catch (err) {
      console.error('Failed to fetch SuperAdmin dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
    const interval = setInterval(fetchSuperAdminData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleKillSwitch = async (action: 'ARM' | 'DISARM', tenantId?: string) => {
    setIsProcessingKill(true);
    try {
      const adminKey = getAdminKey();
      const res = await fetch('/api/admin/kill-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
          'Authorization': `Bearer ${adminKey}`
        },
        body: JSON.stringify({
          action,
          tenantId: tenantId === 'GLOBAL' ? undefined : tenantId,
          reason: killReason || (action === 'DISARM' ? 'Administrative Emergency Safety Disarm' : 'Normal Operations Restored')
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowKillModal(false);
        setKillStep(1);
        setConfirmPhrase('');
        setKillReason('');
        await fetchSuperAdminData();
      } else {
        alert(`Kill-Switch error: ${data.error || 'Operation failed'}`);
      }
    } catch (err: any) {
      alert(`Kill-Switch connection error: ${err.message}`);
    } finally {
      setIsProcessingKill(false);
    }
  };

  const isGlobalArmed = telemetry ? !telemetry.isKillSwitchActive : true;

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      t.tenantId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.accountNumber.includes(searchTerm) ||
      t.brokerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEnv = filterEnvironment === 'ALL' || t.environment === filterEnvironment;
    return matchesSearch && matchesEnv;
  });

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-100">
      {/* Top Banner: Super-Admin Multi-Tenant Control Hub */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-400 shadow-inner">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                  {isMalay ? 'Pusat Kawalan Super-Admin Multi-Tenant' : 'Super-Admin Multi-Tenant Control Hub'}
                </h1>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  {isMalay
                    ? 'Pengasingan Data RLS Aktif • Kredensial AES-256-GCM Tersimpan Selamat'
                    : 'RLS Data Isolation Enforced • AES-256-GCM Vault Active'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Global Actions & Kill-Switch Indicator */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={fetchSuperAdminData}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-all shadow-sm"
              title="Refresh Telemetry & Tenants"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              {isMalay ? 'Muat Semula' : 'Refresh'}
            </button>

            {/* Global Kill Switch Trigger Button */}
            {isGlobalArmed ? (
              <button
                onClick={() => {
                  setKillModalTarget('GLOBAL');
                  setKillStep(1);
                  setKillReason('');
                  setConfirmPhrase('');
                  setShowKillModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-bold transition-all shadow-lg hover:shadow-rose-900/30 group"
              >
                <Power className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                <span>{isMalay ? 'SUIS KECEMASAN (KILL-SWITCH)' : 'GLOBAL KILL-SWITCH'}</span>
              </button>
            ) : (
              <button
                onClick={() => handleToggleKillSwitch('ARM', 'GLOBAL')}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 hover:text-emerald-200 rounded-xl text-xs font-bold transition-all shadow-lg hover:shadow-emerald-900/30"
              >
                <Play className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>{isMalay ? 'PULIHKAN ENJIN (ARM)' : 'RESTORE ENGINE (ARM)'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time System Telemetry Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: FIX / OpenAPI Socket Health */}
        <div className="bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">{isMalay ? 'Soket cTrader FIX' : 'cTrader FIX Socket'}</span>
            <Radio className={`w-4 h-4 ${telemetry?.socketHealth === 'ONLINE' ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-xl font-bold ${telemetry?.socketHealth === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {telemetry?.socketHealth || 'ONLINE'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {telemetry?.latencyMs ?? 38}ms {isMalay ? 'latensi' : 'ping'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 truncate font-mono" title={telemetry?.socketEndpoint}>
            {telemetry?.socketEndpoint || 'demo.ctraderapi.com:5035'}
          </p>
        </div>

        {/* Card 2: Global Execution Router Gate */}
        <div className={`bg-slate-900/80 border ${isGlobalArmed ? 'border-emerald-500/30' : 'border-rose-500/50'} rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all`}>
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">{isMalay ? 'Status Enjin Execution' : 'Execution Gate'}</span>
            {isGlobalArmed ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce" />
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-xl font-bold ${isGlobalArmed ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isGlobalArmed ? 'ARMED (ACTIVE)' : 'DISARMED (HALTED)'}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${isGlobalArmed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
              {isGlobalArmed ? 'Safe' : 'Halted'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {isGlobalArmed ? (isMalay ? 'Pesanan broker dibenarkan' : 'Router actively accepting orders') : (isMalay ? 'Semua pesanan disekat' : 'Broker transmission blocked')}
          </p>
        </div>

        {/* Card 3: Global Orders & Total Volume */}
        <div className="bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">{isMalay ? 'Jumlah Pesanan Global' : 'Global Orders'}</span>
            <BarChart3 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-indigo-300">
              {telemetry?.globalOrdersCount ?? 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {telemetry?.globalVolumeLots ?? 0.0} Lots
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>{isMalay ? 'Posisi Terbuka' : 'Open Positions'}: {telemetry?.openPositionsCount ?? 0}</span>
            <span className="text-emerald-400 font-semibold font-mono">+${telemetry?.totalPnlDollars?.toFixed(2) ?? '0.00'}</span>
          </div>
        </div>

        {/* Card 4: Active Tenants & Uptime */}
        <div className="bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 rounded-2xl p-5 shadow-lg backdrop-blur-md transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">{isMalay ? 'Jumlah Penyewa' : 'Total Tenants'}</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-cyan-300">
              {tenants.length}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {telemetry?.serverUptimeSeconds ? formatUptime(telemetry.serverUptimeSeconds) : 'Active'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {tenants.filter(t => t.isActive).length} {isMalay ? 'Penyewa Aktif' : 'Active Connections'}
          </p>
        </div>
      </div>

      {/* Tenant Management Table Section */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              {isMalay ? 'Jadual Pengurusan Penyewa (Multi-Tenant Hub)' : 'Tenant Management Ledger'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isMalay
                ? 'Senarai akaun penyewa terasing dengan pengesanan kredensial dan statistik perdagangan'
                : 'Isolated tenant accounts with credential vault bindings and trade telemetry'}
            </p>
          </div>

          {/* Search & Filters */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={isMalay ? 'Cari Tenant ID / Akaun...' : 'Search Tenant ID / Account...'}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>

            <select
              value={filterEnvironment}
              onChange={e => setFilterEnvironment(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500/80 transition-colors"
            >
              <option value="ALL">{isMalay ? 'Semua Environment' : 'All Environments'}</option>
              <option value="DEMO">DEMO</option>
              <option value="LIVE">LIVE</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Tenant ID & Vault</th>
                <th className="px-4 py-3">Broker & Account</th>
                <th className="px-4 py-3">Connection Type</th>
                <th className="px-4 py-3">Environment</th>
                <th className="px-4 py-3 text-right">Orders / Trades</th>
                <th className="px-4 py-3 text-right">Net PnL</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {isMalay ? 'Tiada penyewa dijumpai.' : 'No tenants found matching criteria.'}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const isTenantArmed = telemetry?.killSwitchState?.tenantStates?.[t.tenantId]?.isArmed ?? true;

                  return (
                    <tr key={t.tenantId} className="hover:bg-slate-800/40 transition-colors">
                      {/* Tenant ID & Vault */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                          <div>
                            <span className="font-mono text-[11px] text-slate-200 block truncate max-w-[180px]" title={t.tenantId}>
                              {t.tenantId}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              AES-256-GCM Vault v1
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Broker & Account */}
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-semibold text-slate-200 block">{t.brokerName}</span>
                          <span className="text-[10px] text-indigo-400 font-mono">Acc #{t.accountNumber}</span>
                        </div>
                      </td>

                      {/* Connection Type */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono">
                          {t.connectionType}
                        </span>
                      </td>

                      {/* Environment */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.environment === 'LIVE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        }`}>
                          {t.environment}
                        </span>
                      </td>

                      {/* Orders / Trades */}
                      <td className="px-4 py-3 text-right font-mono">
                        <span className="text-slate-200 font-bold">{t.totalOrders}</span>
                        <span className="text-slate-500 text-[10px] block">
                          {t.openPositions} open / {t.closedPositions} closed
                        </span>
                      </td>

                      {/* Net PnL */}
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span className={t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.netPnl >= 0 ? `+$${t.netPnl.toFixed(2)}` : `-$${Math.abs(t.netPnl).toFixed(2)}`}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          t.isActive && isTenantArmed
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${t.isActive && isTenantArmed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {t.isActive && isTenantArmed ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isTenantArmed ? (
                            <button
                              onClick={() => {
                                setKillModalTarget(t.tenantId);
                                setKillStep(1);
                                setKillReason('');
                                setConfirmPhrase('');
                                setShowKillModal(true);
                              }}
                              className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 rounded-lg transition-colors"
                              title={isMalay ? 'Matikan Enjin Penyewa Ini' : 'Halt Tenant Execution'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleKillSwitch('ARM', t.tenantId)}
                              className="p-1.5 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/20 rounded-lg transition-colors"
                              title={isMalay ? 'Aktifkan Semula Penyewa' : 'Arm Tenant Execution'}
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2-Step Confirmation Kill-Switch Modal */}
      {showKillModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/20 rounded-xl border border-rose-500/30">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {killModalTarget === 'GLOBAL'
                    ? (isMalay ? 'Pengesahan Suis Kecemasan Global' : 'Global Kill-Switch Confirmation')
                    : (isMalay ? `Pengesahan Hentian Penyewa` : 'Tenant Disarm Confirmation')}
                </h3>
                <p className="text-xs text-rose-300/80">
                  {isMalay ? 'Tindakan Berimpak Tinggi (High Impact Safety Action)' : 'High Impact Safety Action'}
                </p>
              </div>
            </div>

            {killStep === 1 ? (
              <div className="space-y-4">
                <div className="p-3 bg-rose-950/40 border border-rose-500/20 rounded-xl text-xs text-rose-200 leading-relaxed">
                  {killModalTarget === 'GLOBAL'
                    ? (isMalay
                      ? 'Amaran: Mengaktifkan suis kecemasan ini akan MEMATIKAN SEMUA penghantaran pesanan broker secara global. Semua pesanan baharu akan serta-merta ditolak.'
                      : 'Warning: Activating the global kill-switch will HALT ALL broker order transmissions across all tenants. All incoming signals will be immediately rejected.')
                    : (isMalay
                      ? `Amaran: Enjin pelaksanaan untuk penyewa ${killModalTarget} akan dimatikan.`
                      : `Warning: Execution engine for tenant ${killModalTarget} will be disarmed.`)}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isMalay ? 'Sebab Hentian / Catatan Audit' : 'Disarm Reason / Audit Note'}
                  </label>
                  <input
                    type="text"
                    value={killReason}
                    onChange={e => setKillReason(e.target.value)}
                    placeholder={isMalay ? 'cth: High market volatility risk / Broker maintenance' : 'e.g. Extreme volatility / API maintenance'}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowKillModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                  >
                    {isMalay ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    onClick={() => setKillStep(2)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    {isMalay ? 'Seterusnya (Langkah 2) →' : 'Proceed to Step 2 →'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-200">
                  <p className="font-bold mb-1">
                    {isMalay ? 'Langkah 2/2: Pengesahan Muktamad' : 'Step 2/2: Final Authorization Confirmation'}
                  </p>
                  <p>
                    {isMalay
                      ? 'Sila taip "CONFIRM KILL" di bawah untuk mengesahkan tindakan ini:'
                      : 'Please type "CONFIRM KILL" below to execute the disarm command:'}
                  </p>
                </div>

                <div>
                  <input
                    type="text"
                    value={confirmPhrase}
                    onChange={e => setConfirmPhrase(e.target.value)}
                    placeholder="CONFIRM KILL"
                    className="w-full px-3 py-2 bg-slate-800 border border-rose-500/60 rounded-xl text-xs font-mono font-bold text-rose-300 placeholder-slate-600 text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-500"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setKillStep(1)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                  >
                    {isMalay ? '← Kembali' : '← Back'}
                  </button>
                  <button
                    onClick={() => handleToggleKillSwitch('DISARM', killModalTarget)}
                    disabled={confirmPhrase !== 'CONFIRM KILL' || isProcessingKill}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-rose-950 flex items-center gap-2"
                  >
                    <Power className="w-4 h-4" />
                    <span>{isProcessingKill ? (isMalay ? 'Melaksanakan...' : 'Executing...') : (isMalay ? 'PENGESAHAN MATIKAN' : 'CONFIRM DISARM')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
