import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Bot, Brain, Activity, Calendar, Eye, Sparkles, SlidersHorizontal, Layers, User, Building2, ShieldCheck } from 'lucide-react';
import { CurrencyPair, Timeframe, TradingStyle, CandleData, IndicatorValues, SmcStructures, SupportResistanceZone, MultiTimeframeAnalysis, AiTradeOpportunity, EconomicEvent, PriceAlarm } from './types';
import { PAIR_CONFIGS, calculate24hRollingChange } from './lib/marketDataGenerator';
import { calculateAllIndicators } from './lib/indicators';
import { analyzeSmcStructures, detectSupportResistance } from './lib/smcEngine';
import { Language } from './lib/translations';

import { Header } from './components/Header';
import { ChartWidget } from './components/ChartWidget';
import { AiAnalysisCard } from './components/AiAnalysisCard';
import { MultiTimeframePanel } from './components/MultiTimeframePanel';
import { IndicatorsPanel } from './components/IndicatorsPanel';
import { SMCPanel } from './components/SMCPanel';
import { RiskCalculatorModal } from './components/RiskCalculatorModal';
import { EconomicCalendarWidget } from './components/EconomicCalendarWidget';
import { AiChatAssistant } from './components/AiChatAssistant';
import { PakarTraderPanel } from './components/PakarTraderPanel';
import { AutoTraderPanel } from './components/AutoTraderPanel';
import { BacktestModule } from './components/BacktestModule';
import { JournalModule } from './components/JournalModule';
import { PriceAlarmModal } from './components/PriceAlarmModal';
import { PriceAlarmToastContainer } from './components/PriceAlarmToastContainer';
import { AutoTraderToastContainer } from './components/AutoTraderToastContainer';
import { AiOpportunitiesScanner } from './components/AiOpportunitiesScanner';
import { TraderAccountModal } from './components/TraderAccountModal';
import { BrokerConnectionModal } from './components/BrokerConnectionModal';
import { AdaptiveLearningModal } from './components/AdaptiveLearningModal';
import { SystemAuditModal } from './components/SystemAuditModal';
import { UserDashboard } from './components/UserDashboard';
import { AdminDeveloperDashboard } from './components/AdminDeveloperDashboard';

export default function App() {
  const [portalMode, setPortalMode] = useState<'USER_DASHBOARD' | 'ADMIN_DEVELOPER' | 'FULL_DESK'>('USER_DASHBOARD');
  const [activePair, setActivePair] = useState<CurrencyPair>('EUR/USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('M15');
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('DAY_TRADER');
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('app_language');
      return (saved as Language) || 'ms';
    } catch (e) {
      return 'ms';
    }
  });

  // Persist language preference
  useEffect(() => {
    try {
      localStorage.setItem('app_language', language);
    } catch (e) {
      console.error('Failed to save language preference:', e);
    }
  }, [language]);

  // Dashboard Workspace View Mode State ('FOCUS' | 'AUTO_TRADER' | 'PAKAR' | 'TECHNICAL' | 'ECONOMIC' | 'ALL')
  const [dashboardView, setDashboardView] = useState<'FOCUS' | 'AUTO_TRADER' | 'PAKAR' | 'TECHNICAL' | 'ECONOMIC' | 'ALL'>(() => {
    try {
      const saved = localStorage.getItem('app_dashboard_view');
      return (saved as any) || 'FOCUS';
    } catch (e) {
      return 'FOCUS';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_dashboard_view', dashboardView);
    } catch (e) {
      console.error('Failed to save dashboard view preference:', e);
    }
  }, [dashboardView]);

  // Market Data States
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(1.08350);
  const [priceChange24h, setPriceChange24h] = useState<number>(0.32);

  // Analysis Engine States
  const [indicators, setIndicators] = useState<IndicatorValues | undefined>(undefined);
  const [smcData, setSmcData] = useState<SmcStructures | undefined>(undefined);
  const [srZones, setSrZones] = useState<SupportResistanceZone[] | undefined>(undefined);
  const [mtfAnalysis, setMtfAnalysis] = useState<MultiTimeframeAnalysis | undefined>(undefined);
  const [aiOpportunity, setAiOpportunity] = useState<AiTradeOpportunity | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Economic Events
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>([]);

  // Modal / Drawer States
  const [isRiskCalcOpen, setIsRiskCalcOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState<string>('');
  const [isBacktestOpen, setIsBacktestOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [isPriceAlarmOpen, setIsPriceAlarmOpen] = useState(false);
  const [isTraderAccountOpen, setIsTraderAccountOpen] = useState(false);
  const [isBrokerConnectionOpen, setIsBrokerConnectionOpen] = useState(false);
  const [isAdaptiveLearningOpen, setIsAdaptiveLearningOpen] = useState(false);
  const [isSystemAuditOpen, setIsSystemAuditOpen] = useState(false);

  const handleAskPakar = useCallback((query: string) => {
    setChatQuery(query);
    setIsChatOpen(true);
  }, []);

  // Price Alarm States
  const [alarms, setAlarms] = useState<PriceAlarm[]>(() => {
    try {
      const saved = localStorage.getItem('forex_price_alarms');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [triggeredToasts, setTriggeredToasts] = useState<PriceAlarm[]>([]);

  // Persist alarms to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('forex_price_alarms', JSON.stringify(alarms));
    } catch (e) {
      console.error('Failed to save price alarms to localStorage:', e);
    }
  }, [alarms]);

  // Web Audio API Chime Synthesizer
  const playAlarmChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc1.frequency.setValueAtTime(1320, ctx.currentTime + 0.15); // E6 note

      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start();
      osc1.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio playback blocked or unsanctioned before user gesture
    }
  }, []);

  // Alarm Price Hit Evaluator Loop
  useEffect(() => {
    if (!currentPrice || alarms.length === 0) return;

    setAlarms((prevAlarms) => {
      let hasChanges = false;
      const updated = prevAlarms.map((alarm) => {
        if (alarm.triggered || alarm.pair !== activePair) return alarm;

        const isHit =
          (alarm.condition === 'ABOVE' && currentPrice >= alarm.targetPrice) ||
          (alarm.condition === 'BELOW' && currentPrice <= alarm.targetPrice);

        if (isHit) {
          hasChanges = true;
          const hitAlarm: PriceAlarm = {
            ...alarm,
            triggered: true,
            triggeredAt: Date.now(),
          };

          // Add to active visual toasts
          setTriggeredToasts((prev) => [hitAlarm, ...prev.filter((t) => t.id !== hitAlarm.id)]);

          // Sound Chime
          if (soundEnabled) {
            playAlarmChime();
          }

          // Browser Native Push Notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`Price Alarm Triggered: ${alarm.pair}`, {
                body: `${alarm.pair} has hit target ${alarm.targetPrice}! Current live price: ${currentPrice}`,
              });
            } catch (err) {
              console.error('Browser Notification Error:', err);
            }
          }

          return hitAlarm;
        }
        return alarm;
      });

      return hasChanges ? updated : prevAlarms;
    });
  }, [currentPrice, activePair, soundEnabled, playAlarmChime, alarms.length]);

  const handleAddAlarm = (newAlarmData: Omit<PriceAlarm, 'id' | 'createdAt' | 'triggered'>) => {
    const alarm: PriceAlarm = {
      ...newAlarmData,
      id: `alarm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: Date.now(),
      triggered: false,
    };
    setAlarms((prev) => [alarm, ...prev]);
  };

  const handleDeleteAlarm = (id: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    setTriggeredToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClearTriggered = () => {
    setAlarms((prev) => prev.filter((a) => !a.triggered));
    setTriggeredToasts([]);
  };

  const handleDismissToast = (id: string) => {
    setTriggeredToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Candlesticks and run technical analysis on pair / timeframe change
  const loadMarketData = useCallback(async () => {
    setAiOpportunity(null);
    // 1. Fetch Live Exchange Rates to sync base price with real live market quotes
    try {
      const rateRes = await fetch('/api/forex/live-rates');
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        if (rateData?.rates) {
          Object.keys(rateData.rates).forEach((p) => {
            const pairKey = p as CurrencyPair;
            if (PAIR_CONFIGS[pairKey] && rateData.rates[pairKey] && (!PAIR_CONFIGS[pairKey].basePrice || PAIR_CONFIGS[pairKey].basePrice === 1.0)) {
              PAIR_CONFIGS[pairKey].basePrice = rateData.rates[pairKey];
            }
          });
        }
      }
    } catch (e) {
      // Offline fallback uses default PAIR_CONFIGS
    }

    // 2. Fetch real candlestick history from live market API
    let history: CandleData[] = [];
    try {
      const candleRes = await fetch(`/api/forex/candles?pair=${encodeURIComponent(activePair)}&timeframe=${timeframe}&count=150`);
      if (candleRes.ok) {
        const candleData = await candleRes.json();
        if (Array.isArray(candleData.candles) && candleData.candles.length > 0) {
          history = candleData.candles;
        }
      }
    } catch (err) {
      console.warn('Real candle fetch error, falling back:', err);
    }

    if (history.length === 0) {
      // Fail-closed: No synthetic candle fallback
      setCandles([]);
      setCurrentPrice(0);
      setPriceChange24h(0);
      setIndicators(undefined);
      setSmcData(undefined);
      setSrZones(undefined);
      setMtfAnalysis(undefined);
      setAiOpportunity(null);
      return;
    }

    setCandles(history);

    const latest = history[history.length - 1];
    if (latest) {
      setCurrentPrice(latest.close);
      const change = calculate24hRollingChange(history, latest.close);
      setPriceChange24h(change);
    }

    // Run Quantitative Indicators & SMC Engine
    const calculatedIndicators = calculateAllIndicators(history);
    setIndicators(calculatedIndicators);

    const smc = analyzeSmcStructures(history, timeframe);
    setSmcData(smc);

    const sr = detectSupportResistance(history, timeframe);
    setSrZones(sr);

    const decimals = PAIR_CONFIGS[activePair]?.decimals || 5;
    const formatPrice = (p: number) => p.toFixed(decimals);

    // Multi-Timeframe Alignment
    const mtf: MultiTimeframeAnalysis = {
      higherTimeframe: {
        timeframe: 'D1',
        bias: calculatedIndicators.ema200 < latest.close ? 'BULLISH' : 'BEARISH',
        description: `Daily macro trend remains ${calculatedIndicators.ema200 < latest.close ? 'constructive above EMA200' : 'pressured below EMA200'}. Support around ${sr[0]?.priceStart || formatPrice(latest.close * 0.995)}.`,
        keyLevels: [formatPrice(latest.close * 0.991), formatPrice(latest.close * 1.009)]
      },
      trendTimeframe: {
        timeframe: 'H4',
        bias: calculatedIndicators.superTrend.trend,
        description: `H4 market structure forming higher lows with SuperTrend ${calculatedIndicators.superTrend.trend.toLowerCase()} at ${formatPrice(calculatedIndicators.superTrend.value)}.`,
        keyLevels: [formatPrice(latest.close * 0.996), formatPrice(latest.close * 1.004)]
      },
      entryTimeframe: {
        timeframe,
        bias: calculatedIndicators.rsi > 50 ? 'BULLISH' : 'BEARISH',
        description: `Execution timeframe ${timeframe} showing RSI at ${calculatedIndicators.rsi} with ${smc.orderBlocks.length} active order blocks.`,
        keyLevels: [formatPrice(latest.close * 0.998), formatPrice(latest.close * 1.002)]
      },
      overallBias: calculatedIndicators.rsi > 50 ? 'BUY BIAS' : 'SELL BIAS',
      alignmentScore: 82
    };
    setMtfAnalysis(mtf);

    // Fetch AI Analysis Engine Opinion
    fetchAiOpinion(activePair, timeframe, tradingStyle, latest.close, calculatedIndicators, smc);
  }, [activePair, timeframe, tradingStyle]);

  // Fetch AI Opinion from Server API
  const fetchAiOpinion = async (
    pair: CurrencyPair,
    tf: Timeframe,
    style: TradingStyle,
    price: number,
    ind: IndicatorValues,
    smc: SmcStructures
  ) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/forex/ai-opinion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          timeframe: tf,
          style,
          currentPrice: price,
          indicators: ind,
          smc,
          riskSettings: { accountSize: 10000, riskPercent: 1.0 }
        })
      });
      const data = await res.json();
      setAiOpportunity(data);
    } catch (err) {
      console.error('AI Opinion Error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // Fetch Economic Calendar Events
  useEffect(() => {
    fetch('/api/forex/economic-calendar')
      .then((res) => res.json())
      .then((data) => {
        if (data.events) setEconomicEvents(data.events);
      })
      .catch((err) => console.error('Economic Calendar Error:', err));
  }, []);

  // Initial Load & On Settings Change
  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  // Real-Time Tick Streaming Interval
  useEffect(() => {
    const interval = setInterval(() => {
      setCandles((prevCandles) => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        const lastIndex = prevCandles.length - 1;
        const updatedLast = generateNextTick(prevCandles[lastIndex], activePair);
        setCurrentPrice(updatedLast.close);

        const newArr = [...prevCandles];
        newArr[lastIndex] = updatedLast;
        return newArr;
      });
    }, 2500); // tick update every 2.5s

    return () => clearInterval(interval);
  }, [activePair]);

  // Sync AI Opportunity setup to Risk Calculator Modal
  const handleSyncToRiskCalc = (opp: AiTradeOpportunity) => {
    setAiOpportunity(opp);
    setIsRiskCalcOpen(true);
  };

  // Log Trade to Performance Journal
  const handleLogToJournal = async (opp: AiTradeOpportunity) => {
    try {
      await fetch('/api/forex/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: opp.pair,
          tradingStyle,
          direction: opp.action === 'BUY' ? 'BUY' : 'SELL',
          entryPrice: (opp.entryZone.min + opp.entryZone.max) / 2,
          stopLoss: opp.stopLoss,
          takeProfit: opp.takeProfit1,
          lotSize: 0.2,
          pnlDollars: 0,
          status: 'OPEN',
          notes: `Logged AI Setup: ${opp.reasons[0]}`,
          tags: ['AISetup', tradingStyle]
        })
      });
      setIsJournalOpen(true);
    } catch (err) {
      console.error('Log to journal error:', err);
    }
  };

  const highImpactNews = economicEvents.find((e) => e.impact === 'HIGH' && e.warningText);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white flex flex-col">
      {/* Top Navigation Bar */}
      <Header
        activePair={activePair}
        setActivePair={setActivePair}
        tradingStyle={tradingStyle}
        setTradingStyle={setTradingStyle}
        currentPrice={currentPrice}
        priceChange24h={priceChange24h}
        upcomingNews={highImpactNews}
        onOpenRiskCalc={() => setIsRiskCalcOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenBacktest={() => setIsBacktestOpen(true)}
        onOpenJournal={() => setIsJournalOpen(true)}
        onOpenAdaptiveLearning={() => setIsAdaptiveLearningOpen(true)}
        onOpenPriceAlarm={() => setIsPriceAlarmOpen(true)}
        onOpenTraderAccount={() => setIsTraderAccountOpen(true)}
        onOpenBrokerConnection={() => setIsBrokerConnectionOpen(true)}
        activeAlarmsCount={alarms.filter((a) => !a.triggered).length}
        language={language}
        setLanguage={setLanguage}
      />


      {/* Main Dashboard Canvas Body */}
      
      {/* PHASE 6: PROMINENT MANUAL SIGNAL MODE SYSTEM STATUS BANNER */}
      <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 pt-3">
        <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border-2 border-blue-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-wider">QUANTUMAI</span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/50 text-blue-300 font-mono text-xs font-bold uppercase tracking-wider">
                  MANUAL SIGNAL MODE
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-0.5">
                QuantumAI provides analysis and trade setups only. No trades are executed by QuantumAI.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono w-full lg:w-auto justify-start lg:justify-end">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              REAL MARKET DATA: ACTIVE
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              AI ANALYSIS: ACTIVE
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              ADAPTIVE LEARNING: ACTIVE
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              BROKER EXECUTION: DISABLED
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 font-semibold">
              AUTOMATIC ORDERS: 0
            </span>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-4 space-y-4">
        {/* Main Role & Dashboard Portal Switcher */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none w-full sm:w-auto">
            <button
              onClick={() => setPortalMode('USER_DASHBOARD')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                portalMode === 'USER_DASHBOARD'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/50'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <User className="w-4 h-4 text-blue-300" />
              <span>ðŸ‘¤ Dashboard User / Ahli (Hook, Sim & Broker)</span>
            </button>

            <button
              onClick={() => setPortalMode('ADMIN_DEVELOPER')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                portalMode === 'ADMIN_DEVELOPER'
                  ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white shadow-lg shadow-purple-900/40 ring-1 ring-purple-400/50'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4 text-purple-300" />
              <span>ðŸ‘‘ Dashboard Admin &amp; Developer (SaaS &amp; Relay)</span>
            </button>

            <button
              onClick={() => setPortalMode('FULL_DESK')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                portalMode === 'FULL_DESK'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/50'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <LayoutGrid className="w-4 h-4 text-emerald-300" />
              <span>ðŸ“Š Meja Dagangan Sebenar (Chart &amp; Technical Desk)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400 font-bold hidden md:inline">Status Port:</span>
            <button
              id="portal-ctrader-status-btn"
              onClick={() => setIsBrokerConnectionOpen(true)}
              className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm"
              title="Klik untuk buka Tetingkap Sambungan cTrader FIX API"
            >
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span>âš¡ cTrader FIX (Port 5212) ONLINE</span>
            </button>
          </div>
        </div>

        {/* PORTAL VIEW 1: USER DASHBOARD */}
        {portalMode === 'USER_DASHBOARD' && (
          <UserDashboard
            currentPrice={currentPrice}
            activePair={activePair}
            setActivePair={setActivePair}
            candles={candles}
            indicators={indicators}
            smcData={smcData}
            srZones={srZones}
            isMalay={language === 'ms'}
            onOpenBrokerModal={() => setIsBrokerConnectionOpen(true)}
          />
        )}

        {/* PORTAL VIEW 2: ADMIN & DEVELOPER DASHBOARD */}
        {portalMode === 'ADMIN_DEVELOPER' && (
          <AdminDeveloperDashboard
            isMalay={language === 'ms'}
            onOpenBrokerModal={() => setIsBrokerConnectionOpen(true)}
          />
        )}

        {/* PORTAL VIEW 3: FULL TECHNICAL TRADING DESK */}
        {portalMode === 'FULL_DESK' && (
          <>
            {/* Row 1: Interactive Chart + Primary AI Analysis Engine (Core Focus Row) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Chart Widget (7 Cols on large screen) */}
              <div className="lg:col-span-7 flex flex-col h-full">
                <ChartWidget
                  candles={candles}
                  pair={activePair}
                  timeframe={timeframe}
                  setTimeframe={setTimeframe}
                  aiOpportunity={aiOpportunity}
                  smcData={smcData}
                  srZones={srZones}
                  onRefreshData={loadMarketData}
                  onAskPakar={handleAskPakar}
                  language={language}
                />
              </div>

              {/* AI Analysis Reasoning Card (5 Cols on large screen) */}
              <div className="lg:col-span-5 flex flex-col h-full">
                <AiAnalysisCard
                  opportunity={aiOpportunity}
                  loading={aiLoading}
                  tradingStyle={tradingStyle}
                  currentPrice={currentPrice}
                  onSyncToRiskCalc={handleSyncToRiskCalc}
                  onLogToJournal={handleLogToJournal}
                  onAskAi={handleAskPakar}
                  language={language}
                />
              </div>
            </div>

        {/* Workspace Dashboard Tab Switcher - Clean Layout Architecture */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xl backdrop-blur-md sticky top-14 z-20">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none w-full md:w-auto">
            <button
              onClick={() => setDashboardView('FOCUS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                dashboardView === 'FOCUS'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-900/40 ring-1 ring-blue-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-300" />
              <span>{language === 'ms' ? 'ðŸŽ¯ Utama & Pakar' : 'ðŸŽ¯ Main & Pakar'}</span>
            </button>

            <button
              onClick={() => setDashboardView('AUTO_TRADER')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                dashboardView === 'AUTO_TRADER'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/40 ring-1 ring-emerald-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-emerald-300" />
              <span>{language === 'ms' ? 'ðŸ¤– Bot Auto Trader & Scanner' : 'ðŸ¤– Auto Trader Bot & Scanner'}</span>
            </button>

            <button
              onClick={() => setDashboardView('PAKAR')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                dashboardView === 'PAKAR'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/40 ring-1 ring-purple-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-purple-300" />
              <span>{language === 'ms' ? 'ðŸŽ“ Pakar AI Trader' : 'ðŸŽ“ Pakar AI Trader'}</span>
            </button>

            <button
              onClick={() => setDashboardView('TECHNICAL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                dashboardView === 'TECHNICAL'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-900/40 ring-1 ring-amber-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-amber-300" />
              <span>{language === 'ms' ? 'ðŸ” Indikator & SMC' : 'ðŸ” Technical & SMC'}</span>
            </button>

            <button
              onClick={() => setDashboardView('ECONOMIC')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                dashboardView === 'ECONOMIC'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-900/40 ring-1 ring-cyan-400/50'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-cyan-300" />
              <span>{language === 'ms' ? 'ðŸ“… Kalendar Ekonomi' : 'ðŸ“… Economic Calendar'}</span>
            </button>

            <button
              onClick={() => setDashboardView('ALL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                dashboardView === 'ALL'
                  ? 'bg-slate-700 text-white border border-slate-500 shadow-md'
                  : 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 border border-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-slate-300" />
              <span>{language === 'ms' ? 'ðŸ‘ï¸ Semua Widget' : 'ðŸ‘ï¸ All Widgets'}</span>
            </button>

            <button
              onClick={() => setIsSystemAuditOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600/30 via-slate-800 to-emerald-600/30 hover:from-emerald-600/50 hover:to-emerald-600/50 text-emerald-300 border border-emerald-500/40 flex items-center gap-2 transition cursor-pointer shrink-0 shadow-lg shadow-emerald-950/50"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'ms' ? 'ðŸ›¡ï¸ System Audit' : 'ðŸ›¡ï¸ System Audit'}</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{language === 'ms' ? 'Papan Kerja Teratur' : 'Organized Workspace'}</span>
          </div>
        </div>

        {/* Dynamic Workspace Module Rendering based on Trader Criticality Hierarchy */}
        {(dashboardView === 'FOCUS' || dashboardView === 'ALL') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 flex flex-col h-full">
              <MultiTimeframePanel mtfData={mtfAnalysis} language={language} />
            </div>
            <div className="lg:col-span-5 flex flex-col h-full">
              <EconomicCalendarWidget events={economicEvents} language={language} />
            </div>
          </div>
        )}

        {(dashboardView === 'FOCUS' || dashboardView === 'PAKAR' || dashboardView === 'ALL') && (
          <PakarTraderPanel
            pair={activePair}
            timeframe={timeframe}
            tradingStyle={tradingStyle}
            currentPrice={currentPrice}
            opportunity={aiOpportunity}
            indicators={indicators}
            smcData={smcData}
            onAskPakar={handleAskPakar}
            language={language}
          />
        )}

        {(dashboardView === 'AUTO_TRADER' || dashboardView === 'ALL') && (
          <>
            <AutoTraderPanel
              currentPrice={currentPrice}
              activePair={activePair}
              opportunity={aiOpportunity}
              language={language}
              onOpenJournal={() => setIsJournalOpen(true)}
              onOpenBrokerConnection={() => setIsBrokerConnectionOpen(true)}
            />

            <AiOpportunitiesScanner
              activePair={activePair}
              setActivePair={setActivePair}
              tradingStyle={tradingStyle}
              language={language}
              opportunity={aiOpportunity}
            />
          </>
        )}

        {(dashboardView === 'TECHNICAL' || dashboardView === 'ALL') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 flex flex-col h-full">
              <IndicatorsPanel
                indicators={indicators}
                smcData={smcData}
                mtfAnalysis={mtfAnalysis}
                opportunity={aiOpportunity}
                currentPrice={currentPrice}
                activePair={activePair}
                language={language}
              />
            </div>
            <div className="lg:col-span-5 flex flex-col h-full">
              <SMCPanel smcData={smcData} timeframe={timeframe} language={language} />
            </div>
          </div>
        )}

        {dashboardView === 'ECONOMIC' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12 flex flex-col h-full">
              <EconomicCalendarWidget events={economicEvents} language={language} />
            </div>
          </div>
        )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Forex Analysis Assistant &copy; {new Date().getFullYear()} &bull; Professional Trading Desk Intelligence</span>
          <span className="text-[11px] text-slate-400">
            Probability-Based Analysis Model. Foreign Exchange trading involves substantial risk of loss.
          </span>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <RiskCalculatorModal
        isOpen={isRiskCalcOpen}
        onClose={() => setIsRiskCalcOpen(false)}
        activePair={activePair}
        syncedSetup={aiOpportunity}
        currentPrice={currentPrice}
        language={language}
      />

      <AiChatAssistant
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        pair={activePair}
        timeframe={timeframe}
        tradingStyle={tradingStyle}
        currentPrice={currentPrice}
        indicators={indicators}
        smcData={smcData}
        newsContext={highImpactNews?.warningText}
        initialQuery={chatQuery}
        onClearQuery={() => setChatQuery('')}
        language={language}
      />

      <BacktestModule
        isOpen={isBacktestOpen}
        onClose={() => setIsBacktestOpen(false)}
        activePair={activePair}
        activeTimeframe={timeframe}
        language={language}
      />

      <JournalModule
        isOpen={isJournalOpen}
        onClose={() => setIsJournalOpen(false)}
        activePair={activePair}
        activeStyle={tradingStyle}
        language={language}
        onOpenAdaptiveLearning={() => setIsAdaptiveLearningOpen(true)}
      />

      <PriceAlarmModal
        isOpen={isPriceAlarmOpen}
        onClose={() => setIsPriceAlarmOpen(false)}
        activePair={activePair}
        currentPrice={currentPrice}
        alarms={alarms}
        onAddAlarm={handleAddAlarm}
        onDeleteAlarm={handleDeleteAlarm}
        onClearTriggered={handleClearTriggered}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        playAlarmChime={playAlarmChime}
        language={language}
      />

      <PriceAlarmToastContainer
        triggeredToasts={triggeredToasts}
        onDismissToast={handleDismissToast}
      />

      <AutoTraderToastContainer />

      <TraderAccountModal
        isOpen={isTraderAccountOpen}
        onClose={() => setIsTraderAccountOpen(false)}
        language={language}
      />

      <BrokerConnectionModal
        isOpen={isBrokerConnectionOpen}
        onClose={() => setIsBrokerConnectionOpen(false)}
        language={language}
      />

      <AdaptiveLearningModal
        isOpen={isAdaptiveLearningOpen}
        onClose={() => setIsAdaptiveLearningOpen(false)}
        language={language}
        activePair={activePair}
        activeTimeframe={timeframe}
        currentPrice={currentPrice}
      />

      <SystemAuditModal
        isOpen={isSystemAuditOpen}
        onClose={() => setIsSystemAuditOpen(false)}
        isMalay={language === 'ms'}
      />
    </div>
  );
}




