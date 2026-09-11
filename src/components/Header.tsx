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
  }>({
    balance: 990.73,
    equity: 990.73,
    connected: true,
    accountNumber: '5881460',
    environment: 'DEMO'
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = () => {
      fetch('/api/broker/status')
        .then(r => r.json())
        .then(d => {
          if (isMounted && d) {
            setBrokerInfo({
              balance: Number(d.liveBalance ?? d.balance ?? 990.73),
              equity: Number(d.liveEquity ?? d.equity ?? d.balance ?? 990.73),
              connected: Boolean(d.connected ?? true),
              accountNumber: String(d.accountNumber || '5881460'),
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
      <header className="min-h-[3.75rem] py-2 border-b border-white/[0.08] bg-[#0B0F19]/90 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-50 backdrop-blur-xl max-w-full shadow-lg shadow-black/40">
        {/* Left: Brand & Instrument Selector */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center font-extrabold text-white text-xs tracking-wider shadow-md shadow-cyan-500/20 shrink-0 border border-white/20 ring-1 ring-cyan-500/30">
              Q
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-base sm:text-lg text-white whitespace-nowrap">
                QUANTUM<span className="text-cyan-400 font-extrabold">AI</span>
              </span>
              <span className="px-2 py-0.5 bg-gradient-to-r from-cyan-500/15 via-indigo-500/15 to-purple-500/15 border border-cyan-500/30 text-[9px] font-mono text-cyan-300 rounded-full font-bold uppercase tracking-wider hidden sm:inline-block shadow-sm">
                QUANT DESK
              </span>
            </div>
          </div>

          {/* Prominent cTrader FIX API Broker Button */}
          {onOpenBrokerConnection && (
            <button
              id="header-left-ctrader-btn"
              onClick={onOpenBrokerConnection}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-950/90 via-teal-950/90 to-emerald-900/90 hover:from-emerald-900 hover:to-teal-800 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md shadow-emerald-950/60 ring-1 ring-emerald-500/20 cursor-pointer shrink-0 group"
              title={language === 'ms' ? 'Sambungkan Akaun cTrader FIX API / MT4 / MT5' : 'Connect cTrader FIX API / MT4 / MT5 Account'}
            >
              <div className="relative flex items-center justify-center">
                <Wifi className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
              </div>
              <span className="whitespace-nowrap font-mono tracking-tight text-emerald-200 font-semibold text-[11px] sm:text-xs">
                {language === 'ms' ? 'cTrader Live' : 'cTrader Live'}
              </span>
            </button>
          )}

          {/* Live Broker Capital & Balance Display Pill */}
          <div 
            onClick={onOpenBrokerConnection}
            className="hidden sm:flex items-center gap-3 bg-slate-900/90 border border-white/[0.08] hover:border-emerald-500/40 px-3 py-1.5 rounded-xl font-mono text-xs shadow-inner cursor-pointer transition shrink-0 backdrop-blur-md"
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
              <span className="font-extrabold text-cyan-400 text-xs sm:text-sm leading-tight">
                ${brokerInfo.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="hidden sm:block h-5 w-[1px] bg-slate-800 shrink-0" />

          {/* Pair Select Dropdown for Mobile, Tablet & Medium screens (< 2xl) */}
          <div className="flex items-center gap-1.5 2xl:hidden">
            <select
              id="header-pair-mobile-select"
              value={activePair}
              onChange={(e) => setActivePair(e.target.value as CurrencyPair)}
              className="bg-slate-900/90 hover:bg-slate-800 border border-white/[0.1] text-white text-xs rounded-xl px-2.5 py-1.5 font-mono font-bold cursor-pointer outline-none focus:border-cyan-500 transition shadow-sm"
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
          <div className="hidden 2xl:flex items-center gap-1 bg-slate-800/60 p-1 rounded-md text-xs font-medium border border-slate-800">
            {PAIRS.map((pair) => (
              <button
                key={pair}
                id={`pair-btn-${pair.replace('/', '-')}`}
                onClick={() => setActivePair(pair)}
                className={`px-2.5 py-1 rounded text-xs transition-all font-mono font-semibold ${
                  activePair === pair
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {pair}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Trading Style & Action Tools Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Trading Style Selector (Dropdown on < xl, Pills on xl+) */}
          <div className="xl:hidden">
            <select
              id="header-trading-style-select"
              value={tradingStyle}
              onChange={(e) => setTradingStyle(e.target.value as TradingStyle)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1 font-semibold cursor-pointer outline-none focus:border-blue-500 transition"
              title="Trading Style"
            >
              {STYLES.map((st) => (
                <option key={st.id} value={st.id} className="bg-slate-900 text-white">
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden xl:flex bg-slate-800 p-1 rounded-md text-xs font-medium border border-slate-700/60 shrink-0">
            {STYLES.map((st) => (
              <button
                key={st.id}
                id={`style-btn-${st.id}`}
                onClick={() => setTradingStyle(st.id)}
                title={st.desc}
                className={`px-2.5 py-1 rounded transition-all font-semibold whitespace-nowrap ${
                  tradingStyle === st.id
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Action Tools & Language Selector */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-wrap">
            {/* Language Selector Dropdown */}
            <div className="relative flex items-center bg-slate-800 border border-slate-700/90 text-slate-200 rounded-md px-1.5 py-1 text-xs font-semibold hover:border-blue-500/50 transition shrink-0">
              <Globe className="w-3.5 h-3.5 text-blue-400 mr-1 shrink-0" />
              <select
                id="header-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-transparent text-white font-bold cursor-pointer outline-none focus:outline-none pr-0 text-xs"
                title={t.languageSelect}
              >
                <option value="ms" className="bg-slate-900 text-white">🇲🇾 BM</option>
                <option value="en" className="bg-slate-900 text-white">🇬🇧 EN</option>
                <option value="id" className="bg-slate-900 text-white">🇮🇩 ID</option>
              </select>
            </div>

            {/* Trader Account Button */}
            {onOpenTraderAccount && (
              <button
                id="header-trader-account-btn"
                onClick={onOpenTraderAccount}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 border border-blue-500/40 text-blue-300 hover:text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition shadow-sm shrink-0"
                title={language === 'ms' ? 'Akaun Pedagang Standard' : 'Trader Profile & Account'}
              >
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden xl:inline">{language === 'ms' ? 'Akaun Trader' : 'Trader Profile'}</span>
              </button>
            )}

            {/* Broker Real Money Gateway Button (cTrader / FIX / MT5) */}
            {onOpenBrokerConnection && (
              <button
                id="header-broker-conn-btn"
                onClick={onOpenBrokerConnection}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-950 via-teal-950 to-cyan-950 hover:from-emerald-900 hover:to-cyan-900 border border-emerald-400/60 text-emerald-300 hover:text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition shadow-lg shadow-emerald-950/50 shrink-0 ring-1 ring-emerald-500/30"
                title={language === 'ms' ? 'Sambungkan Akaun cTrader FIX API / MT4 / MT5' : 'Connect cTrader FIX API / MT4 / MT5 Account'}
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="whitespace-nowrap font-mono tracking-tight text-emerald-300">
                  {language === 'ms' ? '🔌 Sambung cTrader' : '🔌 Connect cTrader'}
                </span>
                <span className="hidden sm:inline-block px-1 py-0.2 bg-emerald-500/20 text-[9px] text-emerald-200 border border-emerald-400/30 rounded font-mono">
                  FIX/API
                </span>
              </button>
            )}

            {/* Price Alarm Button */}
            <button
              id="header-price-alarm-btn"
              onClick={onOpenPriceAlarm}
              className="p-1.5 2xl:px-3 2xl:py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-sm relative shrink-0"
              title={t.priceAlarmTitle}
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden 2xl:inline">{t.alarms}</span>
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
              className="p-1.5 2xl:px-3 2xl:py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0"
              title={t.riskCalcTitle}
            >
              <Calculator className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden 2xl:inline">{t.riskCalc}</span>
            </button>

            {/* AI Learning & Entry Pattern Analysis Button */}
            {onOpenAdaptiveLearning && (
              <button
                id="header-ai-learning-btn"
                onClick={onOpenAdaptiveLearning}
                className="px-2.5 py-1.5 bg-gradient-to-r from-purple-950/90 to-indigo-950/90 hover:from-purple-900 hover:to-indigo-900 border border-purple-500/60 text-purple-200 hover:text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition shadow-sm shrink-0 group relative"
                title={language === 'ms' ? 'Enjin Pembelajaran & Analisis Corak Entri AI' : 'AI Behavioral Learning & Entry Pattern Analyzer'}
              >
                <div className="relative">
                  <Brain className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full animate-ping" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full" />
                </div>
                <span className="whitespace-nowrap font-mono">{language === 'ms' ? '🧠 AI Learning' : '🧠 AI Learning'}</span>
              </button>
            )}

            {/* AI Chat / Pakar Trader Button */}
            <button
              id="header-ai-chat-btn"
              onClick={onOpenChat}
              className="px-2.5 py-1.5 bg-gradient-to-r from-blue-600/30 to-indigo-600/30 hover:from-blue-600/40 hover:to-indigo-600/40 border border-blue-500/50 text-blue-200 hover:text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition shadow-sm shrink-0 group relative"
              title="Tanya Pakar Trader Forex AI Quantum"
            >
              <div className="relative">
                <MessageSquare className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />
              </div>
              <span className="whitespace-nowrap">🤖 {language === 'ms' ? 'Pakar Trader AI' : 'Pakar Trader AI'}</span>
            </button>

            {/* Backtest Button */}
            <button
              id="header-backtest-btn"
              onClick={onOpenBacktest}
              className="p-1.5 2xl:px-3 2xl:py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0"
              title={t.backtestTitle}
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden 2xl:inline">{t.backtest}</span>
            </button>

            {/* Journal Button */}
            <button
              id="header-journal-btn"
              onClick={onOpenJournal}
              className="p-1.5 2xl:px-3 2xl:py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0"
              title={t.journalTitle}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden 2xl:inline">{t.journal}</span>
            </button>
          </div>
        </div>
      </header>

      {/* High Impact News Ticker Banner */}
      {upcomingNews && <HeaderNewsBanner news={upcomingNews} macroAlertLabel={t.macroAlert} />}
    </>
  );
};
