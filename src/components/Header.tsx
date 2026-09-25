import React, { useState, useEffect } from 'react';
import { CurrencyPair, TradingStyle, EconomicEvent } from '../types';
import { TrendingUp, AlertTriangle, Calculator, BookOpen, History, MessageSquare, ShieldCheck, Bell, Globe, Brain, User, Building2, Wifi, DollarSign, Activity } from 'lucide-react';
import { Language, translations } from '../lib/translations';
import { formatEventLocalTime, useCountdown } from '../lib/timeUtils';

const HeaderNewsBanner: React.FC<{ news: EconomicEvent; macroAlertLabel: string }> = ({ news, macroAlertLabel }) => {
  const cd = useCountdown(news.timestamp, news.time);
  const localTime = formatEventLocalTime(news.timestamp, news.time);

  let timerBadge = '';
  if (cd.isPast) {
    timerBadge = `RELEASED (${cd.formatted})`;
  } else {
    timerBadge = `⏱️ ${cd.formatted}`;
  }

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 mt-2 overflow-hidden">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs text-amber-300 shadow-sm gap-2">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="font-semibold text-amber-200 whitespace-nowrap shrink-0">{macroAlertLabel}</span>
          <span className="truncate">{news.title} ({news.currency}) - {news.warningText || 'Volatility risk anticipated.'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
          <span className="text-amber-400/80 hidden md:inline whitespace-nowrap">{localTime}</span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
              cd.isPast
                ? 'bg-slate-800 text-slate-400 border-slate-700'
                : cd.totalSeconds <= 1800
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {timerBadge}
          </span>
        </div>
      </div>
    </div>
  );
};


interface HeaderProps {
  activePair: CurrencyPair;
  setActivePair: (pair: CurrencyPair) => void;
  tradingStyle: TradingStyle;
  setTradingStyle: (style: TradingStyle) => void;
  currentPrice: number;
  priceChange24h: number;
  upcomingNews?: EconomicEvent;
  onOpenRiskCalc: () => void;
  onOpenChat: () => void;
  onOpenBacktest: () => void;
  onOpenJournal: () => void;
  onOpenAdaptiveLearning?: () => void;
  onOpenPriceAlarm: () => void;
  onOpenTraderAccount?: () => void;
  onOpenBrokerConnection?: () => void;
  activeAlarmsCount: number;
  language: Language;
  setLanguage: (lang: Language) => void;
}


const PAIRS: CurrencyPair[] = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/JPY', 'AUD/USD', 'XAU/USD', 'NASDAQ', 'BTC/USD'];

const STYLES: { id: TradingStyle; label: string; desc: string }[] = [
  { id: 'SCALPER', label: 'Scalper', desc: 'M1-M15 Fast Moves' },
  { id: 'DAY_TRADER', label: 'Day Trader', desc: 'M15-H4 Intraday' },
  { id: 'SWING_TRADER', label: 'Swing', desc: 'H4-Daily Waves' },
  { id: 'POSITION_TRADER', label: 'Position', desc: 'Weekly Macro' },
];

export const Header: React.FC<HeaderProps> = ({
  activePair,
  setActivePair,
  tradingStyle,
  setTradingStyle,
  currentPrice,
  priceChange24h,
  upcomingNews,
  onOpenRiskCalc,
  onOpenChat,
  onOpenBacktest,
  onOpenJournal,
  onOpenAdaptiveLearning,
  onOpenPriceAlarm,
  onOpenTraderAccount,
  onOpenBrokerConnection,
  activeAlarmsCount,
  language,
  setLanguage,
}) => {

  const [brokerInfo, setBrokerInfo] = useState<{
    balance: number;
    equity: number;
    connected: boolean;
    accountNumber: string;
    environment: string;
  }>(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const acc = urlParams.get('account') || (typeof localStorage !== 'undefined' ? localStorage.getItem('vip_account_id') : null) || '';
    return {
      balance: 0,
      equity: 0,
      connected: false,
      accountNumber: acc,
      environment: 'DEMO'
    };
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const acc = urlParams.get('account') || localStorage.getItem('vip_account_id') || '';
      const endpoint = acc ? `/api/broker/status?accountId=${acc}` : '/api/broker/status';
      fetch(endpoint)
        .then(r => r.json())
        .then(d => {
          if (isMounted && d) {
            setBrokerInfo({
              balance: Number(d.liveBalance ?? d.balance ?? 0),
              equity: Number(d.liveEquity ?? d.equity ?? d.balance ?? 0),
              connected: Boolean(d.connected ?? true),
              accountNumber: String(d.accountNumber || acc),
              environment: String(d.environment || 'DEMO')
            });
          }
        })
        .catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const isPositive = priceChange24h >= 0;
  const t = translations[language] || translations.ms;

  return (
    <>
      <header className="min-h-[4rem] py-2.5 border-b border-white/[0.08] bg-[#0B0F19]/95 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-50 backdrop-blur-2xl max-w-full shadow-xl shadow-black/50 transition-all">
        {/* Left: Brand & Instrument Selector */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center font-black text-white text-sm tracking-wider shadow-lg shadow-cyan-500/25 shrink-0 border border-white/20 ring-1 ring-cyan-500/40">
              Q
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tight text-base sm:text-lg text-white whitespace-nowrap">
                QUANTUM<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 font-black">AI</span>
              </span>
              <span className="px-2 py-0.5 bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 border border-cyan-500/40 text-[9px] font-mono text-cyan-300 rounded-full font-bold uppercase tracking-wider hidden sm:inline-block shadow-sm">
                VIP DESK
              </span>
            </div>
          </div>

          {/* Prominent cTrader FIX API Broker Button */}
          {onOpenBrokerConnection && (
            <button
              id="header-left-ctrader-btn"
              onClick={onOpenBrokerConnection}
              className="px-2.5 sm:px-3.5 py-1.5 bg-gradient-to-r from-emerald-950/90 via-teal-950/90 to-emerald-900/90 hover:from-emerald-900 hover:to-teal-800 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all duration-200 shadow-md shadow-emerald-950/60 ring-1 ring-emerald-500/30 cursor-pointer shrink-0 group active:scale-95"
              title={language === 'ms' ? 'Sambungkan Akaun cTrader FIX API / MT4 / MT5' : 'Connect cTrader FIX API / MT4 / MT5 Account'}
            >
              <div className="relative flex items-center justify-center">
                <Wifi className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
              </div>
              <span className="whitespace-nowrap font-mono tracking-tight text-emerald-200 font-semibold text-[11px] sm:text-xs">
                {brokerInfo.connected ? 'cTrader Live' : 'Sambung Broker'}
              </span>
            </button>
          )}

          {/* Live Broker Capital & Balance Display Pill */}
          <div 
            onClick={onOpenBrokerConnection}
            className="hidden md:flex items-center gap-3 bg-slate-900/80 hover:bg-slate-900 border border-white/[0.08] hover:border-emerald-500/40 px-3.5 py-1.5 rounded-xl font-mono text-xs shadow-inner cursor-pointer transition-all shrink-0 backdrop-blur-md"
            title="Klik untuk lihat butiran akaun broker"
          >
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                BAKI
              </span>
              <span className="font-extrabold text-emerald-400 text-xs sm:text-sm leading-tight">
                ${brokerInfo.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="h-5 w-[1px] bg-slate-800" />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                EKUITI
              </span>
              <span className="font-extrabold text-cyan-300 text-xs sm:text-sm leading-tight">
                ${brokerInfo.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Pair Select Dropdown for Mobile, Tablet & Medium screens (< 2xl) */}
          <div className="flex items-center gap-1.5 2xl:hidden">
            <select
              id="header-pair-mobile-select"
              value={activePair}
              onChange={(e) => setActivePair(e.target.value as CurrencyPair)}
              className="bg-slate-900/90 hover:bg-slate-800 border border-white/[0.12] text-white text-xs rounded-xl px-2.5 py-1.5 font-mono font-bold cursor-pointer outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition shadow-sm"
              title={t.pairSelect}
            >
              {PAIRS.map((p) => (
                <option key={p} value={p} className="bg-slate-950 text-white">
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Live Price & Metrics (Visible on lg+) */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-mono border-l border-slate-800 pl-4 shrink-0">
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">{t.lastPrice}</span>
              <span className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentPrice.toFixed(activePair === 'USD/JPY' ? 3 : activePair.includes('USD') && !activePair.startsWith('BTC') && !activePair.startsWith('XAU') ? 5 : 2)}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">{t.change24h}</span>
              <span className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Full Pair Pills Bar (Only on Ultra-wide 2xl screens) */}
          <div className="hidden 2xl:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl text-xs font-medium border border-white/[0.08]">
            {PAIRS.map((pair) => (
              <button
                key={pair}
                id={`pair-btn-${pair.replace('/', '-')}`}
                onClick={() => setActivePair(pair)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all font-mono font-bold ${
                  activePair === pair
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-950/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {pair}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Trading Style & Action Tools Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Trading Style Selector */}
          <div className="xl:hidden">
            <select
              id="header-trading-style-select"
              value={tradingStyle}
              onChange={(e) => setTradingStyle(e.target.value as TradingStyle)}
              className="bg-slate-900 border border-white/[0.12] text-slate-200 text-xs rounded-xl px-2.5 py-1.5 font-semibold cursor-pointer outline-none focus:border-cyan-500 transition shadow-sm"
              title="Trading Style"
            >
              {STYLES.map((st) => (
                <option key={st.id} value={st.id} className="bg-slate-950 text-white">
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden xl:flex bg-slate-900/80 p-1 rounded-xl text-xs font-medium border border-white/[0.08] shrink-0">
            {STYLES.map((st) => (
              <button
                key={st.id}
                id={`style-btn-${st.id}`}
                onClick={() => setTradingStyle(st.id)}
                title={st.desc}
                className={`px-3 py-1 rounded-lg transition-all font-semibold whitespace-nowrap ${
                  tradingStyle === st.id
                    ? 'bg-slate-800 text-cyan-300 shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Action Tools & Language Selector */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Language Selector Dropdown */}
            <div className="relative flex items-center bg-slate-900/90 border border-white/[0.1] text-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold hover:border-cyan-500/50 transition shadow-sm shrink-0">
              <Globe className="w-3.5 h-3.5 text-cyan-400 mr-1 shrink-0" />
              <select
                id="header-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-transparent text-white font-bold cursor-pointer outline-none focus:outline-none pr-0 text-xs"
                title={t.languageSelect}
              >
                <option value="ms" className="bg-slate-950 text-white">🇲🇾 BM</option>
                <option value="en" className="bg-slate-950 text-white">🇬🇧 EN</option>
                <option value="id" className="bg-slate-950 text-white">🇮🇩 ID</option>
              </select>
            </div>

            {/* Base44 Weekly Adaptive Learning & Review Button */}
            {onOpenAdaptiveLearning && (
              <button
                id="header-ai-learning-btn"
                onClick={onOpenAdaptiveLearning}
                className="px-3 py-1.5 bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 hover:from-cyan-900 hover:to-indigo-900 border border-cyan-400/60 hover:border-cyan-300 text-cyan-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 shadow-md shadow-cyan-950/70 shrink-0 group relative cursor-pointer active:scale-95"
                title={language === 'ms' ? 'Enjin Pembelajaran Adaptif AI & Ulangkaji Mingguan Base44' : 'AI Adaptive Learning & Base44 Weekly Review'}
              >
                <Brain className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition animate-pulse" />
                <span className="hidden sm:inline font-mono tracking-tight text-cyan-100">
                  {language === 'ms' ? '📚 AI Review' : '📚 AI Review'}
                </span>
              </button>
            )}

            {/* AI Chat / Pakar Trader Button */}
            <button
              id="header-ai-chat-btn"
              onClick={onOpenChat}
              className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/50 hover:to-purple-600/50 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm shrink-0 active:scale-95"
              title="Tanya Pakar Trader Forex AI Quantum"
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline whitespace-nowrap">🤖 Pakar AI</span>
            </button>

            {/* Price Alarm Button */}
            <button
              id="header-price-alarm-btn"
              onClick={onOpenPriceAlarm}
              className="p-2 sm:px-2.5 sm:py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-white/[0.1] text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm relative shrink-0 active:scale-95"
              title={t.priceAlarmTitle}
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              {activeAlarmsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold flex items-center justify-center -ml-0.5">
                  {activeAlarmsCount}
                </span>
              )}
            </button>

            {/* Risk Calculator Button */}
            <button
              id="header-risk-calc-btn"
              onClick={onOpenRiskCalc}
              className="p-2 sm:px-2.5 sm:py-1.5 bg-slate-900/90 hover:bg-slate-800 border border-white/[0.1] text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0 active:scale-95"
              title={t.riskCalcTitle}
            >
              <Calculator className="w-3.5 h-3.5 text-cyan-400" />
            </button>
          </div>
        </div>
      </header>

      {/* High Impact News Ticker Banner */}
      {upcomingNews && <HeaderNewsBanner news={upcomingNews} macroAlertLabel={t.macroAlert} />}
    </>
  );
};
