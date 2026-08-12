import React from 'react';
import { ShieldCheck, ShieldAlert, Zap, AlertTriangle, Radio, Power, RefreshCw, Cpu } from 'lucide-react';

export type SystemEnvironment = 'TEST' | 'DEMO' | 'REAL_LIVE';
export type MarketDataLineage = 'LIVE' | 'SIMULATED' | 'SYNTHETIC' | 'UNKNOWN';
export type ReadinessStatus = 'READY' | 'NOT_READY' | 'KILL_SWITCH_ACTIVE' | 'BROKER_DISCONNECTED';

export interface SystemSafetyBannerProps {
  environment?: SystemEnvironment;
  marketDataLineage?: MarketDataLineage;
  brokerConnected?: boolean;
  isArmed?: boolean;
  killSwitchActive?: boolean;
  readinessStatus?: ReadinessStatus;
  lastSyncTime?: number;
  onRefresh?: () => void;
  onToggleKillSwitch?: () => void;
}

export const SystemSafetyBanner: React.FC<SystemSafetyBannerProps> = ({
  environment = 'DEMO',
  marketDataLineage = 'LIVE',
  brokerConnected = true,
  isArmed = true,
  killSwitchActive = false,
  readinessStatus = 'READY',
  lastSyncTime,
  onRefresh,
  onToggleKillSwitch
}) => {
  // Determine overall readiness state
  let computedStatus: ReadinessStatus = (readinessStatus as ReadinessStatus) || 'READY';
  if (killSwitchActive) {
    computedStatus = 'KILL_SWITCH_ACTIVE';
  } else if (!brokerConnected) {
    computedStatus = 'BROKER_DISCONNECTED';
  }

  const getStatusBadge = () => {
    switch (computedStatus) {
      case 'READY':
        return (
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-xl font-mono text-xs font-black flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            SYSTEM READY
          </span>
        );
      case 'KILL_SWITCH_ACTIVE':
        return (
          <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/50 rounded-xl font-mono text-xs font-black flex items-center gap-1.5 shadow-sm">
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce" />
            KILL SWITCH ACTIVE
          </span>
        );
      case 'BROKER_DISCONNECTED':
        return (
          <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl font-mono text-xs font-black flex items-center gap-1.5 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            BROKER DISCONNECTED
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-mono text-xs font-black flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            NOT READY
          </span>
        );
    }
  };

  const getEnvLabel = () => {
    switch (environment) {
      case 'REAL_LIVE':
        return <span className="text-emerald-400 font-bold">REAL LIVE</span>;
      case 'DEMO':
        return <span className="text-cyan-300 font-bold">DEMO (Paper)</span>;
      default:
        return <span className="text-amber-400 font-bold">TEST</span>;
    }
  };

  const getLineageLabel = () => {
    switch (marketDataLineage) {
      case 'LIVE':
        return <span className="text-emerald-400 font-bold">LIVE (Broker Stream)</span>;
      case 'SIMULATED':
        return <span className="text-amber-300 font-bold">SIMULATED</span>;
      case 'SYNTHETIC':
        return <span className="text-purple-300 font-bold">SYNTHETIC</span>;
      default:
        return <span className="text-slate-400 font-bold">UNKNOWN</span>;
    }
  };

  return (
    <div className={`p-4 rounded-2xl border transition shadow-xl font-mono ${
      computedStatus === 'READY' 
        ? 'bg-slate-900/95 border-slate-800'
        : computedStatus === 'KILL_SWITCH_ACTIVE'
        ? 'bg-rose-950/80 border-rose-500/50'
        : 'bg-amber-950/60 border-amber-500/50'
    }`}>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left: System Readiness Indicator */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            {computedStatus === 'READY' ? (
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            ) : computedStatus === 'KILL_SWITCH_ACTIVE' ? (
              <ShieldAlert className="w-6 h-6 text-rose-400 animate-pulse" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400">System Safety Banner</span>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Authoritative live safety state verified by backend Risk Authority &amp; Zero-Bypass Guard.
            </p>
          </div>
        </div>

        {/* Center: Consolidated Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs w-full lg:w-auto">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <span className="text-[9px] text-slate-400 uppercase font-bold block">Environment</span>
            <div>{getEnvLabel()}</div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <span className="text-[9px] text-slate-400 uppercase font-bold block">Data Lineage</span>
            <div>{getLineageLabel()}</div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <span className="text-[9px] text-slate-400 uppercase font-bold block">Live Execution</span>
            <div>
              {isArmed ? (
                <span className="text-emerald-400 font-bold">ARMED ⚡</span>
              ) : (
                <span className="text-slate-400 font-bold">DISARMED 🔒</span>
              )}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <span className="text-[9px] text-slate-400 uppercase font-bold block">Kill Switch</span>
            <div>
              {killSwitchActive ? (
                <span className="text-rose-400 font-bold">ACTIVE 🚨</span>
              ) : (
                <span className="text-emerald-400 font-bold">INACTIVE ✅</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition cursor-pointer"
              title="Refresh Safety State"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
            </button>
          )}

          {onToggleKillSwitch && (
            <button
              type="button"
              onClick={onToggleKillSwitch}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg ${
                killSwitchActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{killSwitchActive ? 'Deactivate Kill Switch' : 'EMERGENCY KILL SWITCH'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
