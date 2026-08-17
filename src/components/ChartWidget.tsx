import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickData, LineStyle, CandlestickSeries } from 'lightweight-charts';
import { CandleData, CurrencyPair, Timeframe, AiTradeOpportunity, SmcStructures, SupportResistanceZone } from '../types';
import { calculate24hRollingChange } from '../lib/marketDataGenerator';
import { Layers, Eye, RefreshCw, TrendingUp, TrendingDown, Zap, CheckCircle2, XCircle, DollarSign, Brain, ShieldCheck, AlertTriangle, Sparkles, Target, Fingerprint, ChevronDown, ChevronUp } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface ChartWidgetProps {
  candles: CandleData[];
  pair: CurrencyPair;
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;
  aiOpportunity?: AiTradeOpportunity | null;
  smcData?: SmcStructures;
  srZones?: SupportResistanceZone[];
  onRefreshData?: () => void;
  onAskPakar?: (prompt: string) => void;
  language?: Language;
  onExecuteTrade?: (direction: 'BUY' | 'SELL', entryPrice?: number) => void;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

// Helper to get flags or currency pair icons
const getPairMeta = (pair: CurrencyPair) => {
  switch (pair) {
    case 'EUR/USD':
      return { title: 'EUR to USD', quote: 'USD', baseFlag: 'ðŸ‡ªðŸ‡º', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
    case 'GBP/USD':
      return { title: 'GBP to USD', quote: 'USD', baseFlag: 'ðŸ‡¬ðŸ‡§', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
    case 'USD/JPY':
      return { title: 'USD to JPY', quote: 'JPY', baseFlag: 'ðŸ‡ºðŸ‡¸', quoteFlag: 'ðŸ‡¯ðŸ‡µ' };
    case 'AUD/USD':
      return { title: 'AUD to USD', quote: 'USD', baseFlag: 'ðŸ‡¦ðŸ‡º', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
    case 'XAU/USD':
      return { title: 'Gold to USD', quote: 'USD', baseFlag: 'ðŸ¥‡', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
    case 'NASDAQ':
      return { title: 'NASDAQ 100', quote: 'USD', baseFlag: 'ðŸ“ˆ', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
    case 'BTC/USD':
      return { title: 'BTC to USD', quote: 'USD', baseFlag: 'â‚¿', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
    default:
      return { title: String(pair).replace('/', ' to '), quote: 'USD', baseFlag: 'ðŸŒ', quoteFlag: 'ðŸ‡ºðŸ‡¸' };
  }
};

export const ChartWidget: React.FC<ChartWidgetProps> = ({
  candles,
  pair,
  timeframe,
  setTimeframe,
  aiOpportunity,
  smcData,
  srZones,
  onRefreshData,
  onAskPakar,
  language = 'ms',
  onExecuteTrade,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Overlay state toggles
  const [showOverlays, setShowOverlays] = useState({
    setupLevels: true,
    orderBlocks: true,
    supportResistance: true,
  });

  // Custom Order Parameters State (Lot Size, SL pips, TP pips & Fixed Price Levels)
  const [customLot, setCustomLot] = useState<number>(0.10);
  const [customSlPips, setCustomSlPips] = useState<number>(30);
  const [customTpPips, setCustomTpPips] = useState<number>(60);
  const [customSlPrice, setCustomSlPrice] = useState<number | null>(null);
  const [customTpPrice, setCustomTpPrice] = useState<number | null>(null);
  const [draggingLevel, setDraggingLevel] = useState<'SL' | 'TP' | null>(null);

  // Live AI Manual Entry Analysis & Guard State
  const [showAiManualGuard, setShowAiManualGuard] = useState<boolean>(false);
  const [manualAiFeedback, setManualAiFeedback] = useState<any>(null);
  const [isAnalyzingManual, setIsAnalyzingManual] = useState<boolean>(false);

  const runManualEntryPreCheck = async (direction: 'BUY' | 'SELL' = 'BUY') => {
    setIsAnalyzingManual(true);
    const latestClose = candles && candles.length > 0 ? candles[candles.length - 1].close : 1.0;
    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU');
    const isCrypto = pair.includes('BTC');
    const isNasdaq = pair.includes('NASDAQ');
    const pipMultiplier = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
    const decimals = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;

    const slVal = customSlPriceVal || parseFloat((direction === 'BUY' ? latestClose - (customSlPips * pipMultiplier) : latestClose + (customSlPips * pipMultiplier)).toFixed(decimals));
    const tpVal = customTpPriceVal || parseFloat((direction === 'BUY' ? latestClose + (customTpPips * pipMultiplier) : latestClose - (customTpPips * pipMultiplier)).toFixed(decimals));

    try {
      const res = await fetch('/api/forex/ai-entry-pattern-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          timeframe,
          proposedEntry: {
            direction,
            entryPrice: latestClose,
            stopLoss: slVal,
            takeProfit: tpVal,
            lotSize: customLot
          }
        })
      });
      const data = await res.json();
      if (data.proposedEntryCheck) {
        setManualAiFeedback({
          ...data.proposedEntryCheck,
          traderDNA: data.traderDNA,
          adaptiveRecommendations: language === 'ms' ? data.adaptiveRecommendationsMs : data.adaptiveRecommendationsEn,
          keyFlaws: language === 'ms' ? data.keyEntryFlawsMs : data.keyEntryFlawsEn
        });
      }
    } catch (err) {
      console.error('Manual Entry AI check error:', err);
    } finally {
      setIsAnalyzingManual(false);
    }
  };

  // Initialize / lock fixed SL and TP price levels when pair or AI opportunity changes
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    const latestClose = candles[candles.length - 1].close;
    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU');
    const isCrypto = pair.includes('BTC');
    const isNasdaq = pair.includes('NASDAQ');
    const pipMult = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
    const dec = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;

    const isSell = aiOpportunity?.action === 'SELL';

    if (aiOpportunity?.stopLoss) {
      setCustomSlPrice(aiOpportunity.stopLoss);
      const pips = Math.max(1, Math.round(Math.abs(latestClose - aiOpportunity.stopLoss) / pipMult));
      setCustomSlPips(pips);
    } else {
      const slVal = parseFloat((isSell ? (latestClose + 30 * pipMult) : (latestClose - 30 * pipMult)).toFixed(dec));
      setCustomSlPrice(slVal);
      setCustomSlPips(30);
    }

    if (aiOpportunity?.takeProfit1) {
      setCustomTpPrice(aiOpportunity.takeProfit1);
      const pips = Math.max(1, Math.round(Math.abs(latestClose - aiOpportunity.takeProfit1) / pipMult));
      setCustomTpPips(pips);
    } else {
      const tpVal = parseFloat((isSell ? (latestClose - 60 * pipMult) : (latestClose + 60 * pipMult)).toFixed(dec));
      setCustomTpPrice(tpVal);
      setCustomTpPips(60);
    }
  }, [pair, aiOpportunity?.id]);

  const handleSlPipsChange = (newPips: number) => {
    const pips = Math.max(1, newPips);
    setCustomSlPips(pips);
    const latestClose = candles && candles.length > 0 ? candles[candles.length - 1].close : 1.0;
    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU');
    const isCrypto = pair.includes('BTC');
    const isNasdaq = pair.includes('NASDAQ');
    const pipMult = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
    const dec = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;
    const isSell = aiOpportunity?.action === 'SELL';
    const newSlPrice = parseFloat((isSell ? (latestClose + pips * pipMult) : (latestClose - pips * pipMult)).toFixed(dec));
    setCustomSlPrice(newSlPrice);
  };

  const handleTpPipsChange = (newPips: number) => {
    const pips = Math.max(1, newPips);
    setCustomTpPips(pips);
    const latestClose = candles && candles.length > 0 ? candles[candles.length - 1].close : 1.0;
    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU');
    const isCrypto = pair.includes('BTC');
    const isNasdaq = pair.includes('NASDAQ');
    const pipMult = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
    const dec = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;
    const isSell = aiOpportunity?.action === 'SELL';
    const newTpPrice = parseFloat((isSell ? (latestClose - pips * pipMult) : (latestClose + pips * pipMult)).toFixed(dec));
    setCustomTpPrice(newTpPrice);
  };

  // Drag SL or TP line on chart canvas vertically
  const handleStartDragLevel = (type: 'SL' | 'TP', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLevel(type);

    const container = chartContainerRef.current;
    if (!container || !candlestickSeriesRef.current) return;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const relativeY = moveEvent.clientY - rect.top;
      if (relativeY < 10 || relativeY > rect.height - 10) return;

      const series = candlestickSeriesRef.current;
      if (!series) return;

      const priceAtY = series.coordinateToPrice(relativeY);
      if (priceAtY === null || isNaN(priceAtY)) return;

      const latestClose = candles[candles.length - 1]?.close || 1.0;
      const isJpy = pair.includes('JPY');
      const isGold = pair.includes('XAU');
      const isCrypto = pair.includes('BTC');
      const isNasdaq = pair.includes('NASDAQ');
      const pipMultiplier = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
      const decimals = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;

      const roundedPrice = parseFloat(priceAtY.toFixed(decimals));
      const pipsDiff = Math.max(1, Math.round(Math.abs(roundedPrice - latestClose) / pipMultiplier));

      if (type === 'SL') {
        setCustomSlPrice(roundedPrice);
        setCustomSlPips(pipsDiff);
      } else if (type === 'TP') {
        setCustomTpPrice(roundedPrice);
        setCustomTpPips(pipsDiff);
      }
    };

    const onPointerUp = () => {
      setDraggingLevel(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Active trades state & PnL calculation for current active pair
  const [activePairTrades, setActivePairTrades] = useState<any[]>([]);

  // Sync active trades for current pair continuously across localStorage & notifications
  useEffect(() => {
    const syncTrades = () => {
      try {
        const rawOpen = localStorage.getItem('quantum_open_trades');
        const rawAuto = localStorage.getItem('quantum_autotrader_trades');
        const list1 = rawOpen ? JSON.parse(rawOpen) : [];
        const list2 = rawAuto ? JSON.parse(rawAuto) : [];
        const map = new Map();
        [...list1, ...list2].forEach((t: any) => {
          if (t && t.id) map.set(t.id, t);
        });
        const all = Array.from(map.values());
        const filtered = all.filter((t: any) => t.pair === pair);
        setActivePairTrades(filtered);
      } catch (e) {}
    };

    syncTrades();
    const interval = setInterval(syncTrades, 5000);
    window.addEventListener('storage', syncTrades);
    window.addEventListener('QUANTUM_AUTO_NOTIFY', syncTrades);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', syncTrades);
      window.removeEventListener('QUANTUM_AUTO_NOTIFY', syncTrades);
    };
  }, [pair]);

  // Helpers for PnL & Pip calculation
  const calculatePipsMoved = (p: string, entry: number, current: number, direction: 'BUY' | 'SELL') => {
    const diff = direction === 'BUY' ? (current - entry) : (entry - current);
    if (p === 'USD/JPY') return diff * 100;
    if (p === 'XAU/USD') return diff * 10;
    if (p === 'NASDAQ' || p === 'BTC/USD') return diff;
    return diff * 10000;
  };

  const calculatePipValue = (p: string, lotSize: number, pips: number) => {
    if (p === 'XAU/USD') return pips * lotSize * 10.0;
    if (p === 'NASDAQ') return pips * lotSize * 1.0;
    if (p === 'BTC/USD') return pips * lotSize * 0.1;
    return pips * lotSize * 10.0;
  };

  // Compute live floating PnL for active pair
  const currentLivePrice = candles[candles.length - 1]?.close || 1.0;
  let pairFloatingPnlDollars = 0;
  let pairFloatingPnlPips = 0;

  activePairTrades.forEach(trade => {
    const pips = calculatePipsMoved(pair, trade.entryPrice, currentLivePrice, trade.direction);
    const pnl = calculatePipValue(pair, trade.lotSize || 0.1, pips);
    pairFloatingPnlDollars += pnl;
    pairFloatingPnlPips += pips;
  });

  // Chart Direct Trade Execution Toast Feedback State
  const [executionToast, setExecutionToast] = useState<{
    show: boolean;
    type: 'BUY' | 'SELL' | 'CLOSE';
    pair: string;
    entry: number;
    sl: number;
    tp: number;
    customMsg?: string;
  } | null>(null);

  // Direct On-Chart Trade Execution Handler (BUY/SELL)
  const handleChartDirectExecute = (direction: 'BUY' | 'SELL') => {
    const latestCandle = candles[candles.length - 1];
    const currentMarketPrice = latestCandle ? latestCandle.close : (aiOpportunity?.entryPrice || 1.0);
    const targetEntry = currentMarketPrice;

    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU');
    const isCrypto = pair.includes('BTC');
    const isNasdaq = pair.includes('NASDAQ');
    const decimals = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;

    const pipMultiplier = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
    const slDelta = (customSlPips > 0 ? customSlPips : 30) * pipMultiplier;
    const tpDelta = (customTpPips > 0 ? customTpPips : 60) * pipMultiplier;

    let sl = customSlPriceVal;
    let tp = customTpPriceVal;

    if (!sl) {
      sl = direction === 'BUY'
        ? parseFloat((targetEntry - slDelta).toFixed(decimals))
        : parseFloat((targetEntry + slDelta).toFixed(decimals));
    }

    if (!tp) {
      tp = direction === 'BUY'
        ? parseFloat((targetEntry + tpDelta).toFixed(decimals))
        : parseFloat((targetEntry - tpDelta).toFixed(decimals));
    }

    const tradeLot = customLot > 0 ? customLot : 0.10;

    const tradeId = `trade_${Date.now()}_${Date.now().toString(36)}`;
    const newTrade = {
      id: tradeId,
      pair,
      direction,
      entryPrice: targetEntry,
      stopLoss: sl,
      takeProfit1: tp,
      takeProfit2: tp,
      lotSize: tradeLot,
      openTime: Date.now(),
      setupId: aiOpportunity?.id || `manual_chart_${Date.now()}`
    };

    // Save directly into Virtual Portfolio & Open Trades
    try {
      const existing1 = localStorage.getItem('quantum_autotrader_trades');
      const existing2 = localStorage.getItem('quantum_open_trades');
      const parsed1 = existing1 ? JSON.parse(existing1) : [];
      const parsed2 = existing2 ? JSON.parse(existing2) : [];
      localStorage.setItem('quantum_autotrader_trades', JSON.stringify([...parsed1, newTrade]));
      localStorage.setItem('quantum_open_trades', JSON.stringify([...parsed2, newTrade]));
    } catch (e) {
      console.error('Failed to save chart direct trade:', e);
    }

    // Dispatch global notification event
    window.dispatchEvent(new CustomEvent('QUANTUM_AUTO_NOTIFY', {
      detail: {
        id: `exec_${Date.now()}`,
        type: 'EXECUTE',
        pair,
        title: `âš¡ CARTA EKSEKUSI: ${direction} ${pair}`,
        message: `@ ${targetEntry.toFixed(decimals)} | SL: ${sl.toFixed(decimals)} | TP: ${tp.toFixed(decimals)}`,
        timestamp: new Date().toLocaleTimeString('ms-MY', { hour12: false })
      }
    }));

    // Post to Webhook for MT5 Bridge
    fetch('/api/broker/mt5-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ORDER_OPEN',
        ticket: Date.now(),
        symbol: pair.replace('/', ''),
        type: direction,
        lots: newTrade.lotSize,
        price: targetEntry,
        sl,
        tp,
        comment: 'Quantum AI Chart Direct Order'
      })
    }).catch(() => {});

    // Trigger Toast Feedback directly on Chart
    setExecutionToast({
      show: true,
      type: direction,
      pair,
      entry: targetEntry,
      sl,
      tp
    });

    setTimeout(() => {
      setExecutionToast(null);
    }, 4000);

    if (onExecuteTrade) {
      onExecuteTrade(direction, targetEntry);
    }
  };

  // 1-Click AI Setup Execution Handler (Follows full AI analysis parameters exactly!)
  const handleExecuteAiSetup = () => {
    if (!aiOpportunity) {
      alert('Tiada Setup AI aktif untuk mata wang ini.');
      return;
    }

    const direction: 'BUY' | 'SELL' = aiOpportunity.action === 'SELL' ? 'SELL' : 'BUY';
    const latestCandle = candles[candles.length - 1];
    const targetEntry = aiOpportunity.entryZone?.min || (aiOpportunity as any).entryPrice || (latestCandle ? latestCandle.close : 1.0);
    const sl = aiOpportunity.stopLoss;
    const tp1 = aiOpportunity.takeProfit1;
    const tp2 = aiOpportunity.takeProfit2;
    const tradeLot = customLot > 0 ? customLot : 0.10;

    const tradeId = `ai_setup_${Date.now()}_${Date.now().toString(36)}`;
    const newTrade = {
      id: tradeId,
      pair,
      direction,
      entryPrice: targetEntry,
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      lotSize: tradeLot,
      openTime: Date.now(),
      setupId: aiOpportunity.id || `ai_analysis_${Date.now()}`
    };

    // Save into Virtual Portfolio & Open Trades
    try {
      const existing1 = localStorage.getItem('quantum_autotrader_trades');
      const existing2 = localStorage.getItem('quantum_open_trades');
      const parsed1 = existing1 ? JSON.parse(existing1) : [];
      const parsed2 = existing2 ? JSON.parse(existing2) : [];
      localStorage.setItem('quantum_autotrader_trades', JSON.stringify([...parsed1, newTrade]));
      localStorage.setItem('quantum_open_trades', JSON.stringify([...parsed2, newTrade]));
    } catch (e) {
      console.error('Failed to save AI setup trade:', e);
    }

    // Dispatch notification
    window.dispatchEvent(new CustomEvent('QUANTUM_AUTO_NOTIFY', {
      detail: {
        id: `exec_ai_${Date.now()}`,
        type: 'EXECUTE',
        pair,
        title: `ðŸ¤– 1-CLICK AI SETUP: ${direction} ${pair}`,
        message: `Entry AI: ${targetEntry} | SL: ${sl} | TP1: ${tp1} | TP2: ${tp2} | Keyakinan: ${aiOpportunity.confidence}%`,
        timestamp: new Date().toLocaleTimeString('ms-MY', { hour12: false })
      }
    }));

    // Post to Webhook for MT5 Bridge
    fetch('/api/broker/mt5-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ORDER_OPEN',
        ticket: Date.now(),
        symbol: pair.replace('/', ''),
        type: direction,
        lots: tradeLot,
        price: targetEntry,
        sl,
        tp: tp1,
        comment: `Quantum AI Setup (${aiOpportunity.confidence}% Conf)`
      })
    }).catch(() => {});

    // Toast Feedback on Chart
    setExecutionToast({
      show: true,
      type: direction,
      pair,
      entry: targetEntry,
      sl,
      tp: tp1,
      customMsg: `ðŸŽ¯ SETUP AI DIEKSEKUSI: ${direction} ${pair} | Entry: ${targetEntry} | SL: ${sl} | TP1: ${tp1}`
    });

    setTimeout(() => {
      setExecutionToast(null);
    }, 4500);

    if (onExecuteTrade) {
      onExecuteTrade(direction, targetEntry);
    }
  };

  // Direct On-Chart Trade Close All Handler
  const handleChartDirectCloseAll = () => {
    const latestCandle = candles[candles.length - 1];
    const price = latestCandle ? latestCandle.close : (aiOpportunity?.entryPrice || 1.0);

    let allOpen1: any[] = [];
    let allOpen2: any[] = [];
    try {
      const raw1 = localStorage.getItem('quantum_open_trades');
      const raw2 = localStorage.getItem('quantum_autotrader_trades');
      allOpen1 = raw1 ? JSON.parse(raw1) : [];
      allOpen2 = raw2 ? JSON.parse(raw2) : [];
    } catch (e) {}

    if (activePairTrades.length === 0) {
      setExecutionToast({
        show: true,
        type: 'CLOSE',
        pair,
        entry: price,
        sl: 0,
        tp: 0,
        customMsg: `Tiada posisi aktif ${pair} untuk ditutup.`
      });
      setTimeout(() => setExecutionToast(null), 3000);
      return;
    }

    let closedPnl = 0;
    activePairTrades.forEach(trade => {
      const pips = calculatePipsMoved(pair, trade.entryPrice, price, trade.direction);
      const pnl = calculatePipValue(pair, trade.lotSize || 0.1, pips);
      closedPnl += pnl;
    });

    const rem1 = allOpen1.filter((t: any) => t.pair !== pair);
    const rem2 = allOpen2.filter((t: any) => t.pair !== pair);

    try {
      localStorage.setItem('quantum_open_trades', JSON.stringify(rem1));
      localStorage.setItem('quantum_autotrader_trades', JSON.stringify(rem2));

      const currentBal = parseFloat(localStorage.getItem('quantum_auto_balance') || '10000');
      localStorage.setItem('quantum_auto_balance', (currentBal + closedPnl).toFixed(2));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('QUANTUM_AUTO_NOTIFY', {
      detail: {
        id: `close_${Date.now()}`,
        type: 'MANUAL_CLOSE',
        pair,
        title: `ðŸ”’ POSISI DITUTUP: ${pair} (${activePairTrades.length} Posisi)`,
        message: `Harga Tutup: ${price.toFixed(pair.includes('JPY') ? 3 : pair.includes('BTC') ? 2 : 5)} | Total PnL: ${closedPnl >= 0 ? '+' : ''}$${closedPnl.toFixed(2)}`,
        pnlDollars: closedPnl,
        timestamp: new Date().toLocaleTimeString('ms-MY', { hour12: false })
      }
    }));

    fetch('/api/broker/mt5-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ORDER_CLOSE_ALL',
        symbol: pair.replace('/', ''),
        price,
        comment: 'Quantum AI Chart Close All'
      })
    }).catch(() => {});

    setExecutionToast({
      show: true,
      type: 'CLOSE',
      pair,
      entry: price,
      sl: 0,
      tp: 0,
      customMsg: `${activePairTrades.length} Posisi ${pair} Ditutup | PnL: ${closedPnl >= 0 ? '+' : ''}$${closedPnl.toFixed(2)}`
    });

    setTimeout(() => setExecutionToast(null), 4000);
    setActivePairTrades([]);
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clear previous chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const containerWidth = chartContainerRef.current.clientWidth || 600;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' }, // Slate 900
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: containerWidth,
      height: 480,
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#334155',
        autoScale: true,
      },
    });

    chartInstanceRef.current = chart;

    const seriesOptions = {
      upColor: '#10b981', // Emerald 500
      downColor: '#f43f5e', // Rose 500
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
    };

    const candleSeries = typeof (chart as any).addCandlestickSeries === 'function'
      ? (chart as any).addCandlestickSeries(seriesOptions)
      : (chart as any).addSeries(CandlestickSeries, seriesOptions);

    candlestickSeriesRef.current = candleSeries;

    // Handle Resize Observer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  const priceLinesRef = useRef<any[]>([]);
  const [levelLabels, setLevelLabels] = useState<Array<{
    key: string;
    label: string;
    price: number;
    bgColor: string;
    borderColor: string;
    textColor: string;
    y: number | null;
  }>>([]);

  // Calculate Y coordinates for left-aligned level labels & draggable custom SL/TP lines
  const [customSlY, setCustomSlY] = useState<number | null>(null);
  const [customTpY, setCustomTpY] = useState<number | null>(null);

  const latestPrice = candles[candles.length - 1]?.close || 1.0;
  const isJpy = pair.includes('JPY');
  const isGold = pair.includes('XAU');
  const isCrypto = pair.includes('BTC');
  const isNasdaq = pair.includes('NASDAQ');
  const pipMultiplier = isJpy ? 0.01 : isGold ? 0.1 : isCrypto ? 1.0 : isNasdaq ? 1.0 : 0.0001;
  const decimals = isCrypto ? 2 : isJpy ? 3 : isGold ? 2 : isNasdaq ? 2 : 5;

  const isSellSetup = aiOpportunity?.action === 'SELL';
  const customSlPriceVal = customSlPrice ?? parseFloat((isSellSetup ? (latestPrice + customSlPips * pipMultiplier) : (latestPrice - customSlPips * pipMultiplier)).toFixed(decimals));
  const customTpPriceVal = customTpPrice ?? parseFloat((isSellSetup ? (latestPrice - customTpPips * pipMultiplier) : (latestPrice + customTpPips * pipMultiplier)).toFixed(decimals));

  const updateLevelCoordinates = () => {
    if (!candlestickSeriesRef.current) {
      setLevelLabels([]);
      setCustomSlY(null);
      setCustomTpY(null);
      return;
    }

    const series = candlestickSeriesRef.current;

    // Calculate Y for Custom Draggable SL & TP
    try {
      setCustomSlY(series.priceToCoordinate(customSlPriceVal));
      setCustomTpY(series.priceToCoordinate(customTpPriceVal));
    } catch (e) {}

    if (!aiOpportunity || !showOverlays.setupLevels) {
      setLevelLabels([]);
      return;
    }

    if (aiOpportunity.action === 'WAIT / NO SETUP' || !aiOpportunity.entryZone) {
      setLevelLabels([]);
      return;
    }

    const newLabels: Array<{
      key: string;
      label: string;
      price: number;
      bgColor: string;
      borderColor: string;
      textColor: string;
      y: number | null;
    }> = [];

    if (aiOpportunity.takeProfit2) {
      const y = series.priceToCoordinate(aiOpportunity.takeProfit2);
      newLabels.push({
        key: 'tp2',
        label: `AI TP2 (${aiOpportunity.takeProfit2})`,
        price: aiOpportunity.takeProfit2,
        bgColor: 'bg-emerald-950/90',
        borderColor: 'border-emerald-500/80',
        textColor: 'text-emerald-300',
        y,
      });
    }

    if (aiOpportunity.takeProfit1) {
      const y = series.priceToCoordinate(aiOpportunity.takeProfit1);
      newLabels.push({
        key: 'tp1',
        label: `AI TP1 (${aiOpportunity.takeProfit1})`,
        price: aiOpportunity.takeProfit1,
        bgColor: 'bg-emerald-950/90',
        borderColor: 'border-emerald-400/80',
        textColor: 'text-emerald-400',
        y,
      });
    }

    if (aiOpportunity.entryZone?.min) {
      const y = series.priceToCoordinate(aiOpportunity.entryZone.min);
      newLabels.push({
        key: 'entry',
        label: `AI ENTRY (${aiOpportunity.entryZone.min})`,
        price: aiOpportunity.entryZone.min,
        bgColor: 'bg-amber-950/90',
        borderColor: 'border-amber-500/80',
        textColor: 'text-amber-300',
        y,
      });
    }

    if (aiOpportunity.stopLoss) {
      const y = series.priceToCoordinate(aiOpportunity.stopLoss);
      newLabels.push({
        key: 'sl',
        label: `AI SL (${aiOpportunity.stopLoss})`,
        price: aiOpportunity.stopLoss,
        bgColor: 'bg-rose-950/90',
        borderColor: 'border-rose-500/80',
        textColor: 'text-rose-300',
        y,
      });
    }

    setLevelLabels(newLabels);
  };

  // Subscribe to timescale changes to update left labels dynamically on scroll/zoom
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().subscribeVisibleLogicalRangeChange(() => {
        updateLevelCoordinates();
      });
    }
  }, [chartInstanceRef.current]);

  // Update candlestick series data & price lines
  useEffect(() => {
    if (!candlestickSeriesRef.current || !candles || candles.length === 0) return;

    const formattedData: CandlestickData[] = candles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candlestickSeriesRef.current.setData(formattedData);

    // Remove existing price lines
    priceLinesRef.current.forEach((line) => {
      try {
        if (candlestickSeriesRef.current) {
          candlestickSeriesRef.current.removePriceLine(line);
        }
      } catch (e) {
        // Line already removed
      }
    });
    priceLinesRef.current = [];

    // Apply Price Lines for Custom Draggable SL / TP
    if (candlestickSeriesRef.current) {
      try {
        const series = candlestickSeriesRef.current;

        // Custom SL Line
        const slLine = series.createPriceLine({
          price: customSlPriceVal,
          color: '#f43f5e', // Rose 500
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `SL (${customSlPips}p)`,
        });
        priceLinesRef.current.push(slLine);

        // Custom TP Line
        const tpLine = series.createPriceLine({
          price: customTpPriceVal,
          color: '#10b981', // Emerald 500
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `TP (${customTpPips}p)`,
        });
        priceLinesRef.current.push(tpLine);
      } catch (e) {}
    }

    // Apply Price Lines for Active AI Trade Setup if toggled (without title text over candles)
    if (aiOpportunity && showOverlays.setupLevels && candlestickSeriesRef.current) {
      try {
        if (aiOpportunity.action !== 'WAIT / NO SETUP' && aiOpportunity.entryZone) {
          const series = candlestickSeriesRef.current;

          // Entry Min Line
          const line1 = series.createPriceLine({
            price: aiOpportunity.entryZone.min,
            color: '#f59e0b', // Amber 500
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: '', // Empty title so candles on the right remain 100% visible
          });
          priceLinesRef.current.push(line1);

          // Stop Loss Line
          if (aiOpportunity.stopLoss) {
            const line2 = series.createPriceLine({
              price: aiOpportunity.stopLoss,
              color: '#ef4444', // Red 500
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: '',
            });
            priceLinesRef.current.push(line2);
          }

          // Take Profit 1 Line
          if (aiOpportunity.takeProfit1) {
            const line3 = series.createPriceLine({
              price: aiOpportunity.takeProfit1,
              color: '#10b981', // Green 500
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: '',
            });
            priceLinesRef.current.push(line3);
          }

          // Take Profit 2 Line
          if (aiOpportunity.takeProfit2) {
            const line4 = series.createPriceLine({
              price: aiOpportunity.takeProfit2,
              color: '#059669', // Emerald 600
              lineWidth: 1,
              lineStyle: LineStyle.LargeDashed,
              axisLabelVisible: true,
              title: '',
            });
            priceLinesRef.current.push(line4);
          }
        }
      } catch (err) {
        console.error('Error rendering chart price lines:', err);
      }
    }

    // Update left level label coordinates
    setTimeout(() => {
      updateLevelCoordinates();
    }, 50);
  }, [candles, aiOpportunity, showOverlays, customSlPips, customTpPips, customSlPriceVal, customTpPriceVal]);

  // Calculate 24H rolling change percentage
  const latestCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
  const currentPrice = latestCandle?.close || 0;
  const percentChange = calculate24hRollingChange(candles, currentPrice);
  const isPositive = percentChange >= 0;

  const meta = getPairMeta(pair);

  const formatPriceParts = (price: number, p: CurrencyPair) => {
    let decimals = 5;
    if (p === 'USD/JPY') decimals = 3;
    if (p === 'XAU/USD' || p === 'NASDAQ' || p === 'BTC/USD') decimals = 2;

    const str = price.toFixed(decimals);
    if (decimals >= 3) {
      return {
        main: str.slice(0, -1),
        fractional: str.slice(-1),
      };
    }
    return { main: str, fractional: '' };
  };

  const { main, fractional } = formatPriceParts(currentPrice, pair);

  // Live Manual Entry Calculated Metrics
  const liveRrRatio = customSlPips > 0 ? (customTpPips / customSlPips).toFixed(2) : '1.00';
  const pipVal = pair.includes('JPY') ? 7 : pair.includes('XAU') ? 100 : pair.includes('BTC') ? 1 : 10;
  const liveEstRiskDollars = (customLot * customSlPips * pipVal).toFixed(2);
  const liveEstRewardDollars = (customLot * customTpPips * pipVal).toFixed(2);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3 h-full justify-between">
      {/* Timeframe Open Percentage Header Banner Pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1">
        {/* Currency Pair Pill Badge matching reference UI */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-3.5 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-full px-5 py-2 shadow-sm transition hover:shadow-md">
            {/* Overlapping Flag / Currency Icons */}
            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
              <div className="absolute top-0 right-0 w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-slate-100 dark:border-slate-800 flex items-center justify-center text-xs shadow-xs z-0 overflow-hidden">
                {meta.quoteFlag}
              </div>
              <div className="absolute bottom-0 left-0 w-6 h-6 rounded-full bg-blue-600 border-2 border-slate-100 dark:border-slate-800 flex items-center justify-center text-xs shadow-xs z-10 overflow-hidden">
                {meta.baseFlag}
              </div>
            </div>

            {/* Title & Price Stats */}
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-tight">
                {meta.title}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-slate-900 dark:text-white tracking-tight">
                  {main}
                  {fractional && (
                    <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-rose-600 dark:text-rose-400 font-extrabold'}>
                      {fractional}
                    </span>
                  )}
                </span>

                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {meta.quote}
                </span>

                <span
                  className={`ml-2 text-xs font-extrabold font-mono flex items-center gap-0.5 ${
                    isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                  title={`24H Rolling Change (${percentChange.toFixed(2)}%)`}
                >
                  {isPositive ? <TrendingUp className="w-3.5 h-3.5 inline" /> : <TrendingDown className="w-3.5 h-3.5 inline" />}
                  {isPositive ? `+${percentChange.toFixed(2)}%` : `${percentChange.toFixed(2)}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Direct On-Header Instant Execution & Broker Panel (Standard One-Click Style) */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-lg">
            {/* Live Floating PnL Badge in Header */}
            <div className="flex flex-col px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between gap-1">
                <span>PnL ({pair})</span>
                {activePairTrades.length > 0 && (
                  <span className="px-1 text-[9px] bg-slate-800 text-amber-300 font-mono rounded">
                    {activePairTrades.length}
                  </span>
                )}
              </span>
              <span className={`text-xs font-mono font-black flex items-center gap-0.5 ${
                pairFloatingPnlDollars > 0 
                  ? 'text-emerald-400' 
                  : pairFloatingPnlDollars < 0 
                  ? 'text-rose-400' 
                  : 'text-slate-400'
              }`}>
                {pairFloatingPnlDollars > 0 ? '+' : ''}${pairFloatingPnlDollars.toFixed(2)}
                <span className="text-[10px] opacity-75 font-normal">
                  ({pairFloatingPnlPips > 0 ? '+' : ''}{pairFloatingPnlPips.toFixed(1)}p)
                </span>
              </span>
            </div>

            {/* Order Settings Inputs: Lot, SL (pips), TP (pips) with Quick Adjustment Buttons */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Lot Size</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10.0"
                  value={customLot}
                  onChange={(e) => setCustomLot(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                  className="w-14 bg-slate-900 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
                  title="Saiz Lot Pesanan"
                />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] text-rose-400 font-semibold uppercase tracking-wider">SL (Pips)</span>
                  <div className="flex items-center gap-0.5 text-[9px] font-mono font-extrabold text-slate-400">
                    <button
                      type="button"
                      onClick={() => handleSlPipsChange(Math.max(5, customSlPips - 5))}
                      className="px-1 hover:text-rose-300 hover:bg-slate-800 rounded cursor-pointer"
                      title="-5 pips"
                    >-5</button>
                    <span>/</span>
                    <button
                      type="button"
                      onClick={() => handleSlPipsChange(customSlPips + 5)}
                      className="px-1 hover:text-rose-300 hover:bg-slate-800 rounded cursor-pointer"
                      title="+5 pips"
                    >+5</button>
                  </div>
                </div>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="500"
                  value={customSlPips}
                  onChange={(e) => handleSlPipsChange(Math.max(1, parseInt(e.target.value) || 10))}
                  className="w-14 bg-slate-900 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-rose-300 focus:outline-none focus:border-rose-400"
                  title="Stop Loss dalam Pips (atau seret garisan SL di carta)"
                />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">TP (Pips)</span>
                  <div className="flex items-center gap-0.5 text-[9px] font-mono font-extrabold text-slate-400">
                    <button
                      type="button"
                      onClick={() => handleTpPipsChange(Math.max(5, customTpPips - 5))}
                      className="px-1 hover:text-emerald-300 hover:bg-slate-800 rounded cursor-pointer"
                      title="-5 pips"
                    >-5</button>
                    <span>/</span>
                    <button
                      type="button"
                      onClick={() => handleTpPipsChange(customTpPips + 5)}
                      className="px-1 hover:text-emerald-300 hover:bg-slate-800 rounded cursor-pointer"
                      title="+5 pips"
                    >+5</button>
                  </div>
                </div>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="1000"
                  value={customTpPips}
                  onChange={(e) => handleTpPipsChange(Math.max(1, parseInt(e.target.value) || 20))}
                  className="w-14 bg-slate-900 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-400"
                  title="Take Profit dalam Pips (atau seret garisan TP di carta)"
                />
              </div>

              {/* Calculated Risk:Reward Badge */}
              <div className="hidden sm:flex flex-col px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-center">
                <span className="text-[8px] text-slate-400 uppercase font-bold">R:R Ratio</span>
                <span className={`text-[11px] font-mono font-extrabold ${parseFloat(liveRrRatio) >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  1:{liveRrRatio}
                </span>
              </div>
            </div>

            {/* AI Manual Entry Pre-Check Toggle Button */}
            <button
              type="button"
              onClick={() => {
                const nextState = !showAiManualGuard;
                setShowAiManualGuard(nextState);
                if (nextState && !manualAiFeedback) {
                  runManualEntryPreCheck('BUY');
                }
              }}
              className={`px-3 py-2 rounded-xl border font-mono font-bold text-xs flex items-center gap-1.5 transition shadow cursor-pointer ${
                showAiManualGuard
                  ? 'bg-purple-900/90 text-purple-200 border-purple-400/80 ring-1 ring-purple-400'
                  : 'bg-slate-950 text-purple-300 border-purple-500/40 hover:bg-slate-900'
              }`}
              title="Analisis Entri Manual & Maklum Balas Corak AI"
            >
              <Brain className={`w-3.5 h-3.5 text-purple-400 ${isAnalyzingManual ? 'animate-spin' : 'animate-pulse'}`} />
              <span className="hidden md:inline font-bold">{language === 'ms' ? 'ðŸ§  Semakan AI' : 'ðŸ§  AI Entry Guard'}</span>
              {showAiManualGuard ? <ChevronUp className="w-3 h-3 text-purple-300" /> : <ChevronDown className="w-3 h-3 text-purple-300" />}
            </button>

            {/* 1-Click AI Setup Direct Execution Button */}
            {aiOpportunity && (aiOpportunity.action === 'BUY' || aiOpportunity.action === 'SELL') && (
              <button
                onClick={handleExecuteAiSetup}
                className={`px-3.5 py-1.5 rounded-xl border font-mono font-black text-xs text-white flex items-center gap-2 transition shadow-lg cursor-pointer active:scale-95 ${
                  aiOpportunity.action === 'BUY'
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 border-emerald-400/60 shadow-emerald-950/60 hover:brightness-110'
                    : 'bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 border-rose-400/60 shadow-rose-950/60 hover:brightness-110'
                }`}
                title={`Eksekusi Setup AI Sepenuhnya (${aiOpportunity.action} ${pair} @ Entry: ${aiOpportunity.entryZone?.min || (aiOpportunity as any).entryPrice || 'Market'} | SL: ${aiOpportunity.stopLoss} | TP: ${aiOpportunity.takeProfit1})`}
              >
                <Zap className="w-4 h-4 text-amber-300 animate-bounce shrink-0" />
                <div className="flex flex-col text-left leading-none">
                  <span className="text-[9px] text-amber-200 font-extrabold uppercase tracking-wider">âš¡ 1-CLICK SETUP AI</span>
                  <span className="text-xs font-black">
                    {aiOpportunity.action} @ {aiOpportunity.entryZone?.min || (aiOpportunity as any).entryPrice || 'AI Entry'}
                  </span>
                </div>
              </button>
            )}

            <button
              onClick={() => handleChartDirectExecute('BUY')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-mono font-black tracking-wide rounded-xl transition shadow-md shadow-emerald-900/40 border border-emerald-400/40 flex items-center gap-1.5 cursor-pointer"
              title={`Eksekusi BUY ${pair}`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>BUY</span>
            </button>

            <button
              onClick={() => handleChartDirectExecute('SELL')}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-mono font-black tracking-wide rounded-xl transition shadow-md shadow-rose-900/40 border border-rose-400/40 flex items-center gap-1.5 cursor-pointer"
              title={`Eksekusi SELL ${pair}`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>SELL</span>
            </button>

            <button
              onClick={handleChartDirectCloseAll}
              className={`px-3 py-2 active:scale-95 text-xs font-mono font-black rounded-xl transition shadow-md flex items-center gap-1.5 border cursor-pointer ${
                activePairTrades.length > 0
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400/50 shadow-amber-950/50 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title={`Tutup Semua Posisi ${pair}`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>CLOSE {activePairTrades.length > 0 ? `(${activePairTrades.length})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Expandable Live AI Manual Entry Analysis & Feedback Drawer */}
        {showAiManualGuard && (
          <div className="w-full bg-slate-900/95 border border-purple-500/40 rounded-2xl p-3.5 text-xs space-y-3 shadow-2xl backdrop-blur mt-1 transition">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
                <span className="font-extrabold text-white font-mono text-xs sm:text-sm">
                  {language === 'ms' ? 'âš¡ Analisis Entri Manual & Semakan Keselamatan AI' : 'âš¡ AI Manual Entry Pre-Flight Guard & Pattern Evaluation'}
                </span>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-mono rounded-full font-bold">
                  {pair} â€¢ {timeframe}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runManualEntryPreCheck('BUY')}
                  disabled={isAnalyzingManual}
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition shadow cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isAnalyzingManual ? 'animate-spin' : ''}`} />
                  <span>{isAnalyzingManual ? (language === 'ms' ? 'Menyemak...' : 'Checking...') : (language === 'ms' ? 'Kemaskini AI' : 'Re-Check AI')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAiManualGuard(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Parameter Evaluation Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Nisbah Risk:Reward</span>
                <span className={`font-black text-sm flex items-center gap-1 ${parseFloat(liveRrRatio) >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  1:{liveRrRatio}
                  <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800">
                    {parseFloat(liveRrRatio) >= 1.5 ? 'âœ“ PASS' : 'âš ï¸ LOW'}
                  </span>
                </span>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
                <span className="text-[9px] text-rose-400 uppercase font-bold block">Potensi Risiko SL</span>
                <span className="text-rose-300 font-black text-sm">-${liveEstRiskDollars} ({customSlPips}p)</span>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
                <span className="text-[9px] text-emerald-400 uppercase font-bold block">Potensi TP (Profit)</span>
                <span className="text-emerald-300 font-black text-sm">+${liveEstRewardDollars} ({customTpPips}p)</span>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
                <span className="text-[9px] text-purple-300 uppercase font-bold block">Status Skor AI</span>
                <span className={`font-black text-xs ${parseFloat(liveRrRatio) >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {manualAiFeedback?.verdict || (parseFloat(liveRrRatio) >= 1.5 ? 'STRONG_GO (88/100)' : 'CAUTION (65/100)')}
                </span>
              </div>
            </div>

            {/* Continuous Learning Pattern Feedback Box */}
            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs leading-relaxed space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{language === 'ms' ? 'Maklum Balas Corak Entri AI (Continuous Learning):' : 'AI Continuous Learning Advice:'}</span>
                </div>
                <span className="text-[10px] text-purple-300 font-mono font-bold uppercase">
                  Archetype: {manualAiFeedback?.traderDNA?.archetype || 'Calculated SMC Day Trader'}
                </span>
              </div>

              <p className="font-sans text-xs text-slate-200 leading-relaxed">
                {manualAiFeedback
                  ? (language === 'ms' ? manualAiFeedback.notesMs : manualAiFeedback.notesEn)
                  : (language === 'ms'
                      ? `Berdasarkan algoritma pembelajaran AI: Saiz Lot ${customLot} & SL ${customSlPips} pips mematuhi disiplin risiko. Disyorkan pastikan garisan SL berada di luar zon kecairan (liquidity pool) SMC untuk mengelakkan stop hunt.`
                      : `Based on AI learning: Lot ${customLot} & SL ${customSlPips} pips aligns with risk discipline. Ensure SL is placed outside SMC liquidity pools.`)}
              </p>
            </div>
          </div>
        )}

        {/* Timeframe Selector & Refresh Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 overflow-x-auto">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                id={`tf-btn-${tf}`}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={() =>
              setShowOverlays((prev) => ({ ...prev, setupLevels: !prev.setupLevels }))
            }
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition flex items-center gap-1.5 ${
              showOverlays.setupLevels
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Setup Lines</span>
          </button>

          {onAskPakar && (
            <button
              onClick={() => onAskPakar(`Analisis corak carta ${pair} pada timeframe ${timeframe} sekarang.`)}
              className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
              title="Tanya Pakar Trader AI tentang Carta Ini"
            >
              <span>ðŸ¤–</span>
              <span className="hidden sm:inline">Tanya Pakar</span>
            </button>
          )}

          {onRefreshData && (
            <button
              onClick={onRefreshData}
              className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition"
              title="Refresh Chart & Market Feed"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Lightweight Chart Canvas Container */}
      <div className="relative w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
        <div ref={chartContainerRef} className="w-full h-[480px]" />

        {/* Chart Execution Feedback Toast Banner Overlay */}
        {executionToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-emerald-500 rounded-2xl p-3 shadow-2xl shadow-emerald-950/80 z-30 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 max-w-md w-full mx-auto backdrop-blur-md">
            <CheckCircle2 className={`w-6 h-6 shrink-0 animate-pulse ${executionToast.type === 'CLOSE' ? 'text-amber-400' : 'text-emerald-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wide">
                  âš¡ {executionToast.type === 'CLOSE' ? 'POSISI DITUTUP' : 'ORDER EXECUTED'}: <span className={executionToast.type === 'BUY' ? 'text-emerald-400' : executionToast.type === 'SELL' ? 'text-rose-400' : 'text-amber-400'}>{executionToast.type} {executionToast.pair}</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">Broker Execution</span>
              </div>
              <p className="text-[11px] font-mono text-emerald-300 mt-0.5 truncate">
                {executionToast.customMsg || `Entry: ${executionToast.entry} | SL: ${executionToast.sl} | TP: ${executionToast.tp}`}
              </p>
            </div>
          </div>
        )}

        {/* Left-Aligned Price Level Badges (Positioned on the Left Edge so candles on the right remain 100% visible) */}
        {showOverlays.setupLevels && levelLabels.map((lbl) => (
          lbl.y !== null && lbl.y >= 10 && lbl.y <= 460 ? (
            <div
              key={lbl.key}
              style={{ top: `${lbl.y}px` }}
              className={`absolute left-3 -translate-y-1/2 px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold shadow-xl z-20 pointer-events-none transition-all flex items-center gap-1.5 ${lbl.bgColor} ${lbl.borderColor} ${lbl.textColor}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              <span>{lbl.label}</span>
            </div>
          ) : null
        ))}

        {/* Interactive Draggable Custom SL Line Badge on Chart Canvas */}
        {customSlY !== null && customSlY >= 15 && customSlY <= 465 && (
          <div
            style={{ top: `${customSlY}px` }}
            onPointerDown={(e) => handleStartDragLevel('SL', e)}
            className={`absolute right-3 -translate-y-1/2 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold shadow-2xl z-30 cursor-ns-resize select-none flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-110 bg-rose-950/95 border-rose-500/90 text-rose-300 ${
              draggingLevel === 'SL' ? 'ring-2 ring-rose-400 scale-105 bg-rose-900' : ''
            }`}
            title="Tekan dan seret ke atas/bawah untuk melaras Stop Loss"
          >
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
            <span>SL: {customSlPriceVal} ({customSlPips}p)</span>
            <span className="text-[9px] bg-rose-900/90 px-1 py-0.5 rounded text-rose-200 uppercase font-black tracking-wider flex items-center gap-0.5">
              <span>â†•</span> SERET
            </span>
          </div>
        )}

        {/* Interactive Draggable Custom TP Line Badge on Chart Canvas */}
        {customTpY !== null && customTpY >= 15 && customTpY <= 465 && (
          <div
            style={{ top: `${customTpY}px` }}
            onPointerDown={(e) => handleStartDragLevel('TP', e)}
            className={`absolute right-3 -translate-y-1/2 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold shadow-2xl z-30 cursor-ns-resize select-none flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-110 bg-emerald-950/95 border-emerald-500/90 text-emerald-300 ${
              draggingLevel === 'TP' ? 'ring-2 ring-emerald-400 scale-105 bg-emerald-900' : ''
            }`}
            title="Tekan dan seret ke atas/bawah untuk melaras Take Profit"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>TP: {customTpPriceVal} ({customTpPips}p)</span>
            <span className="text-[9px] bg-emerald-900/90 px-1 py-0.5 rounded text-emerald-200 uppercase font-black tracking-wider flex items-center gap-0.5">
              <span>â†•</span> SERET
            </span>
          </div>
        )}

        {/* Dragging Active Feedback Banner */}
        {draggingLevel && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 px-3.5 py-1.5 rounded-full text-xs font-mono font-black shadow-2xl z-40 animate-pulse flex items-center gap-2">
            <span>â†• MENYERET {draggingLevel}: {draggingLevel === 'SL' ? `${customSlPriceVal} (${customSlPips} Pips)` : `${customTpPriceVal} (${customTpPips} Pips)`}</span>
          </div>
        )}

        {/* Floating SMC Legend Overlay */}
        {smcData && (
          <div className="absolute top-3 right-16 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-300 shadow-md space-y-1">
            <div className="font-semibold text-slate-200 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-400" /> SMC Structural Radar
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-medium">OBs: {smcData.orderBlocks?.length || 0}</span>
              <span className="text-amber-400 font-medium">FVGs: {smcData.fairValueGaps?.length || 0}</span>
              <span className="text-indigo-400 font-medium">
                {smcData.lastBos ? smcData.lastBos.type : 'No BOS'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


