import React, { useState, useEffect } from 'react';
import { CurrencyPair, AiTradeOpportunity, TradingStyle } from '../types';
import { Brain, TrendingUp, TrendingDown, Clock, Sparkles, ArrowRight } from 'lucide-react';
import { Language } from '../lib/translations';
import { PAIR_CONFIGS } from '../lib/marketDataGenerator';
import { calculateAllIndicators } from '../lib/indicators';
import { analyzeSmcStructures } from '../lib/smcEngine';

interface AiOpportunitiesScannerProps {
  activePair: CurrencyPair;
  setActivePair: (pair: CurrencyPair) => void;
  tradingStyle: TradingStyle;
  language?: Language;
  opportunity?: AiTradeOpportunity | null;
}

const ALL_PAIRS: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'NASDAQ', 'BTC/USD'];

export const AiOpportunitiesScanner: React.FC<AiOpportunitiesScannerProps> = ({
  activePair,
  setActivePair,
  tradingStyle,
  language = 'ms',
  opportunity
}) => {
  const isMalay = language === 'ms';
  const [signalCache, setSignalCache] = useState<Record<CurrencyPair, AiTradeOpportunity | null>>(() => {
    try {
      const saved = localStorage.getItem('quantum_signal_cache');
      return saved ? JSON.parse(saved) : {} as Record<CurrencyPair, AiTradeOpportunity | null>;
    } catch {
      return {} as Record<CurrencyPair, AiTradeOpportunity | null>;
    }
  });

  // Always keep activePair in sync with the primary AI Analysis Opportunity
  useEffect(() => {
    if (opportunity && opportunity.pair === activePair) {
      setSignalCache(prev => {
        const updated = { ...prev, [activePair]: opportunity };
        try {
          localStorage.setItem('quantum_signal_cache', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }
  }, [opportunity, activePair]);

  const [loadingPairs, setLoadingPairs] = useState<Record<CurrencyPair, boolean>>({
    'EUR/USD': false,
    'GBP/USD': false,
    'USD/JPY': false,
    'AUD/USD': false,
    'XAU/USD': false,
    'NASDAQ': false,
    'BTC/USD': false,
  });

  // Background scan all pairs periodically using REAL technical candle analysis
  useEffect(() => {
    let isMounted = true;

    const scanPair = async (pair: CurrencyPair) => {
      if (loadingPairs[pair]) return;
      setLoadingPairs(prev => ({ ...prev, [pair]: true }));
      try {
        const candleRes = await fetch(`/api/forex/candles?pair=${encodeURIComponent(pair)}&timeframe=M15&count=100`);
        if (!candleRes.ok) { setLoadingPairs(prev => ({ ...prev, [pair]: false })); return; }
        const candleData = await candleRes.json();
        const history = candleData.candles;
        if (!Array.isArray(history) || history.length === 0) { setLoadingPairs(prev => ({ ...prev, [pair]: false })); return; }
        const latest = history[history.length - 1];
        const basePrice = latest ? latest.close : (PAIR_CONFIGS[pair]?.basePrice || 1.0);
        const calculatedIndicators = calculateAllIndicators(history);
        const smc = analyzeSmcStructures(history, 'M15');

        const res = await fetch('/api/forex/ai-opinion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pair,
            timeframe: 'M15',
            style: tradingStyle,
            currentPrice: basePrice,
            indicators: calculatedIndicators,
            smc,
            riskSettings: { accountSize: 10000, riskPercent: 1.0 }
          })
        });
        const data = await res.json();
        if (isMounted && data) {
          setSignalCache(prev => {
            const updated = { ...prev, [pair]: data };
            try {
              localStorage.setItem('quantum_signal_cache', JSON.stringify(updated));
            } catch (e) {}
            return updated;
          });
        }
      } catch (err) {
        console.error(`Scanner error for ${pair}:`, err);
      } finally {
        if (isMounted) {
          setLoadingPairs(prev => ({ ...prev, [pair]: false }));
        }
      }
    };

    // Initial scan
    ALL_PAIRS.forEach((pair, idx) => {
      if (!signalCache[pair] || pair !== activePair) {
        setTimeout(() => {
          scanPair(pair);
        }, idx * 1200);
      }
    });

    // Periodic refresh
    const interval = setInterval(() => {
      const inactivePairs = ALL_PAIRS.filter(p => p !== activePair);
      const randomPair = inactivePairs[0];
      if (randomPair) scanPair(randomPair);
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [tradingStyle, activePair]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Brain className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isMalay ? 'Peluang AI Global & Multi-Pair Scanner' : 'Global AI Opportunities & Multi-Pair Scanner'}
            </h3>
            <p className="text-xs text-slate-400">
              {isMalay ? 'Analisis masa sebenar merentasi semua pasaran forex, komoditi & indeks global' : 'Real-time AI signal monitoring across all global currency & asset pairs'}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold rounded-full flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          LIVE SCANNER
        </span>
      </div>

      {/* Grid of All Pairs AI Signals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {ALL_PAIRS.map(pair => {
          const sig = signalCache[pair];
          const isLoading = loadingPairs[pair];
          const isSelected = activePair === pair;
          const action = sig?.action || 'WAIT';
          const isBuy = action === 'BUY';
          const isSell = action === 'SELL';

          return (
            <div
              key={pair}
              onClick={() => setActivePair(pair)}
              className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-3 ${
                isSelected
                  ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/10'
                  : 'bg-slate-950/60 border-slate-800/90 hover:border-slate-700 hover:bg-slate-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-white text-xs">{pair}</span>
                {isLoading ? (
                  <span className="text-[10px] text-blue-400 animate-pulse">Scanning...</span>
                ) : (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    isSell ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {action}
                  </span>
                )}
              </div>

              {sig && sig.action !== 'WAIT / NO SETUP' ? (
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Conf:</span>
                    <span className="text-emerald-400 font-bold">{sig.confidence}%</span>
                  </div>
                  {sig.entryZone && (
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Entry:</span>
                      <span className="text-amber-400">{sig.entryZone.min}</span>
                    </div>
                  )}
                  {sig.takeProfit1 && (
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>TP1:</span>
                      <span className="text-emerald-400">{sig.takeProfit1}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-3 text-center text-slate-500 text-xs font-mono">
                  {isLoading ? 'Analysing...' : 'WAIT / Sideway'}
                </div>
              )}

              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-blue-400 font-semibold">
                <span>{isSelected ? 'Aktif' : 'Pilih'}</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


