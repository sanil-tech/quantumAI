import React, { useState, useEffect } from 'react';
import { JournalEntry, CurrencyPair, TradingStyle } from '../types';
import { BookOpen, Plus, X, Trash2, Clock, ShieldAlert, Target, TrendingUp, Brain, Sparkles, RefreshCw } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface JournalModuleProps {
  isOpen: boolean;
  onClose: () => void;
  activePair: CurrencyPair;
  activeStyle: TradingStyle;
  language?: Language;
  onOpenAdaptiveLearning?: () => void;
}

export const JournalModule: React.FC<JournalModuleProps> = ({
  isOpen,
  onClose,
  activePair,
  activeStyle,
  language = 'ms',
  onOpenAdaptiveLearning
}) => {
  const t = translations[language] || translations.ms;
  const isMalay = language === 'ms';
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [entryReviews, setEntryReviews] = useState<Record<string, any>>({});

  // New Entry Form State
  const [pair, setPair] = useState<CurrencyPair>(activePair);
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState<number>(1.08250);
  const [exitPrice, setExitPrice] = useState<number>(1.08620);
  const [stopLoss, setStopLoss] = useState<number>(1.07980);
  const [takeProfit, setTakeProfit] = useState<number>(1.08700);
  const [lotSize, setLotSize] = useState<number>(0.2);
  const [pnlDollars, setPnlDollars] = useState<number>(60.00);
  const [notes, setNotes] = useState('');

  const sanitizeJournalEntry = (e: JournalEntry): JournalEntry => {
    if (!e || !e.pair) return e;
    const isFxPair = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY'].includes(e.pair);
    const isJpy = e.pair === 'USD/JPY';

    let needsFix = false;
    if (isFxPair && !isJpy && (e.exitPrice > 5.0 || e.exitPrice < 0.1)) {
      needsFix = true;
    } else if (isJpy && (e.exitPrice > 300 || e.exitPrice < 50)) {
      needsFix = true;
    } else if (Math.abs(e.pnlDollars) > 100000) {
      needsFix = true;
    }

    if (needsFix) {
      let correctedExit = (e.takeProfit && e.takeProfit > 0) ? e.takeProfit : ((e.stopLoss && e.stopLoss > 0) ? e.stopLoss : e.entryPrice);
      if (isFxPair && !isJpy && (correctedExit > 5.0 || correctedExit < 0.1)) {
        correctedExit = e.entryPrice;
      }

      const diff = e.direction === 'BUY' ? (correctedExit - e.entryPrice) : (e.entryPrice - correctedExit);
      let pips = 0;
      if (e.pair === 'USD/JPY') pips = diff * 100;
      else if (e.pair === 'XAU/USD') pips = diff * 10;
      else if (e.pair === 'NASDAQ' || e.pair === 'BTC/USD') pips = diff;
      else pips = diff * 10000;

      let pnl = 0;
      const lot = e.lotSize || 0.1;
      if (e.pair === 'XAU/USD') pnl = pips * lot * 10.0;
      else if (e.pair === 'NASDAQ') pnl = pips * lot * 1.0;
      else if (e.pair === 'BTC/USD') pnl = pips * lot * 0.1;
      else pnl = pips * lot * 10.0;

      const decimals = e.pair === 'USD/JPY' ? 3 : (e.pair === 'XAU/USD' || e.pair === 'NASDAQ' || e.pair === 'BTC/USD') ? 2 : 5;

      return {
        ...e,
        exitPrice: Number(correctedExit.toFixed(decimals)),
        pnlDollars: Number(pnl.toFixed(2)),
        status: pnl >= 0 ? 'CLOSED_WIN' : 'CLOSED_LOSS'
      };
    }

    return e;
  };

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/forex/journal');
      const data = await res.json();
      let serverList: JournalEntry[] = (data.entries || []).map(sanitizeJournalEntry);

      // Merge manual saved entries from localStorage
      try {
        const manualSavedStr = localStorage.getItem('quantum_manual_journal_entries');
        if (manualSavedStr) {
          const manualSaved: JournalEntry[] = JSON.parse(manualSavedStr);
          const existingIds = new Set(serverList.map(e => e.id));
          const newManual = manualSaved.filter(e => !existingIds.has(e.id));
          serverList = [...newManual, ...serverList];
        }
      } catch (err) {
        console.error('Manual saved entries parse error:', err);
      }

      // Merge auto closed trades from localStorage to ensure 100% data sync
      try {
        const localClosedStr = localStorage.getItem('quantum_closed_trades');
        if (localClosedStr) {
          const localClosed = JSON.parse(localClosedStr);
          const convertedLocal: JournalEntry[] = localClosed.map((c: any) => sanitizeJournalEntry({
            id: c.id,
            timestamp: c.closeTime || Date.now(),
            pair: c.pair,
            tradingStyle: 'DAY_TRADER' as TradingStyle,
            direction: c.direction,
            entryPrice: c.entryPrice,
            exitPrice: c.exitPrice,
            stopLoss: c.stopLoss,
            takeProfit: c.takeProfit1,
            lotSize: c.lotSize,
            pnlDollars: c.pnlDollars,
            status: c.pnlDollars >= 0 ? 'CLOSED_WIN' : 'CLOSED_LOSS',
            notes: `Auto Executed via Quantum AI Engine. Reason: ${c.closeReason || 'CLOSED'}`,
            tags: ['AutoTrader']
          }));

          // Avoid duplicates by checking id or combination
          const existingIds = new Set(serverList.map(e => e.id));
          const newLocalEntries = convertedLocal.filter(e => !existingIds.has(e.id));
          serverList = [...newLocalEntries, ...serverList];
        }
      } catch (err) {
        console.error('Local closed trades parse error:', err);
      }

      setEntries(serverList.map(sanitizeJournalEntry));
    } catch (err) {
      console.error('Journal Fetch Error:', err);
    }
  };

  useEffect(() => {
    if (isOpen) fetchEntries();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunPostMortem = async (item: JournalEntry) => {
    setAnalyzingId(item.id);
    try {
      const res = await fetch('/api/forex/post-mortem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: item.pair,
          direction: item.direction,
          entryPrice: item.entryPrice,
          exitPrice: item.exitPrice || item.entryPrice,
          stopLoss: item.stopLoss,
          takeProfit: item.takeProfit,
          pnlDollars: item.pnlDollars || 0,
          notes: item.notes || 'Journal entry review request'
        })
      });
      const data = await res.json();
      if (data.review) {
        setEntryReviews(prev => ({ ...prev, [item.id]: data.review }));
      }
    } catch (err) {
      console.error('Post-mortem error:', err);
    } finally {
      setAnalyzingId(null);
    }
  };
  const handleAddTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const newManualObj = {
      id: `manual_${Date.now()}`,
      timestamp: Date.now(),
      pair,
      tradingStyle: activeStyle,
      direction,
      entryPrice,
      exitPrice,
      stopLoss,
      takeProfit,
      lotSize,
      pnlDollars,
      status: pnlDollars > 0 ? ('CLOSED_WIN' as const) : pnlDollars < 0 ? ('CLOSED_LOSS' as const) : ('OPEN' as const),
      notes,
      tags: ['ManualEntry', activeStyle]
    };

    // Always persist to localStorage
    try {
      const existingStr = localStorage.getItem('quantum_manual_journal_entries');
      const existing = existingStr ? JSON.parse(existingStr) : [];
      localStorage.setItem('quantum_manual_journal_entries', JSON.stringify([newManualObj, ...existing]));
    } catch (err) {
      console.error('LocalStorage manual entry save error:', err);
    }

    try {
      const status = pnlDollars > 0 ? 'CLOSED_WIN' : pnlDollars < 0 ? 'CLOSED_LOSS' : 'OPEN';
      const res = await fetch('/api/forex/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          tradingStyle: activeStyle,
          direction,
          entryPrice,
          exitPrice,
          stopLoss,
          takeProfit,
          lotSize,
          pnlDollars,
          status,
          notes,
          tags: ['ManualEntry', activeStyle]
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddForm(false);
        fetchEntries();
      }
    } catch (err) {
      console.error('Add Trade Error:', err);
      setShowAddForm(false);
      fetchEntries();
    }
  };

  const handleDeleteTrade = async (id: string) => {
    try {
      await fetch(`/api/forex/journal/${id}`, { method: 'DELETE' });
      fetchEntries();
    } catch (err) {
      console.error('Delete Trade Error:', err);
    }
  };

  const totalTrades = entries.length;
  const wins = entries.filter((e) => e.pnlDollars && e.pnlDollars > 0).length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
  const totalPnl = entries.reduce((acc, curr) => acc + (curr.pnlDollars || 0), 0);

  const formatTimestamp = (ts?: number) => {
    if (!ts) return 'Terbaru';
    const d = new Date(ts);
    return d.toLocaleString('ms-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatPrice = (p?: number, pairName?: string) => {
    if (p === undefined || p === null) return '-';
    const decimals = (pairName === 'USD/JPY') ? 3 : (pairName === 'XAU/USD' || pairName === 'NASDAQ' || pairName === 'BTC/USD') ? 2 : 5;
    return p.toFixed(decimals);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t.journalTitle}</h3>
              <p className="text-xs text-slate-400">Rekod Masa Sebenar Entry & Paras SL/TP • {activePair} ({activeStyle})</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAdaptiveLearning && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAdaptiveLearning();
                }}
                className="px-3 py-1.5 bg-purple-950/90 hover:bg-purple-900 border border-purple-500/50 text-purple-200 hover:text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow"
                title="Analisis Corak Entri & Profil Pembelajaran AI"
              >
                <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span>🧠 Analisis Corak Entri AI</span>
              </button>
            )}

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'Batal' : t.addEntry}</span>
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Jumlah Trade Direkod</span>
            <span className="font-mono font-bold text-white text-lg">{totalTrades}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">{t.winRate}</span>
            <span className="font-mono font-bold text-emerald-400 text-lg">{winRate}%</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">{t.totalPnl}</span>
            <span className={`font-mono font-bold text-lg ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ${totalPnl.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Add Trade Form Modal / Container */}
        {showAddForm && (
          <form onSubmit={handleAddTrade} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <span className="font-bold text-slate-200 block border-b border-slate-800 pb-2">Rekod Masukan Trade Sebenar</span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="text-slate-400 block mb-1">Pasangan (Pair)</label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value as CurrencyPair)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono"
                >
                  <option value="EUR/USD">EUR/USD</option>
                  <option value="GBP/USD">GBP/USD</option>
                  <option value="USD/JPY">USD/JPY</option>
                  <option value="AUD/USD">AUD/USD</option>
                  <option value="XAU/USD">XAU/USD</option>
                  <option value="NASDAQ">NASDAQ</option>
                  <option value="BTC/USD">BTC/USD</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Arah (Direction)</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'BUY' | 'SELL')}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono font-bold"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Harga Entry</label>
                <input
                  type="number"
                  step="0.00001"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono font-bold text-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Stop Loss (SL)</label>
                <input
                  type="number"
                  step="0.00001"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono font-bold text-rose-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Take Profit (TP)</label>
                <input
                  type="number"
                  step="0.00001"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Lot Size</label>
                <input
                  type="number"
                  step="0.01"
                  value={lotSize}
                  onChange={(e) => setLotSize(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Harga Exit (Opt)</label>
                <input
                  type="number"
                  step="0.00001"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">P&L ($)</label>
                <input
                  type="number"
                  step="1"
                  value={pnlDollars}
                  onChange={(e) => setPnlDollars(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 font-mono font-bold text-emerald-400"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Sebab & Nota Masukan</label>
              <input
                type="text"
                placeholder="e.g. Belian pada Order Block M15 + RSI bullish divergence..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition"
            >
              Simpan Rekod Trade
            </button>
          </form>
        )}

        {/* Entries List with Timestamps & Clear SL/TP Levels */}
        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              Tiada rekod trade lagi. Sila klik "Rekod Trade Baharu" atau simpan terus dari AI Analysis setup.
            </div>
          ) : (
            entries.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-xl space-y-2 text-xs hover:border-slate-700 transition shadow-sm"
              >
                {/* Row 1: Direction, Pair, Lot Size, Timestamp, Status, PnL & Delete */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      item.direction === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {item.direction} {item.pair}
                    </span>

                    <span className="text-slate-300 font-mono text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {item.lotSize} Lots
                    </span>

                    <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/80">
                      <Clock className="w-3 h-3 text-blue-400" />
                      <span>{formatTimestamp(item.timestamp)}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                      item.status === 'CLOSED_WIN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      item.status === 'CLOSED_LOSS' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                      'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {item.status}
                    </span>

                    <span className={`font-mono font-bold text-sm ${
                      item.pnlDollars && item.pnlDollars > 0 ? 'text-emerald-400' :
                      item.pnlDollars && item.pnlDollars < 0 ? 'text-rose-400' :
                      'text-slate-300'
                    }`}>
                      {item.pnlDollars !== undefined && item.pnlDollars !== 0
                        ? `${item.pnlDollars > 0 ? '+' : ''}$${item.pnlDollars.toFixed(2)}`
                        : '$0.00 (OPEN)'}
                    </span>

                    <button
                      onClick={() => handleDeleteTrade(item.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded transition"
                      title="Padam rekod trade"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Price Levels Display (ENTRY, SL, TP) */}
                <div className="grid grid-cols-3 gap-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800/80 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <Target className="w-3 h-3 text-amber-400" /> ENTRY:
                    </span>
                    <span className="text-white font-bold">{formatPrice(item.entryPrice, item.pair)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-rose-400 font-semibold flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rose-400" /> SL:
                    </span>
                    <span className="text-rose-300 font-bold">{formatPrice(item.stopLoss, item.pair)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-400" /> TP:
                    </span>
                    <span className="text-emerald-300 font-bold">{formatPrice(item.takeProfit, item.pair)}</span>
                  </div>
                </div>

                {/* Row 3: Execution Notes / Rationale */}
                {item.notes && (
                  <p className="text-slate-300 italic text-[11px] bg-slate-900/40 p-2 rounded border border-slate-800/50">
                    <span className="font-semibold text-slate-400 not-italic">Sebab/Nota Entry: </span>
                    {item.notes}
                  </p>
                )}

                {/* Row 4: AI Post-Mortem Review Section */}
                {entryReviews[item.id] ? (
                  <div className="bg-purple-950/40 border border-purple-500/30 rounded-lg p-2.5 space-y-1 text-[11px] text-purple-200">
                    <span className="font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />
                      {isMalay ? 'Punca Utama & Peraturan Adaptif AI:' : 'Root Cause & Adaptive AI Rule:'}
                    </span>
                    <p className="text-slate-300">
                      <strong>Root Cause:</strong> {isMalay ? entryReviews[item.id].rootCauseMs : entryReviews[item.id].rootCauseEn}
                    </p>
                    <p className="font-semibold text-purple-200">
                      <strong>Rule:</strong> {isMalay ? entryReviews[item.id].adaptiveRuleMs : entryReviews[item.id].adaptiveRuleEn}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => handleRunPostMortem(item)}
                      disabled={analyzingId === item.id}
                      className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition"
                    >
                      <Brain className={`w-3 h-3 text-purple-400 ${analyzingId === item.id ? 'animate-spin' : ''}`} />
                      <span>
                        {analyzingId === item.id
                          ? (isMalay ? 'Menganalisis Post-Mortem...' : 'Analyzing Post-Mortem...')
                          : (isMalay ? '🔍 Jalankan Analisis Post-Mortem AI' : '🔍 Run AI Post-Mortem')}
                      </span>
                    </button>

                    {onOpenAdaptiveLearning && (
                      <button
                        onClick={onOpenAdaptiveLearning}
                        className="text-[10px] text-purple-400 hover:underline flex items-center gap-1"
                      >
                        {isMalay ? 'Lihat Semua Memori AI →' : 'View AI Memory →'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

