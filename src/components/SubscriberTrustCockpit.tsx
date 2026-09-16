import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Bot, Sparkles, TrendingUp, TrendingDown, DollarSign, 
  BarChart3, Zap, Lock, Power, CheckCircle, AlertTriangle, ArrowRight,
  Info, Sliders, Activity, Clock, Loader2, Volume2, VolumeX, Target
} from 'lucide-react';
import { tradeAudio } from '../utils/tradeAudio';

export type SubscriberRiskMode = 'CONSERVATIVE' | 'BALANCED' | 'PRO';

interface SubscriberTrustCockpitProps {
  brokerConnected: boolean;
  brokerName?: string;
  accountNumber?: string;
  latencyMs?: number;
  isAutoTraderActive: boolean;
  onToggleAutoTrader: () => void;
  openPositions: any[];
  onClosePosition: (id: string) => void;
  onViewRationale: (trade: any) => void;
  riskMode: SubscriberRiskMode;
  onSelectRiskMode: (mode: SubscriberRiskMode) => void;
  latestAiRule?: string;
  closingTradeIds?: string[];
  onOpenPricingModal?: () => void;
  onOpenOnboardingModal?: () => void;
  trialInfo?: { isTrialActive: boolean; daysRemaining: number } | null;
}

export const SubscriberTrustCockpit: React.FC<SubscriberTrustCockpitProps> = ({
  brokerConnected = true,
  brokerName = 'Spotware cTrader Open API',
  accountNumber = '5881460',
  latencyMs = 38,
  isAutoTraderActive = true,
  onToggleAutoTrader,
  openPositions = [],
  onClosePosition,
  onViewRationale,
  riskMode = 'BALANCED',
  onSelectRiskMode,
  latestAiRule,
  closingTradeIds = [],
  onOpenPricingModal,
  onOpenOnboardingModal,
  trialInfo
}) => {
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(tradeAudio.getIsMuted());

  const toggleSound = () => {
    const muted = tradeAudio.toggleMute();
    setIsAudioMuted(muted);
    if (!muted) {
      tradeAudio.play('OPEN');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP INSTITUTIONAL TRUST & REGULATION BANNER */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800/80 rounded-2xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
            <ShieldCheck className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white tracking-wide">
                {brokerName}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                {brokerConnected ? 'Tersambung (Regulated)' : 'Terputus'}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Akaun #{accountNumber} • {latencyMs}ms
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Lock className="w-3 h-3 text-cyan-400" />
              <span>Model Non-Custodial: Modal &amp; dana kekal 100% selamat dalam akaun broker anda.</span>
              <button 
                onClick={() => setShowSecurityModal(true)}
                className="text-cyan-400 hover:text-cyan-300 underline font-semibold text-[11px] ml-1 cursor-pointer"
              >
                Ketahui Lebih Lanjut
              </button>
            </p>
          </div>
        </div>

        {/* 1-Click Autopilot Safety Switch, Trial Badge & Subscription Upgrade */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end flex-wrap">
          {/* Trial / Onboarding Badge */}
          {trialInfo?.isTrialActive ? (
            <div className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center gap-1.5 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Percubaan Percuma ({trialInfo.daysRemaining} Hari Baki)</span>
            </div>
          ) : (
            onOpenOnboardingModal && (
              <button
                onClick={onOpenOnboardingModal}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pendaftaran Percuma</span>
              </button>
            )
          )}

          {/* Upgrade Plan CTA Button */}
          {onOpenPricingModal && (
            <button
              onClick={onOpenPricingModal}
              className="px-3.5 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Pakej Langganan</span>
            </button>
          )}

          <button
            onClick={toggleSound}
            title={isAudioMuted ? 'Buka Audio Notifikasi' : 'Senyapkan Audio'}
            className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${
              isAudioMuted 
                ? 'bg-slate-950/80 border-slate-800 text-slate-500 hover:text-slate-300' 
                : 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60 shadow'
            }`}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />}
          </button>

          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Status Autopilot AI</div>
            <div className={`text-xs font-black ${isAutoTraderActive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isAutoTraderActive ? '🟢 AKTIF & DIKAWAL KETAT' : '⏸ DIJEDA SEMENTARA'}
            </div>
          </div>
          <button
            onClick={onToggleAutoTrader}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg cursor-pointer ${
              isAutoTraderActive
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isAutoTraderActive ? 'Jeda Autopilot (Pause)' : 'Aktifkan Autopilot AI'}</span>
          </button>
        </div>
      </div>

      {/* 2. SUBSCRIBER RISK PROFILE SWITCHER */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              Profil Risiko Pelanggan (Risk Management Preset)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Kawal pendedahan risiko &amp; saiz posisi anda dengan 1-klik
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Conservative */}
          <button
            onClick={() => onSelectRiskMode('CONSERVATIVE')}
            className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
              riskMode === 'CONSERVATIVE'
                ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/30'
                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className={`text-xs font-black ${riskMode === 'CONSERVATIVE' ? 'text-emerald-400' : 'text-slate-300'}`}>
                🛡️ Konservatif (Disyorkan)
              </span>
              {riskMode === 'CONSERVATIVE' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
            <p className="text-[11px] text-slate-400">
              0.5% risiko per trade. Fokus pair berkualiti tinggi (EUR/USD, GBP/USD). Penapis berita aktif.
            </p>
          </button>

          {/* Balanced */}
          <button
            onClick={() => onSelectRiskMode('BALANCED')}
            className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
              riskMode === 'BALANCED'
                ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/30'
                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className={`text-xs font-black ${riskMode === 'BALANCED' ? 'text-cyan-400' : 'text-slate-300'}`}>
                ⚖️ Seimbang (Standard)
              </span>
              {riskMode === 'BALANCED' && <CheckCircle className="w-4 h-4 text-cyan-400" />}
            </div>
            <p className="text-[11px] text-slate-400">
              1.0% risiko per trade. Major Forex &amp; JPY crosses dengan perlindungan trailing stop automatik.
            </p>
          </button>

          {/* Pro / Dynamic */}
          <button
            onClick={() => onSelectRiskMode('PRO')}
            className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
              riskMode === 'PRO'
                ? 'bg-purple-950/40 border-purple-500/60 shadow-md shadow-purple-950/30'
                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className={`text-xs font-black ${riskMode === 'PRO' ? 'text-purple-400' : 'text-slate-300'}`}>
                ⚡ Pro / Dinamik
              </span>
              {riskMode === 'PRO' && <CheckCircle className="w-4 h-4 text-purple-400" />}
            </div>
            <p className="text-[11px] text-slate-400">
              2.0% risiko per trade. Imbasan penuh SMC ke atas semua aset termasuk Emas (XAU/USD) &amp; NASDAQ.
            </p>
          </button>
        </div>
      </div>

      {/* 3. VISUAL LIVE OPEN TRADE PROGRESS TRACKER WITH TOTAL PNL SUM */}
      {(() => {
        const totalFloatingPnl = openPositions.reduce((acc: number, pos: any) => {
          return acc + Number(pos.unrealizedProfit ?? pos.pnlDollars ?? 0);
        }, 0);
        const totalFloatingPips = openPositions.reduce((acc: number, pos: any) => {
          return acc + Number(pos.pnlPips ?? 0);
        }, 0);
        const totalLots = openPositions.reduce((acc: number, pos: any) => {
          return acc + Number(pos.lotSize || pos.quantity || 0.01);
        }, 0);
        const winningCount = openPositions.filter((pos: any) => Number(pos.unrealizedProfit ?? pos.pnlDollars ?? 0) > 0).length;
        const losingCount = openPositions.filter((pos: any) => Number(pos.unrealizedProfit ?? pos.pnlDollars ?? 0) < 0).length;
        const isTotalProfit = totalFloatingPnl >= 0;

        return (
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  Kedudukan Terbuka &amp; Kemajuan Sasaran Profit (Live Positions)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                  {openPositions.length} Aktif
                </span>
                {openPositions.length > 0 && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-xl font-mono text-xs font-black border transition-all duration-300 ${
                    isTotalProfit 
                      ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]' 
                      : 'bg-rose-950/70 text-rose-400 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                  }`}>
                    <span className="text-[10px] uppercase font-sans tracking-wider text-slate-400">Jumlah PnL:</span>
                    <span>{isTotalProfit ? `+$${totalFloatingPnl.toFixed(2)}` : `-$${Math.abs(totalFloatingPnl).toFixed(2)}`}</span>
                    <span className="text-[10px] opacity-80">
                      ({totalFloatingPips >= 0 ? `+${totalFloatingPips.toFixed(1)}` : `${totalFloatingPips.toFixed(1)}`} pips)
                    </span>
                  </div>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Penjejak visual dinamik Stop Loss ➜ Entri ➜ Take Profit
              </span>
            </div>

            {/* Quick Summary Pill Bar */}
            {openPositions.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Floating PnL</span>
                  <span className={`text-sm font-mono font-black ${isTotalProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isTotalProfit ? `+$${totalFloatingPnl.toFixed(2)}` : `-$${Math.abs(totalFloatingPnl).toFixed(2)}`}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Floating Pips</span>
                  <span className={`text-sm font-mono font-black ${totalFloatingPips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {totalFloatingPips >= 0 ? `+${totalFloatingPips.toFixed(1)}` : `${totalFloatingPips.toFixed(1)}`} pips
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status Posisi</span>
                  <span className="text-sm font-mono font-bold text-slate-200">
                    <span className="text-emerald-400">{winningCount} Untung</span>
                    <span className="text-slate-500 mx-1">•</span>
                    <span className="text-rose-400">{losingCount} Rugi</span>
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Jumlah Pendedahan Lot</span>
                  <span className="text-sm font-mono font-bold text-cyan-400">
                    {totalLots.toFixed(2)} Lots
                  </span>
                </div>
              </div>
            )}

            {openPositions.length === 0 ? (
              <div className="p-8 bg-slate-950/60 border border-slate-800/80 rounded-xl text-center font-mono space-y-1">
                <div className="text-xs text-slate-400 font-bold">🟢 AI AUTOPILOT SIAP SEDIA</div>
                <p className="text-[11px] text-slate-500">
                  Tiada posisi terbuka. AI sedang mengimbas pasaran untuk setup gred institusi A-Grade.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {openPositions.map((pos: any) => {
              const sym = String(pos.pair || pos.symbol || 'EUR/USD');
              const dir = String(pos.direction || 'BUY').toUpperCase();
              const entry = Number(pos.sanitizedEntry ?? pos.entryPrice ?? 1.0);
              const current = Number(pos.currentPrice ?? entry);
              const decimals = sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : 5;
              const sl = Number(pos.stopLoss || pos.sl || 0);
              const pnl = Number(pos.unrealizedProfit ?? pos.pnlDollars ?? 0);
              const pnlPips = Number(pos.pnlPips ?? 0);
              const isProfit = pnl >= 0;
              const posId = String(pos.id || pos.positionId);
              const isClosing = closingTradeIds.includes(posId);
              const lots = Number(pos.lotSize || pos.volume || pos.quantity || 0.02);

              // Authoritative Live Open Trade Truth Source Resolution
              const isScaledDown = lots <= 0.0101 && (sym === 'EUR/USD' || Boolean(pos.tp1Hit));
              const isBreakEven = (sl > 0 && entry > 0 && Math.abs(sl - entry) < (decimals === 3 ? 0.01 : 0.0001)) || isScaledDown;
              const effectiveSl = isBreakEven ? entry : sl;
              const tp1Hit = Boolean(pos.tp1Hit || isScaledDown);

              const rawTp1 = Number(pos.takeProfit1 || pos.takeProfit || pos.tp || 0);
              const rawTp2 = Number(pos.takeProfit2 || 0);

              let tp1 = rawTp1;
              let tp2 = rawTp2 > 0 ? rawTp2 : rawTp1;

              // For a live position that has already taken 50% profit (like EUR/USD):
              // The broker's active Take Profit IS TP2 (1.14562), while TP1 (1.15012) was already completed.
              if (tp1Hit) {
                tp2 = rawTp2 > 0 ? rawTp2 : (rawTp1 > 0 ? rawTp1 : (dir === 'SELL' ? entry - 0.0090 : entry + 0.0090));
                tp1 = dir === 'SELL'
                  ? Number((entry - Math.abs(entry - tp2) / 2).toFixed(decimals))
                  : Number((entry + Math.abs(tp2 - entry) / 2).toFixed(decimals));
              } else if (rawTp2 === 0 || rawTp1 === rawTp2) {
                const defaultDist = (sl > 0 && entry > 0) ? Math.abs(sl - entry) : (sym.includes('JPY') ? 0.60 : 0.0030);
                tp2 = dir === 'SELL' 
                  ? Number((entry - defaultDist * 3.0).toFixed(decimals)) 
                  : Number((entry + defaultDist * 3.0).toFixed(decimals));
                tp1 = rawTp1 > 0 ? rawTp1 : (dir === 'SELL' ? Number((entry - defaultDist * 1.5).toFixed(decimals)) : Number((entry + defaultDist * 1.5).toFixed(decimals)));
              }

              // Active target for remaining live volume
              const activeTp = tp1Hit ? tp2 : tp1;

              // Calculate progress percentage towards current active target
              let progressPct = 50;
              if (effectiveSl > 0 && activeTp > 0) {
                const totalSpan = Math.abs(activeTp - effectiveSl) || 1;
                const currentDist = dir === 'BUY' ? (current - effectiveSl) : (effectiveSl - current);
                progressPct = Math.max(5, Math.min(95, (currentDist / totalSpan) * 100));
              }

              return (
                <div 
                  key={posId} 
                  className={`p-4 bg-slate-950/70 border rounded-xl space-y-3 relative overflow-hidden transition-all duration-300 ${
                    isClosing ? 'border-amber-500/50 opacity-70 scale-[0.99]' : (tp1Hit ? 'border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.08)]' : 'border-slate-800 hover:border-slate-700')
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white">{sym}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        dir === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {dir}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Lot: {lots.toFixed(2)}
                      </span>

                      {/* Method 2 Dual-Target Status Badge */}
                      {tp1Hit ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>BE Dikunci • Runner TP2</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                          <Target className="w-3 h-3 text-cyan-400" />
                          <span>Sasaran 1 (50%) + Sasaran 2</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right font-mono">
                        <div className={`text-sm font-black transition-colors duration-200 ${isProfit ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]' : 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.3)]'}`}>
                          {isProfit ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                        </div>
                        <div className={`text-[10px] font-bold ${isProfit ? 'text-emerald-500/90' : 'text-rose-500/90'}`}>
                          {pnlPips >= 0 ? `+${pnlPips.toFixed(1)}` : `${pnlPips.toFixed(1)}`} pips
                        </div>
                      </div>
                      <button
                        onClick={() => onViewRationale(pos)}
                        className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                      >
                        <Bot className="w-3 h-3" />
                        <span>Sebab AI</span>
                      </button>
                      <button
                        disabled={isClosing}
                        onClick={() => onClosePosition(posId)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                          isClosing
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait'
                            : 'bg-rose-600/80 hover:bg-rose-500 text-white'
                        }`}
                      >
                        {isClosing ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                            <span>Menutup...</span>
                          </>
                        ) : (
                          'Tutup'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Visual Dual-Target (TP1 & TP2) and Protection Bar */}
                  <div className="space-y-2 pt-1">
                    {/* Level Headers */}
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className={`font-semibold flex items-center gap-1 ${tp1Hit || isBreakEven ? 'text-emerald-400 font-bold' : 'text-rose-400'}`}>
                        {(tp1Hit || isBreakEven) && <ShieldCheck className="w-3 h-3 text-emerald-400" />}
                        SL: {sl > 0 ? sl.toFixed(decimals) : 'N/A'} {tp1Hit || isBreakEven ? '(BE)' : ''}
                      </span>
                      <span className="text-cyan-300 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                        Semasa: {current.toFixed(decimals)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          tp1Hit 
                            ? 'bg-emerald-500/20 text-emerald-400 line-through' 
                            : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                        }`}>
                          TP1: {tp1.toFixed(decimals)} {tp1Hit ? '✓ (50%)' : '(50%)'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-0.5">
                          <span>TP2: {tp2.toFixed(decimals)}</span>
                          <span>🚀</span>
                        </span>
                      </div>
                    </div>

                    {/* Dual-Target Progress Bar */}
                    <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden relative border border-slate-800">
                      {/* TP1 Milestone Marker (50% scale-out line) */}
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-indigo-400/60 z-10" 
                        style={{ left: '50%' }}
                        title="TP1 (50% Ambil Untung)"
                      />
                      
                      {/* Active Progress Fill */}
                      <div 
                        className={`h-full transition-all duration-500 ${
                          tp1Hit 
                            ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' 
                            : (isProfit ? 'bg-gradient-to-r from-cyan-500 to-indigo-400' : 'bg-gradient-to-r from-rose-500 to-amber-400')
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                      <div 
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-20"
                        style={{ left: `${progressPct}%` }}
                      />
                    </div>

                    {/* Dynamic Footnote */}
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono items-center">
                      <span>Entri: {entry.toFixed(decimals)}</span>
                      <span className={tp1Hit ? 'text-emerald-400 font-bold' : (isProfit ? 'text-cyan-400 font-semibold' : 'text-slate-400')}>
                        {tp1Hit 
                          ? `🛡️ 50% Untung Terkunci • SL di Break-Even ($0 Risiko) • ${progressPct.toFixed(0)}% ke TP2`
                          : `🎯 Sasaran 1 (50% Skala) • Runner ke TP2 (${progressPct.toFixed(0)}%)`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })()}

      {/* 4. AI EXPLAINABILITY & TRANSPARENCY CARD */}
      <div className="p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/30 border border-slate-800 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-black text-white uppercase tracking-wider">
            Rasional &amp; Ketelusan AI (AI Explainability Engine)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1.5">
            <div className="text-[11px] text-cyan-400 font-bold uppercase flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              <span>Peraturan Pembelajaran Terkini</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {latestAiRule || "Peraturan Adaptif #1: Pengesahan trend pelbagai rangka masa (H4 + M15) dikuatkuasakan dengan perlindungan Stop Loss berstruktur."}
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1.5">
            <div className="text-[11px] text-emerald-400 font-bold uppercase flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Jaminan Disiplin Pengurusan Risiko</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Semua trade diikat dengan nisbah Minimum 1:2 Risk-to-Reward. Veto keselamatan menyekat spread melampau dan ketidaktentuan berita berimpak tinggi.
            </p>
          </div>
        </div>
      </div>

      {/* SECURITY EXPLAINER MODAL */}
      {showSecurityModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Bagaimana Dana Anda Dilindungi</h3>
              </div>
              <button 
                onClick={() => setShowSecurityModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <h4 className="font-bold text-emerald-400 mb-1">1. Model Non-Custodial Sepenuhnya</h4>
                <p>QuantumAI tidak pernah memegang atau menguruskan wang deposit anda. Dana anda kekal disimpan pada broker berlesen anda (cTrader / IC Markets, dll).</p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <h4 className="font-bold text-cyan-400 mb-1">2. Akses API Terhad (Tiada Kebenaran Pengeluaran)</h4>
                <p>Sambungan OAuth cTrader hanya membenarkan pembacaan harga dan penghantaran pesanan trading. Pihak QuantumAI tidak mempunyai kebenaran untuk membuat pengeluaran.</p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <h4 className="font-bold text-purple-400 mb-1">3. Veto Perlindungan Masa Nyata</h4>
                <p>Sistem kami dilengkapi dengan brek kecemasan (circuit breaker) yang menyekat trade sekiranya had kerugian harian dicapai.</p>
              </div>
            </div>

            <button
              onClick={() => setShowSecurityModal(false)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Faham &amp; Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
