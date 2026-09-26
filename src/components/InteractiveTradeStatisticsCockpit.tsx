import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Zap,
  Activity,
  Calendar,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Layers,
  Percent,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';

export interface CTraderDeal {
  id: string;
  dealId: string;
  positionId: string;
  orderId: string;
  ticketId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  lotSize: number;
  entryPrice: number;
  exitPrice: number;
  grossProfit: number;
  commission: number;
  swap: number;
  netPnl: number;
  pnlDollars: number;
  realizedProfit: number;
  balance: number;
  closeTime: number;
  closeDate: string;
  closeReason: string;
  broker: string;
  environment: string;
}

export interface EquityCurvePoint {
  index: number;
  dealId: string;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  tradePnl: number;
  cumulativePnl: number;
  balance: number;
}

export interface SymbolStat {
  symbol: string;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnl: number;
  volumeLots: number;
}

export interface TradeStatisticsData {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRatePercent: number;
  profitFactor: number;
  totalProfitDollars: number;
  totalLossDollars: number;
  netPnlDollars: number;
  avgWinDollars: number;
  avgLossDollars: number;
  payoffRatio: number;
  maxDrawdownDollars: number;
  expectancyDollars: number;
  longStats: {
    total: number;
    wins: number;
    winRate: number;
    netPnl: number;
  };
  shortStats: {
    total: number;
    wins: number;
    winRate: number;
    netPnl: number;
  };
  symbolBreakdown: SymbolStat[];
}

type TimeframeFilter = 'ALL' | '30D' | '7D' | '1D';
type OutcomeFilter = 'ALL' | 'WINS' | 'LOSSES' | 'BUY' | 'SELL';

interface Props {
  className?: string;
  onRefreshTriggered?: () => void;
}

export const InteractiveTradeStatisticsCockpit: React.FC<Props> = ({
  className = '',
  onRefreshTriggered
}) => {
  const [deals, setDeals] = useState<CTraderDeal[]>([]);
  const [statistics, setStatistics] = useState<TradeStatisticsData | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityCurvePoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  // Interactive filters
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // UI state
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [hoveredPoint, setHoveredPoint] = useState<EquityCurvePoint | null>(null);
  const [sortField, setSortField] = useState<'closeTime' | 'netPnl' | 'volumeLots'>('closeTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch real historical deals directly from cTrader broker
  const fetchDealsAndStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/broker/deals?days=90&maxRows=500');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setDeals(data.deals || []);
        setStatistics(data.statistics || null);
        setEquityCurve(data.equityCurve || []);
        setLastRefreshedAt(new Date());
      } else {
        setError(data.error || 'Failed to fetch cTrader deals');
      }
    } catch (err: any) {
      console.error('[InteractiveTradeStats] Fetch error:', err);
      setError(err.message || 'Rangkaian broker tidak dapat dicapai');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDealsAndStats();
    const interval = setInterval(fetchDealsAndStats, 15000); // 15s auto-refresh
    return () => clearInterval(interval);
  }, [fetchDealsAndStats]);

  const handleManualRefresh = () => {
    fetchDealsAndStats();
    if (onRefreshTriggered) onRefreshTriggered();
  };

  const handleCopy = (id: string, textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Dynamic counts for each timeframe period
  const timeframeCounts = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    let count30D = 0;
    let count7D = 0;
    let count1D = 0;
    for (const d of deals) {
      const diff = now - d.closeTime;
      if (diff <= 30 * 24 * 60 * 60 * 1000) count30D++;
      if (diff <= 7 * 24 * 60 * 60 * 1000) count7D++;
      if (d.closeTime >= startOfTodayMs) count1D++;
    }
    return {
      ALL: deals.length,
      '30D': count30D,
      '7D': count7D,
      '1D': count1D
    };
  }, [deals]);

  // Filter deals by timeframe
  const filteredByTimeframe = useMemo(() => {
    if (!deals.length) return [];
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    return deals.filter(deal => {
      if (timeframe === 'ALL') return true;
      if (timeframe === '30D') return now - deal.closeTime <= 30 * 24 * 60 * 60 * 1000;
      if (timeframe === '7D') return now - deal.closeTime <= 7 * 24 * 60 * 60 * 1000;
      if (timeframe === '1D') return deal.closeTime >= startOfTodayMs;
      return true;
    });
  }, [deals, timeframe]);

  // Dynamically compute filtered statistics based on active timeframe & selected symbol
  const dynamicStats = useMemo(() => {
    let dataset = filteredByTimeframe;
    if (selectedSymbol !== 'ALL') {
      dataset = dataset.filter(d => d.symbol === selectedSymbol);
    }

    if (!dataset.length) {
      return {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        winRatePercent: 0,
        profitFactor: 0,
        totalProfitDollars: 0,
        totalLossDollars: 0,
        netPnlDollars: 0,
        avgWinDollars: 0,
        avgLossDollars: 0,
        payoffRatio: 0,
        maxDrawdownDollars: 0,
        expectancyDollars: 0,
        longStats: { total: 0, wins: 0, winRate: 0, netPnl: 0 },
        shortStats: { total: 0, wins: 0, winRate: 0, netPnl: 0 },
        symbolBreakdown: [] as SymbolStat[]
      };
    }

    const wins = dataset.filter(d => d.netPnl > 0);
    const losses = dataset.filter(d => d.netPnl < 0);
    const be = dataset.filter(d => d.netPnl === 0);
    const totalProfit = wins.reduce((acc, d) => acc + d.netPnl, 0);
    const totalLoss = Math.abs(losses.reduce((acc, d) => acc + d.netPnl, 0));
    const netPnl = totalProfit - totalLoss;
    const winRate = dataset.length > 0 ? Number(((wins.length / dataset.length) * 100).toFixed(1)) : 0;
    const profitFactor = totalLoss > 0 ? Number((totalProfit / totalLoss).toFixed(2)) : (totalProfit > 0 ? 99.99 : 0);
    const avgWin = wins.length > 0 ? Number((totalProfit / wins.length).toFixed(2)) : 0;
    const avgLoss = losses.length > 0 ? Number((totalLoss / losses.length).toFixed(2)) : 0;
    const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0;

    const longs = dataset.filter(d => d.direction === 'BUY');
    const shorts = dataset.filter(d => d.direction === 'SELL');
    const longWins = longs.filter(d => d.netPnl > 0).length;
    const shortWins = shorts.filter(d => d.netPnl > 0).length;
    const longPnl = longs.reduce((acc, d) => acc + d.netPnl, 0);
    const shortPnl = shorts.reduce((acc, d) => acc + d.netPnl, 0);

    // Symbols breakdown
    const symMap: Record<string, { total: number; wins: number; losses: number; pnl: number; volume: number }> = {};
    for (const d of dataset) {
      if (!symMap[d.symbol]) symMap[d.symbol] = { total: 0, wins: 0, losses: 0, pnl: 0, volume: 0 };
      symMap[d.symbol].total++;
      if (d.netPnl > 0) symMap[d.symbol].wins++;
      else if (d.netPnl < 0) symMap[d.symbol].losses++;
      symMap[d.symbol].pnl += d.netPnl;
      symMap[d.symbol].volume += d.volumeLots;
    }

    const symbolStats: SymbolStat[] = Object.entries(symMap).map(([sym, data]) => ({
      symbol: sym,
      totalTrades: data.total,
      winCount: data.wins,
      lossCount: data.losses,
      winRate: Number(((data.wins / data.total) * 100).toFixed(1)),
      netPnl: Number(data.pnl.toFixed(2)),
      volumeLots: Number(data.volume.toFixed(2))
    })).sort((a, b) => b.totalTrades - a.totalTrades);

    // Dynamic equity curve & max drawdown for the selected dataset
    const chrono = [...dataset].sort((a, b) => a.closeTime - b.closeTime);
    let running = 0;
    let peak = 0;
    let maxDd = 0;
    for (const d of chrono) {
      running += d.netPnl;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDd) maxDd = dd;
    }

    return {
      totalTrades: dataset.length,
      winCount: wins.length,
      lossCount: losses.length,
      breakevenCount: be.length,
      winRatePercent: winRate,
      profitFactor,
      totalProfitDollars: Number(totalProfit.toFixed(2)),
      totalLossDollars: Number(totalLoss.toFixed(2)),
      netPnlDollars: Number(netPnl.toFixed(2)),
      avgWinDollars: avgWin,
      avgLossDollars: avgLoss,
      payoffRatio,
      maxDrawdownDollars: Number(maxDd.toFixed(2)),
      expectancyDollars: dataset.length > 0 ? Number((netPnl / dataset.length).toFixed(2)) : 0,
      longStats: {
        total: longs.length,
        wins: longWins,
        winRate: longs.length > 0 ? Number(((longWins / longs.length) * 100).toFixed(1)) : 0,
        netPnl: Number(longPnl.toFixed(2))
      },
      shortStats: {
        total: shorts.length,
        wins: shortWins,
        winRate: shorts.length > 0 ? Number(((shortWins / shorts.length) * 100).toFixed(1)) : 0,
        netPnl: Number(shortPnl.toFixed(2))
      },
      symbolBreakdown: symbolStats
    };
  }, [filteredByTimeframe, selectedSymbol]);

  // Dynamic equity curve points
  const dynamicEquityCurve = useMemo(() => {
    let dataset = filteredByTimeframe;
    if (selectedSymbol !== 'ALL') {
      dataset = dataset.filter(d => d.symbol === selectedSymbol);
    }
    const chrono = [...dataset].sort((a, b) => a.closeTime - b.closeTime);
    let running = 0;
    return chrono.map((t, idx) => {
      running += t.netPnl;
      return {
        index: idx + 1,
        dealId: t.dealId,
        timestamp: t.closeTime,
        dateStr: new Date(t.closeTime).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        timeStr: new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        symbol: t.symbol,
        direction: t.direction,
        tradePnl: t.netPnl,
        cumulativePnl: Number(running.toFixed(2)),
        balance: t.balance
      };
    });
  }, [filteredByTimeframe, selectedSymbol]);

  // Filter deals for table view
  const displayDeals = useMemo(() => {
    let result = filteredByTimeframe;

    if (selectedSymbol !== 'ALL') {
      result = result.filter(d => d.symbol === selectedSymbol);
    }

    if (outcomeFilter === 'WINS') {
      result = result.filter(d => d.netPnl > 0);
    } else if (outcomeFilter === 'LOSSES') {
      result = result.filter(d => d.netPnl < 0);
    } else if (outcomeFilter === 'BUY') {
      result = result.filter(d => d.direction === 'BUY');
    } else if (outcomeFilter === 'SELL') {
      result = result.filter(d => d.direction === 'SELL');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(d =>
        d.symbol.toLowerCase().includes(q) ||
        d.dealId.toLowerCase().includes(q) ||
        d.positionId.toLowerCase().includes(q) ||
        d.direction.toLowerCase().includes(q) ||
        d.netPnl.toString().includes(q)
      );
    }

    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortOrder === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return result;
  }, [filteredByTimeframe, selectedSymbol, outcomeFilter, searchQuery, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(displayDeals.length / pageSize));
  const paginatedDeals = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayDeals.slice(start, start + pageSize);
  }, [displayDeals, currentPage, pageSize]);

  // Unique symbols for filter pills
  const availableSymbols = useMemo(() => {
    const set = new Set<string>();
    deals.forEach(d => set.add(d.symbol));
    return Array.from(set).sort();
  }, [deals]);

  // Export CSV
  const handleExportCsv = () => {
    if (!displayDeals.length) return;
    const headers = ['Deal ID', 'Position ID', 'Symbol', 'Direction', 'Lots', 'Entry Price', 'Exit Price', 'Gross PnL', 'Commission', 'Swap', 'Net PnL', 'Balance', 'Closed Date UTC'];
    const rows = displayDeals.map(d => [
      d.dealId,
      d.positionId,
      d.symbol,
      d.direction,
      d.volumeLots,
      d.entryPrice,
      d.exitPrice,
      d.grossProfit,
      d.commission,
      d.swap,
      d.netPnl,
      d.balance,
      d.closeDate
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cTrader_Deals_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render SVG Sparkline / Equity Curve
  const renderEquityChart = () => {
    if (!dynamicEquityCurve.length) {
      return (
        <div className="h-44 flex items-center justify-center text-slate-500 font-mono text-xs">
          Tiada data graf untuk pilihan masa semasa
        </div>
      );
    }

    const data = dynamicEquityCurve;
    const pnlValues = data.map(d => d.cumulativePnl);
    const minVal = Math.min(0, ...pnlValues);
    const maxVal = Math.max(0, ...pnlValues);
    const range = (maxVal - minVal) || 1;

    const width = 800;
    const height = 160;
    const padding = { top: 15, bottom: 25, left: 10, right: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = (idx: number) => padding.left + (idx / Math.max(1, data.length - 1)) * chartW;
    const getY = (val: number) => padding.top + chartH - ((val - minVal) / range) * chartH;
    const zeroY = getY(0);

    const points = data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.cumulativePnl).toFixed(1)}`).join(' ');
    const firstX = getX(0).toFixed(1);
    const lastX = getX(data.length - 1).toFixed(1);
    const areaPoints = `${points} ${lastX},${zeroY} ${firstX},${zeroY}`;

    const isNetPositive = (data[data.length - 1]?.cumulativePnl || 0) >= 0;

    return (
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 overflow-visible cursor-crosshair select-none"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="equityGradGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="equityGradRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>

          {/* Zero reference line */}
          <line
            x1={padding.left}
            y1={zeroY}
            x2={width - padding.right}
            y2={zeroY}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={width - padding.right - 2}
            y={zeroY - 4}
            fill="#64748b"
            fontSize="9"
            fontFamily="monospace"
            textAnchor="end"
          >
            $0.00 Titik Pulang Modal (Breakeven)
          </text>

          {/* Area under curve */}
          <polygon
            points={areaPoints}
            fill={isNetPositive ? "url(#equityGradGreen)" : "url(#equityGradRed)"}
          />

          {/* Main equity path */}
          <polyline
            fill="none"
            stroke={isNetPositive ? "#10b981" : "#f43f5e"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Data Points Interactive Hover Targets */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.cumulativePnl);
            const isHovered = hoveredPoint?.dealId === d.dealId;

            return (
              <g key={d.dealId} onMouseEnter={() => setHoveredPoint(d)}>
                {isHovered && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="6"
                    fill={d.tradePnl >= 0 ? "#10b981" : "#f43f5e"}
                    className="animate-ping opacity-75"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? "5" : "2.5"}
                  fill={d.tradePnl >= 0 ? "#10b981" : "#f43f5e"}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                  className="transition-all duration-150"
                />
              </g>
            );
          })}

          {/* X-Axis timestamps */}
          {data.length > 1 && (
            <>
              <text x={padding.left} y={height - 5} fill="#64748b" fontSize="9" fontFamily="monospace">
                {data[0]?.dateStr} {data[0]?.timeStr}
              </text>
              <text x={width / 2} y={height - 5} fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="middle">
                {data[Math.floor(data.length / 2)]?.dateStr}
              </text>
              <text x={width - padding.right} y={height - 5} fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="end">
                {data[data.length - 1]?.dateStr} {data[data.length - 1]?.timeStr}
              </text>
            </>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div className="absolute top-2 left-4 z-20 p-2.5 bg-slate-950/95 border border-cyan-500/40 rounded-xl shadow-2xl backdrop-blur-md font-mono text-[11px] pointer-events-none animate-fadeIn flex items-center gap-4">
            <div>
              <div className="text-slate-400 text-[9px] uppercase">Tiket #{hoveredPoint.dealId} &bull; {hoveredPoint.symbol} ({hoveredPoint.direction})</div>
              <div className="text-white font-bold">{hoveredPoint.dateStr} {hoveredPoint.timeStr}</div>
            </div>
            <div className="border-l border-white/10 pl-3">
              <div className="text-slate-400 text-[9px] uppercase">Untung Trade</div>
              <div className={`font-black ${hoveredPoint.tradePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {hoveredPoint.tradePnl >= 0 ? `+$${hoveredPoint.tradePnl.toFixed(2)}` : `-$${Math.abs(hoveredPoint.tradePnl).toFixed(2)}`}
              </div>
            </div>
            <div className="border-l border-white/10 pl-3">
              <div className="text-slate-400 text-[9px] uppercase">Kumulatif P&L</div>
              <div className={`font-black ${hoveredPoint.cumulativePnl >= 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                {hoveredPoint.cumulativePnl >= 0 ? `+$${hoveredPoint.cumulativePnl.toFixed(2)}` : `-$${Math.abs(hoveredPoint.cumulativePnl).toFixed(2)}`}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. MASTER HEADER & LIVE CTRADER STATUS */}
      <div className="p-6 bg-slate-900/90 border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-emerald-500/10 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <Activity className="w-6 h-6 animate-pulse text-cyan-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-wide uppercase">
                  Statistik Interaktif &amp; Rekod Sahih cTrader
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  100% REAL BROKER DEALS
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                  DEMO.CTRADERAPI.COM
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-2">
                <span>Akaun cTrader: <strong className="text-slate-200">#5881460</strong> (ID: 48282756)</span>
                <span>&bull;</span>
                <span>Jumlah Rekod Disahkan: <strong className="text-cyan-300">{deals.length} Trade</strong></span>
                <span>&bull;</span>
                <span className="text-[11px] text-slate-500">Kemaskini: {lastRefreshedAt.toLocaleTimeString()}</span>
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 self-end lg:self-center">
            <button
              onClick={handleExportCsv}
              disabled={displayDeals.length === 0}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 rounded-xl text-slate-300 hover:text-white font-mono text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              title="Eksport Laporan CSV"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Eksport CSV</span>
            </button>

            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Menyegerak...' : 'Segerak cTrader'}</span>
            </button>
          </div>
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="mt-4 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-mono flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 2. INTERACTIVE TIMEFRAME & ASSET FILTER CONTROLS */}
      <div className="p-4 bg-slate-900/70 border border-white/[0.06] rounded-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Timeframe Selector Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/[0.06]">
          <span className="text-[10px] text-slate-400 font-mono uppercase px-2 font-bold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-cyan-400" />
            Tempoh:
          </span>
          {(['ALL', '30D', '7D', '1D'] as TimeframeFilter[]).map(tf => {
            const labelMap: Record<TimeframeFilter, string> = {
              ALL: `Semua (${timeframeCounts.ALL})`,
              '30D': `30 Hari (${timeframeCounts['30D']})`,
              '7D': `7 Hari (${timeframeCounts['7D']})`,
              '1D': `Hari Ini (${timeframeCounts['1D']})`
            };
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => { setTimeframe(tf); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  active
                    ? 'bg-cyan-500 text-slate-950 shadow-md ring-1 ring-cyan-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {labelMap[tf]}
              </button>
            );
          })}
        </div>

        {/* Pair Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase px-1 font-bold flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-purple-400" />
            Pasangan:
          </span>
          <button
            onClick={() => { setSelectedSymbol('ALL'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
              selectedSymbol === 'ALL'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/[0.06]'
            }`}
          >
            Semua Simbol
          </button>
          {availableSymbols.map(sym => (
            <button
              key={sym}
              onClick={() => { setSelectedSymbol(sym); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                selectedSymbol === sym
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Active Filter Summary Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/60 border border-white/[0.04] rounded-xl text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>
            Tempoh Aktif: <strong className="text-white font-bold">{timeframe === 'ALL' ? 'Semua Masa' : timeframe === '30D' ? '30 Hari Terkini' : timeframe === '7D' ? '7 Hari Terkini' : '24 Jam Terkini'}</strong>
          </span>
          <span>&bull;</span>
          <span>
            Pasangan: <strong className="text-purple-300 font-bold">{selectedSymbol === 'ALL' ? 'Semua Simbol' : selectedSymbol}</strong>
          </span>
          <span>&bull;</span>
          <span>
            Jumlah Trade Diproses: <strong className="text-cyan-300 font-bold">{dynamicStats.totalTrades} Trade</strong>
          </span>
        </div>
        {dynamicStats.totalTrades > 0 && (
          <div className="text-[11px] text-slate-400 flex items-center gap-3">
            <span>Kadar Menang: <strong className="text-emerald-400">{dynamicStats.winRatePercent}%</strong></span>
            <span>Untung Bersih: <strong className={dynamicStats.netPnlDollars >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>${dynamicStats.netPnlDollars >= 0 ? `+${dynamicStats.netPnlDollars.toFixed(2)}` : dynamicStats.netPnlDollars.toFixed(2)}</strong></span>
            <span>PF: <strong className="text-purple-300 font-bold">{dynamicStats.profitFactor}</strong></span>
          </div>
        )}
      </div>

      {/* 3. EXECUTIVE KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Net Realized P&L */}
        <div className={`p-4 rounded-2xl border backdrop-blur-xl relative overflow-hidden transition-all shadow-lg ${
          dynamicStats.netPnlDollars >= 0
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider">Net Realized P&amp;L</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-mono tracking-tight text-white">
            {dynamicStats.netPnlDollars >= 0 ? `+$${dynamicStats.netPnlDollars.toFixed(2)}` : `-$${Math.abs(dynamicStats.netPnlDollars).toFixed(2)}`}
          </div>
          <div className="text-[10px] font-mono mt-1.5 text-slate-400 flex items-center justify-between">
            <span className="text-emerald-400 font-semibold">+${dynamicStats.totalProfitDollars.toFixed(2)}</span>
            <span className="text-rose-400 font-semibold">-${dynamicStats.totalLossDollars.toFixed(2)}</span>
          </div>
        </div>

        {/* 2. Win Rate */}
        <div className="p-4 bg-slate-900/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider">Kadar Kemenangan (Win Rate)</span>
            <Percent className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-black font-mono tracking-tight text-cyan-300 flex items-baseline gap-1.5">
            <span>{dynamicStats.winRatePercent}%</span>
            <span className="text-[11px] font-normal text-slate-400 font-mono">
              ({dynamicStats.winCount}W / {dynamicStats.lossCount}L)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${dynamicStats.winRatePercent}%` }} />
            <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${100 - dynamicStats.winRatePercent}%` }} />
          </div>
        </div>

        {/* 3. Profit Factor & Payoff Ratio */}
        <div className="p-4 bg-slate-900/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider">Faktor Keuntungan (PF)</span>
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-black font-mono tracking-tight text-purple-300 flex items-baseline gap-2">
            <span>{dynamicStats.profitFactor}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
              dynamicStats.profitFactor >= 1.5 ? 'bg-emerald-500/20 text-emerald-300' :
              dynamicStats.profitFactor >= 1.0 ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {dynamicStats.profitFactor >= 1.5 ? 'CEMERLANG' : dynamicStats.profitFactor >= 1.0 ? 'POSITIF' : 'PERLU REVIU'}
            </span>
          </div>
          <div className="text-[10px] font-mono mt-1.5 text-slate-400">
            Nisbah Ganjaran: <span className="text-white font-bold">1:{dynamicStats.payoffRatio}</span>
          </div>
        </div>

        {/* 4. Directional Win Rate (BUY vs SELL) */}
        <div className="p-4 bg-slate-900/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider">BUY vs SELL Split</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-cyan-400 font-bold">BUY: {dynamicStats.longStats.winRate}%</span>
              <span className="text-slate-300 font-bold">{dynamicStats.longStats.total} pos</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-purple-400 font-bold">SELL: {dynamicStats.shortStats.winRate}%</span>
              <span className="text-slate-300 font-bold">{dynamicStats.shortStats.total} pos</span>
            </div>
          </div>
          <div className="text-[9px] font-mono text-slate-500 mt-1 text-right">
            P&amp;L: BUY (${dynamicStats.longStats.netPnl.toFixed(0)}) / SELL (${dynamicStats.shortStats.netPnl.toFixed(0)})
          </div>
        </div>

        {/* 5. Max Drawdown */}
        <div className="p-4 bg-slate-900/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider">Maksimum Drawdown</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-black font-mono tracking-tight text-rose-400">
            -${dynamicStats.maxDrawdownDollars.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono mt-1.5 text-slate-400">
            Purata Kerugian: <span className="text-rose-400 font-bold">-${dynamicStats.avgLossDollars.toFixed(2)}</span>
          </div>
        </div>

        {/* 6. Expectancy per Trade */}
        <div className="p-4 bg-slate-900/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider">Jangkaan Pulangan / Trade</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-xl font-black font-mono tracking-tight ${
            dynamicStats.expectancyDollars >= 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}>
            {dynamicStats.expectancyDollars >= 0 ? `+$${dynamicStats.expectancyDollars.toFixed(2)}` : `-$${Math.abs(dynamicStats.expectancyDollars).toFixed(2)}`}
          </div>
          <div className="text-[10px] font-mono mt-1.5 text-slate-400">
            Purata Kemenangan: <span className="text-emerald-400 font-bold">+${dynamicStats.avgWinDollars.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 4. INTERACTIVE EQUITY GROWTH & P&L TIMELINE CURVE */}
      <div className="p-6 bg-slate-900/85 border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wide font-mono">
              Lengkung Pertumbuhan Ekuiti &amp; P&amp;L Kumulatif (cTrader Live Curve)
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {dynamicEquityCurve.length} Titik Eksekusi Broker &bull; {selectedSymbol !== 'ALL' ? selectedSymbol : 'Semua Pasangan'}
          </span>
        </div>

        {/* SVG Equity Chart */}
        {renderEquityChart()}
      </div>

      {/* 5. PER-SYMBOL PERFORMANCE MATRIX */}
      {dynamicStats.symbolBreakdown.length > 0 && (
        <div className="p-6 bg-slate-900/80 border border-white/[0.08] rounded-2xl shadow-xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wide font-mono">
                Prestasi Mengikut Pasangan Matawang (Symbol Matrix)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Klik mana-mana simbol untuk tapis senarai rekod
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {dynamicStats.symbolBreakdown.map(sym => {
              const isSelected = selectedSymbol === sym.symbol;
              const isProfit = sym.netPnl >= 0;
              return (
                <div
                  key={sym.symbol}
                  onClick={() => setSelectedSymbol(isSelected ? 'ALL' : sym.symbol)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-purple-950/60 border-purple-500 shadow-md ring-1 ring-purple-500'
                      : 'bg-slate-950/60 border-white/[0.06] hover:border-white/20 hover:bg-slate-950/90'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-white text-sm">{sym.symbol}</span>
                    <span className={`font-mono text-xs font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? `+$${sym.netPnl.toFixed(2)}` : `-$${Math.abs(sym.netPnl).toFixed(2)}`}
                    </span>
                  </div>

                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Kadar Menang: <strong className="text-cyan-300">{sym.winRate}%</strong></span>
                      <span>{sym.totalTrades} Trade ({sym.winCount}W / {sym.lossCount}L)</span>
                    </div>

                    {/* Progress visual */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                      <div className="bg-emerald-500 h-full" style={{ width: `${sym.winRate}%` }} />
                      <div className="bg-rose-500 h-full" style={{ width: `${100 - sym.winRate}%` }} />
                    </div>

                    <div className="text-[10px] text-slate-500 flex justify-between pt-0.5">
                      <span>Volum: {sym.volumeLots} Lots</span>
                      <span className="text-purple-300">{isSelected ? 'Aktif Tapisan ✓' : 'Tapis Pasangan'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. REAL CTRADER CLOSED TRADE LEDGER TABLE (FILTERABLE & PAGINATED) */}
      <div className="p-6 bg-slate-900/85 border border-white/[0.08] rounded-2xl shadow-2xl space-y-4 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-wide uppercase font-mono flex items-center gap-2">
              <span>Buku Rekod Sahih Broker (Audit Deal Ledger)</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {displayDeals.length} DITEMUI
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Setiap rekod dipetakan terus dari tiket cTrader Open API Protokol OA 2134
            </p>
          </div>

          {/* Table Filters & Search */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {/* Outcome Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/[0.06]">
              {(['ALL', 'WINS', 'LOSSES', 'BUY', 'SELL'] as OutcomeFilter[]).map(of => {
                const labelMap: Record<OutcomeFilter, string> = {
                  ALL: 'Semua',
                  WINS: 'Menang (Win)',
                  LOSSES: 'Kalah (Loss)',
                  BUY: 'BUY Sahaja',
                  SELL: 'SELL Sahaja'
                };
                const active = outcomeFilter === of;
                return (
                  <button
                    key={of}
                    onClick={() => { setOutcomeFilter(of); setCurrentPage(1); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      active
                        ? 'bg-cyan-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {labelMap[of]}
                  </button>
                );
              })}
            </div>

            {/* Live Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari Tiket, Pair..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-8 pr-3 py-1.5 bg-slate-950/80 border border-white/[0.08] rounded-xl text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-cyan-500 transition-all w-40 sm:w-48"
              />
            </div>
          </div>
        </div>

        {/* Empty State or Table */}
        {displayDeals.length === 0 ? (
          <div className="p-12 bg-slate-950/60 border border-white/[0.06] rounded-xl text-center font-mono text-xs text-slate-400 space-y-2">
            <HelpCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <div>[TIADA REKOD DITUTUP MEMADANI TAPISAN]</div>
            <p className="text-[11px] text-slate-500">
              Cuba tukar tempoh masa atau tetapkan semula penapis pasangan/hasil trade.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-slate-950/40">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="sticky top-0 bg-slate-950/95 z-10 backdrop-blur-md">
                  <tr className="border-b border-white/[0.08] text-[11px] text-slate-400 uppercase">
                    <th className="p-3 cursor-pointer hover:text-white" onClick={() => { setSortField('closeTime'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                      <div className="flex items-center gap-1">
                        <span>Masa &amp; Tiket</span>
                        {sortField === 'closeTime' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="p-3">Simbol &amp; Arah</th>
                    <th className="p-3 cursor-pointer hover:text-white" onClick={() => { setSortField('volumeLots'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                      <div className="flex items-center gap-1">
                        <span>Saiz Lot</span>
                        {sortField === 'volumeLots' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="p-3">Harga Entri</th>
                    <th className="p-3">Harga Tutup</th>
                    <th className="p-3">Komisen &amp; Swap</th>
                    <th className="p-3 cursor-pointer hover:text-white" onClick={() => { setSortField('netPnl'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                      <div className="flex items-center gap-1">
                        <span>Realized Net P&amp;L</span>
                        {sortField === 'netPnl' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="p-3">Baki Akaun</th>
                    <th className="p-3 text-center">Bukti Broker</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {paginatedDeals.map((deal) => {
                    const isWin = deal.netPnl > 0;
                    const isLoss = deal.netPnl < 0;
                    const isExpanded = expandedDealId === deal.dealId;

                    return (
                      <React.Fragment key={deal.dealId}>
                        <tr className={`hover:bg-white/[0.03] transition-all ${isExpanded ? 'bg-slate-900/60' : ''}`}>
                          {/* Masa & Tiket */}
                          <td className="p-3">
                            <div className="font-bold text-slate-200">
                              {new Date(deal.closeTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>{new Date(deal.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                              <span>&bull;</span>
                              <button
                                onClick={() => handleCopy(deal.dealId, deal.dealId)}
                                className="text-cyan-400/80 hover:text-cyan-300 flex items-center gap-0.5"
                                title="Salin cTrader Deal ID"
                              >
                                <span>#{deal.dealId}</span>
                                {copiedId === deal.dealId ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                              </button>
                            </div>
                          </td>

                          {/* Simbol & Arah */}
                          <td className="p-3">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{deal.symbol}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                deal.direction === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              }`}>
                                {deal.direction}
                              </span>
                            </div>
                          </td>

                          {/* Saiz Lot */}
                          <td className="p-3 font-bold text-slate-300">
                            {deal.volumeLots.toFixed(2)} Lot
                          </td>

                          {/* Harga Entri */}
                          <td className="p-3 text-slate-300 font-mono">
                            {deal.entryPrice.toFixed(deal.symbol.includes('JPY') ? 3 : deal.symbol.includes('BTC') ? 2 : 5)}
                          </td>

                          {/* Harga Tutup */}
                          <td className="p-3 text-slate-300 font-mono">
                            {deal.exitPrice.toFixed(deal.symbol.includes('JPY') ? 3 : deal.symbol.includes('BTC') ? 2 : 5)}
                          </td>

                          {/* Komisen & Swap */}
                          <td className="p-3 text-slate-400 text-[11px]">
                            <div>Kom: <span className="text-slate-300">${deal.commission.toFixed(2)}</span></div>
                            <div>Swap: <span className="text-slate-300">${deal.swap.toFixed(2)}</span></div>
                          </td>

                          {/* Realized Net PnL */}
                          <td className="p-3">
                            <div className={`font-black text-sm flex items-center gap-1 ${
                              isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-300'
                            }`}>
                              {isWin ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : isLoss ? <ArrowDownRight className="w-4 h-4 text-rose-400" /> : null}
                              <span>{deal.netPnl >= 0 ? `+$${deal.netPnl.toFixed(2)}` : `-$${Math.abs(deal.netPnl).toFixed(2)}`}</span>
                            </div>
                            <span className={`text-[9px] px-1 rounded font-bold uppercase ${
                              isWin ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                            }`}>
                              {isWin ? 'PROFIT' : 'LOSS'}
                            </span>
                          </td>

                          {/* Baki Selepas Tutup */}
                          <td className="p-3 font-bold text-slate-200">
                            ${deal.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Bukti Broker Action */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setExpandedDealId(isExpanded ? null : deal.dealId)}
                              className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 rounded-lg text-cyan-300 text-[10px] font-bold flex items-center gap-1 mx-auto transition-all"
                            >
                              <span>{isExpanded ? 'Tutup' : 'Audit'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>

                        {/* Accordion Audit Payload */}
                        {isExpanded && (
                          <tr className="bg-slate-950/90 border-b border-white/[0.08]">
                            <td colSpan={9} className="p-4 space-y-3 font-mono text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-900/90 border border-cyan-500/20 rounded-xl">
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase">cTrader Deal ID</div>
                                  <div className="text-cyan-300 font-bold">{deal.dealId}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase">Position ID (Ticket)</div>
                                  <div className="text-white font-bold">{deal.positionId}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase">cTrader Order ID</div>
                                  <div className="text-purple-300 font-bold">{deal.orderId}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase">Integriti Bukti Broker</div>
                                  <div className="text-emerald-400 font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Sah cTrader Open API</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-white/[0.04] flex flex-wrap items-center justify-between gap-2">
                                <span>Gross Profit: <strong className="text-white">${deal.grossProfit.toFixed(2)}</strong></span>
                                <span>Komisen Broker: <strong className="text-slate-300">${deal.commission.toFixed(2)}</strong></span>
                                <span>Kadar Swap: <strong className="text-slate-300">${deal.swap.toFixed(2)}</strong></span>
                                <span>Net Realized PnL: <strong className={deal.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${deal.netPnl.toFixed(2)}</strong></span>
                                <span>Baki Semasa Tutup: <strong className="text-cyan-300">${deal.balance.toFixed(2)}</strong></span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 font-mono text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Memaparkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, displayDeals.length)} daripada {displayDeals.length} rekod</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-white text-xs font-mono"
                >
                  <option value={10}>10 Baris</option>
                  <option value={25}>25 Baris</option>
                  <option value={50}>50 Baris</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-white font-bold flex items-center gap-1 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelum</span>
                </button>
                <span className="px-3 py-1 bg-slate-950 border border-white/[0.08] rounded-lg text-white font-bold">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-white font-bold flex items-center gap-1 transition-all"
                >
                  <span>Seterusnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
