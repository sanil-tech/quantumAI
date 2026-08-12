import React, { useState } from 'react';
import { EconomicEvent } from '../types';
import { Calendar, Clock, ShieldAlert, Cpu, Filter, Search, CheckCircle, Zap } from 'lucide-react';
import { Language, translations } from '../lib/translations';
import { formatEventLocalTime, useCountdown } from '../lib/timeUtils';

interface EconomicCalendarWidgetProps {
  events: EconomicEvent[];
  language?: Language;
}

const EventCountdownRow: React.FC<{ event: EconomicEvent; language: Language }> = ({ event, language }) => {
  const cd = useCountdown(event.timestamp, event.time);
  const localTime = formatEventLocalTime(event.timestamp, event.time);

  let countdownText = '';
  if (cd.isPast || event.status === 'RELEASED') {
    countdownText = `DIKELUARKAN (${cd.formatted})`;
  } else if (event.status === 'LIVE_WINDOW' || cd.totalSeconds <= 3600) {
    countdownText = `🔥 LIVE NEWS (~${Math.max(1, Math.round(cd.totalSeconds / 60))}m)`;
  } else {
    countdownText = `⏱️ ${cd.formatted}`;
  }

  const isHigh = event.impact === 'HIGH';

  return (
    <div
      className={`p-4 rounded-xl border transition space-y-3 ${
        event.status === 'LIVE_WINDOW'
          ? 'bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-900/20 animate-pulse'
          : isHigh
          ? 'bg-slate-900/90 border-amber-500/30 hover:border-amber-500/50'
          : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top Bar: Badges & Time */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Badge */}
          {event.date && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {event.date}
            </span>
          )}

          {/* Currency Badge */}
          <span
            className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
              event.currency === 'USD'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : event.currency === 'EUR'
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : event.currency === 'GBP'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : event.currency === 'JPY'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}
          >
            {event.currency}
          </span>

          {/* Impact Badge */}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
              isHigh
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isHigh && <Zap className="w-3 h-3 text-rose-400" />}
            {event.impact} IMPACT
          </span>

          <h4 className="font-semibold text-white text-xs sm:text-sm">{event.title}</h4>
        </div>

        {/* Countdown & Local Time */}
        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> {localTime}
          </span>
          <span
            className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
              cd.isPast || event.status === 'RELEASED'
                ? 'bg-slate-800/80 text-emerald-400 border-slate-700 flex items-center gap-1'
                : event.status === 'LIVE_WINDOW' || cd.totalSeconds <= 3600
                ? 'bg-rose-500/30 text-rose-200 border-rose-500/60 animate-bounce'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {cd.isPast && <CheckCircle className="w-3 h-3 text-emerald-400 inline" />}
            {countdownText}
          </span>
        </div>
      </div>

      {/* Forecast / Previous / Actual Data Grid */}
      <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60 text-xs font-mono">
        <div>
          <span className="text-slate-400 text-[10px] block uppercase">Jangkaan (Forecast)</span>
          <span className="text-slate-200 font-bold">{event.forecast || 'N/A'}</span>
        </div>
        <div>
          <span className="text-slate-400 text-[10px] block uppercase">Sebelum (Previous)</span>
          <span className="text-slate-200 font-bold">{event.previous || 'N/A'}</span>
        </div>
        <div>
          <span className="text-slate-400 text-[10px] block uppercase">Sebenar (Actual)</span>
          <span className={`font-bold ${event.actual ? 'text-emerald-400' : 'text-slate-400'}`}>
            {event.actual || (cd.isPast ? event.forecast : 'Pending...')}
          </span>
        </div>
      </div>

      {/* AI Economic Adaptive Rule Box */}
      {event.aiImpactRule && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-lg p-2.5 text-[11px] text-indigo-200 flex items-start gap-2">
          <Cpu className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-indigo-300 block mb-0.5">Adaptasi Pembelajaran AI:</span>
            <span>{event.aiImpactRule}</span>
          </div>
        </div>
      )}

      {/* High Impact Alert Warning */}
      {event.warningText && event.warningText !== event.aiImpactRule && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5 text-[11px] text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{event.warningText}</span>
        </div>
      )}
    </div>
  );
};

export const EconomicCalendarWidget: React.FC<EconomicCalendarWidgetProps> = ({ events, language = 'ms' }) => {
  const t = translations[language] || translations.ms;
  const [filterCurrency, setFilterCurrency] = useState<string>('ALL');
  const [filterImpact, setFilterImpact] = useState<'ALL' | 'HIGH'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredEvents = events.filter(ev => {
    if (filterImpact === 'HIGH' && ev.impact !== 'HIGH') return false;
    if (filterCurrency !== 'ALL' && ev.currency !== filterCurrency) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return ev.title.toLowerCase().includes(q) || ev.currency.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Calendar className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t.ecoCalendarTitle}</h3>
            <p className="text-[11px] text-slate-400">Jadual Acara Berita Makro Ekonomi Sahih & Adaptasi AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            {t.liveFeed}
          </span>
        </div>
      </div>

      {/* AI Learning Engine Banner */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-amber-950/40 border border-indigo-500/30 rounded-xl p-3 text-xs text-slate-300 flex items-center gap-3">
        <div className="p-2 bg-indigo-500/20 rounded-lg shrink-0 border border-indigo-500/40">
          <Cpu className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">Pembelajaran Adaptif AI Terhadap Berita Ekonomi</span>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono px-1.5 py-0.5 rounded">AKTIF</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Model AI secara automatik menyerap peristiwa berita di atas. AI meluaskan zon Stop Loss (SL Buffer 1.5x - 2.2x ATR) dan mengaktifkan kunci kunci berita (News Lock 30m) untuk mengelakkan slippage.
          </p>
        </div>
      </div>

      {/* Controls: Search & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari peristiwa berita..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Currency & Impact Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
          <button
            onClick={() => setFilterImpact(filterImpact === 'ALL' ? 'HIGH' : 'ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${
              filterImpact === 'HIGH'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <Filter className="w-3 h-3" />
            {filterImpact === 'HIGH' ? 'Impak Tinggi Sahaja' : 'Semua Impak'}
          </button>

          {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'].map((curr) => (
            <button
              key={curr}
              onClick={() => setFilterCurrency(curr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                filterCurrency === curr
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-1">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((ev) => (
            <EventCountdownRow key={ev.id} event={ev} language={language} />
          ))
        ) : (
          <div className="text-center py-8 text-slate-400 text-xs font-mono bg-slate-950/50 rounded-xl border border-slate-800/60 p-4">
            Tiada acara berita ekonomi memenuhi kriteria carian.
          </div>
        )}
      </div>
    </div>
  );
};


