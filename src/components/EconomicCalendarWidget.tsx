import React, { useState, useMemo } from 'react';
import { EconomicEvent } from '../types';
import {
  Calendar, Clock, ShieldAlert, Cpu, Filter, Search, CheckCircle, Zap,
  ChevronDown, ChevronUp, ExternalLink, Globe, AlertTriangle, ShieldCheck,
  TrendingUp, TrendingDown, RefreshCw, BarChart2, Radio, Lightbulb, Compass,
  Sparkles, ArrowUpRight, ArrowDownRight, Info, HelpCircle
} from 'lucide-react';
import { Language, translations } from '../lib/translations';
import { TradingViewEconomicCalendar } from './TradingViewEconomicCalendar';

interface EconomicCalendarWidgetProps {
  events: EconomicEvent[];
  language?: Language;
  onRefresh?: () => void;
}

type DateFilter = 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK';
type ImpactFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
type Timezone = 'UTC+8' | 'UTC' | 'EST';

export interface MarketReactionGuide {
  higherIsBetter: boolean;
  actualVsForecastBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UPCOMING';
  actualVsPreviousTrend: 'IMPROVING' | 'DETERIORATING' | 'NEUTRAL' | 'UPCOMING';
  summaryBadge: {
    label: string;
    subLabel: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    icon: 'UP' | 'DOWN' | 'NEUTRAL' | 'PENDING';
  };
  bullishScenario: {
    condition: string;
    currencyImpact: string;
    marketBehavior: string;
    samplePairs: string;
  };
  bearishScenario: {
    condition: string;
    currencyImpact: string;
    marketBehavior: string;
    samplePairs: string;
  };
  previousComparisonText: string;
}

export const parseNumericVal = (valStr?: string): number | null => {
  if (!valStr || valStr === '—' || valStr === 'N/A') return null;
  const cleaned = valStr.replace(/[%kKMmBb+,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

export const getMarketReactionGuide = (ev: EconomicEvent): MarketReactionGuide => {
  const titleLower = (ev.title || '').toLowerCase();
  const curr = ev.currency || 'USD';

  // Determine if higher value is generally bullish for the currency
  let higherIsBetter = true;
  if (
    titleLower.includes('unemployment') ||
    titleLower.includes('jobless') ||
    titleLower.includes('claimant count')
  ) {
    higherIsBetter = false;
  }

  const actualNum = parseNumericVal(ev.actual);
  const forecastNum = parseNumericVal(ev.forecast);
  const prevNum = parseNumericVal(ev.previous);

  let actualVsForecastBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UPCOMING' = 'UPCOMING';
  let actualVsPreviousTrend: 'IMPROVING' | 'DETERIORATING' | 'NEUTRAL' | 'UPCOMING' = 'UPCOMING';

  if (actualNum !== null && forecastNum !== null) {
    if (actualNum > forecastNum) {
      actualVsForecastBias = higherIsBetter ? 'BULLISH' : 'BEARISH';
    } else if (actualNum < forecastNum) {
      actualVsForecastBias = higherIsBetter ? 'BEARISH' : 'BULLISH';
    } else {
      actualVsForecastBias = 'NEUTRAL';
    }
  } else if (actualNum !== null && prevNum !== null) {
    if (actualNum > prevNum) {
      actualVsForecastBias = higherIsBetter ? 'BULLISH' : 'BEARISH';
    } else if (actualNum < prevNum) {
      actualVsForecastBias = higherIsBetter ? 'BEARISH' : 'BULLISH';
    } else {
      actualVsForecastBias = 'NEUTRAL';
    }
  }

  if (actualNum !== null && prevNum !== null) {
    if (actualNum > prevNum) {
      actualVsPreviousTrend = higherIsBetter ? 'IMPROVING' : 'DETERIORATING';
    } else if (actualNum < prevNum) {
      actualVsPreviousTrend = higherIsBetter ? 'DETERIORATING' : 'IMPROVING';
    } else {
      actualVsPreviousTrend = 'NEUTRAL';
    }
  }

  // Summary badge configuration
  let summaryBadge = {
    label: `💡 PANDUAN: Sebenar > Jangkaan = Bullish ${curr} • Sebenar < Jangkaan = Bearish ${curr}`,
    subLabel: `Sebenar > Jangkaan = Bullish ${curr} | Sebenar < Jangkaan = Bearish ${curr}`,
    bgClass: 'bg-slate-900/90',
    textClass: 'text-slate-300',
    borderClass: 'border-slate-800',
    icon: 'PENDING' as const
  };

  if (actualVsForecastBias === 'BULLISH') {
    summaryBadge = {
      label: `🟢 KESAN HARGA: BULLISH ${curr} (KUKUH)`,
      subLabel: `Sebenar (${ev.actual}) ${higherIsBetter ? '>' : '<'} Jangkaan (${ev.forecast || ev.previous}) • Pasaran cenderung BUY ${curr}`,
      bgClass: 'bg-emerald-950/80',
      textClass: 'text-emerald-300',
      borderClass: 'border-emerald-500/40',
      icon: 'UP'
    };
  } else if (actualVsForecastBias === 'BEARISH') {
    summaryBadge = {
      label: `🔴 KESAN HARGA: BEARISH ${curr} (LEMAH)`,
      subLabel: `Sebenar (${ev.actual}) ${higherIsBetter ? '<' : '>'} Jangkaan (${ev.forecast || ev.previous}) • Pasaran cenderung SELL ${curr}`,
      bgClass: 'bg-rose-950/80',
      textClass: 'text-rose-300',
      borderClass: 'border-rose-500/40',
      icon: 'DOWN'
    };
  } else if (actualVsForecastBias === 'NEUTRAL') {
    summaryBadge = {
      label: `⚪ KESAN HARGA: NEUTRAL / SEJAJAR JANGKAAN`,
      subLabel: `Sebenar (${ev.actual}) sepadan dengan Jangkaan • Impak pasaran sederhana`,
      bgClass: 'bg-slate-900',
      textClass: 'text-slate-300',
      borderClass: 'border-slate-700',
      icon: 'NEUTRAL'
    };
  }

  // Scenario 1: Better than expected (Bullish for currency)
  const bullishScenario = {
    condition: `Jika Sebenar ${higherIsBetter ? '>' : '<'} Jangkaan (${ev.forecast || 'Konsensus'})`,
    currencyImpact: `MENGUKUHKAN ${curr} (BULLISH)`,
    marketBehavior: higherIsBetter
      ? `Bacaan ${ev.title} mencatat angka lebih tinggi daripada unjuran, mencerminkan aktiviti ekonomi yang cergas dan meningkatkan tarikan pelaburan terhadap ${curr}.`
      : `Kadar bacaan ${ev.title} jatuh lebih rendah daripada unjuran, menandakan pasaran buruh/ekonomi yang lebih kukuh daripada dijangkakan.`,
    samplePairs: curr === 'USD'
      ? `EUR/USD ⬇️ TURUN, GBP/USD ⬇️ TURUN, USD/JPY ⬆️ NAIK, XAU/USD (Emas) ⬇️ TURUN`
      : curr === 'EUR'
      ? `EUR/USD ⬆️ NAIK, EUR/JPY ⬆️ NAIK, EUR/GBP ⬆️ NAIK`
      : curr === 'GBP'
      ? `GBP/USD ⬆️ NAIK, GBP/JPY ⬆️ NAIK, EUR/GBP ⬇️ TURUN`
      : curr === 'JPY'
      ? `USD/JPY ⬇️ TURUN, GBP/JPY ⬇️ TURUN, EUR/JPY ⬇️ TURUN`
      : curr === 'AUD'
      ? `AUD/USD ⬆️ NAIK, AUD/JPY ⬆️ NAIK, EUR/AUD ⬇️ TURUN`
      : `${curr}/USD ⬆️ NAIK, EUR/${curr} ⬇️ TURUN`
  };

  // Scenario 2: Worse than expected (Bearish for currency)
  const bearishScenario = {
    condition: `Jika Sebenar ${higherIsBetter ? '<' : '>'} Jangkaan (${ev.forecast || 'Konsensus'})`,
    currencyImpact: `MELEMAHKAN ${curr} (BEARISH)`,
    marketBehavior: higherIsBetter
      ? `Bacaan ${ev.title} tersasar di bawah jangkaan, mencetuskan kebimbangan kelembapan ekonomi dan tekanan jualan terhadap ${curr}.`
      : `Kadar bacaan ${ev.title} melonjak melebihi unjuran, mencerminkan kelemahan ekonomi dan risiko pengurangan aktiviti pasaran.`,
    samplePairs: curr === 'USD'
      ? `EUR/USD ⬆️ NAIK, GBP/USD ⬆️ NAIK, USD/JPY ⬇️ TURUN, XAU/USD (Emas) ⬆️ NAIK`
      : curr === 'EUR'
      ? `EUR/USD ⬇️ TURUN, EUR/JPY ⬇️ TURUN, EUR/GBP ⬇️ TURUN`
      : curr === 'GBP'
      ? `GBP/USD ⬇️ TURUN, GBP/JPY ⬇️ TURUN, EUR/GBP ⬆️ NAIK`
      : curr === 'JPY'
      ? `USD/JPY ⬆️ NAIK, GBP/JPY ⬆️ NAIK, EUR/JPY ⬆️ NAIK`
      : curr === 'AUD'
      ? `AUD/USD ⬇️ TURUN, AUD/JPY ⬇️ TURUN, EUR/AUD ⬆️ NAIK`
      : `${curr}/USD ⬇️ TURUN, EUR/${curr} ⬆️ NAIK`
  };

  // Previous comparison note
  let previousComparisonText = 'Tiada data sebelum untuk perbandingan.';
  if (prevNum !== null) {
    if (actualNum !== null) {
      if (actualNum > prevNum) {
        previousComparisonText = `Sebenar (${ev.actual}) lebih tinggi berbanding Sebelum (${ev.previous}) — Momentum makro menunjukkan arah ${higherIsBetter ? 'PENGEMBANGAN (Expansion)' : 'PENINGKATAN RISIKO'}.`;
      } else if (actualNum < prevNum) {
        previousComparisonText = `Sebenar (${ev.actual}) lebih rendah berbanding Sebelum (${ev.previous}) — Momentum makro menunjukkan arah ${higherIsBetter ? 'PENGUNCUPAN (Contraction)' : 'PEMULIHAN'}.`;
      } else {
        previousComparisonText = `Sebenar (${ev.actual}) tidak berubah berbanding Sebelum (${ev.previous}) — Trend mendatar (flat).`;
      }
    } else {
      previousComparisonText = `Nilai sebelumnya adalah ${ev.previous}. Jika data sebenar melebihi ${ev.previous}, ia menandakan momentum ${higherIsBetter ? 'positif' : 'negatif'} bagi ${curr}.`;
    }
  }

  return {
    higherIsBetter,
    actualVsForecastBias,
    actualVsPreviousTrend,
    summaryBadge,
    bullishScenario,
    bearishScenario,
    previousComparisonText
  };
};

export const EconomicCalendarWidget: React.FC<EconomicCalendarWidgetProps> = ({
  events = [],
  language = 'ms',
  onRefresh
}) => {
  const t = translations[language] || translations.ms;
  
  // State management
  const [viewMode, setViewMode] = useState<'INSTITUTIONAL_TABLE' | 'TRADINGVIEW_STREAM'>('INSTITUTIONAL_TABLE');
  const [dateFilter, setDateFilter] = useState<DateFilter>('THIS_WEEK');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTimezone, setSelectedTimezone] = useState<Timezone>('UTC+8');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Time formatting helper based on selected timezone
  const formatTimezone = (timestamp: number) => {
    const d = new Date(timestamp);
    let offsetHours = 8; // default UTC+8
    if (selectedTimezone === 'UTC') offsetHours = 0;
    if (selectedTimezone === 'EST') offsetHours = -5;

    const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
    const targetDate = new Date(utcTime + (3600000 * offsetHours));

    const hours = String(targetDate.getHours()).padStart(2, '0');
    const minutes = String(targetDate.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} ${selectedTimezone}`;
  };

  // Group events and filter
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Date filter
      if (dateFilter === 'TODAY' && ev.date !== todayStr) return false;
      if (dateFilter === 'TOMORROW' && ev.date !== tomorrowStr) return false;

      // Currency filter
      if (currencyFilter !== 'ALL' && ev.currency !== currencyFilter) return false;

      // Impact filter
      if (impactFilter === 'HIGH' && ev.impact !== 'HIGH') return false;
      if (impactFilter === 'MEDIUM' && ev.impact !== 'MEDIUM') return false;
      if (impactFilter === 'LOW' && ev.impact !== 'LOW') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ev.title.toLowerCase().includes(q);
        const matchCurr = ev.currency.toLowerCase().includes(q);
        const matchCountry = ev.country?.toLowerCase().includes(q) || false;
        const matchCategory = ev.category?.toLowerCase().includes(q) || false;
        return matchTitle || matchCurr || matchCountry || matchCategory;
      }

      return true;
    });
  }, [events, dateFilter, currencyFilter, impactFilter, searchQuery, todayStr, tomorrowStr]);

  // Group filtered events by date
  const groupedByDate = useMemo(() => {
    const groups: { [date: string]: EconomicEvent[] } = {};
    filteredEvents.forEach((ev) => {
      const d = ev.date || 'TIDAK DITETAPKAN';
      if (!groups[d]) groups[d] = [];
      groups[d].push(ev);
    });
    return groups;
  }, [filteredEvents]);

  // Format date header to friendly institutional Malaysian/English format
  const formatDateHeader = (dateStr: string) => {
    if (dateStr === todayStr) return `HARI INI (${dateStr})`;
    if (dateStr === tomorrowStr) return `ESOK (${dateStr})`;

    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;

    const daysMalay = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
    const monthsMalay = [
      'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
      'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
    ];

    const dayName = daysMalay[d.getDay()];
    const dayNum = d.getDate();
    const monthName = monthsMalay[d.getMonth()];
    const year = d.getFullYear();

    return `${dayName.toUpperCase()}, ${dayNum} ${monthName.toUpperCase()} ${year}`;
  };

  // Metrics summary
  const totalHighImpact = events.filter((e) => e.impact === 'HIGH').length;
  const liveWindowEvents = events.filter((e) => e.status === 'LIVE_WINDOW');
  const nextUpcoming = events.find((e) => e.status === 'UPCOMING');

  const currencies = [
    { code: 'ALL', label: 'SEMUA', flag: '🌐' },
    { code: 'USD', label: 'USD', flag: '🇺🇸' },
    { code: 'EUR', label: 'EUR', flag: '🇪🇺' },
    { code: 'GBP', label: 'GBP', flag: '🇬🇧' },
    { code: 'JPY', label: 'JPY', flag: '🇯🇵' },
    { code: 'AUD', label: 'AUD', flag: '🇦🇺' },
    { code: 'CAD', label: 'CAD', flag: '🇨🇦' },
    { code: 'CHF', label: 'CHF', flag: '🇨🇭' },
    { code: 'CNY', label: 'CNY', flag: '🇨🇳' }
  ];

  return (
    <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-5 md:p-6 shadow-2xl space-y-6 font-sans">
      {/* 1. EXECUTIVE HEADER & REALTIME STATUS BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Calendar className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-black text-white tracking-wide">
                  {t.ecoCalendarTitle || 'KALENDAR BERITA EKONOMI & MAKRO REALTIME'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> INSTITUSI
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Jadual berita makroekonomi global disahkan dengan peraturan mitigasi risiko dan VETO automatik AI.
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Switcher + Live Indicator */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Dual Mode Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('INSTITUTIONAL_TABLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'INSTITUTIONAL_TABLE'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-950/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Jadual Institusi &amp; AI</span>
            </button>
            <button
              onClick={() => setViewMode('TRADINGVIEW_STREAM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'TRADINGVIEW_STREAM'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>TradingView Live Stream</span>
            </button>
          </div>

          {/* Timezone Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-300 gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value as Timezone)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer text-xs"
            >
              <option value="UTC+8" className="bg-slate-900">UTC+8 (KL/SG)</option>
              <option value="UTC" className="bg-slate-900">UTC (London)</option>
              <option value="EST" className="bg-slate-900">EST (New York)</option>
            </select>
          </div>

          {/* Live Status Badge */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              REALTIME LIVE FEED
            </span>
          </div>
        </div>
      </div>

      {/* 2. EXECUTIVE RISK & AI MACRO SHIELD SUMMARY BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
        {/* Metric 1: High Impact Events */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Acara Impak Tinggi (Minggu Ini)</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-rose-400">{totalHighImpact} Acara</span>
              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">HIGH RISK</span>
            </div>
          </div>
          <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
        </div>

        {/* Metric 2: AI Risk Guard Status */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Status Perlindungan Berita AI</span>
            <div className="flex items-center gap-2">
              {liveWindowEvents.length > 0 ? (
                <>
                  <span className="text-base font-black text-amber-400 animate-pulse">NEWS LOCK AKTIF</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">VETO (30m)</span>
                </>
              ) : (
                <>
                  <span className="text-base font-black text-emerald-400">PASARAN NORMAL</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">SL BUFFER 1.8x</span>
                </>
              )}
            </div>
          </div>
          <div className={`p-2 rounded-lg border ${liveWindowEvents.length > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
            <ShieldCheck className={`w-5 h-5 ${liveWindowEvents.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
          </div>
        </div>

        {/* Metric 3: Next Major Macro Release */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between shadow-sm">
          <div className="space-y-1 overflow-hidden pr-2">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Acara Utama Seterusnya</span>
            <div className="text-xs font-bold text-white truncate">
              {nextUpcoming ? `${nextUpcoming.currency}: ${nextUpcoming.title}` : 'Semua data telah dikeluarkan'}
            </div>
            {nextUpcoming && (
              <span className="text-[10px] text-amber-400">
                {formatTimezone(nextUpcoming.timestamp)}
              </span>
            )}
          </div>
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg shrink-0">
            <Clock className="w-5 h-5 text-indigo-400" />
          </div>
        </div>
      </div>

      {/* 3. VIEW MODE: TRADINGVIEW STREAM */}
      {viewMode === 'TRADINGVIEW_STREAM' && (
        <TradingViewEconomicCalendar height="680px" />
      )}

      {/* 4. VIEW MODE: INSTITUTIONAL TABLE & AI INTEGRATED */}
      {viewMode === 'INSTITUTIONAL_TABLE' && (
        <div className="space-y-4">
          {/* Controls: Date Range, Currency Filter, Impact Filter, Search */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800/80 p-3 rounded-xl">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cari acara (cth: CPI, NFP, GDP, FOMC, ECB)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Date Range Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 xl:pb-0 shrink-0">
              {[
                { id: 'THIS_WEEK', label: 'Minggu Ini' },
                { id: 'TODAY', label: 'Hari Ini' },
                { id: 'TOMORROW', label: 'Esok' },
                { id: 'ALL', label: 'Semua' }
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDateFilter(d.id as DateFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    dateFilter === d.id
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Impact Filter */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setImpactFilter(impactFilter === 'HIGH' ? 'ALL' : 'HIGH')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  impactFilter === 'HIGH'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3 text-rose-400" />
                <span>Impak Tinggi Sahaja</span>
              </button>
            </div>
          </div>

          {/* Currency Pills Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
            {currencies.map((curr) => (
              <button
                key={curr.code}
                onClick={() => setCurrencyFilter(curr.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  currencyFilter === curr.code
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border border-blue-400/30'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>{curr.flag}</span>
                <span>{curr.label}</span>
              </button>
            ))}
          </div>

          {/* Standard Financial Table Grid */}
          <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl overflow-hidden shadow-inner">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-sans">
                {/* Table Header */}
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3.5 w-36">Masa ({selectedTimezone})</th>
                    <th className="py-3 px-3 w-20">Mata Wang</th>
                    <th className="py-3 px-3 w-20 text-center">Impak</th>
                    <th className="py-3 px-4">Peristiwa Ekonomi Makro</th>
                    <th className="py-3 px-3 w-28 text-right">Sebenar</th>
                    <th className="py-3 px-3 w-24 text-right">Jangkaan</th>
                    <th className="py-3 px-3 w-24 text-right">Sebelum</th>
                    <th className="py-3 px-3.5 w-48 text-center">Adaptasi AI</th>
                    <th className="py-3 px-2 w-10"></th>
                  </tr>
                </thead>

                {/* Table Body Grouped by Date */}
                <tbody className="divide-y divide-slate-800/60">
                  {Object.keys(groupedByDate).length > 0 ? (
                    Object.entries(groupedByDate).map(([dateStr, dateEvents]) => (
                      <React.Fragment key={dateStr}>
                        {/* Sticky Date Header Divider */}
                        <tr className="bg-slate-950/90 border-y border-slate-800/90">
                          <td colSpan={9} className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-mono font-bold text-xs text-amber-300 tracking-wider">
                                📅 {formatDateHeader(dateStr)}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                ({dateEvents.length} Acara)
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Events in this date */}
                        {dateEvents.map((ev) => {
                          const isHigh = ev.impact === 'HIGH';
                          const isMed = ev.impact === 'MEDIUM';
                          const isExpanded = expandedEventId === ev.id;
                          const isLive = ev.status === 'LIVE_WINDOW';
                          const isReleased = ev.status === 'RELEASED';
                          const guide = getMarketReactionGuide(ev);

                          return (
                            <React.Fragment key={ev.id}>
                              <tr
                                onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                                className={`transition-colors cursor-pointer ${
                                  isLive
                                    ? 'bg-rose-950/30 hover:bg-rose-950/40 border-l-4 border-l-rose-500'
                                    : isExpanded
                                    ? 'bg-slate-800/60'
                                    : 'hover:bg-slate-800/40'
                                }`}
                              >
                                {/* Time & Status */}
                                <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-200">
                                      {formatTimezone(ev.timestamp)}
                                    </span>
                                  </div>
                                  {isLive ? (
                                    <span className="mt-0.5 inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500 text-white animate-pulse">
                                      🔥 LIVE NEWS
                                    </span>
                                  ) : isReleased ? (
                                    <span className="mt-0.5 inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                                      ✓ DIKELUARKAN
                                    </span>
                                  ) : (
                                    <span className="mt-0.5 inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      ⏳ DIJADUALKAN
                                    </span>
                                  )}
                                </td>

                                {/* Currency with Flag */}
                                <td className="py-3 px-3 font-mono font-bold whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <span>{ev.flag || '🌐'}</span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[11px] ${
                                        ev.currency === 'USD'
                                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                          : ev.currency === 'EUR'
                                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                          : ev.currency === 'GBP'
                                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                          : ev.currency === 'JPY'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      }`}
                                    >
                                      {ev.currency}
                                    </span>
                                  </div>
                                </td>

                                {/* Impact Indicator (3 bars institutional standard) */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-0.5" title={`${ev.impact} IMPACT`}>
                                    <span className={`w-1.5 h-3.5 rounded-xs ${isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-500' : 'bg-yellow-500'}`} />
                                    <span className={`w-1.5 h-3.5 rounded-xs ${isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-500' : 'bg-slate-700'}`} />
                                    <span className={`w-1.5 h-3.5 rounded-xs ${isHigh ? 'bg-rose-500' : 'bg-slate-700'}`} />
                                  </div>
                                </td>

                                {/* Event Title with Market Price Bias Badge */}
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-white text-xs hover:text-amber-300 transition">
                                    {ev.title}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {ev.category && (
                                      <span className="text-[10px] font-mono text-slate-400">
                                        Kategori: {ev.category.replace('_', ' ')}
                                      </span>
                                    )}
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${guide.summaryBadge.bgClass} ${guide.summaryBadge.textClass} ${guide.summaryBadge.borderClass}`}>
                                      {guide.summaryBadge.icon === 'UP' && <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />}
                                      {guide.summaryBadge.icon === 'DOWN' && <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />}
                                      {guide.summaryBadge.icon === 'PENDING' && <Lightbulb className="w-3 h-3 text-amber-400 shrink-0" />}
                                      <span>{guide.summaryBadge.label}</span>
                                    </span>
                                  </div>
                                </td>

                                {/* Actual Value */}
                                <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                                  {ev.actual ? (
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-xs ${
                                        guide.actualVsForecastBias === 'BULLISH'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                          : guide.actualVsForecastBias === 'BEARISH'
                                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                                          : 'text-slate-200'
                                      }`}
                                    >
                                      {ev.actual}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 text-[11px]">—</span>
                                  )}
                                </td>

                                {/* Forecast Value */}
                                <td className="py-3 px-3 text-right font-mono text-slate-300 whitespace-nowrap text-xs">
                                  {ev.forecast || 'N/A'}
                                </td>

                                {/* Previous Value */}
                                <td className="py-3 px-3 text-right font-mono text-slate-400 whitespace-nowrap text-xs">
                                  {ev.previous || 'N/A'}
                                </td>

                                {/* AI Risk Adaptation Chip */}
                                <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                  {isHigh ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                      <Cpu className="w-3 h-3 text-indigo-400" />
                                      <span>{isLive ? 'VETO LOCK 30M' : 'SL BUFFER 1.8x'}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/60">
                                      <span>NORMAL</span>
                                    </span>
                                  )}
                                </td>

                                {/* Expand Toggle Chevron */}
                                <td className="py-3 px-2 text-center text-slate-400">
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-amber-400" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </td>
                              </tr>

                              {/* Expanded Row Drawer with Market Price Reaction Dynamics */}
                              {isExpanded && (
                                <tr className="bg-slate-900/90 border-b border-slate-800">
                                  <td colSpan={9} className="p-4 space-y-4">
                                    {/* Market Reaction Guidance Header */}
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                      <div className="flex items-center gap-2 text-xs font-black text-amber-300 uppercase tracking-wider">
                                        <Compass className="w-4 h-4 text-amber-400" />
                                        <span>Panduan Reaksi Harga &amp; Dinamik Pasaran (What You Should Know for Market Price)</span>
                                      </div>
                                      <span className="text-[11px] font-mono text-slate-400">
                                        Mata Wang Asas: <strong className="text-white">{ev.currency}</strong>
                                      </span>
                                    </div>

                                    {/* 3-Card Scenario Matrix */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-sans">
                                      {/* 1. Bullish Scenario */}
                                      <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                            <ArrowUpRight className="w-4 h-4" />
                                            <span>{guide.bullishScenario.condition}</span>
                                          </div>
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                            BULLISH {ev.currency}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300 leading-relaxed">
                                          {guide.bullishScenario.marketBehavior}
                                        </p>
                                        <div className="pt-1 border-t border-emerald-500/20">
                                          <div className="text-[10px] font-bold text-emerald-400/90 uppercase tracking-wider">Kesan Pasangan Forex:</div>
                                          <div className="text-[11px] font-mono text-emerald-200 mt-0.5">
                                            {guide.bullishScenario.samplePairs}
                                          </div>
                                        </div>
                                      </div>

                                      {/* 2. Bearish Scenario */}
                                      <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                                            <ArrowDownRight className="w-4 h-4" />
                                            <span>{guide.bearishScenario.condition}</span>
                                          </div>
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                            BEARISH {ev.currency}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300 leading-relaxed">
                                          {guide.bearishScenario.marketBehavior}
                                        </p>
                                        <div className="pt-1 border-t border-rose-500/20">
                                          <div className="text-[10px] font-bold text-rose-400/90 uppercase tracking-wider">Kesan Pasangan Forex:</div>
                                          <div className="text-[11px] font-mono text-rose-200 mt-0.5">
                                            {guide.bearishScenario.samplePairs}
                                          </div>
                                        </div>
                                      </div>

                                      {/* 3. Historical Momentum vs Previous */}
                                      <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                                            <TrendingUp className="w-4 h-4" />
                                            <span>Sebenar vs Sebelum ({ev.previous || 'N/A'})</span>
                                          </div>
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                            guide.actualVsPreviousTrend === 'IMPROVING'
                                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                              : guide.actualVsPreviousTrend === 'DETERIORATING'
                                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                              : 'bg-slate-800 text-slate-300'
                                          }`}>
                                            {guide.actualVsPreviousTrend === 'IMPROVING' ? 'MOMENTUM POSITIF' : guide.actualVsPreviousTrend === 'DETERIORATING' ? 'MOMENTUM NEGATIF' : 'STABIL'}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300 leading-relaxed">
                                          {guide.previousComparisonText}
                                        </p>
                                        <div className="pt-1 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                                          Perbandingan ini menilai sama ada trend ekonomi sedang memecut (*accelerating*) atau mengendur (*slowing down*).
                                        </div>
                                      </div>
                                    </div>

                                    {/* SMC Protocol & Affected Pairs Bottom Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-sans">
                                      {/* AI Adaptation Rule */}
                                      <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 space-y-1.5">
                                        <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold">
                                          <Cpu className="w-4 h-4 text-indigo-400" />
                                          <span>Protokol Mitigasi AI Smart Money Concepts (SMC)</span>
                                        </div>
                                        <p className="text-xs text-indigo-100 font-mono">
                                          {ev.aiImpactRule || 'Tiada sekatan khusus. Sistem menapis volatiliti pada rangka masa M15.'}
                                        </p>
                                        {ev.aiDetailedBreakdown && (
                                          <p className="text-[11px] text-indigo-300/80 mt-1">
                                            {ev.aiDetailedBreakdown}
                                          </p>
                                        )}
                                      </div>

                                      {/* Affected Pairs & Historical Volatility */}
                                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-2 text-white text-xs font-bold">
                                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                                          <span>Pasangan Mata Wang Terjejas</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {(ev.affectedPairs || [`${ev.currency}/USD`, `${ev.currency}/JPY`]).map((p) => (
                                            <span
                                              key={p}
                                              className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-amber-300 font-bold"
                                            >
                                              {p}
                                            </span>
                                          ))}
                                        </div>
                                        {ev.warningText && (
                                          <div className="text-[11px] text-slate-400 flex items-start gap-1.5 mt-1">
                                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                            <span>{ev.warningText}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 font-mono text-xs">
                        Tiada acara berita ekonomi memenuhi kriteria carian/penapis semasa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
