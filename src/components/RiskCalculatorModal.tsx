import React, { useState, useEffect } from 'react';
import { CurrencyPair, AiTradeOpportunity } from '../types';
import { Calculator, X, DollarSign, ShieldAlert, CheckCircle2, TrendingUp } from 'lucide-react';
import { PAIR_CONFIGS } from '../lib/marketDataGenerator';
import { Language, translations } from '../lib/translations';

interface RiskCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePair: CurrencyPair;
  syncedSetup?: AiTradeOpportunity | null;
  currentPrice: number;
  language?: Language;
}

export const RiskCalculatorModal: React.FC<RiskCalculatorModalProps> = ({
  isOpen,
  onClose,
  activePair,
  syncedSetup,
  currentPrice,
  language = 'ms',
}) => {
  const t = translations[language] || translations.ms;
  const [accountSize, setAccountSize] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [entryPrice, setEntryPrice] = useState<number>(currentPrice || 1.08350);
  const [stopLossPrice, setStopLossPrice] = useState<number>(currentPrice ? currentPrice * 0.997 : 1.08050);
  const [tp1Price, setTp1Price] = useState<number>(currentPrice ? currentPrice * 1.006 : 1.08950);

  // Auto populate if syncedSetup provided
  useEffect(() => {
    if (syncedSetup) {
      setEntryPrice((syncedSetup.entryZone.min + syncedSetup.entryZone.max) / 2);
      setStopLossPrice(syncedSetup.stopLoss);
      setTp1Price(syncedSetup.takeProfit1);
    } else if (currentPrice) {
      setEntryPrice(currentPrice);
      setStopLossPrice(Number((currentPrice * 0.997).toFixed(5)));
      setTp1Price(Number((currentPrice * 1.006).toFixed(5)));
    }
  }, [syncedSetup, currentPrice]);

  if (!isOpen) return null;

  const pairConfig = PAIR_CONFIGS[activePair] || PAIR_CONFIGS['EUR/USD'];

  // Risk Math
  const riskAmountUsd = (accountSize * riskPercent) / 100;
  const priceDiff = Math.abs(entryPrice - stopLossPrice);
  const pipDistance = priceDiff * pairConfig.pipMultiplier;
  
  // Lot calculation
  // Standard Lot = 100,000 units. Pip value per standard lot is approx $10 for EUR/USD
  const lotSize = pipDistance > 0 ? Number((riskAmountUsd / (pipDistance * pairConfig.pipValue)).toFixed(2)) : 0.01;
  const tp1Diff = Math.abs(tp1Price - entryPrice);
  const tp1Pips = tp1Diff * pairConfig.pipMultiplier;
  const potentialProfitTp1Usd = Number((tp1Pips * lotSize * pairConfig.pipValue).toFixed(2));
  const rrRatio = pipDistance > 0 ? (tp1Pips / pipDistance).toFixed(2) : '1.0';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{t.riskCalcTitle}</h3>
            <p className="text-xs text-slate-400">{activePair}</p>
          </div>
        </div>

        {/* Input Fields */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Account Size */}
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">{t.accountBalance}</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 font-bold">$</span>
              <input
                type="number"
                value={accountSize}
                onChange={(e) => setAccountSize(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Risk Percent */}
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">{t.riskPercent}</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
              />
              <span className="absolute right-3 top-2.5 text-slate-500 font-bold">%</span>
            </div>
          </div>

          {/* Entry Price */}
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Planned Entry Price</label>
            <input
              type="number"
              step="0.00001"
              value={entryPrice}
              onChange={(e) => setEntryPrice(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Stop Loss Price */}
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold block">Stop Loss Price (SL)</label>
            <input
              type="number"
              step="0.00001"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Take Profit Price */}
          <div className="space-y-1 col-span-2">
            <label className="text-slate-400 font-semibold block">Take Profit Price (TP1)</label>
            <input
              type="number"
              step="0.00001"
              value={tp1Price}
              onChange={(e) => setTp1Price(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Calculated Results Panel */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800/80 pb-2">
            Position Sizing Output
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Maximum Risk ($)</span>
              <span className="font-mono font-bold text-rose-400 text-sm">${riskAmountUsd.toFixed(2)}</span>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Stop Distance</span>
              <span className="font-mono font-bold text-white text-sm">{pipDistance.toFixed(1)} Pips</span>
            </div>

            <div className="bg-blue-600/20 p-2.5 rounded-lg border border-blue-500/40 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-blue-300 block font-semibold">Recommended Lots</span>
              <span className="font-mono font-black text-blue-400 text-base">{lotSize} Lots</span>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Potential TP1 Profit</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">${potentialProfitTp1Usd}</span>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-semibold">Calculated R:R</span>
              <span className="font-mono font-bold text-amber-400 text-sm">1:{rrRatio}</span>
            </div>
          </div>
        </div>

        {/* Modal Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-lg"
        >
          Apply & Close Risk Engine
        </button>
      </div>
    </div>
  );
};
