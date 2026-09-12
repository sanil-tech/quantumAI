import React, { useState } from 'react';
import { Shield, TrendingUp, TrendingDown, CheckCircle, ExternalLink, Lock, XCircle, AlertTriangle } from 'lucide-react';

export interface OpenPositionData {
  id: string;
  symbol: string;
  tradeSide: 'BUY' | 'SELL';
  volume: number; // in Lots
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedGrossPnl: number;
  unrealizedPips: number;
  openTimestamp: number;
  brokerOrderId?: string;
  isBreakevenLocked?: boolean;
}

interface LivePositionCardProps {
  position: OpenPositionData;
  onLockBreakeven?: (positionId: string) => Promise<void>;
  onClosePosition?: (positionId: string) => Promise<void>;
}

export const LivePositionCard: React.FC<LivePositionCardProps> = ({
  position,
  onLockBreakeven,
  onClosePosition
}) => {
  const [isLocking, setIsLocking] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const isBuy = position.tradeSide === 'BUY';
  const isProfit = position.unrealizedGrossPnl >= 0;
  
  // Calculate percentage distance from SL to TP (0% = Stop Loss, 100% = Take Profit)
  const totalRange = Math.abs(position.takeProfit - position.stopLoss) || 1;
  const currentProgress = isBuy
    ? Math.min(100, Math.max(0, ((position.currentPrice - position.stopLoss) / totalRange) * 100))
    : Math.min(100, Math.max(0, ((position.stopLoss - position.currentPrice) / totalRange) * 100));

  const handleBreakeven = async () => {
    if (!onLockBreakeven || position.isBreakevenLocked) return;
    setIsLocking(true);
    try {
      await onLockBreakeven(position.id);
    } finally {
      setIsLocking(false);
    }
  };

  const handleClose = async () => {
    if (!onClosePosition) return;
    setIsClosing(true);
    try {
      await onClosePosition(position.id);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md transition-all hover:border-slate-600">
      {/* Top Header: Symbol, Side & PnL */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'} border border-slate-700`}>
            {isBuy ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-wide text-sm">{position.symbol}</span>
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${isBuy ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50' : 'bg-rose-950 text-rose-300 border border-rose-800/50'}`}>
                {position.tradeSide} {position.volume.toFixed(2)}L
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Entri: {position.entryPrice.toFixed(5)} → Semasa: {position.currentPrice.toFixed(5)}
            </div>
          </div>
        </div>

        {/* Live Dynamic PnL Badge */}
        <div className="text-right">
          <div className={`font-mono text-base font-extrabold tracking-tight ${isProfit ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'text-rose-400'}`}>
            {isProfit ? '+' : ''}${position.unrealizedGrossPnl.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {position.unrealizedPips >= 0 ? '+' : ''}{position.unrealizedPips.toFixed(1)} pips
          </div>
        </div>
      </div>

      {/* Progress Bar from Stop Loss to Take Profit */}
      <div className="mt-3.5 space-y-1.5">
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span className="text-rose-400/90 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> SL: {position.stopLoss.toFixed(5)}
          </span>
          <span className="text-slate-300 font-semibold">{currentProgress.toFixed(0)}% ke Sasaran</span>
          <span className="text-emerald-400/90 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> TP: {position.takeProfit.toFixed(5)}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 border border-slate-700/60 relative">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-full ${
              isProfit 
                ? 'bg-gradient-to-r from-cyan-500 via-emerald-400 to-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
                : 'bg-gradient-to-r from-rose-500 to-amber-500'
            }`}
            style={{ width: `${Math.max(4, currentProgress)}%` }}
          />
        </div>
      </div>

      {/* Action Buttons & Digital Broker Proof */}
      <div className="mt-3.5 flex items-center justify-between pt-2 border-t border-slate-800/60">
        <button
          onClick={() => setShowReceipt(!showReceipt)}
          className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
        >
          <ExternalLink className="h-3 w-3" />
          {showReceipt ? 'Tutup Resit' : 'Resit Sah cTrader'}
        </button>

        <div className="flex items-center gap-2">
          {/* Lock Breakeven Button */}
          <button
            onClick={handleBreakeven}
            disabled={isLocking || position.isBreakevenLocked || !isProfit}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-all ${
              position.isBreakevenLocked
                ? 'bg-indigo-950/60 border-indigo-700/50 text-indigo-300 cursor-default'
                : isProfit
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Lock className="h-3 w-3" />
            {position.isBreakevenLocked ? 'BE Dikunci' : isLocking ? 'Mengunci...' : 'Kunci BE'}
          </button>

          {/* Emergency Close Button */}
          <button
            onClick={handleClose}
            disabled={isClosing}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition-colors shadow-sm"
          >
            <XCircle className="h-3 w-3" />
            {isClosing ? 'Menutup...' : 'Tutup Trade'}
          </button>
        </div>
      </div>

      {/* Expandable Digital Verification Receipt */}
      {showReceipt && (
        <div className="mt-2.5 rounded-lg bg-slate-950 p-3 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1 animate-fadeIn">
          <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-800 pb-1">
            <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> DISAHKAN OLEH CTRADER OPEN API</span>
            <span className="text-[10px] text-slate-500">NON-CUSTODIAL</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-slate-500">Order ID Broker:</span>
            <span className="text-slate-200 font-bold">#{position.brokerOrderId || position.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Waktu Pelaksanaan:</span>
            <span>{new Date(position.openTimestamp).toLocaleTimeString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Protokol Salinan:</span>
            <span className="text-indigo-400">Zero-Latency Master Copier</span>
          </div>
        </div>
      )}
    </div>
  );
};
