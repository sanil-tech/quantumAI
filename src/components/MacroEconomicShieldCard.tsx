import React from 'react';
import { Shield, ShieldAlert, AlertCircle, Clock, Calendar, CheckCircle2 } from 'lucide-react';
import { EconomicEvent } from '../types';

interface MacroEconomicShieldCardProps {
  events?: EconomicEvent[];
  isBlackoutActive?: boolean;
  nextEventCountdown?: string;
}

export const MacroEconomicShieldCard: React.FC<MacroEconomicShieldCardProps> = ({
  events = [],
  isBlackoutActive = false,
  nextEventCountdown = '—'
}) => {
  const highImpactEvents = events.filter(e => e.impact === 'HIGH').slice(0, 3);

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md">
      {/* Header with Status Indicator */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${isBlackoutActive ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'} border border-slate-700`}>
            {isBlackoutActive ? <ShieldAlert className="h-4 w-4 animate-pulse" /> : <Shield className="h-4 w-4" />}
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Perisai Makroekonomi</h4>
            <p className="text-[10px] text-slate-400">Penapis Berita Merah (±30 Minit)</p>
          </div>
        </div>

        {/* Shield Status Badge */}
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide border flex items-center gap-1 ${
          isBlackoutActive
            ? 'bg-rose-950/80 border-rose-600 text-rose-300 animate-pulse'
            : 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isBlackoutActive ? 'bg-rose-400' : 'bg-emerald-400'}`} />
          {isBlackoutActive ? 'PERISAI AKTIF (NO TRADE)' : 'ZON SELAMAT'}
        </div>
      </div>

      {/* Upcoming High-Impact Events List */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-indigo-400" /> Acara Berimpak Tinggi</span>
          <span className="flex items-center gap-1 text-slate-300 font-mono"><Clock className="h-3 w-3 text-amber-400" /> Seterusnya: {nextEventCountdown}</span>
        </div>

        {highImpactEvents.length > 0 ? (
          <div className="space-y-1.5">
            {highImpactEvents.map((evt, idx) => (
              <div key={evt.id || idx} className="flex items-center justify-between rounded-lg bg-slate-950/80 p-2 border border-slate-800 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded text-[10px] border border-rose-800/40">
                    {evt.currency}
                  </span>
                  <span className="text-slate-200 font-medium truncate max-w-[170px]">{evt.title}</span>
                </div>
                <div className="text-right font-mono text-[10px] text-slate-400">
                  {evt.time || '12:30 UTC'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Tiada berita merah berimpak tinggi dalam 3 jam akan datang.
            </p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span>Perlindungan Slippage: Aktif</span>
        <span className="text-indigo-400">100% Fail-Closed Policy</span>
      </div>
    </div>
  );
};
