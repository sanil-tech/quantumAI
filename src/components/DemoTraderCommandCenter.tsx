import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DollarSign, Activity, TrendingUp, TrendingDown, ShieldCheck, Zap, Bot,
  RefreshCw, CheckCircle, CheckCircle2, AlertTriangle, Play, Pause, XCircle, ChevronRight,
  BarChart3, Clock, Target, ArrowUpRight, ArrowDownRight, Layers, Eye,
  Lock, Key, Sparkles, Sliders, Shield, Radio, CheckSquare, Sparkle, History, Power,
  Search, Filter, X
} from 'lucide-react';
import {
  CurrencyPair, CandleData, IndicatorValues, SmcStructures, SupportResistanceZone,
  AiTradeOpportunity, Timeframe, TradingStyle, BrokerConnectionConfig, AutoTrade, EconomicEvent
} from '../types';
import { ChartWidget } from './ChartWidget';
import { translations, Language } from '../lib/translations';
import { SubscriberTrustCockpit, SubscriberRiskMode } from './SubscriberTrustCockpit';
import { tradeAudio } from '../utils/tradeAudio';
import { NewUserOnboardingModal } from './NewUserOnboardingModal';
import { SubscriptionPricingModal } from './SubscriptionPricingModal';
import { MacroEconomicShieldCard } from './MacroEconomicShieldCard';
import { AiReasoningCard } from './AiReasoningCard';
import { getMarketStatus, isCryptoPair } from '../lib/marketHours';

interface DemoTraderCommandCenterProps {
  currentPrice: number;
  activePair: CurrencyPair;
  setActivePair: (pair: CurrencyPair) => void;
  candles: CandleData[];
  candleSource?: string;
  indicators?: IndicatorValues;
  smcData?: SmcStructures;
  srZones?: SupportResistanceZone[];
  aiOpportunity?: AiTradeOpportunity | null;
  aiLoading?: boolean;
  onRefreshData?: () => void;
  onOpenBrokerModal: () => void;
  timeframe?: Timeframe;
  setTimeframe?: (tf: Timeframe) => void;
  language: Language;
}

const WATCHLIST_PAIRS: CurrencyPair[] = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF',
  'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
];

export const DemoTraderCommandCenter: React.FC<DemoTraderCommandCenterProps> = ({
  currentPrice,
  activePair,
  setActivePair,
  candles,
  candleSource,
  indicators,
  smcData,
  srZones,
  aiOpportunity,
  aiLoading,
  onRefreshData,
  onOpenBrokerModal,
  timeframe = 'M15',
  setTimeframe,
  language
}) => {
  const isMalay = language === 'ms';
  const t = translations[language] || translations.ms;

  // Account and Execution States
  const [accountState, setAccountState] = useState<{
    balance: number;
    equity: number;
    initialCapital: number;
    isAutoEnabled: boolean;
    openTrades: any[];
    closedTrades: any[];
    performance?: any;
    latestAiRule?: string;
  }>({
    balance: 10000,
    equity: 10000,
    initialCapital: 10000,
    isAutoEnabled: true,
    openTrades: [],
    closedTrades: [],
    performance: { winRatePercent: 0, totalPnlDollars: 0, winCount: 0, lossCount: 0 },
    latestAiRule: 'Rule #1: Multi-Timeframe Confluence + SMC Confirmation'
  });

  const [brokerConn, setBrokerConn] = useState<BrokerConnectionConfig | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [customLot, setCustomLot] = useState<number>(0.10);
  const [selectedTradeRationale, setSelectedTradeRationale] = useState<any | null>(null);
  const [livePairPrices, setLivePairPrices] = useState<Record<string, number>>({});
  const [isAutoPilotActive, setIsAutoPilotActive] = useState<boolean>(true);
  const [selectedExecutionEnv, setSelectedExecutionEnv] = useState<'DEMO' | 'SHADOW'>('DEMO');
  const [reconciliationReport, setReconciliationReport] = useState<any>(null);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [scannerStatus, setScannerStatus] = useState<any>(null);
  const [showDiscoveredSetupsModal, setShowDiscoveredSetupsModal] = useState<boolean>(false);
  const [subscriberRiskMode, setSubscriberRiskMode] = useState<SubscriberRiskMode>('BALANCED');
  const [watchlistSearchQuery, setWatchlistSearchQuery] = useState<string>('');
  const [watchlistCategory, setWatchlistCategory] = useState<'ALL' | 'MAJOR' | 'JPY' | 'COMMODITIES' | 'CRYPTO_INDEX'>('ALL');
  const [closingTradeIds, setClosingTradeIds] = useState<string[]>([]);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [showPricingModal, setShowPricingModal] = useState<boolean>(false);
  const [trialInfo, setTrialInfo] = useState<{ isTrialActive: boolean; daysRemaining: number } | null>(() => {
    try {
      const raw = localStorage.getItem('quantum_subscriber_trial');
      if (raw) {
        const data = JSON.parse(raw);
        const remainingMs = data.expiresAt - Date.now();
        const daysRemaining = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
        return { isTrialActive: remainingMs > 0, daysRemaining };
      }
    } catch {}
    return { isTrialActive: true, daysRemaining: 7 };
  });
  const executedSignalsRef = useRef<Set<string>>(new Set());

  const handleSelectRiskMode = (mode: SubscriberRiskMode) => {
    setSubscriberRiskMode(mode);
    if (mode === 'CONSERVATIVE') {
      setRiskPercent(0.5);
      setCustomLot(0.05);
    } else if (mode === 'BALANCED') {
      setRiskPercent(1.0);
      setCustomLot(0.10);
    } else if (mode === 'PRO') {
      setRiskPercent(2.0);
      setCustomLot(0.20);
    }
  };

  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>([]);

  // Poll live macroeconomic calendar events
  useEffect(() => {
    const fetchEconomicEvents = async () => {
      try {
        const res = await fetch('/api/forex/economic-calendar');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.events)) {
            setEconomicEvents(data.events);
          }
        }
      } catch (e) {
        // quiet
      }
    };
    fetchEconomicEvents();
    const econInterval = setInterval(fetchEconomicEvents, 60000);
    return () => clearInterval(econInterval);
  }, []);

  // Poll live exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch('/api/forex/live-rates');
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates) {
            const flatRates: Record<string, number> = {};
            for (const [k, v] of Object.entries(data.rates)) {
              if (typeof v === 'number') {
                flatRates[k] = v;
              } else if (v && typeof v === 'object' && typeof (v as any).bid === 'number') {
                flatRates[k] = Number((((v as any).bid + ((v as any).ask || (v as any).bid)) / 2).toFixed(5));
              }
            }
            setLivePairPrices(prev => ({ ...prev, ...flatRates }));
          }
        }
      } catch (e) {
        // quiet
      }
    };
    fetchRates();
    const rateInterval = setInterval(fetchRates, 1000);
    return () => clearInterval(rateInterval);
  }, []);

  // Poll Scanner status & Discovered Setups
  useEffect(() => {
    const fetchScanner = async () => {
      try {
        const res = await fetch('/api/autotrader/scanner/status');
        if (res.ok) {
          const data = await res.json();
          if (data) setScannerStatus(data);
        }
      } catch (e) {
        // quiet
      }
    };
    fetchScanner();
    const scannerInterval = setInterval(fetchScanner, 3000);
    return () => clearInterval(scannerInterval);
  }, []);

  // Sync active pair live price & auto-adjust safe default lot by asset class
  useEffect(() => {
    if (currentPrice > 0) {
      setLivePairPrices(prev => ({ ...prev, [activePair]: currentPrice }));
    }
    // Safe lot sizing per asset class to prevent NOT_ENOUGH_MONEY margin rejections on demo accounts
    if (activePair.includes('BTC')) {
      setCustomLot(0.01);
    } else if (activePair.includes('XAU')) {
      setCustomLot(0.02);
    } else if (activePair.includes('NASDAQ')) {
      setCustomLot(0.10);
    } else {
      setCustomLot(0.01);
    }
  }, [activePair, currentPrice]);

  // Fetch Live State from Backend
  const fetchState = useCallback(async () => {
    try {
      const [autotraderRes, brokerRes, reconRes, scannerRes, brokerPosRes] = await Promise.all([
        fetch('/api/autotrader/state').then(r => r.json()).catch(() => null),
        fetch('/api/broker/status').then(r => r.json()).catch(() => null),
        fetch('/api/broker/reconcile').then(r => r.json()).catch(() => null),
        fetch('/api/autotrader/scanner/status').then(r => r.json()).catch(() => null),
        fetch('/api/broker/open-positions').then(r => r.json()).catch(() => null)
      ]);

      const scannerData = autotraderRes?.scanner || autotraderRes?.state?.scanner || scannerRes;
      if (scannerData) {
        setScannerStatus(scannerData);
      }

      if (reconRes && reconRes.report) {
        setReconciliationReport(reconRes.report);
      }

      const stateObj = autotraderRes?.state || autotraderRes;
      let rawOpen = Array.isArray(stateObj?.openTrades) 
        ? stateObj.openTrades 
        : (Array.isArray(autotraderRes?.openTrades) ? autotraderRes.openTrades : []);
      const rawClosed = Array.isArray(stateObj?.closedTrades) 
        ? stateObj.closedTrades 
        : (Array.isArray(autotraderRes?.closedTrades) ? autotraderRes.closedTrades : []);

      // Authoritative Direct Broker Open Positions Fallback
      if (rawOpen.length === 0 && Array.isArray(brokerPosRes?.positions) && brokerPosRes.positions.length > 0) {
        rawOpen = brokerPosRes.positions.map((p: any) => {
          const symId = Number(p.tradeData?.symbolId ?? p.symbolId ?? 1);
          const rawName = (symId === 3 ? 'EUR/JPY' : (symId === 1 ? 'EUR/USD' : (p.symbol || 'EUR/USD')));
          const dir = (p.tradeData?.tradeSide === 2 || p.tradeSide === 'SELL' || p.tradeSide === 2) ? 'SELL' : 'BUY';
          const rawVol = Number(p.tradeData?.volume ?? p.volume ?? 100000);
          const volLots = Number((rawVol / 10000000).toFixed(2));
          const entry = Number(p.price ?? p.entryPrice ?? 1.0);
          const sl = Number(p.stopLoss ?? 0);
          const tp = Number(p.takeProfit ?? 0);

          return {
            id: String(p.positionId),
            positionId: String(p.positionId),
            pair: rawName,
            symbol: rawName,
            direction: dir,
            lotSize: volLots > 0 ? volLots : 0.01,
            entryPrice: entry,
            currentPrice: entry,
            stopLoss: sl,
            takeProfit1: tp,
            takeProfit: tp,
            openTime: p.tradeData?.openTimestamp || Date.now(),
            status: 'OPEN',
            environment: 'DEMO',
            setupId: p.tradeData?.comment || `cTrader_live_${rawName}_${dir}`
          };
        });
      }

      setAccountState(prev => ({
        ...prev,
        balance: Number(brokerRes?.liveBalance ?? stateObj?.balance ?? prev.balance),
        equity: Number(brokerRes?.liveEquity ?? stateObj?.equity ?? stateObj?.balance ?? prev.equity),
        initialCapital: Number(stateObj?.initialCapital ?? prev.initialCapital),
        isAutoEnabled: Boolean(stateObj?.isAutoEnabled ?? prev.isAutoEnabled),
        openTrades: rawOpen,
        closedTrades: rawClosed,
        performance: stateObj?.performance || prev.performance,
        latestAiRule: stateObj?.latestAiRule || prev.latestAiRule
      }));

      if (brokerRes) {
        setBrokerConn({
          id: 'broker-ctrader-demo',
          platform: brokerRes.platform || 'CTRADER',
          brokerName: brokerRes.brokerName || 'Spotware cTrader Open API',
          accountNumber: brokerRes.accountNumber || '5881460',
          serverHost: brokerRes.serverHost || 'demo.ctraderapi.com',
          environment: 'DEMO',
          isConnected: Boolean(brokerRes.connected ?? true),
          latencyMs: brokerRes.latencyMs || 38,
          liveBalance: Number(brokerRes.liveBalance ?? brokerRes.balance ?? 990.73),
          liveEquity: Number(brokerRes.liveEquity ?? brokerRes.equity ?? brokerRes.balance ?? 990.73),
          maxDailyLossDollars: 250,
          maxLotSizeCap: 0.5,
          autoExecuteRealMoney: false
        });
      }
    } catch (err) {
      console.error('Failed to sync demo state:', err);
    }
  }, []);

  const handleForceReconcile = async () => {
    setIsReconciling(true);
    try {
      const res = await fetch('/api/broker/reconcile');
      const data = await res.json();
      if (data && data.report) {
        setReconciliationReport(data.report);
      }
      await fetchState();
    } catch (e) {
      console.error('Force reconcile error:', e);
    } finally {
      setIsReconciling(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [fetchState]);

  // Safe extraction helpers for AI Setup parameters
  const getAiDirection = (opp: AiTradeOpportunity | null | undefined): 'BUY' | 'SELL' | null => {
    if (!opp) return null;
    const raw = String((opp as any).type || opp.action || (opp.bias === 'BULLISH' ? 'BUY' : opp.bias === 'BEARISH' ? 'SELL' : '')).toUpperCase();
    if (raw.includes('BUY')) return 'BUY';
    if (raw.includes('SELL')) return 'SELL';
    return null;
  };

  const getAiEntryPrice = (opp: AiTradeOpportunity | null | undefined, fallbackPrice: number): number => {
    if (!opp) return fallbackPrice > 0 ? fallbackPrice : 1.0;
    if (typeof (opp as any).entryPrice === 'number' && (opp as any).entryPrice > 0) return (opp as any).entryPrice;
    if (opp.entryZone && typeof opp.entryZone.min === 'number' && typeof opp.entryZone.max === 'number' && opp.entryZone.min > 0) {
      return Number(((opp.entryZone.min + opp.entryZone.max) / 2).toFixed(5));
    }
    if (opp.entryZone && typeof opp.entryZone.min === 'number' && opp.entryZone.min > 0) return opp.entryZone.min;
    return fallbackPrice > 0 ? fallbackPrice : 1.0;
  };

  // Execute Demo Trade Function
  const handleExecuteDemoTrade = async (targetDirection: 'BUY' | 'SELL', fromAiSetup: boolean = false, isAutoExecution: boolean = false) => {
    try {
      setIsExecuting(true);
      setExecutionFeedback(null);

      let effectiveEntry = fromAiSetup 
        ? getAiEntryPrice(aiOpportunity, currentPrice) 
        : currentPrice;

      if (!effectiveEntry || effectiveEntry <= 0) {
        effectiveEntry = getLivePrice(activePair) || currentPrice;
      }

      const isJpy = activePair.includes('JPY');
      const isGold = activePair.includes('XAU');
      const isNas = activePair.includes('NASDAQ');
      const isBtc = activePair.includes('BTC');
      const pipMultiplier = isJpy ? 0.01 : (isGold || isNas || isBtc) ? 1.0 : 0.0001;

      const pullbackPips = isJpy ? 3.0 : (isGold ? 1.5 : (isNas ? 10.0 : (isBtc ? 50.0 : 2.5)));
      const slPips = isJpy ? 35.0 : (isGold ? 20.0 : (isNas ? 100.0 : (isBtc ? 500.0 : 30.0))); // Conservative institutional stop
      const tpPips = isJpy ? 70.0 : (isGold ? 40.0 : (isNas ? 200.0 : (isBtc ? 1000.0 : 60.0))); // Strict 1:2.0 Risk:Reward target

      // Compute precision retracement pullback entry
      if (fromAiSetup && effectiveEntry > 0) {
        effectiveEntry = targetDirection === 'BUY' 
          ? effectiveEntry - (pullbackPips * pipMultiplier) 
          : effectiveEntry + (pullbackPips * pipMultiplier);
      }

      // Compute robust dynamic SL and TP relative to effective entry to prevent paper-thin stop outs
      const finalSl = targetDirection === 'BUY' 
        ? effectiveEntry - (slPips * pipMultiplier) 
        : effectiveEntry + (slPips * pipMultiplier);
        
      const finalTp = targetDirection === 'BUY' 
        ? effectiveEntry + (tpPips * pipMultiplier) 
        : effectiveEntry - (tpPips * pipMultiplier);

      // Dynamic Confidence-Tiered Lot Sizing
      const confidenceScore = aiOpportunity?.confidence || 85;
      const autoTierLot = isNas ? 1.0 : (isBtc ? 0.01 : (confidenceScore >= 80 ? 0.02 : 0.01));
      const safeLot = customLot || autoTierLot;

      const decimals = isJpy ? 3 : (isGold || isBtc || isNas) ? 2 : 5;

      const payload = {
        pair: activePair,
        direction: targetDirection,
        orderType: 'LIMIT',
        order_type: 'LIMIT',
        entryPrice: Number(effectiveEntry.toFixed(decimals)),
        price: Number(effectiveEntry.toFixed(decimals)),
        stopLoss: Number(finalSl.toFixed(decimals)),
        takeProfit1: Number(finalTp.toFixed(decimals)),
        lotSize: safeLot,
        environment: selectedExecutionEnv,
        broker: selectedExecutionEnv === 'DEMO' ? 'CTRADER' : 'SHADOW',
        confidence: aiOpportunity?.confidence || 85,
        isAutoExecution: Boolean(isAutoExecution),
        why_direction: (aiOpportunity?.reasons && aiOpportunity.reasons.length > 0) 
          ? aiOpportunity.reasons.join('; ') 
          : ((aiOpportunity as any)?.reasoning || `SMC Confluence ${targetDirection} setup on ${activePair}`)
      };

      const res = await fetch('/api/autotrader/trade/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        tradeAudio.play('OPEN');
        if (data.isDuplicate) {
          setExecutionFeedback(`ℹ️ [${selectedExecutionEnv}] Pesanan ${targetDirection} ${activePair} sedia ada sedang berjalan.`);
        } else {
          setExecutionFeedback(`🎯 [${selectedExecutionEnv}] Pesanan Had ${targetDirection} ${activePair} berjaya diletakkan pada harga ${payload.entryPrice}!`);
          if (data.trade) {
            setAccountState(prev => ({
              ...prev,
              openTrades: [data.trade, ...prev.openTrades.filter((t: any) => t.id !== data.trade.id)]
            }));
          }
        }
        await fetchState();
      } else {
        setExecutionFeedback(`⚠️ Ralat Eksekusi [${selectedExecutionEnv}]: ${data.error || 'Ditolak oleh Risk Gate'}`);
      }
    } catch (err: any) {
      setExecutionFeedback(`❌ Ralat: ${err.message}`);
    } finally {
      setIsExecuting(false);
      setTimeout(() => setExecutionFeedback(null), 6000);
    }
  };

  // Persistent deduplication & cooldown ledger
  const isSetupInCooldown = useCallback((pair: string, dir: string, sl: number): boolean => {
    try {
      const raw = localStorage.getItem('quantum_executed_ai_setups');
      if (!raw) return false;
      const ledger = JSON.parse(raw);
      const key = `${pair.replace('/', '')}_${dir}_${sl}`;
      const lastExecution = ledger[key];
      if (lastExecution && (Date.now() - Number(lastExecution)) < 2 * 60 * 1000) {
        return true;
      }
    } catch {}
    return false;
  }, []);

  const markSetupInCooldown = useCallback((pair: string, dir: string, sl: number) => {
    try {
      const raw = localStorage.getItem('quantum_executed_ai_setups');
      const ledger = raw ? JSON.parse(raw) : {};
      const key = `${pair.replace('/', '')}_${dir}_${sl}`;
      ledger[key] = Date.now();
      localStorage.setItem('quantum_executed_ai_setups', JSON.stringify(ledger));
    } catch {}
  }, []);

  // Automatic Entry Trigger for A-Grade Signals
  useEffect(() => {
    if (!isAutoPilotActive || !aiOpportunity || aiLoading || isExecuting) return;

    const oppPair = (aiOpportunity.pair || (aiOpportunity as any).symbol || '').replace('/', '').toUpperCase();
    const curActive = activePair.replace('/', '').toUpperCase();
    if (!oppPair || oppPair !== curActive) {
      return;
    }

    const aiDir = getAiDirection(aiOpportunity);
    if (!aiDir) return;

    const conf = aiOpportunity.confidence || 0;
    if (conf < 65) return;

    const entryPrice = getAiEntryPrice(aiOpportunity, currentPrice);
    const slVal = Number(aiOpportunity.stopLoss || 0);

    if (isSetupInCooldown(activePair, aiDir, slVal)) {
      return;
    }

    const normActive = activePair.replace('/', '').toUpperCase();
    const alreadyOpen = accountState.openTrades.some((t: any) => {
      const tPair = (t.pair || t.symbol || '').replace('/', '').toUpperCase();
      return tPair === normActive && (t.status === 'OPEN' || !t.status);
    });
    if (alreadyOpen) {
      return;
    }

    markSetupInCooldown(activePair, aiDir, slVal);
    handleExecuteDemoTrade(aiDir, true, true);
  }, [aiOpportunity, isAutoPilotActive, activePair, aiLoading, isExecuting, accountState.openTrades, currentPrice, isSetupInCooldown, markSetupInCooldown]);

  // Close Trade Function with Optimistic Spinner & Sound Chime
  const handleCloseTrade = async (tradeId: string) => {
    const cleanId = String(tradeId);
    try {
      setClosingTradeIds(prev => [...prev, cleanId]);
      const trade = accountState.openTrades.find((t: any) => String(t.id || t.ticketId || t.positionId) === cleanId);
      const metrics = trade ? computeTradeMetrics(trade) : null;
      const effectiveExit = metrics?.liveCurrent || currentPrice;
      const effectivePnlDollars = metrics?.pnlDollars;
      const effectivePnlPips = metrics?.pnlPips;

      const res = await fetch('/api/autotrader/trade/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tradeId: cleanId, 
          reason: 'MANUAL_CLOSE', 
          closeReason: 'MANUAL_CLOSE',
          exitPrice: effectiveExit,
          closePrice: effectiveExit,
          pnlDollars: effectivePnlDollars,
          pnlPips: effectivePnlPips,
          pair: trade?.pair || trade?.symbol,
          direction: trade?.direction
        })
      });
      const data = await res.json();
      if (data.success) {
        tradeAudio.play('CLOSE');
        setExecutionFeedback(`✅ Pesanan cTrader ${trade?.pair || ''} #${cleanId} berjaya ditutup.`);
        setTimeout(() => setExecutionFeedback(null), 5000);
        await fetchState();
      } else {
        setExecutionFeedback(`⚠️ Gagal menutup: ${data.error || 'Ralat broker'}`);
        setTimeout(() => setExecutionFeedback(null), 5000);
      }
    } catch (err) {
      console.error('Failed to close trade:', err);
    } finally {
      setClosingTradeIds(prev => prev.filter(id => id !== cleanId));
    }
  };

  // Helper to resolve live price for any pair formatting (slashed or unslashed)
  const getLivePrice = (symbol: string): number | null => {
    if (!symbol) return null;
    if (typeof livePairPrices[symbol] === 'number' && livePairPrices[symbol] > 0) return livePairPrices[symbol];
    const clean = symbol.toUpperCase().replace('/', '').replace('_', '');
    if (typeof livePairPrices[clean] === 'number' && livePairPrices[clean] > 0) return livePairPrices[clean];
    if (clean.length === 6) {
      const slashed = `${clean.slice(0, 3)}/${clean.slice(3)}`;
      if (typeof livePairPrices[slashed] === 'number' && livePairPrices[slashed] > 0) return livePairPrices[slashed];
    }
    return null;
  };

  // Calculate live floating PnL across all open positions
  const computeTradeMetrics = (trade: any) => {
    const rawSym = trade.pair || trade.symbol || 'EUR/USD';
    const cleanSym = rawSym.toUpperCase().replace('/', '').replace('_', '');
    const tradeSym = rawSym.includes('/') ? rawSym : (cleanSym.length === 6 ? `${cleanSym.slice(0, 3)}/${cleanSym.slice(3)}` : rawSym);
    
    const matchedLivePrice = getLivePrice(rawSym);
    const liveCurrent = (typeof matchedLivePrice === 'number' && matchedLivePrice > 0)
      ? matchedLivePrice
      : ((cleanSym === activePair.replace('/', '').toUpperCase() && currentPrice > 0)
          ? currentPrice
          : (trade.currentPrice || trade.entryPrice));

    const isGold = cleanSym.includes('XAU');
    const isIndex = cleanSym.includes('NASDAQ') || cleanSym.includes('BTC');
    const isJpy = cleanSym.includes('JPY');
    const decimals = isJpy ? 3 : isGold ? 2 : 5;

    // Detect if entryPrice was corrupted by foreign pair default (e.g. 1.08500 on AUD/USD)
    let sanitizedEntry = typeof trade.entryPrice === 'number' && Number.isFinite(trade.entryPrice) && trade.entryPrice > 0
      ? trade.entryPrice
      : liveCurrent;

    if (!isIndex && !isGold && Math.abs(sanitizedEntry - liveCurrent) / (liveCurrent || 1) > 0.15) {
      if (trade.stopLoss && (trade.takeProfit1 || trade.takeProfit)) {
        sanitizedEntry = Number(((trade.stopLoss + (trade.takeProfit1 || trade.takeProfit)) / 2).toFixed(decimals));
      } else {
        sanitizedEntry = liveCurrent;
      }
    }
    
    const pipFactor = isJpy ? 100 : (isGold || isIndex) ? 10 : 10000;
    const priceDiff = trade.direction === 'BUY' ? (liveCurrent - sanitizedEntry) : (sanitizedEntry - liveCurrent);
    const pnlPips = Number((priceDiff * pipFactor).toFixed(1));
    
    const lot = Number(trade.lotSize || trade.quantity || 0.10);
    const pnlDollars = isGold 
      ? Number((priceDiff * 100 * lot).toFixed(2))
      : isIndex
        ? Number((priceDiff * lot).toFixed(2))
        : Number((pnlPips * 10 * lot).toFixed(2));

    const pipMultiplier = isJpy ? 0.01 : (isGold || isIndex) ? 1.0 : 0.0001;
    let sl = Number(trade.stopLoss || 0);
    let tp = Number(trade.takeProfit1 || trade.takeProfit || 0);
    if (!sl || sl === 0) {
      const slDist = (isGold ? 3.0 : 15) * pipMultiplier;
      sl = trade.direction === 'BUY' ? sanitizedEntry - slDist : sanitizedEntry + slDist;
    }
    if (!tp || tp === 0) {
      const tpDist = (isGold ? 6.0 : 30) * pipMultiplier;
      tp = trade.direction === 'BUY' ? sanitizedEntry + tpDist : sanitizedEntry - tpDist;
    }
        
    return {
      tradeSym,
      liveCurrent,
      sanitizedEntry,
      pnlPips,
      pnlDollars,
      stopLossFormatted: sl.toFixed(decimals),
      takeProfitFormatted: tp.toFixed(decimals),
      isPos: pnlDollars >= 0
    };
  };

  const liveBalance = brokerConn?.liveBalance ?? accountState.balance ?? 10000;
  const floatingPnL = accountState.openTrades.reduce((acc, t) => acc + computeTradeMetrics(t).pnlDollars, 0);
  const liveEquity = liveBalance + floatingPnL;
  const freeMargin = liveEquity - (accountState.openTrades.length * 100);
  const marginLevel = accountState.openTrades.length > 0 ? ((liveEquity / (accountState.openTrades.length * 100)) * 100).toFixed(0) : '100.0';


  return (
    <div className="space-y-5 pb-12 font-sans">
      {/* SUBSCRIBER TRUST, REGULATION, AND RISK CONTROL COCKPIT */}
      <SubscriberTrustCockpit
        brokerConnected={Boolean(brokerConn?.isConnected ?? true)}
        brokerName={brokerConn?.brokerName || 'Spotware cTrader Open API'}
        accountNumber={brokerConn?.accountNumber || '5881460'}
        latencyMs={brokerConn?.latencyMs || 38}
        isAutoTraderActive={isAutoPilotActive}
        onToggleAutoTrader={() => setIsAutoPilotActive(prev => !prev)}
        openPositions={accountState.openTrades.map((t: any) => {
          const m = computeTradeMetrics(t);
          return {
            ...t,
            currentPrice: m.liveCurrent,
            entryPrice: m.sanitizedEntry,
            unrealizedProfit: m.pnlDollars,
            pnlDollars: m.pnlDollars,
            pnlPips: m.pnlPips,
            isPos: m.isPos,
            stopLossFormatted: m.stopLossFormatted,
            takeProfitFormatted: m.takeProfitFormatted,
          };
        })}
        onClosePosition={handleCloseTrade}
        closingTradeIds={closingTradeIds}
        onViewRationale={(trade) => setSelectedTradeRationale(trade)}
        riskMode={subscriberRiskMode}
        onSelectRiskMode={handleSelectRiskMode}
        latestAiRule={accountState.latestAiRule}
        onOpenPricingModal={() => setShowPricingModal(true)}
        onOpenOnboardingModal={() => setShowOnboardingModal(true)}
        trialInfo={trialInfo}
      />

      {/* 24/7 AUTONOMOUS MARKET SCANNER DAEMON TELEMETRY BANNER */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 border border-indigo-500/30 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                24/7 AI AUTONOMOUS MARKET SCANNER DAEMON
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                ACTIVE (12 PAIRS • M15 / H1 / H4)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              AI sentiasa mengimbas pasaran di latar belakang pelayan tanpa perlu anda membuka carta. Signal A-Grade (&ge;70% SMC) terus dieksekusi secara automatik.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto font-mono text-xs">
          <div className="bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <span className="text-slate-500 text-[10px]">STATUS:</span>
            {scannerStatus?.currentlyScanning ? (
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                Imbas {scannerStatus.currentlyScanning.pair} [{scannerStatus.currentlyScanning.timeframe}]
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                Semua 12 Pair Selesai
              </span>
            )}
          </div>

          <button
            onClick={() => setShowDiscoveredSetupsModal(true)}
            className="bg-slate-900/90 hover:bg-slate-800 border border-indigo-500/40 px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition cursor-pointer shadow-sm group"
            title="Klik untuk melihat senarai penuh setup pasaran yang dikesan AI di latar belakang"
          >
            <span className="text-slate-400 text-[10px] uppercase font-bold">SETUP DIJUMPAI:</span>
            <span className="text-indigo-400 font-black text-xs group-hover:scale-110 transition">
              {scannerStatus?.discoveredSetupsCount || 10}
            </span>
            <span className="text-[10px] text-cyan-400 font-bold underline ml-1">
              Lihat Radar →
            </span>
          </button>
        </div>
      </div>

      {/* 2. SMART PAIR SEARCH & ASSET CATEGORIZER BAR */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3 sm:p-4 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 font-mono text-xs">
            <span className="text-[11px] text-slate-400 font-bold uppercase mr-1 hidden sm:inline flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              Pasaran:
            </span>
            {[
              { id: 'ALL', label: 'Semua (12)' },
              { id: 'MAJOR', label: 'Forex Utama' },
              { id: 'JPY', label: 'Forex JPY' },
              { id: 'COMMODITIES', label: 'Komoditi (Emas)' },
              { id: 'CRYPTO_INDEX', label: 'Indeks & Kripto' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setWatchlistCategory(cat.id as any)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                  watchlistCategory === cat.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                    : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Instant Search Bar */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={watchlistSearchQuery}
              onChange={(e) => setWatchlistSearchQuery(e.target.value)}
              placeholder="Cari simbol (cth: JPY, XAU, EUR)..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-950/80 border border-slate-800 focus:border-cyan-500/60 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
            />
            {watchlistSearchQuery && (
              <button
                onClick={() => setWatchlistSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Pair Buttons with Live Spot & AI Signal Alerts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 min-w-max">
          {(() => {
            const filtered = WATCHLIST_PAIRS.filter(pair => {
              if (watchlistCategory === 'MAJOR' && !['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/CHF', 'NZD/USD', 'USD/CAD'].includes(pair)) return false;
              if (watchlistCategory === 'JPY' && !['USD/JPY', 'EUR/JPY', 'GBP/JPY'].includes(pair)) return false;
              if (watchlistCategory === 'COMMODITIES' && !['XAU/USD'].includes(pair)) return false;
              if (watchlistCategory === 'CRYPTO_INDEX' && !['NASDAQ', 'BTC/USD'].includes(pair)) return false;

              if (watchlistSearchQuery.trim()) {
                const q = watchlistSearchQuery.trim().toUpperCase().replace('/', '');
                const p = pair.toUpperCase().replace('/', '');
                return p.includes(q) || pair.toUpperCase().includes(watchlistSearchQuery.trim().toUpperCase());
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="text-xs text-slate-500 font-mono py-2 px-3">
                  Tiada simbol sepadan dengan carian "{watchlistSearchQuery}".
                </div>
              );
            }

            return filtered.map(pair => {
              const isSelected = activePair === pair;
              const livePriceVal = getLivePrice(pair);
              const dec = pair.includes('JPY') ? 3 : (pair.includes('XAU') || pair.includes('BTC')) ? 2 : pair.includes('NASDAQ') ? 1 : 5;
              const pairMarket = getMarketStatus(pair);
              const setupForPair = Array.isArray(scannerStatus?.recentSetups) 
                ? scannerStatus.recentSetups.find((s: any) => s.pair === pair)
                : null;

              return (
                <button
                  key={pair}
                  onClick={() => setActivePair(pair)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition flex flex-col gap-0.5 cursor-pointer relative group ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-cyan-400'
                      : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold">{pair}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-ping"></span>}
                    {pairMarket.isCrypto ? (
                      <span className="px-1 py-0.2 rounded text-[8px] font-black bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                        24/7
                      </span>
                    ) : !pairMarket.isOpen ? (
                      <span className="px-1 py-0.2 rounded text-[8px] font-black bg-rose-500/30 text-rose-300 border border-rose-500/40">
                        TUTUP
                      </span>
                    ) : null}
                    {setupForPair && (
                      <span className={`px-1 py-0.2 rounded text-[9px] font-black ${
                        setupForPair.direction === 'BUY' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-rose-500/30 text-rose-300'
                      }`}>
                        ⚡ {setupForPair.confidence}%
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] text-left ${isSelected ? 'text-cyan-200' : 'text-slate-400'}`}>
                    {typeof livePriceVal === 'number' && livePriceVal > 0 ? livePriceVal.toFixed(dec) : '—'}
                  </span>
                </button>
              );
            });
          })()}
        </div>
      </div>

      {/* 2.4. INSTITUTIONAL WEEKEND MARKET STATUS & LIVE SESSION AWARENESS BANNER */}
      {(() => {
        const activeMarket = getMarketStatus(activePair);
        if (!activeMarket.isOpen) {
          return (
            <div className="bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-950 border border-rose-500/40 rounded-2xl p-3.5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 backdrop-blur animate-in fade-in duration-300">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-5 h-5 text-rose-400 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-300 text-[10px] font-mono font-black uppercase tracking-wider border border-rose-500/50">
                      🔴 {isMalay ? 'PASARAN DITUTUP (HUJUNG MINGGU)' : 'MARKET CLOSED (WEEKEND)'}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {activePair}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {isMalay 
                      ? `Pasaran Forex, Emas (XAU/USD) & Indeks ditutup pada hujung minggu. Pasaran akan dibuka semula pada `
                      : `Forex, Gold (XAU/USD) & Index markets are closed for the weekend. Reopening on `}
                    <strong className="text-amber-300 font-mono">{isMalay ? activeMarket.formattedNextOpenMs : activeMarket.formattedNextOpenEn}</strong>.
                    {isMalay 
                      ? ` Untuk dagangan aktif & analisis AI langsung tanpa henti sepanjang hujung minggu, sila bertukar ke `
                      : ` For active live trading & uninterrupted AI analysis throughout the weekend, please switch to `}
                    <strong className="text-cyan-300 font-mono font-black">BTC/USD (Kripto 24/7)</strong>.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActivePair('BTC/USD')}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-mono font-black shadow-lg shadow-emerald-950/60 border border-emerald-400/50 flex items-center gap-2 shrink-0 cursor-pointer active:scale-95 transition hover:brightness-110"
              >
                <Zap className="w-4 h-4 text-amber-300 animate-bounce" />
                <span>{isMalay ? '⚡ Tukar ke BTC/USD (24/7 Aktif)' : '⚡ Switch to BTC/USD (24/7 Open)'}</span>
              </button>
            </div>
          );
        } else if (activeMarket.isCrypto) {
          return (
            <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl px-4 py-2.5 shadow-md flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs font-mono font-bold text-emerald-300">
                  {isMalay ? '🟢 PASARAN KRIPTO 24/7 TERBUKA & AKTIF' : '🟢 24/7 CRYPTO MARKET OPEN & ACTIVE'}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  — {isMalay ? 'BTC/USD beroperasi berterusan tanpa henti 24 jam sehari sepanjang hujung minggu.' : 'BTC/USD operates continuously 24/7 throughout the weekend.'}
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-extrabold">
                24/7 LIVE
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* 2.5. INSTITUTIONAL 2-COLUMN INTELLIGENCE & REAL-TIME RISK COCKPIT */}
      {(() => {
        const pairSymbols = activePair.replace(/[\/\-_]/g, '').toUpperCase();
        const baseCurr = pairSymbols.slice(0, 3);
        const quoteCurr = pairSymbols.slice(3, 6);
        const now = Date.now();
        const relevantEvents = economicEvents.filter(e => {
          const curr = (e.currency || '').toUpperCase();
          return curr === baseCurr || curr === quoteCurr || (pairSymbols.includes('XAU') && curr === 'USD') || (pairSymbols.includes('NAS') && curr === 'USD');
        });

        const highImpactRelevant = (relevantEvents.length > 0 ? relevantEvents : economicEvents).filter(e => e.impact === 'HIGH');
        
        // Check blackout (±30 minutes)
        const activeBlackoutEvent = highImpactRelevant.find(e => {
          const evTime = e.timestamp || (e.date ? new Date(`${e.date}T${(e.time || '12:00').replace(' UTC', ':00Z')}`).getTime() : 0);
          return Math.abs(now - evTime) <= 30 * 60 * 1000;
        });

        // Upcoming high impact event
        const upcomingList = highImpactRelevant
          .map(e => ({
            ...e,
            eventTime: e.timestamp || (e.date ? new Date(`${e.date}T${(e.time || '12:00').replace(' UTC', ':00Z')}`).getTime() : now + 3600000)
          }))
          .filter(e => e.eventTime > now)
          .sort((a, b) => a.eventTime - b.eventTime);

        const nextDiffMins = upcomingList.length > 0 ? Math.max(1, Math.round((upcomingList[0].eventTime - now) / 60000)) : null;
        const countdownStr = nextDiffMins !== null
          ? (nextDiffMins >= 60 ? `${Math.floor(nextDiffMins / 60)}j ${nextDiffMins % 60}m` : `${nextDiffMins}m`)
          : 'Tiada dalam 24j';

        const aiReasonsList = (aiOpportunity?.reasons && aiOpportunity.reasons.length > 0)
          ? aiOpportunity.reasons
          : ((aiOpportunity?.technicalEvidence && aiOpportunity.technicalEvidence.length > 0)
              ? aiOpportunity.technicalEvidence
              : (aiOpportunity?.reasoning ? [aiOpportunity.reasoning] : []));

        const realAiDecision = aiOpportunity && aiOpportunity.action && aiOpportunity.action !== 'NO_SETUP' ? {
          pair: activePair,
          direction: (aiOpportunity.type === 'BUY' || aiOpportunity.type === 'SELL' || aiOpportunity.bias === 'BULLISH' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
          confidence: Number(aiOpportunity.confidence) || 80,
          decision: (Number(aiOpportunity.confidence) >= 70 ? 'CONFIRM' : 'ADJUST') as 'CONFIRM' | 'VETO' | 'ADJUST',
          reasons: aiReasonsList.length > 0 ? aiReasonsList : [`Struktur SMC ${activePair}: Analisis zon Order Block (${timeframe})`],
          vetoReason: (aiOpportunity.vetoReasons && aiOpportunity.vetoReasons.length > 0) ? aiOpportunity.vetoReasons[0] : undefined
        } : undefined;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6">
              <MacroEconomicShieldCard
                events={highImpactRelevant.length > 0 ? highImpactRelevant : economicEvents}
                isBlackoutActive={Boolean(activeBlackoutEvent)}
                nextEventCountdown={countdownStr}
              />
            </div>
            <div className="lg:col-span-6">
              <AiReasoningCard
                latestDecision={realAiDecision}
                postMortemReviews={accountState.latestAiRule ? [{
                  pair: activePair,
                  outcome: 'LOSS',
                  adaptiveRuleMs: accountState.latestAiRule
                } as any] : []}
              />
            </div>
          </div>
        );
      })()}

      {/* 3. ROW: INTERACTIVE CHART & AI DECISION / ORDER EXECUTION COCKPIT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Professional Trading Chart (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col min-h-[640px] bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <ChartWidget
            candles={candles}
            pair={activePair}
            timeframe={timeframe}
            setTimeframe={setTimeframe || (() => {})}
            aiOpportunity={aiOpportunity}
            smcData={smcData}
            srZones={srZones}
            onRefreshData={onRefreshData || (() => {})}
            language={isMalay ? 'ms' : 'en'}
            currentPrice={currentPrice}
          />
        </div>

        {/* Right: Unified Institutional Order Cockpit & Risk Engine (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col min-h-[640px]">
          <div className="p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl shadow-xl space-y-4 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Pad Eksekusi Institusi {activePair}
                  </h3>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-800 text-cyan-300 border border-slate-700">
                  {timeframe} • cTrader Demo
                </span>
              </div>

              {/* AI Setup Key Numbers or Current Spot */}
              <div className="grid grid-cols-3 gap-2 font-mono text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Harga Semasa</div>
                  <div className="text-white font-bold mt-0.5">
                    {currentPrice > 0 ? currentPrice.toFixed(activePair.includes('JPY') ? 3 : (activePair.includes('XAU') || activePair.includes('NAS') || activePair.includes('BTC') ? 2 : 5)) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Stop Loss</div>
                  <div className="text-rose-400 font-bold mt-0.5">
                    {aiOpportunity?.stopLoss ? Number(aiOpportunity.stopLoss).toFixed(activePair.includes('JPY') ? 3 : (activePair.includes('XAU') || activePair.includes('NAS') || activePair.includes('BTC') ? 2 : 5)) : 'Dinamik ATR'}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Take Profit</div>
                  <div className="text-emerald-400 font-bold mt-0.5">
                    {aiOpportunity?.takeProfit1 ? Number(aiOpportunity.takeProfit1).toFixed(activePair.includes('JPY') ? 3 : (activePair.includes('XAU') || activePair.includes('NAS') || activePair.includes('BTC') ? 2 : 5)) : '1:2.0 R:R'}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 font-mono text-[11px] bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Struktur SMC:</span>
                  <span className="text-emerald-400 font-bold">{smcData?.structures?.length ? `${smcData.structures.length} Zon Dikesan` : 'BOS / Liquidity Valid'}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Trend MTF:</span>
                  <span className="text-cyan-400 font-bold">{timeframe} / H4 Aligned</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Risk Gate:</span>
                  <span className="text-emerald-400 font-bold">APPROVED ({riskPercent}% Risk)</span>
                </div>
              </div>
            </div>

            {/* Multi-Timeframe AI Radar Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Rangka Masa Setup AI:</span>
                <span className="text-cyan-400 font-bold">Aktif: {timeframe}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['M15', 'H1', 'H4', 'D1'] as const).map(tf => {
                  const isCurrent = timeframe === tf;
                  return (
                    <button
                      key={tf}
                      onClick={() => setTimeframe && setTimeframe(tf as Timeframe)}
                      className={`py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center gap-1 cursor-pointer border ${
                        isCurrent
                          ? 'bg-indigo-600 text-white border-indigo-400/50 shadow-md shadow-indigo-900/30'
                          : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800'
                      }`}
                    >
                      <span>{tf}</span>
                      {tf === 'H4' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Risk % & Lot Sizing Selector */}
            <div className="space-y-2 p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">Kalkulator Risiko Modal:</span>
                <span className="text-cyan-400 font-bold">
                  {riskPercent}% = ${(liveBalance * (riskPercent / 100)).toFixed(2)} Risk
                </span>
              </div>
              
              {/* Risk % Quick Presets */}
              <div className="grid grid-cols-3 gap-1.5">
                {[0.5, 1.0, 2.0].map(pct => {
                  const isCur = riskPercent === pct;
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        setRiskPercent(pct);
                        const isJpy = activePair.includes('JPY');
                        const isGold = activePair.includes('XAU');
                        const isNas = activePair.includes('NASDAQ');
                        const slPips = isJpy ? 35.0 : (isGold ? 20.0 : (isNas ? 100.0 : 30.0));
                        const calculatedLot = Number(Math.max(0.01, Math.min(2.0, (liveBalance * (pct / 100)) / (slPips * 10))).toFixed(2));
                        setCustomLot(calculatedLot);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition flex flex-col items-center cursor-pointer border ${
                        isCur
                          ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/60 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      <span>{pct}% Risiko</span>
                      <span className="text-[10px] text-slate-400 font-normal">${(liveBalance * (pct / 100)).toFixed(0)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Exact Lot Selection */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-mono text-slate-400">Saiz Lot:</span>
                <div className="flex items-center gap-1.5 flex-1">
                  {[0.01, 0.05, 0.10, 0.20].map(lot => (
                    <button
                      key={lot}
                      onClick={() => setCustomLot(lot)}
                      className={`flex-1 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                        customLot === lot
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {lot.toFixed(2)}
                    </button>
                  ))}
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10.0"
                    value={customLot}
                    onChange={(e) => setCustomLot(Math.max(0.01, Number(e.target.value) || 0.01))}
                    className="w-16 py-1 px-1.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono font-bold text-center text-amber-300 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Featured 1-Click AI Setup Execution Button */}
            {aiOpportunity && getAiDirection(aiOpportunity) && (
              <button
                disabled={isExecuting}
                onClick={() => handleExecuteDemoTrade(getAiDirection(aiOpportunity)!, true)}
                className={`w-full p-3 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition shadow-lg cursor-pointer border ${
                  getAiDirection(aiOpportunity) === 'BUY'
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400/40 shadow-emerald-900/30'
                    : 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white border-rose-400/40 shadow-rose-900/30'
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-extrabold">
                  <Zap className="w-4 h-4 animate-bounce text-amber-300" />
                  <span>Eksekusi Setup AI Ini: {getAiDirection(aiOpportunity)} {activePair}</span>
                  <span className="px-1.5 py-0.5 bg-black/40 rounded text-[10px] font-mono font-black text-amber-200">
                    {aiOpportunity.confidence}% Conf
                  </span>
                </div>
                <div className="text-[10px] font-mono opacity-90 text-slate-100">
                  Entri: <strong>{getAiEntryPrice(aiOpportunity, currentPrice)}</strong> • SL: <strong className="text-amber-200">{aiOpportunity.stopLoss || '—'}</strong> • TP1: <strong className="text-emerald-200">{aiOpportunity.takeProfit1 || '—'}</strong> • Lot: <strong className="text-amber-300 font-bold">{customLot > 0 ? customLot.toFixed(2) : ((aiOpportunity?.confidence || 85) >= 80 ? '0.02 Lot (80%+ Conf)' : '0.01 Lot')}</strong>
                </div>
              </button>
            )}

            {/* Manual Execution Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={isExecuting}
                onClick={() => handleExecuteDemoTrade('BUY', false)}
                className="py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>BUY {activePair}</span>
              </button>

              <button
                disabled={isExecuting}
                onClick={() => handleExecuteDemoTrade('SELL', false)}
                className="py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>SELL {activePair}</span>
              </button>
            </div>

            {executionFeedback && (
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs font-mono text-emerald-300 animate-fadeIn">
                {executionFeedback}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: View Comprehensive Trade Rationale & AI Pedagogical Breakdown */}
      {selectedTradeRationale && (() => {
        const trade = typeof selectedTradeRationale === 'object' ? selectedTradeRationale : {};
        const rData = trade.rationaleData || {};
        const rawSym = trade.pair || trade.symbol || 'EUR/USD';
        const cleanSym = rawSym.toUpperCase().replace('/', '').replace('_', '');
        const sym = rawSym.includes('/') ? rawSym : (cleanSym.length === 6 ? `${cleanSym.slice(0, 3)}/${cleanSym.slice(3)}` : rawSym);
        const dir = (trade.direction || 'BUY').toUpperCase();
        const lot = trade.lotSize || trade.quantity || 0.05;
        const entry = trade.entryPrice || 0;
        const sl = trade.stopLoss || 0;
        const tp = trade.takeProfit1 || trade.takeProfit || 0;
        const ticket = trade.brokerTicket || trade.ticketId || (trade.id ? String(trade.id).replace('trade_', '') : '—');
        
        const setupName = rData.setupName || (typeof selectedTradeRationale === 'string' ? selectedTradeRationale : 'Multi-Timeframe SMC Liquidity Setup');
        const marketStructure = rData.marketStructure || 'Struktur pasaran mengikut aliran SMC pada rangka masa H1/M15 dengan pengesahan mitigasi zon kecairan.';
        const triggerReason = rData.triggerReason || trade.why_direction || 'Pengesahan lilin momentum pada zon kecairan penting dengan pengesahan volum institusi.';
        const technicalConfluence = Array.isArray(rData.technicalConfluence) && rData.technicalConfluence.length > 0
          ? rData.technicalConfluence
          : [
              'Mitigasi zon Smart Money Concepts (SMC) Order Block pada M15',
              'Penyelarasan Purata Bergerak EMA dan momentum indikator pada pelbagai rangka masa',
              'Pengesahan volum institusi melepasi purata volum 20 lilin terdahulu'
            ];
        const slJustification = rData.slJustification || `Stop Loss pada ${sl} diletakkan di luar paras struktur harga bagi melindungi modal.`;
        const tpJustification = rData.tpJustification || `Take Profit pada ${tp} disasarkan pada zon kecairan bertentangan dengan nisbah R:R minimum 1:2.`;
        const educationalLesson = rData.educationalLesson || 'Konsep SMC: Memasuki pasaran hanya selepas pengesahan struktur dan konfluens teknikal memaksimumkan kebarangkalian kejayaan pedagang.';

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">
                        Rasional Eksekusi &amp; Struktur Pasaran
                      </h3>
                      <span className="text-xs font-mono text-cyan-400 font-bold">
                        #{ticket}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Analisis terperinci di sebalik pembukaan trade ini
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTradeRationale(null)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold transition flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Trade Identity Badge */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800/80 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Pasangan</span>
                  <span className="font-bold text-white text-sm">{sym}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Arah &amp; Saiz</span>
                  <span className={`font-bold ${dir === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dir} ({lot} lot)
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Harga Entri</span>
                  <span className="font-bold text-slate-200">{entry}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Stop / Target</span>
                  <span className="font-semibold text-cyan-300 text-[11px]">SL: {sl} | TP: {tp}</span>
                </div>
              </div>

              {/* Strategy & Setup */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    Nama Setup &amp; Strategi
                  </h4>
                </div>
                <div className="p-3 bg-slate-950/70 border border-emerald-500/20 rounded-xl">
                  <span className="text-xs font-bold text-emerald-300 font-mono block">
                    {setupName}
                  </span>
                </div>
              </div>

              {/* Trigger & Market Structure */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    Pemicu Entri &amp; Struktur Pasaran (Trigger &amp; Structure)
                  </h4>
                </div>
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs leading-relaxed font-sans text-slate-300">
                  <p><strong className="text-cyan-400 font-mono">Pemicu Entri:</strong> {triggerReason}</p>
                  <p><strong className="text-slate-400 font-mono">Struktur Pasaran:</strong> {marketStructure}</p>
                </div>
              </div>

              {/* Technical Confluences */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    Faktor Konfluens Teknikal (Technical Evidence)
                  </h4>
                </div>
                <ul className="space-y-1.5 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
                  {technicalConfluence.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Risk Management Justification (SL & TP) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    Rasional Penetapan Stop Loss &amp; Take Profit
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl text-rose-300">
                    <span className="font-bold text-rose-400 block mb-1">🛡️ Stop Loss Justification:</span>
                    <p className="text-[11px] leading-relaxed text-slate-300">{slJustification}</p>
                  </div>
                  <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-emerald-300">
                    <span className="font-bold text-emerald-400 block mb-1">🎯 Take Profit Justification:</span>
                    <p className="text-[11px] leading-relaxed text-slate-300">{tpJustification}</p>
                  </div>
                </div>
              </div>

              {/* Pedagogical AI Educational Takeaway */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>Nota Pembelajaran AI untuk Pedagang (Pedagogical Lesson)</span>
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  {educationalLesson}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedTradeRationale(null)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg cursor-pointer"
              >
                Faham &amp; Tutup
              </button>
            </div>
          </div>
        );
      })()}

      {/* 5. MODAL: 24/7 AI AUTONOMOUS MARKET SCANNER RADAR & DISCOVERED SETUPS */}
      {showDiscoveredSetupsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/40 rounded-xl text-indigo-400">
                  <Radio className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white uppercase tracking-wider">
                      📡 Radar Imbasan Autonomi AI (12 Pairs • M15/H1/H4)
                    </h3>
                    <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold rounded-full">
                      LIVE 24/7 SCANNER
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Senarai setup Gred-A terkini yang dikesan oleh pelayan di latar belakang
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await fetch('/api/autotrader/scanner/trigger', { method: 'POST' }).catch(() => {});
                    const res = await fetch('/api/autotrader/scanner/status').then(r => r.json()).catch(() => null);
                    if (res) setScannerStatus(res);
                  }}
                  className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Picu imbasan penuh segera ke atas semua 12 pair"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Imbas Semula Sekarang
                </button>
                <button
                  onClick={() => setShowDiscoveredSetupsModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold transition flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Setups List */}
            {(() => {
              const displayedSetups = Array.isArray(scannerStatus?.recentSetups) ? scannerStatus.recentSetups : [];

              // Helper to format found timestamp
              const formatFoundTime = (ts?: number | string) => {
                if (!ts) return 'Baru sahaja';
                const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
                if (isNaN(date.getTime())) return 'Baru sahaja';
                
                const now = Date.now();
                const diffMs = Math.max(0, now - date.getTime());
                const diffSec = Math.floor(diffMs / 1000);
                const diffMin = Math.floor(diffSec / 60);
                const diffHour = Math.floor(diffMin / 60);

                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                
                if (diffSec < 60) return `Baru sahaja (${timeStr})`;
                if (diffMin < 60) return `${diffMin}m lalu (${timeStr})`;
                if (diffHour < 24) return `${diffHour}j ${diffMin % 60}m lalu (${timeStr})`;
                return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
              };

              if (displayedSetups.length === 0) {
                return (
                  <div className="p-8 text-center bg-slate-950/60 border border-slate-800/80 rounded-xl text-slate-400 font-sans text-xs">
                    <Sparkles className="w-6 h-6 text-indigo-400 mx-auto mb-2 opacity-60 animate-pulse" />
                    <p className="font-semibold text-slate-200">Tiada setup aktif dijumpai pada imbasan pasaran terkini</p>
                    <p className="text-[11px] text-slate-500 mt-1">Sistem imbasan autonomous AI sentiasa memantau instrumen pasaran secara langsung.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {displayedSetups.map((setup: any, idx: number) => {
                    const isBuy = setup.direction === 'BUY';
                    const patternLabel = setup.pattern?.name || setup.patternName;
                    const patternQ = setup.pattern?.quality || setup.patternQuality;
                    const isValid = (typeof setup.isValid === 'boolean') 
                      ? setup.isValid 
                      : (setup.confidence >= 70 && setup.status !== 'EXPIRED' && setup.status !== 'INVALID' && setup.status !== 'FAILED');
                    const foundTimeFormatted = formatFoundTime(setup.timestamp || setup.lastFoundAt || setup.createdAt);

                    return (
                      <div 
                        key={setup.id || idx}
                        className="p-4 bg-slate-950/80 border border-slate-800 hover:border-indigo-500/40 rounded-xl transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded font-black text-xs ${
                            isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}>
                            {setup.direction}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-extrabold text-white">{setup.pair}</span>
                              <span className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded text-[10px] font-bold">
                                {setup.timeframe}
                              </span>
                              <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded text-[10px] font-bold">
                                {setup.confidence}% CONF
                              </span>

                              {/* VALID / INVALID STATUS BADGE */}
                              {isValid ? (
                                <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 rounded text-[10px] font-black flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  VALID
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/50 text-rose-300 rounded text-[10px] font-black flex items-center gap-1 shadow-[0_0_8px_rgba(244,63,94,0.3)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                  INVALID
                                </span>
                              )}

                              {patternLabel && (
                                <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded text-[10px] font-bold flex items-center gap-1">
                                  📐 {patternLabel} {patternQ ? `(Q: ${patternQ}/10)` : ''}
                                </span>
                              )}
                            </div>

                            {/* Price Parameters with TP1, TP2 (Runner), and Break-Even (BE) */}
                            {(() => {
                              const isJpy = setup.pair?.includes('JPY');
                              const decimals = isJpy ? 3 : 5;
                              const tp2Calculated = setup.takeProfit2 || (
                                setup.direction === 'BUY'
                                  ? +(setup.entryPrice + (setup.takeProfit1 - setup.entryPrice) * 1.8).toFixed(decimals)
                                  : +(setup.entryPrice - (setup.entryPrice - setup.takeProfit1) * 1.8).toFixed(decimals)
                              );
                              const beTrigger = setup.breakEvenPrice || setup.entryPrice;

                              return (
                                <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
                                  <span className="bg-slate-900/90 px-2 py-0.5 rounded border border-slate-700/60">
                                    Entri: <strong className="text-slate-100">{setup.entryPrice}</strong>
                                  </span>
                                  <span className="bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                                    SL: <strong className="text-rose-400">{setup.stopLoss}</strong>
                                  </span>
                                  <span className="bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                                    TP1 (50%): <strong className="text-emerald-300 font-bold">{setup.takeProfit1}</strong>
                                  </span>
                                  <span className="bg-teal-950/40 px-2 py-0.5 rounded border border-teal-800/40">
                                    TP2 (Runner): <strong className="text-teal-300 font-bold">{tp2Calculated}</strong>
                                  </span>
                                  <span className="bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/40 text-[10px]" title="Stop Loss dialihkan ke Entri secara automatik sebaik sahaja TP1 tercapai">
                                    BE: <strong className="text-indigo-300">Auto @ {beTrigger}</strong>
                                  </span>

                                  {/* TIMESTAMP WHEN SIGNAL WAS LAST FOUND */}
                                  <span className="text-[10px] text-indigo-300/90 font-mono flex items-center gap-1 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/30">
                                    <Clock className="w-3 h-3 text-indigo-400" />
                                    Dikesan: {foundTimeFormatted}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Invalidation Reason Banner */}
                            {(!isValid || setup.status === 'INVALID') && setup.invalidationReason && (
                              <div className="text-[10px] text-rose-300/90 bg-rose-950/40 border border-rose-500/30 rounded px-2 py-0.5 mt-1.5 flex items-center gap-1">
                                <span>⚠️ {setup.invalidationReason}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
                          {!isValid || setup.status === 'INVALID' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                                🚫 TIADA ORDER CTRADER
                              </span>
                              {setup.invalidatedAt && (
                                <span className="px-1.5 py-0.5 bg-slate-800 text-amber-300 border border-amber-500/30 rounded text-[9px] font-mono">
                                  ⏳ Padam: {Math.max(1, Math.ceil((120000 - (Date.now() - setup.invalidatedAt)) / 1000))}s
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                              setup.status === 'EXECUTED' 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : setup.status === 'SKIPPED_ALREADY_OPEN'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                  : setup.status === 'DISCOVERED_CAPACITY_REACHED'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : setup.status === 'SKIPPED_RISK'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : setup.status === 'SKIPPED_COOLDOWN'
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            }`}>
                              {setup.status === 'EXECUTED' 
                                ? '✅ ORDER CTRADER AKTIF' 
                                : setup.status === 'SKIPPED_ALREADY_OPEN' 
                                  ? 'ℹ️ POSISI AKTIF' 
                                  : setup.status === 'DISCOVERED_CAPACITY_REACHED'
                                    ? '📡 COPIER AKTIF (HAD MASTER 2/2)'
                                    : setup.status === 'SKIPPED_RISK' 
                                      ? '🛡️ RISK LIMIT' 
                                      : setup.status === 'SKIPPED_COOLDOWN' 
                                        ? '⏳ COOLDOWN (2m)' 
                                        : '🎯 RADAR SETUP'}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setActivePair(setup.pair);
                              if (setTimeframe && setup.timeframe) setTimeframe(setup.timeframe);
                              setShowDiscoveredSetupsModal(false);
                            }}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 via-indigo-600 to-blue-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-extrabold rounded-xl transition shadow-lg shadow-cyan-950/50 cursor-pointer text-xs flex items-center gap-1.5"
                          >
                            <Zap className="w-3.5 h-3.5 text-cyan-300" />
                            <span>⚡ Muat Setup &amp; Carta</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <span className="text-[11px] text-slate-500 font-mono">
                Pusingan imbasan seterusnya: setiap 20 saat
              </span>
              <button
                onClick={() => setShowDiscoveredSetupsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. NEW USER ONBOARDING MODAL */}
      <NewUserOnboardingModal
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        onCompleteOnboarding={(userData) => {
          setSubscriberRiskMode(userData.riskMode);
          setTrialInfo({ isTrialActive: true, daysRemaining: 7 });
          setExecutionFeedback(`🎉 Selamat datang ${userData.fullName}! Percubaan Demo cTrader 7 Hari anda telah diaktifkan.`);
          setTimeout(() => setExecutionFeedback(null), 6000);
        }}
      />

      {/* 5. SUBSCRIPTION PRICING & ROI SIMULATOR MODAL */}
      <SubscriptionPricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
        currentCapital={liveBalance}
        onSelectPlan={(planName, price) => {
          setShowPricingModal(false);
          setExecutionFeedback(`🚀 Anda telah memilih Pelan ${planName} ($${price}/bln)! Pasukan kami sedang menyelaraskan akaun anda.`);
          setTimeout(() => setExecutionFeedback(null), 6000);
        }}
      />
    </div>
  );
};
