import React, { useState, useEffect } from 'react';
import { CurrencyPair, Timeframe, BacktestResult, MultiPairOneYearBacktestResult } from '../types';
import { History, Play, Trophy, TrendingUp, AlertOctagon, X, RefreshCw, ShieldAlert, CheckCircle2, XCircle, Ban, Filter, Brain, Sparkles, Layers } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface BacktestModuleProps {
  isOpen: boolean;
  onClose: () => void;
  activePair: CurrencyPair;
  activeTimeframe: Timeframe;
  language?: Language;
}

export const BacktestModule: React.FC<BacktestModuleProps> = ({
  isOpen,
  onClose,
  activePair,
  activeTimeframe,
  language = 'ms',
}) => {
  const t = translations[language] || translations.ms;
  const isMalay = language === 'ms';

  const [activeTab, setActiveTab] = useState<'SINGLE' | 'ONE_YEAR'>('ONE_YEAR');
  const [pair, setPair] = useState<CurrencyPair>(activePair);
  const [timeframe, setTimeframe] = useState<Timeframe>(activeTimeframe);
  const [strategy, setStrategy] = useState("Smart Money Order Block + Penaliti Berita ±30m");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [filterTab, setFilterTab] = useState<'ALL' | 'WIN' | 'LOSS' | 'NEWS_SKIPPED'>('ALL');

  // 1-Year Multi-Pair Backtest state
  const [oneYearResult, setOneYearResult] = useState<MultiPairOneYearBacktestResult | null>(null);
  const [loadingOneYear, setLoadingOneYear] = useState(false);

  const fetchOneYearBacktest = async () => {
    setLoadingOneYear(true);
    try {
      const res = await fetch('/api/forex/backtest-1year');
      if (res.ok) {
        const data = await res.json();
        if (data && data.pairSummaries) {
          setOneYearResult(data);
        }
      }
    } catch (err) {
      console.error('Fetch 1-year backtest error:', err);
    } finally {
      setLoadingOneYear(false);
    }
  };

  const handleRunOneYearBacktest = async () => {
    setLoadingOneYear(true);
    try {
      const res = await fetch('/api/forex/backtest-1year', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.pairSummaries) {
          setOneYearResult(data);
        }
      }
    } catch (err) {
      console.error('Run 1-year backtest error:', err);
    } finally {
      setLoadingOneYear(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOneYearBacktest();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunBacktest = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/forex/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair, timeframe, strategy })
      });
      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Backtest Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = result ? result.trades.filter(t => {
    if (filterTab === 'WIN') return t.status === 'EXECUTED_WIN';
    if (filterTab === 'LOSS') return t.status === 'EXECUTED_LOSS';
    if (filterTab === 'NEWS_SKIPPED') return t.status === 'SKIPPED_NEWS_BLACKOUT';
    return true;
  }) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-5 relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header & Main Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl">
              <Brain className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                {t.backtestTitle}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold">
                  AI CONTINUOUS LEARNING
                </span>
              </h3>
              <p className="text-xs text-slate-400">{t.backtestSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start sm:self-auto text-xs font-bold">
            <button
              onClick={() => setActiveTab('ONE_YEAR')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                activeTab === 'ONE_YEAR'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>1-Year Multi-Pair AI Engine</span>
            </button>
            <button
              onClick={() => setActiveTab('SINGLE')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                activeTab === 'SINGLE'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Single Pair Simulator</span>
            </button>
          </div>
        </div>

        {/* TAB 1: 1-YEAR MULTI-PAIR BACKTEST & AI LEARNING REPORT */}
        {activeTab === 'ONE_YEAR' && (
          <div className="space-y-4">
            <div className="bg-purple-950/20 border border-purple-500/30 rounded-xl p-4 text-xs text-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-bold text-white flex items-center gap-2 text-sm">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <span>Enjin Pembelajaran AI Background & Backtest 365 Hari (7 Aset)</span>
                </div>
                <p className="text-purple-300/80 text-[11px]">
                  Sistem menjalankan ujian backtest 1 tahun bagi setiap pair di latar belakang, belajar daripada setiap rekod kerugian untuk mengemaskini kod & peraturan analisis AI secara automatik.
                </p>
              </div>

              <button
                onClick={handleRunOneYearBacktest}
                disabled={loadingOneYear}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shrink-0 shadow-lg cursor-pointer"
              >
                {loadingOneYear ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{loadingOneYear ? 'Menganalisis 365 Hari...' : 'Ulang Backtest 1-Tahun'}</span>
              </button>
            </div>

            {/* Overall 1-Year KPI Summary */}
            {oneYearResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-purple-500/30">
                  <span className="text-[10px] text-purple-300 uppercase font-bold block mb-1">Purata Win Rate (1 Tahun)</span>
                  <span className="font-mono font-extrabold text-emerald-400 text-2xl">{oneYearResult.overallWinRatePercent}%</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Semua 7 Pair Tergabung</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Jumlah Untung Bersih (1 Tahun)</span>
                  <span className="font-mono font-extrabold text-emerald-400 text-2xl">${oneYearResult.totalNetPnlDollars.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">365 Hari Dagangan Simpinan</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Profit Factor</span>
                  <span className="font-mono font-extrabold text-purple-400 text-2xl">{oneYearResult.overallProfitFactor}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Nisbah Keuntungan/Kerugian</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Jumlah Pair Dibenarkan</span>
                  <span className="font-mono font-extrabold text-blue-400 text-2xl">{oneYearResult.totalPairsTested} Aset</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Forex, Emas, Indeks & Crypto</span>
                </div>
              </div>
            )}

            {/* Per-Pair 1-Year Performance Breakdown Table */}
            {oneYearResult && (
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden space-y-3 p-4">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Prestasi 1-Tahun Mengikut Pasangan Mata Wang (Pair Breakdown)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {oneYearResult.pairSummaries.map((ps) => (
                    <div key={ps.pair} className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-white text-sm">{ps.pair}</span>
                        <span className="text-emerald-400 font-extrabold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                          {ps.winRatePercent}% Win Rate
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-300 bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <div>
                          <span className="text-[9px] text-slate-500 block">DAGANGAN</span>
                          <strong>{ps.totalTradesExecuted} trades</strong>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 block">PROFIT FACTOR</span>
                          <strong className="text-purple-400">{ps.profitFactor}</strong>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 block">NET PnL</span>
                          <strong className="text-emerald-400">+${ps.netPnlDollars.toFixed(2)}</strong>
                        </div>
                      </div>

                      {/* AI Rules Learned for this pair */}
                      {ps.learnedAdaptiveRules && ps.learnedAdaptiveRules.length > 0 && (
                        <div className="bg-purple-950/30 p-2 rounded-lg border border-purple-500/20 text-[10px] space-y-1">
                          <span className="font-bold text-purple-300 block flex items-center gap-1">
                            <Brain className="w-3 h-3 text-purple-400" /> Peraturan Diberi Pelajaran AI (1-Tahun):
                          </span>
                          {ps.learnedAdaptiveRules.map((rule, idx) => (
                            <p key={idx} className="text-slate-300 italic">
                              "{rule}"
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SINGLE PAIR SIMULATOR */}
        {activeTab === 'SINGLE' && (
          <div className="space-y-4">
            {/* Controls Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
              <div>
                <label className="text-slate-400 font-semibold block mb-1">{t.pairSelect}</label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value as CurrencyPair)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 font-mono font-bold"
                >
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="GBP/USD">GBP/USD</option>
                  <option value="USD/JPY">USD/JPY</option>
                  <option value="AUD/USD">AUD/USD</option>
                  <option value="XAU/USD">XAU/USD (Gold)</option>
                  <option value="NASDAQ">NASDAQ 100</option>
                  <option value="BTC/USD">BTC/USD</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-semibold block mb-1">{t.timeframeSelect}</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 font-mono font-bold"
                >
                  <option value="M15">M15 (Scalp/Intraday)</option>
                  <option value="H1">H1 (Intraday/Swing)</option>
                  <option value="H4">H4 (Trend Main)</option>
                  <option value="D1">D1 (Daily Macro)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-semibold block mb-1">{t.strategySelect}</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 font-semibold"
                >
                  <option value="Smart Money Order Block + Penaliti Berita ±30m">SMC Order Block + News Protection (±30m)</option>
                  <option value="Fair Value Gap Fill & RSI Confluence">FVG Zone Fill + News Filter</option>
                  <option value="Liquidity Sweep & Breakout Confirm">Liquidity Sweep + High Impact Filter</option>
                </select>
              </div>
            </div>

            {/* Rule Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs flex items-center justify-between text-amber-300">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t.newsRuleNotice}</span>
              </div>
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{loading ? t.runningSimulation : t.runSimulation}</span>
            </button>

            {/* Dashboard Results Section */}
            {result && (
              <div className="space-y-4 pt-2 border-t border-slate-800">
                {/* KPI Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">{t.winRate}</span>
                    <span className="font-mono font-extrabold text-emerald-400 text-xl">{result.winRatePercent}%</span>
                    <span className="text-[10px] text-slate-500 block">{result.winCount} W / {result.lossCount} L</span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">{t.netReturn}</span>
                    <span className={`font-mono font-extrabold text-xl ${result.totalPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ${result.totalPnlDollars.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">{result.winCount + result.lossCount} Trade</span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-amber-500/30">
                    <span className="text-[10px] text-amber-400 uppercase font-bold block mb-1">{t.skippedNews}</span>
                    <span className="font-mono font-extrabold text-amber-400 text-xl">{result.skippedNewsCount}</span>
                    <span className="text-[10px] text-slate-400 block">Protected Trades</span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">{t.profitFactor}</span>
                    <span className="font-mono font-extrabold text-blue-400 text-xl">{result.profitFactor}</span>
                    <span className="text-[10px] text-slate-500 block">Gross Profit / Loss</span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">{t.riskReward}</span>
                    <span className="font-mono font-extrabold text-purple-400 text-xl">1 : {result.avgRiskReward}</span>
                    <span className="text-[10px] text-slate-500 block">Target TP 2x SL</span>
                  </div>
                </div>

                {/* Filter Tabs for Trades */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-blue-400" />
                    {t.executionLogs} ({filteredTrades.length})
                  </span>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
                    <button
                      onClick={() => setFilterTab('ALL')}
                      className={`px-2.5 py-1 rounded transition ${filterTab === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {t.filterAll} ({result.trades.length})
                    </button>
                    <button
                      onClick={() => setFilterTab('WIN')}
                      className={`px-2.5 py-1 rounded transition ${filterTab === 'WIN' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {t.filterWin} ({result.winCount})
                    </button>
                    <button
                      onClick={() => setFilterTab('LOSS')}
                      className={`px-2.5 py-1 rounded transition ${filterTab === 'LOSS' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {t.filterLoss} ({result.lossCount})
                    </button>
                    <button
                      onClick={() => setFilterTab('NEWS_SKIPPED')}
                      className={`px-2.5 py-1 rounded transition ${filterTab === 'NEWS_SKIPPED' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {t.filterNewsSkipped} ({result.skippedNewsCount})
                    </button>
                  </div>
                </div>

                {/* Trades Log Table */}
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60 text-xs">
                    {filteredTrades.map((t) => {
                      const isWin = t.status === 'EXECUTED_WIN';
                      const isLoss = t.status === 'EXECUTED_LOSS';
                      const isSkipped = t.status === 'SKIPPED_NEWS_BLACKOUT';

                      return (
                        <div key={t.id} className="p-3 hover:bg-slate-900/80 transition space-y-1.5">
                          <div className="flex items-center justify-between">
                            {/* Direction & Pair & Price */}
                            <div className="flex items-center gap-2 font-mono">
                              <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                                t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}>
                                {t.direction}
                              </span>
                              <span className="font-bold text-white">{pair}</span>
                              <span className="text-slate-400 text-[11px]">
                                Entry: <strong className="text-slate-200">{t.entryPrice.toFixed(5)}</strong>
                              </span>
                              <span className="text-slate-500 text-[10px]">
                                (SL: {t.stopLoss.toFixed(5)} | TP: {t.takeProfit.toFixed(5)})
                              </span>
                            </div>

                            {/* Outcome & PnL */}
                            <div className="flex items-center gap-3 font-mono">
                              {isSkipped ? (
                                <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded font-bold text-[10px] flex items-center gap-1">
                                  <Ban className="w-3 h-3" /> DIELAKKAN (0 Pips)
                                </span>
                              ) : isWin ? (
                                <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded font-bold text-[10px] flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> WIN (+{t.resultPips} Pips)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/40 text-rose-400 rounded font-bold text-[10px] flex items-center gap-1">
                                  <XCircle className="w-3 h-3" /> LOSS ({t.resultPips} Pips)
                                </span>
                              )}

                              <span className={`font-bold ${isSkipped ? 'text-slate-500' : isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {t.pnlDollars > 0 ? `+$${t.pnlDollars.toFixed(2)}` : `$${t.pnlDollars.toFixed(2)}`}
                              </span>
                            </div>
                          </div>

                          {/* Entry Reason & News Status */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] gap-1 text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                            <div>
                              <strong className="text-slate-300">Sebab Masuk:</strong> {t.entryReason}
                            </div>
                            <div className={`font-mono text-[10px] font-semibold ${t.newsStatus.isBlackout ? 'text-amber-400 font-bold' : 'text-emerald-400/90'}`}>
                              {t.newsStatus.statusText}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredTrades.length === 0 && (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        Tiada rekod trade bagi kategori tapisan ini.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


