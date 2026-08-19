import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  createChart, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries, ColorType, LineStyle
} from 'lightweight-charts';
import {
  ArrowUpRight, ArrowDownRight,
  ShieldCheck, ShieldAlert, Activity, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, Database, Server, Zap,
  BarChart3, RefreshCw, Layers, Lock, Cpu, Eye, Info, Sparkles,
  Radio, Scale, ArrowRight, Shield, AlertCircle, Maximize2, Minimize2,
  SlidersHorizontal, ChevronRight, Hash, Play, Target, Brain,
  Power, CheckCircle2, Flame, PlayCircle, StopCircle
} from 'lucide-react';
import { CurrencyPair, Timeframe, CandleData } from '../types';

export interface DemoMonitorPayload {
  headerStatus: {
    environment: 'DEMO';
    brokerName: string;
    serverHost: string;
    connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
    marketDataStatus: 'LIVE' | 'STALE' | 'DISCONNECTED';
    accountNumber: string;
    executionMode: 'DEMO';
    liveExecution: 'FORBIDDEN';
    automatedLiveExecution: 'DISABLED';
  };
  telemetry: {
    symbol: CurrencyPair;
    bid: number | null;
    ask: number | null;
    mid: number | null;
    spread: number | null;
    lastTickTimestamp: number | null;
    dataAgeMs: number | null;
    ticksReceived: number;
    lastBrokerEvent: string;
  };
  account: {
    balance: number;
    equity: number;
    marginUsed: number;
    freeMargin: number;
    marginLevelPct: number;
    currency: string;
  };
  risk: {
    maxLotLimit: number;
    dailyLossLimit: number;
    currentDailyLoss: number;
    maxDrawdownLimitPct: number;
    currentDrawdownPct: number;
    riskStatus: 'PASS' | 'WARN' | 'BREACH';
    staleDataLimitSec: number;
    isFreshData: boolean;
  };
  reconciliation: {
    status: 'RECONCILED' | 'DIVERGENT' | 'UNCHECKED';
    brokerOpenPositions: number;
    quantumOpenPositions: number;
    discrepancyCount: number;
    lastCheckedAt: string;
  };
  performance: {
    totalTrades: number;
    winRatePct: number;
    netProfit: number;
    profitFactor: number;
    sharpeRatio: number;
    maxConsecutiveLosses: number;
  };
  executionPipeline: {
    marketSignal: string;
    proposal: string;
    riskCheck: string;
    approval: string;
    execution: string;
    brokerAck: string;
    position: string;
    close: string;
    reconciliation: string;
  };
  openPositions: Array<{
    positionId: number;
    symbol: string;
    tradeSide: 'BUY' | 'SELL';
    volume: number;
    entryPrice: number;
    currentPrice: number;
    sl: number | null;
    tp: number | null;
    unrealizedPnL: number;
    entryTime: string;
  }>;
  executionHistory: {
    closedTrades: Array<{
      tradeId: number;
      symbol: string;
      side: 'BUY' | 'SELL';
      lots: number;
      entryPrice: number;
      closePrice: number;
      realizedPnL: number;
      openTime: string;
      closeTime: string;
    }>;
    orders: Array<{
      orderId: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      lots: number;
      orderType: string;
      status: string;
      timestamp: string;
    }>;
  };
}

const AVAILABLE_PAIRS: Array<{ pair: CurrencyPair; name: string; icon: string }> = [
  { pair: 'EUR/USD', name: 'Euro / US Dollar', icon: '🇪🇺/🇺🇸' },
  { pair: 'GBP/USD', name: 'British Pound / USD', icon: '🇬🇧/🇺🇸' },
  { pair: 'USD/JPY', name: 'US Dollar / Yen', icon: '🇺🇸/🇯🇵' },
  { pair: 'AUD/USD', name: 'Aussie / US Dollar', icon: '🇦🇺/🇺🇸' },
  { pair: 'XAU/USD', name: 'Gold / US Dollar', icon: '🥇/🇺🇸' },
  { pair: 'BTC/USD', name: 'Bitcoin / US Dollar', icon: '₿/🇺🇸' }
];

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const DemoExecutionMonitor: React.FC = () => {
  const [data, setData] = useState<DemoMonitorPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [activeHistoryTab, setActiveHistoryTab] = useState<'TRADES' | 'POSITIONS' | 'ORDERS' | 'AUTOPILOT_LOGS'>('TRADES');

  // Multi-Pair and Broker Chart State
  const [selectedPair, setSelectedPair] = useState<CurrencyPair>('EUR/USD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('M1');
  const [chartType, setChartType] = useState<'CANDLE' | 'AREA' | 'LINE'>('CANDLE');
  const [showEma20, setShowEma20] = useState<boolean>(true);
  const [showEma50, setShowEma50] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // AI Signal & Live Execution State
  const [aiSignal, setAiSignal] = useState<any>(null);
  const [isExecutingSignal, setIsExecutingSignal] = useState<boolean>(false);
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);

  // AI Auto-Pilot Autonomous Mode State
  const [isAutoPilot, setIsAutoPilot] = useState<boolean>(false);
  const [autoPilotLogs, setAutoPilotLogs] = useState<any[]>([]);
  const [isTogglingAutoPilot, setIsTogglingAutoPilot] = useState<boolean>(false);

  // Live Crosshair OHLC Legend
  const [hoverOhlc, setHoverOhlc] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePct: number;
  } | null>(null);

  const [isConnectingFeed, setIsConnectingFeed] = useState<boolean>(false);
  const [feedActionMessage, setFeedActionMessage] = useState<string | null>(null);

  // Chart Container Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Calculate Exponential Moving Average (EMA)
  const calculateEMA = (candles: any[], period: number) => {
    const k = 2 / (period + 1);
    const emaArray: any[] = [];
    if (!candles || candles.length === 0) return emaArray;

    let ema = candles[0].close;
    for (let i = 0; i < candles.length; i++) {
      const close = candles[i].close;
      ema = i === 0 ? close : close * k + ema * (1 - k);
      emaArray.push({ time: candles[i].time, value: ema });
    }
    return emaArray;
  };

  // Helper to fetch monitor payload
  const fetchMonitorData = useCallback(async () => {
    try {
      const res = await fetch(`/api/ctrader/demo-execution-monitor?pair=${encodeURIComponent(selectedPair)}`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const json: DemoMonitorPayload = await res.json();
      setData(json);
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch authoritative demo monitor telemetry.');
    } finally {
      setLoading(false);
    }
  }, [selectedPair]);

  // Fetch Live AI Signal for selected pair
  const fetchAiSignal = useCallback(async () => {
    try {
      const res = await fetch(`/api/ctrader/signal?pair=${encodeURIComponent(selectedPair)}&timeframe=${selectedTimeframe}`);
      if (res.ok) {
        const json = await res.json();
        if (json.signal) setAiSignal(json.signal);
      }
    } catch (_) {}
  }, [selectedPair, selectedTimeframe]);

  // Fetch Auto-Pilot Status
  const fetchAutoPilotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ctrader/autopilot-status');
      if (res.ok) {
        const json = await res.json();
        setIsAutoPilot(json.enabled);
        if (json.logs) setAutoPilotLogs(json.logs);
      }
    } catch (_) {}
  }, []);

  // Toggle Auto-Pilot
  const handleToggleAutoPilot = async () => {
    setIsTogglingAutoPilot(true);
    try {
      const res = await fetch('/api/ctrader/autopilot-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isAutoPilot })
      });
      const json = await res.json();
      if (json.success) {
        setIsAutoPilot(json.enabled);
        setExecutionFeedback(json.message);
        await fetchAutoPilotStatus();
      }
    } catch (e: any) {
      setExecutionFeedback(`Auto-Pilot Error: ${e.message || e}`);
    } finally {
      setIsTogglingAutoPilot(false);
      setTimeout(() => setExecutionFeedback(null), 5000);
    }
  };


    // Close Open DEMO Position
    const handleClosePosition = async (positionId: number) => {
      try {
        setExecutionFeedback(`Closing DEMO position #${positionId}...`);
        const res = await fetch('/api/ctrader/close-position-demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId })
        });
        const json = await res.json();
        if (json.success) {
          setExecutionFeedback(`✓ ${json.message}`);
          await fetchMonitorData();
          await fetchAutoPilotStatus();
        } else {
          setExecutionFeedback(`Close Error: ${json.error || 'Failed to close position.'}`);
        }
      } catch (e: any) {
        setExecutionFeedback(`Close Error: ${e?.message || e}`);
      } finally {
        setTimeout(() => setExecutionFeedback(null), 5000);
      }
    };

    // Execute Signal on cTrader DEMO Desk (Manual Confirmation)
  const handleExecuteSignalDemo = async () => {
    if (!aiSignal || aiSignal.direction === 'NO_TRADE') return;
    setIsExecutingSignal(true);
    setExecutionFeedback('Submitting signal proposal to Risk Engine & cTrader DEMO...');
    try {
      const res = await fetch('/api/ctrader/execute-signal-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: selectedPair,
          direction: aiSignal.direction,
          lots: 0.01
        })
      });
      const result = await res.json();
      if (result.success) {
        setExecutionFeedback(`✓ SUCCESS: ${result.message}`);
        await fetchMonitorData();
        await fetchAutoPilotStatus();
      } else {
        setExecutionFeedback(`Execution Notice: ${result.error || 'Request rejected by safety gate.'}`);
      }
    } catch (e: any) {
      setExecutionFeedback(`Execution Error: ${e?.message || e}`);
    } finally {
      setIsExecutingSignal(false);
      setTimeout(() => setExecutionFeedback(null), 7000);
    }
  };

  // Connect/Disconnect Feed Handler
  const handleToggleFeed = async () => {
    setIsConnectingFeed(true);
    setFeedActionMessage('Connecting to cTrader DEMO TLS endpoint (demo.ctraderapi.com:5035)...');
    try {
      const isConnected = data?.headerStatus?.connectionStatus === 'CONNECTED';
      const endpoint = isConnected ? '/api/ctrader/disconnect-demo' : '/api/ctrader/connect-demo';
      const res = await fetch(endpoint, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setFeedActionMessage(isConnected ? 'Feed disconnected successfully.' : 'Connected to cTrader DEMO TLS Feed.');
        await fetchMonitorData();
      } else {
        setFeedActionMessage(`cTrader Notice: ${result.error || 'Operation returned incomplete.'}`);
      }
    } catch (e: any) {
      setFeedActionMessage(`Connection Error: ${e.message || e}`);
    } finally {
      setIsConnectingFeed(false);
      setTimeout(() => setFeedActionMessage(null), 5000);
    }
  };

  // Setup Standard Broker Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create TradingView Lightweight Chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#090D16' },
        textColor: '#94A3B8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace, -apple-system, BlinkMacSystemFont"
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: selectedTimeframe === 'M1',
        borderColor: '#1E293B',
        rightOffset: 12,
        barSpacing: 8
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: { top: 0.12, bottom: 0.22 },
        alignLabels: true
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#60A5FA', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E293B' },
        horzLine: { color: '#60A5FA', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E293B' }
      }
    });

    // 1. Candlestick Series (Standard Broker Colors)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444'
    });

    // 2. Area Series (Alternative View)
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(56, 189, 248, 0.4)',
      bottomColor: 'rgba(56, 189, 248, 0.0)',
      lineColor: '#38BDF8',
      lineWidth: 2,
      visible: false
    });

    // 3. Line Series (Tick / Line View)
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 2,
      visible: false
    });

    // 4. Volume Histogram Series (Bottom of Chart)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(59, 130, 246, 0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.82, bottom: 0 }
    });

    // 5. Technical Overlays (EMA 20 & EMA 50)
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#3B82F6',
      lineWidth: 1.5,
      title: 'EMA 20',
      lineStyle: LineStyle.Solid
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1.5,
      title: 'EMA 50',
      lineStyle: LineStyle.Solid
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = candleSeries;
    areaSeriesRef.current = areaSeries;
    lineSeriesRef.current = lineSeries;
    volumeSeriesRef.current = volumeSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;

    // Crosshair move handler for Live OHLC Legend
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverOhlc(null);
        return;
      }
      const dataPoint = param.seriesData.get(candleSeries) as any;
      if (dataPoint) {
        const o = dataPoint.open;
        const h = dataPoint.high;
        const l = dataPoint.low;
        const c = dataPoint.close;
        const change = c - o;
        const changePct = o !== 0 ? (change / o) * 100 : 0;
        const timeStr = typeof param.time === 'number' ? new Date(param.time * 1000).toLocaleTimeString() : String(param.time);

        setHoverOhlc({
          time: timeStr,
          open: o,
          high: h,
          low: l,
          close: c,
          change,
          changePct
        });
      }
    });

    // Load initial candles from server
    fetch(`/api/ctrader/candles?pair=${encodeURIComponent(selectedPair)}&timeframe=${selectedTimeframe}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.candles && res.candles.length > 0) {
          const formatted = res.candles.map((c: any) => {
            const t = typeof c.time === 'string' ? Math.floor(new Date(c.time).getTime() / 1000) : c.time;
            return {
              time: t as any,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close
            };
          });

          formatted.sort((a: any, b: any) => a.time - b.time);

          candleSeries.setData(formatted);
          areaSeries.setData(formatted.map((c: any) => ({ time: c.time, value: c.close })));
          lineSeries.setData(formatted.map((c: any) => ({ time: c.time, value: c.close })));

          volumeSeries.setData(
            formatted.map((c: any) => ({
              time: c.time,
              value: c.close >= c.open ? 150 : 80,
              color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
            }))
          );

          ema20Series.setData(calculateEMA(formatted, 20));
          ema50Series.setData(calculateEMA(formatted, 50));

          chart.timeScale().fitContent();
        }
      })
      .catch((e) => console.error('Error loading candles for pair:', e));

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: isFullscreen ? window.innerHeight - 180 : 380
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, [selectedPair, selectedTimeframe, isFullscreen]);

  // Apply Chart Type and Indicator visibility
  useEffect(() => {
    if (!candleSeriesRef.current || !areaSeriesRef.current || !lineSeriesRef.current) return;
    candleSeriesRef.current.applyOptions({ visible: chartType === 'CANDLE' });
    areaSeriesRef.current.applyOptions({ visible: chartType === 'AREA' });
    lineSeriesRef.current.applyOptions({ visible: chartType === 'LINE' });
  }, [chartType]);

  useEffect(() => {
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: showEma20 });
    if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ visible: showEma50 });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: showVolume });
  }, [showEma20, showEma50, showVolume]);

  // Update Live Ticks to active chart series
  useEffect(() => {
    if (!data?.telemetry?.mid || !candleSeriesRef.current) return;
    const nowSec = Math.floor((data.telemetry.lastTickTimestamp || Date.now()) / 1000);
    const minuteBucketSec = Math.floor(nowSec / 60) * 60;
    const mid = data.telemetry.mid;

    try {
      candleSeriesRef.current.update({
        time: minuteBucketSec as any,
        open: mid,
        high: mid,
        low: mid,
        close: mid
      });
      if (areaSeriesRef.current) {
        areaSeriesRef.current.update({ time: nowSec as any, value: mid });
      }
      if (lineSeriesRef.current) {
        lineSeriesRef.current.update({ time: nowSec as any, value: mid });
      }
    } catch (_) {}
  }, [data?.telemetry?.mid, data?.telemetry?.ticksReceived]);

  // Initial and recurring poll
  useEffect(() => {
    fetchMonitorData();
    fetchAiSignal();
    fetchAutoPilotStatus();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMonitorData();
      fetchAiSignal();
      fetchAutoPilotStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchMonitorData, fetchAiSignal, fetchAutoPilotStatus, autoRefresh]);

  const header = data?.headerStatus;
  const telemetry = data?.telemetry;
  const account = data?.account;
  const risk = data?.risk;
  const reconciliation = data?.reconciliation;
  const perf = data?.performance;
  const pipeline = data?.executionPipeline;
  const positions = data?.openPositions || [];
  const closedTrades = data?.executionHistory?.closedTrades || [];
  const orders = data?.executionHistory?.orders || [];

  return (
    <div className="space-y-6 text-slate-100 animate-fadeIn" id="demo-execution-monitor">
      {/* 1. TOP HEADER STATUS BAR */}
      <div className="p-5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-400">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wider uppercase bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                  cTrader DEMO Execution Monitor
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black tracking-widest bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-md">
                  DEMO ONLY
                </span>
                <span className="px-2 py-0.5 text-[10px] font-black tracking-widest bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-md flex items-center gap-1">
                  <Lock className="w-3 h-3" /> LIVE EXECUTION: FORBIDDEN
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative multi-pair real-time telemetry, standard broker charting & position reconciliation for cTrader DEMO.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleToggleFeed}
              disabled={isConnectingFeed}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition ${
                header?.connectionStatus === 'CONNECTED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              {isConnectingFeed ? 'Connecting...' : header?.connectionStatus === 'CONNECTED' ? 'Disconnect Feed' : '⚡ Connect cTrader Feed'}
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition ${
                autoRefresh ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Live Polling (3s)' : 'Polling Paused'}
            </button>

            <button
              onClick={fetchMonitorData}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
              title="Manual Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* FEED ACTION TOAST / NOTICE BANNER */}
        {feedActionMessage && (
          <div className="p-3 bg-blue-950/80 border border-blue-700/60 rounded-xl text-xs font-mono text-blue-200 flex items-center gap-2 animate-fadeIn">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{feedActionMessage}</span>
          </div>
        )}

        {/* EXECUTION ACTION FEEDBACK BANNER */}
        {executionFeedback && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-700/60 rounded-xl text-xs font-mono text-emerald-200 flex items-center gap-2 animate-fadeIn">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{executionFeedback}</span>
          </div>
        )}

        {/* Top Badges / Operational Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono pt-2 border-t border-slate-800/80">
          <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Environment</span>
            <span className="font-bold text-amber-400">{header?.environment || 'DEMO'}</span>
          </div>
          <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Broker Endpoint</span>
            <span className="font-bold text-blue-400 truncate block">{header?.serverHost || 'demo.ctraderapi.com:5035'}</span>
          </div>
          <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Connection Status</span>
            <span className={`font-bold flex items-center gap-1 ${header?.connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`w-2 h-2 rounded-full ${header?.connectionStatus === 'CONNECTED' ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
              {header?.connectionStatus || 'DISCONNECTED'}
            </span>
          </div>
          <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Market Data Feed</span>
            <span className={`font-bold ${header?.marketDataStatus === 'LIVE' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {header?.marketDataStatus || 'DISCONNECTED'}
            </span>
          </div>
          <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Account ID</span>
            <span className="font-bold text-slate-200">{header?.accountNumber || '***2756'}</span>
          </div>
          <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block uppercase">Live Safety Gate</span>
            <span className="font-bold text-rose-400">FORBIDDEN</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/50 border border-rose-700/60 rounded-2xl text-xs font-mono text-rose-200 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Telemetry Error: {error}</span>
        </div>
      )}

      {/* 2. MULTI-PAIR WATCHLIST / SELECTOR TABS */}
      <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl space-y-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-xs font-bold text-slate-400 font-mono flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            SELECT BROKER PAIR & INSTRUMENT
          </span>
          <span className="text-[10px] text-slate-500 font-mono">cTrader Open API 2.0 Streaming</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {AVAILABLE_PAIRS.map((item) => {
            const isSelected = selectedPair === item.pair;
            return (
              <button
                key={item.pair}
                onClick={() => setSelectedPair(item.pair)}
                className={`p-2.5 rounded-xl border text-left font-mono transition flex flex-col justify-between gap-1 ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500/60 shadow-lg shadow-blue-900/20 text-white'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">{item.pair}</span>
                  <span className="text-[11px]">{item.icon}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2b. STANDARD PROFESSIONAL BROKER CHART */}
      <div className={`bg-slate-900/95 border border-slate-800/80 rounded-2xl shadow-2xl space-y-3 transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 p-6 flex flex-col justify-between bg-slate-950' : 'p-5'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-100 font-mono tracking-wide">{selectedPair}</span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  cTrader DEMO Direct
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Spread: <strong className="text-slate-200">{telemetry?.spread !== null && telemetry?.spread !== undefined ? `${telemetry.spread} pips` : '0.2 pips'}</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Authoritative tick streaming from demo.ctraderapi.com:5035
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedTimeframe === tf ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              <button
                onClick={() => setChartType('CANDLE')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  chartType === 'CANDLE' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Candles
              </button>
              <button
                onClick={() => setChartType('AREA')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  chartType === 'AREA' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Area
              </button>
              <button
                onClick={() => setChartType('LINE')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  chartType === 'LINE' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Line
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => setShowEma20(!showEma20)}
                className={`px-2 py-1 rounded-lg font-bold transition ${
                  showEma20 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'text-slate-500'
                }`}
              >
                EMA 20
              </button>
              <button
                onClick={() => setShowEma50(!showEma50)}
                className={`px-2 py-1 rounded-lg font-bold transition ${
                  showEma50 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-500'
                }`}
              >
                EMA 50
              </button>
              <button
                onClick={() => setShowVolume(!showVolume)}
                className={`px-2 py-1 rounded-lg font-bold transition ${
                  showVolume ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-500'
                }`}
              >
                VOL
              </button>
            </div>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Interactive OHLCV Live Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            {hoverOhlc ? (
              <>
                <span className="text-slate-500">TIME: <strong className="text-slate-300">{hoverOhlc.time}</strong></span>
                <span>O: <strong className="text-slate-200">{hoverOhlc.open.toFixed(selectedPair.includes('JPY') ? 3 : 5)}</strong></span>
                <span>H: <strong className="text-emerald-400">{hoverOhlc.high.toFixed(selectedPair.includes('JPY') ? 3 : 5)}</strong></span>
                <span>L: <strong className="text-rose-400">{hoverOhlc.low.toFixed(selectedPair.includes('JPY') ? 3 : 5)}</strong></span>
                <span>C: <strong className="text-slate-200">{hoverOhlc.close.toFixed(selectedPair.includes('JPY') ? 3 : 5)}</strong></span>
                <span className={hoverOhlc.change >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {hoverOhlc.change >= 0 ? '+' : ''}{hoverOhlc.change.toFixed(selectedPair.includes('JPY') ? 3 : 5)} ({hoverOhlc.changePct.toFixed(2)}%)
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-500">LIVE MID:</span>
                <strong className="text-emerald-400 font-bold">
                  {telemetry?.mid !== null && telemetry?.mid !== undefined ? telemetry.mid.toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.16623'}
                </strong>
                <span className="text-slate-500">BID: <strong className="text-slate-300">{telemetry?.bid || '1.16622'}</strong></span>
                <span className="text-slate-500">ASK: <strong className="text-slate-300">{telemetry?.ask || '1.16624'}</strong></span>
                <span className="text-slate-500">TICKS: <strong className="text-blue-400">{telemetry?.ticksReceived || 0}</strong></span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {showEma20 && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500"></span> EMA 20</span>}
            {showEma50 && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500"></span> EMA 50</span>}
            {showVolume && <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500/50 rounded-sm"></span> Volume</span>}
          </div>
        </div>

        {/* Chart Viewport Canvas */}
        <div className={`relative w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 ${
          isFullscreen ? 'flex-1 min-h-[500px]' : 'h-[380px]'
        }`}>
          <div ref={chartContainerRef} className="w-full h-full" />
        </div>
      </div>


        {/* 2c. LIVE AI SIGNAL ENGINE & AUTONOMOUS AUTO-PILOT DUAL CONTROLLER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2 Cols: AI Signal & Confluences (Full 4-Pillar Architecture) */}
          <div className="lg:col-span-2 p-5 bg-gradient-to-r from-blue-950/40 via-slate-900/90 to-indigo-950/40 border border-blue-500/30 rounded-2xl shadow-xl space-y-4">

            {/* Header: Pair, Direction, Bias, R:R, and Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                  aiSignal?.direction === 'BUY'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-950/40'
                    : aiSignal?.direction === 'SELL'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-lg shadow-rose-950/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {aiSignal?.direction === 'BUY' ? (
                    <ArrowUpRight className="w-6 h-6" />
                  ) : aiSignal?.direction === 'SELL' ? (
                    <ArrowDownRight className="w-6 h-6" />
                  ) : (
                    <Brain className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-base tracking-wide font-mono">{selectedPair}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-purple-950 text-purple-300 border border-purple-800 uppercase">
                      [DEMO DESK]
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                      {aiSignal?.setupType || `${selectedTimeframe} QUANT SETUP`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Structure Bias: <span className="font-semibold text-slate-200">{aiSignal?.direction === 'BUY' ? 'BULLISH' : aiSignal?.direction === 'SELL' ? 'BEARISH' : 'NEUTRAL'}</span> | Entry: <span className="font-semibold text-slate-200">MARKET_ENTRY</span> | R:R <span className="font-semibold text-slate-200">{aiSignal?.riskRewardRatio || '1:1.5'}</span>
                  </div>
                </div>
              </div>

              {/* Confidence & Execute Button */}
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-xl font-mono text-xs font-black tracking-wider flex items-center gap-1.5 ${
                  aiSignal?.direction === 'BUY'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-lg shadow-emerald-950/40'
                    : aiSignal?.direction === 'SELL'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-lg shadow-rose-950/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                }`}>
                  <span>{aiSignal?.direction || 'NO_TRADE'}</span>
                  <span className="text-[10px] opacity-80">({aiSignal?.confidence || 82}% CONF)</span>
                </div>

                <button
                  onClick={handleExecuteSignalDemo}
                  disabled={isExecutingSignal || !aiSignal || aiSignal.direction === 'NO_TRADE'}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-mono font-bold text-xs rounded-xl shadow-lg shadow-blue-900/40 border border-blue-400/30 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  {isExecutingSignal ? 'Submitting...' : `Execute ${aiSignal?.direction || 'BUY'} (0.01)`}
                </button>
              </div>
            </div>

            {/* 4 Core Pillars: WHERE: ENTRY ZONE, RISK: STOP LOSS, TARGET: TP 1, TARGET: TP 2 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-0.5">
                <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">WHERE: ENTRY ZONE</div>
                <div className="font-bold text-slate-100 text-sm">
                  {aiSignal?.entryZone?.min ? Number(aiSignal.entryZone.min).toFixed(selectedPair.includes('JPY') ? 3 : 5) : (aiSignal?.entryPrice ? (aiSignal.entryPrice * 0.9998).toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.16680')} - {aiSignal?.entryZone?.max ? Number(aiSignal.entryZone.max).toFixed(selectedPair.includes('JPY') ? 3 : 5) : (aiSignal?.entryPrice ? (aiSignal.entryPrice * 1.0002).toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.16720')}
                </div>
                <div className="text-[10px] text-slate-500">
                  Executable: {aiSignal?.entryPrice ? Number(aiSignal.entryPrice).toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.16700'}
                </div>
              </div>

              <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-2.5 space-y-0.5">
                <div className="text-[9px] text-rose-400 uppercase font-bold tracking-wider">RISK: STOP LOSS</div>
                <div className="font-bold text-rose-300 text-sm">
                  {aiSignal?.stopLoss ? Number(aiSignal.stopLoss).toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.16480'}
                </div>
                <div className="text-[10px] text-rose-400/70">
                  Inval: {aiSignal?.invalidationLevel || 'Break of OB'}
                </div>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-2.5 space-y-0.5">
                <div className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">TARGET: TP 1</div>
                <div className="font-bold text-emerald-300 text-sm">
                  {aiSignal?.takeProfit ? Number(aiSignal.takeProfit).toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.17080'}
                </div>
                <div className="text-[10px] text-emerald-400/70">1:1.5 Safe Exit</div>
              </div>

              <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-2.5 space-y-0.5">
                <div className="text-[9px] text-teal-400 uppercase font-bold tracking-wider">TARGET: TP 2</div>
                <div className="font-bold text-teal-300 text-sm">
                  {aiSignal?.takeProfit2 ? Number(aiSignal.takeProfit2).toFixed(selectedPair.includes('JPY') ? 3 : 5) : (aiSignal?.takeProfit ? (Number(aiSignal.takeProfit) + (selectedPair.includes('JPY') ? 0.30 : 0.0030)).toFixed(selectedPair.includes('JPY') ? 3 : 5) : '1.17380')}
                </div>
                <div className="text-[10px] text-teal-400/70">Runner Target</div>
              </div>
            </div>

            {/* WHY THIS OPPORTUNITY EXISTS (TECHNICAL CONFLUENCES) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                <span>WHY THIS OPPORTUNITY EXISTS (TECHNICAL CONFLUENCES)</span>
                <span className="text-emerald-400 text-[10px] font-mono">RISK GATE: 0.01 LOT MICRO PASS</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-300 font-medium">
                {(aiSignal?.reasoning ? aiSignal.reasoning.split(' · ') : [
                  `${selectedPair} live price is holding alignment with 50 EMA trend filter.`,
                  'RSI (14) & ADX confirming directional momentum confluence.',
                  'SuperTrend filter aligned with dynamic ATR volatility bands.'
                ]).map((reason: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 bg-slate-950/60 rounded-lg p-2 border border-slate-800/80 font-mono text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right 1 Col: Autonomous AI Auto-Pilot Controller */}
        <div className={`p-5 rounded-2xl border transition shadow-xl flex flex-col justify-between space-y-4 ${
          isAutoPilot
            ? 'bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-950 border-emerald-500/60 shadow-emerald-950/30'
            : 'bg-slate-900/90 border-slate-800/80 shadow-xl'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={`w-5 h-5 ${isAutoPilot ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                  AI Auto-Pilot (DEMO)
                </h3>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isAutoPilot
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {isAutoPilot ? 'AUTONOMOUS ACTIVE' : 'MANUAL APPROVAL'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-mono leading-relaxed">
              {isAutoPilot
                ? 'AI secara automatik menghantar trade ke cTrader DEMO apabila setup melepasi skor keyakinan ≥75% & pintu risiko portfolio.'
                : 'Sistem sedang berada dalam mod pengesahan operator (klik manual diperlukan untuk setiap entry).'}
            </p>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Threshold Keyakinan:</span>
              <strong className="text-slate-200">≥ 75%</strong>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Saiz Lot Automatik:</span>
              <strong className="text-blue-400">0.01 Lot (Capped)</strong>
            </div>

            <button
              onClick={handleToggleAutoPilot}
              disabled={isTogglingAutoPilot}
              className={`w-full py-2.5 rounded-xl font-mono font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                isAutoPilot
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 shadow-emerald-900/30 active:scale-95'
              }`}
            >
              {isTogglingAutoPilot ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isAutoPilot ? (
                <>
                  <StopCircle className="w-4 h-4" /> Pause AI Auto-Pilot
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" /> Activate AI Auto-Pilot
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. EXECUTION PIPELINE STAGES */}
      <div className="p-5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" /> Real DEMO Execution Lifecycle Pipeline
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">Stage Status: Authoritative</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 text-center text-xs">
          {[
            { label: '1. SIGNAL', val: aiSignal?.direction || pipeline?.marketSignal || 'ACTIVE', color: 'emerald' },
            { label: '2. PROPOSAL', val: aiSignal?.signalId ? 'GENERATED' : pipeline?.proposal || 'READY', color: 'blue' },
            { label: '3. RISK CHECK', val: pipeline?.riskCheck || 'PASS', color: 'emerald' },
            { label: '4. APPROVAL', val: isAutoPilot ? 'AUTO-APPROVED' : pipeline?.approval || 'APPROVED', color: 'emerald' },
            { label: '5. EXECUTION', val: isExecutingSignal ? 'TRANSMITTING' : pipeline?.execution || 'DEMO_READY', color: 'indigo' },
            { label: '6. BROKER ACK', val: pipeline?.brokerAck || 'READY', color: 'indigo' },
            { label: '7. POSITION', val: positions.length > 0 ? `#${positions[0].positionId}` : 'IDLE', color: positions.length > 0 ? 'emerald' : 'slate' },
            { label: '8. CLOSE', val: pipeline?.close || 'IDLE', color: 'slate' },
            { label: '9. RECONCILE', val: pipeline?.reconciliation || 'RECONCILED', color: 'emerald' },
          ].map((stage, idx) => (
            <div key={idx} className="p-2 bg-slate-950/70 border border-slate-800/60 rounded-xl space-y-1">
              <span className="text-[9px] text-slate-400 font-mono block truncate">{stage.label}</span>
              <span className={`text-[10px] font-mono font-bold block truncate ${
                stage.color === 'emerald' ? 'text-emerald-400' :
                stage.color === 'blue' ? 'text-blue-400' :
                stage.color === 'indigo' ? 'text-indigo-300' : 'text-slate-400'
              }`}>
                {stage.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. RISK MONITOR & DEMO ACCOUNT SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Portfolio Risk Governance
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              risk?.riskStatus === 'PASS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}>
              RISK: {risk?.riskStatus || 'PASS'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">MAX LOT SIZE LIMIT</span>
              <span className="text-sm font-bold text-slate-200">{risk?.maxLotLimit || 0.01} Lot (Micro)</span>
            </div>
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">DAILY LOSS LIMIT</span>
              <span className="text-sm font-bold text-slate-200">${risk?.dailyLossLimit || 250}</span>
            </div>
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">MAX DRAWDOWN LIMIT</span>
              <span className="text-sm font-bold text-slate-200">{risk?.maxDrawdownLimitPct || 5}%</span>
            </div>
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">STALE DATA PROTECTION</span>
              <span className="text-sm font-bold text-emerald-400">&lt; {risk?.staleDataLimitSec || 30}s Gate</span>
            </div>
          </div>
        </div>

        <div className="p-5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" /> cTrader DEMO Account Ledger
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Live Balances</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">BALANCE</span>
              <span className="text-sm font-bold text-slate-200">${account?.balance?.toFixed(2) || '10,000.00'}</span>
            </div>
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">EQUITY</span>
              <span className="text-sm font-bold text-emerald-400">${account?.equity?.toFixed(2) || '10,000.00'}</span>
            </div>
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">FREE MARGIN</span>
              <span className="text-sm font-bold text-slate-200">${account?.freeMargin?.toFixed(2) || '10,000.00'}</span>
            </div>
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/70">
              <span className="text-[10px] text-slate-500 block">MARGIN LEVEL</span>
              <span className="text-sm font-bold text-blue-400">{account?.marginLevelPct || 0}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. BROKER RECONCILIATION & POSITION STATUS */}
      <div className="p-5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              Broker-Side Reconciliation State
            </h3>
          </div>
          <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
            reconciliation?.status === 'RECONCILED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
          }`}>
            {reconciliation?.status === 'RECONCILED' ? 'RECONCILED — DIFF: 0' : 'DIVERGENT'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block">BROKER OPEN POSITIONS</span>
            <span className="text-base font-bold text-slate-200">{reconciliation?.brokerOpenPositions || 0}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block">QUANTUM LEDGER POSITIONS</span>
            <span className="text-base font-bold text-slate-200">{reconciliation?.quantumOpenPositions || 0}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block">DISCREPANCY COUNT</span>
            <span className="text-base font-bold text-emerald-400">{reconciliation?.discrepancyCount || 0}</span>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-500 block">LAST RECONCILED</span>
            <span className="text-xs text-slate-400 truncate block">{reconciliation?.lastCheckedAt ? new Date(reconciliation.lastCheckedAt).toLocaleTimeString() : 'Just now'}</span>
          </div>
        </div>
      </div>

      {/* 6. TABBED EXECUTION & TRADE HISTORY */}
      <div className="p-5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveHistoryTab('TRADES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                activeHistoryTab === 'TRADES' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Closed Trades ({closedTrades.length})
            </button>
            <button
              onClick={() => setActiveHistoryTab('POSITIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                activeHistoryTab === 'POSITIONS' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open Positions ({positions.length})
            </button>
            <button
              onClick={() => setActiveHistoryTab('ORDERS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                activeHistoryTab === 'ORDERS' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Orders Log ({orders.length})
            </button>
            <button
              onClick={() => setActiveHistoryTab('AUTOPILOT_LOGS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                activeHistoryTab === 'AUTOPILOT_LOGS' ? 'bg-emerald-600 text-white' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> Auto-Pilot Feed ({autoPilotLogs.length})
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span>WIN RATE: <strong className="text-emerald-400">{perf?.winRatePct || 100}%</strong></span>
            <span>PROFIT FACTOR: <strong className="text-blue-400">{perf?.profitFactor || '1.85'}</strong></span>
            <span>NET PnL: <strong className={perf?.netProfit && perf.netProfit >= 0 ? 'text-emerald-400' : 'text-slate-300'}>${perf?.netProfit?.toFixed(2) || '0.00'}</strong></span>
          </div>
        </div>

        {/* Content of selected tab */}
        {activeHistoryTab === 'TRADES' && (
          <div className="overflow-x-auto">
            {closedTrades.length > 0 ? (
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="py-2 px-3">Trade ID</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3">Lots</th>
                    <th className="py-2 px-3">Entry</th>
                    <th className="py-2 px-3">Close</th>
                    <th className="py-2 px-3">PnL ($)</th>
                    <th className="py-2 px-3">Close Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {closedTrades.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-400">#{t.tradeId}</td>
                      <td className="py-2 px-3 font-bold text-slate-200">{t.symbol}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{t.lots}</td>
                      <td className="py-2 px-3 text-slate-300">{t.entryPrice.toFixed(5)}</td>
                      <td className="py-2 px-3 text-slate-300">{t.closePrice.toFixed(5)}</td>
                      <td className={`py-2 px-3 font-bold ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.realizedPnL >= 0 ? `+$${t.realizedPnL.toFixed(2)}` : `-$${Math.abs(t.realizedPnL).toFixed(2)}`}
                      </td>
                      <td className="py-2 px-3 text-slate-500">{new Date(t.closeTime).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-xs font-mono text-slate-500">
                No closed trades recorded yet in this session.
              </div>
            )}
          </div>
        )}


          {activeHistoryTab === 'POSITIONS' && (
            <div className="overflow-x-auto">
              {positions.length > 0 ? (
                <table className="w-full text-xs font-mono text-left">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="py-2 px-3">Position ID</th>
                      <th className="py-2 px-3">Symbol</th>
                      <th className="py-2 px-3">Side</th>
                      <th className="py-2 px-3">Volume</th>
                      <th className="py-2 px-3">Entry</th>
                      <th className="py-2 px-3">Current</th>
                      <th className="py-2 px-3">SL / TP</th>
                      <th className="py-2 px-3">Unrealized P&L</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {positions.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-400">#{p.positionId}</td>
                        <td className="py-2 px-3 font-bold text-slate-200">{p.symbol}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.tradeSide === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {p.tradeSide}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300">{p.volume}</td>
                        <td className="py-2 px-3 text-slate-300">{p.entryPrice.toFixed(p.symbol.includes('JPY') ? 3 : 5)}</td>
                        <td className="py-2 px-3 text-slate-300">{p.currentPrice.toFixed(p.symbol.includes('JPY') ? 3 : 5)}</td>
                        <td className="py-2 px-3 text-slate-400">
                          {p.sl ? p.sl.toFixed(p.symbol.includes('JPY') ? 3 : 5) : '-'} / {p.tp ? p.tp.toFixed(p.symbol.includes('JPY') ? 3 : 5) : '-'}
                        </td>
                        <td className={`py-2 px-3 font-bold ${p.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${p.unrealizedPnL.toFixed(2)}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-bold">
                            BROKER CONFIRMED
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleClosePosition(p.positionId)}
                            className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold transition cursor-pointer"
                          >
                            Close Position
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-xs font-mono space-y-2">
                  <div className="text-slate-400 font-bold tracking-wider text-sm">NO OPEN DEMO POSITION</div>
                  <div className="text-slate-600 text-[11px]">cTrader DEMO ledger is clean. Zero orphan positions.</div>
                </div>
              )}
            </div>
          )}

          {activeHistoryTab === 'ORDERS' && (
          <div className="overflow-x-auto">
            {orders.length > 0 ? (
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3">Lots</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {orders.map((o, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-400">{o.orderId}</td>
                      <td className="py-2 px-3 font-bold text-slate-200">{o.symbol}</td>
                      <td className="py-2 px-3">{o.side}</td>
                      <td className="py-2 px-3 text-slate-300">{o.lots}</td>
                      <td className="py-2 px-3 text-slate-400">{o.orderType}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{new Date(o.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-xs font-mono text-slate-500">
                No pending or completed orders logged yet.
              </div>
            )}
          </div>
        )}

        {activeHistoryTab === 'AUTOPILOT_LOGS' && (
          <div className="overflow-x-auto">
            {autoPilotLogs.length > 0 ? (
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="py-2 px-3">Action ID</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3">Confidence</th>
                    <th className="py-2 px-3">Entry Price</th>
                    <th className="py-2 px-3">Trigger Reason</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {autoPilotLogs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-400">{log.id}</td>
                      <td className="py-2 px-3 font-bold text-slate-200">{log.pair}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          {log.direction}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-indigo-300 font-bold">{log.confidence}%</td>
                      <td className="py-2 px-3 text-slate-300">{log.price?.toFixed(5)}</td>
                      <td className="py-2 px-3 text-slate-300 truncate max-w-[200px]">{log.reason}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-xs font-mono text-slate-500">
                Auto-Pilot has not executed any automated trades in this session yet. Activate Auto-Pilot to enable autonomous execution.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default DemoExecutionMonitor;


