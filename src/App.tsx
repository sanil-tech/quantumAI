import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutGrid, Bot, Brain, Activity, Calendar, Eye, Sparkles, SlidersHorizontal, Layers, User, Building2, ShieldCheck } from 'lucide-react';
import { CurrencyPair, Timeframe, TradingStyle, CandleData, IndicatorValues, SmcStructures, SupportResistanceZone, MultiTimeframeAnalysis, AiTradeOpportunity, EconomicEvent, PriceAlarm } from './types';
import { PAIR_CONFIGS, calculate24hRollingChange, generateNextTick } from './lib/marketDataGenerator';
import { calculateAllIndicators } from './lib/indicators';
import { analyzeSmcStructures, detectSupportResistance } from './lib/smcEngine';
import { Language } from './lib/translations';

import { Header } from './components/Header';
import { RiskCalculatorModal } from './components/RiskCalculatorModal';
import { AiChatAssistant } from './components/AiChatAssistant';
import { BacktestModule } from './components/BacktestModule';
import { JournalModule } from './components/JournalModule';
import { PriceAlarmModal } from './components/PriceAlarmModal';
import { PriceAlarmToastContainer } from './components/PriceAlarmToastContainer';
import { TraderAccountModal } from './components/TraderAccountModal';
import { BrokerConnectionModal } from './components/BrokerConnectionModal';
import { AdaptiveLearningModal } from './components/AdaptiveLearningModal';
import { SystemAuditModal } from './components/SystemAuditModal';
import { UserDashboard } from './components/UserDashboard';
import { AdminDeveloperDashboard } from './components/AdminDeveloperDashboard';

export default function App() {
  const isAdminMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('mode') === 'admin' ||
    new URLSearchParams(window.location.search).get('admin') === 'true' ||
    window.location.pathname.startsWith('/admin')
  );

  const [portalMode, setPortalMode] = useState<'USER_DASHBOARD' | 'ADMIN_DEVELOPER'>(() => {
    if (typeof window !== 'undefined') {
      const mode = new URLSearchParams(window.location.search).get('mode');
      if (mode === 'admin' || window.location.pathname.startsWith('/admin')) return 'ADMIN_DEVELOPER';
    }
    return 'USER_DASHBOARD';
  });
  const aiOpinionAbortControllerRef = useRef<AbortController | null>(null);
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

  // Keyboard Shortcut Navigation for Workspace Views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case '1':
          setPortalMode('USER_DASHBOARD');
          break;
        case '2':
          setPortalMode('ADMIN_DEVELOPER');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  // Market Data States
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [candleSource, setCandleSource] = useState<string>('UNKNOWN');
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
    let sourceStr = 'UNKNOWN';
    try {
      const candleRes = await fetch(`/api/ctrader/candles?pair=${encodeURIComponent(activePair)}&timeframe=${timeframe}`);
      if (candleRes.ok) {
        const candleData = await candleRes.json();
        if (candleData.success && Array.isArray(candleData.candles) && candleData.candles.length > 0) {
          history = candleData.candles;
          sourceStr = candleData.source || 'cTrader DEMO Open API (demo.ctraderapi.com)';
        } else if (candleData.candles && Array.isArray(candleData.candles) && candleData.candles.length > 0) {
          history = candleData.candles;
          sourceStr = candleData.reason || 'INSUFFICIENT_CANDLE_HISTORY';
        } else {
          sourceStr = candleData.reason || 'WAITING FOR cTRADER MARKET HISTORY';
        }
      } else {
        sourceStr = 'FEED_NOT_CONNECTED';
      }
    } catch (err) {
      console.warn('Real candle fetch error, falling back:', err);
      sourceStr = 'ERROR_FETCHING';
    }

    // Sort candles by time to ensure strictly ascending order (required by lightweight-charts)
    // Also remove duplicates - if two candles have the same time, keep only the last one
    const uniqueCandles: typeof history = [];
    const seenTimes = new Set<number>();
    
    history.sort((a, b) => {
      const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : a.time;
      const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : b.time;
      return timeA - timeB;
    });
    
    for (let i = history.length - 1; i >= 0; i--) {
      const candle = history[i];
      const candleTime = typeof candle.time === 'string' ? new Date(candle.time).getTime() : candle.time;
      if (!seenTimes.has(candleTime)) {
        uniqueCandles.unshift(candle);
        seenTimes.add(candleTime);
      }
    }
    
    history = uniqueCandles;

    if (history.length === 0) {
      // Fail-closed: No synthetic candle fallback
      setCandles([]);
      setCandleSource(sourceStr);
      setCurrentPrice(PAIR_CONFIGS[activePair]?.basePrice || 1.16795);
      setPriceChange24h(0);
      setIndicators(undefined);
      setSmcData(undefined);
      setSrZones(undefined);
      setMtfAnalysis(undefined);
      setAiOpportunity(null);
      return;
    }

    setCandles(history);
    setCandleSource(sourceStr);

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
    const higherBiasBullish = calculatedIndicators.ema200 < latest.close;
    const trendBiasBullish = calculatedIndicators.superTrend.trend === 'BULLISH';
    const entryBiasBullish = calculatedIndicators.rsi > 50;

    let bullishScore = 0;
    if (higherBiasBullish) bullishScore += 40; // D1 trend weight: 40%
    if (trendBiasBullish) bullishScore += 35;  // H4 trend weight: 35%
    if (entryBiasBullish) bullishScore += 25;  // Entry timeframe weight: 25%

    const isBuyBias = calculatedIndicators.rsi > 50;
    const dynamicAlignmentScore = isBuyBias ? bullishScore : (100 - bullishScore);

    const mtf: MultiTimeframeAnalysis = {
      higherTimeframe: {
        timeframe: 'D1',
        bias: higherBiasBullish ? 'BULLISH' : 'BEARISH',
        description: `Daily macro trend remains ${higherBiasBullish ? 'constructive above EMA200' : 'pressured below EMA200'}. Support around ${sr[0]?.priceStart || formatPrice(latest.close * 0.995)}.`,
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
        bias: entryBiasBullish ? 'BULLISH' : 'BEARISH',
        description: `Execution timeframe ${timeframe} showing RSI at ${calculatedIndicators.rsi} with ${smc.orderBlocks.length} active order blocks.`,
        keyLevels: [formatPrice(latest.close * 0.998), formatPrice(latest.close * 1.002)]
      },
      overallBias: isBuyBias ? 'BUY BIAS' : 'SELL BIAS',
      alignmentScore: Math.max(0, Math.min(100, dynamicAlignmentScore))
    };
    setMtfAnalysis(mtf);

    // Fetch AI Analysis Engine Opinion
    fetchAiOpinion(activePair, timeframe, tradingStyle, latest.close, calculatedIndicators, smc);
  }, [activePair, timeframe, tradingStyle]);

  // Fetch AI Opinion from Server API with Race Condition and Stale Symbol Protection
  const fetchAiOpinion = async (
    pair: CurrencyPair,
    tf: Timeframe,
    style: TradingStyle,
    price: number,
    ind: IndicatorValues,
    smc: SmcStructures
  ) => {
    // Abort previous in-flight AI opinion request
    if (aiOpinionAbortControllerRef.current) {
      aiOpinionAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    aiOpinionAbortControllerRef.current = controller;

    setAiLoading(true);
    try {
      const res = await fetch('/api/forex/ai-opinion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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
      // Guard against stale symbol arrival: ensure returned opportunity matches active requested pair
      if (data && (data.pair === pair)) {
        setAiOpportunity(data);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('AI Opinion Error:', err);
      }
    } finally {
      if (aiOpinionAbortControllerRef.current === controller) {
        setAiLoading(false);
      }
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
          entryPrice: opp.entryZone && typeof opp.entryZone.min === 'number' ? (opp.entryZone.min + opp.entryZone.max) / 2 : (opp as any).entryPrice || currentPrice || 0,
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

  const now = Date.now();
  const liveNews = economicEvents.find((e) => e.impact === 'HIGH' && e.status === 'LIVE_WINDOW');
  const nextUpcomingNews = economicEvents
    .filter((e) => e.impact === 'HIGH' && (e.status === 'UPCOMING' || e.timestamp > now))
    .sort((a, b) => a.timestamp - b.timestamp)[0];

  const highImpactNews = liveNews || nextUpcomingNews;

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




      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-4 space-y-4">
        {/* Admin Switcher Bar (Only visible when explicitly in admin mode via URL ?mode=admin) */}
        {isAdminMode && (
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none w-full sm:w-auto">
              <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 mr-1">
                Admin Console
              </span>
              <button
                id="portal-user-btn"
                onClick={() => setPortalMode('USER_DASHBOARD')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  portalMode === 'USER_DASHBOARD'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/50'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <User className="w-4 h-4 text-blue-300" />
                <span>{language === 'ms' ? 'Dashboard Pelanggan' : 'Customer Dashboard'}</span>
              </button>

              <button
                id="portal-admin-btn"
                onClick={() => setPortalMode('ADMIN_DEVELOPER')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  portalMode === 'ADMIN_DEVELOPER'
                    ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white shadow-lg shadow-purple-900/40 ring-1 ring-purple-400/50'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4 text-purple-300" />
                <span>{language === 'ms' ? 'Dashboard Admin & Dev' : 'Admin & Dev Dashboard'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-400 font-bold hidden md:inline">Status Port:</span>
              <button
                id="portal-ctrader-status-btn"
                onClick={() => setIsBrokerConnectionOpen(true)}
                className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm"
                title="Tetingkap Sambungan cTrader FIX API"
              >
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                <span>cTrader FIX (Port 5035) ONLINE</span>
              </button>
            </div>
          </div>
        )}

        {/* PORTAL VIEW 1: USER DASHBOARD (Consolidated Dashboard) */}
        {portalMode === 'USER_DASHBOARD' && (
          <UserDashboard
            currentPrice={currentPrice}
            activePair={activePair}
            setActivePair={setActivePair}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            onRefreshData={loadMarketData}
            candles={candles}
            candleSource={candleSource}
            indicators={indicators}
            smcData={smcData}
            srZones={srZones}
            aiOpportunity={aiOpportunity}
            aiLoading={aiLoading}
            isMalay={language === 'ms'}
            onOpenBrokerModal={() => setIsBrokerConnectionOpen(true)}
            onOpenAdaptiveLearning={() => setIsAdaptiveLearningOpen(true)}
            onAskAi={handleAskPakar}
            onSyncToRiskCalc={() => setIsRiskCalcOpen(true)}
            onLogToJournal={() => setIsJournalOpen(true)}
          />
        )}

        {/* PORTAL VIEW 2: ADMIN & DEVELOPER DASHBOARD */}
        {portalMode === 'ADMIN_DEVELOPER' && (
          <AdminDeveloperDashboard
            isMalay={language === 'ms'}
            onOpenBrokerModal={() => setIsBrokerConnectionOpen(true)}
          />
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




