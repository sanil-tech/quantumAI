export interface PriceAlarm {
  id: string;
  pair: CurrencyPair;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
  note?: string;
}

export type CurrencyPair = 'EUR/USD' | 'GBP/USD' | 'USD/JPY' | 'AUD/USD' | 'XAU/USD' | 'NASDAQ' | 'BTC/USD';

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1' | 'MN';

export type TradingStyle = 'SCALPER' | 'DAY_TRADER' | 'SWING_TRADER' | 'POSITION_TRADER';

export interface CandleData {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValues {
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  sma50: number;
  rsi: number; // 0-100
  rsiDivergence?: 'BULLISH' | 'BEARISH' | 'NONE';
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  stochRsi: {
    k: number;
    d: number;
  };
  cci: number;
  atr: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  superTrend: {
    value: number;
    trend: 'BULLISH' | 'BEARISH';
  };
  adx: {
    adx: number;
    plusDI: number;
    minusDI: number;
    trendStrength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  };
  vwap: number;
  obv: number;
  ichimoku: {
    tenkanSen: number; // Conversion line
    kijunSen: number;  // Base line
    senkouSpanA: number; // Leading Span A
    senkouSpanB: number; // Leading Span B
    chikouSpan: number;  // Lagging Span
    cloudState: 'BULLISH_CLOUD' | 'BEARISH_CLOUD' | 'INSIDE_CLOUD';
  };
}

export interface SupportResistanceZone {
  id: string;
  type: 'SUPPORT' | 'RESISTANCE';
  priceStart: number;
  priceEnd: number;
  strength: number; // 1-5
  testedCount: number;
  timeframe: Timeframe;
}

export interface OrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  timeframe: Timeframe;
  timestamp: number;
  mitigated: boolean;
}

export interface FairValueGap {
  id: string;
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  top: number;
  bottom: number;
  timeframe: Timeframe;
  filled: boolean;
}

export interface SmcStructures {
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  lastBos?: {
    type: 'BULLISH_BOS' | 'BEARISH_BOS';
    price: number;
    timestamp: number;
  };
  lastChoch?: {
    type: 'BULLISH_CHOCH' | 'BEARISH_CHOCH';
    price: number;
    timestamp: number;
  };
  liquiditySweeps: {
    type: 'BUY_SIDE_SWEEP' | 'SELL_SIDE_SWEEP';
    price: number;
    timestamp: number;
  }[];
}

export interface TimeframeSummary {
  timeframe: Timeframe;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  description: string;
  keyLevels: string[];
}

export interface MultiTimeframeAnalysis {
  higherTimeframe: TimeframeSummary; // D1 / W1
  trendTimeframe: TimeframeSummary;  // H4 / H1
  entryTimeframe: TimeframeSummary;  // M15 / M5
  overallBias: 'BUY BIAS' | 'SELL BIAS' | 'NEUTRAL / RANGE';
  alignmentScore: number; // 0-100%
}

export interface AiTradeOpportunity {
  pair: CurrencyPair;
  timestamp: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // e.g. 82
  action: 'BUY' | 'SELL' | 'WAIT / NO SETUP';
  reasons: string[];
  entryZone: {
    min: number;
    max: number;
  };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: string; // e.g. "1:2.5"
  invalidationLevel: number;
  tradingStyle: TradingStyle;
  probabilityNotes: string;
  disclaimer: string;
}

export interface EconomicEvent {
  id: string;
  title: string;
  currency: string; // e.g. EUR, USD, GBP, JPY, AUD, CAD
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  date?: string;
  time: string; // e.g. "13:30 UTC"
  timestamp: number;
  forecast?: string;
  previous?: string;
  actual?: string;
  warningText?: string;
  aiImpactRule?: string;
  status?: 'UPCOMING' | 'RELEASED' | 'LIVE_WINDOW';
}

export interface RiskCalculation {
  accountSize: number;
  riskPercent: number; // e.g. 1.0
  riskAmountDollars: number;
  entryPrice: number;
  stopLossPrice: number;
  pipDistance: number;
  pipValuePerLot: number;
  recommendedLots: number;
  units: number;
  potentialProfitTP1: number;
  potentialProfitTP2: number;
}

export interface JournalEntry {
  id: string;
  timestamp: number;
  pair: CurrencyPair;
  tradingStyle: TradingStyle;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  pnlDollars?: number;
  status: 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'CLOSED_BREAKEVEN';
  notes: string;
  tags: string[];
}

export interface BacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  resultPips: number;
  pnlDollars: number;
  win: boolean;
  entryReason: string; // Sebab masuk
  newsStatus: {
    isBlackout: boolean;
    eventTitle?: string;
    minutesDiff?: number;
    statusText: string;
  };
  status: 'EXECUTED_WIN' | 'EXECUTED_LOSS' | 'SKIPPED_NEWS_BLACKOUT';
}

export interface BacktestResult {
  strategyName: string;
  pair: CurrencyPair;
  timeframe: Timeframe;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  skippedNewsCount: number;
  winRatePercent: number;
  profitFactor: number;
  totalPnlDollars: number;
  maxDrawdownPercent: number;
  avgRiskReward: number;
  trades: BacktestTrade[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface OneYearPairSummary {
  pair: CurrencyPair;
  totalCandlesTested: number;
  totalTradesExecuted: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  profitFactor: number;
  netPnlDollars: number;
  maxDrawdownPercent: number;
  learnedAdaptiveRules: string[];
}

export interface MultiPairOneYearBacktestResult {
  timestamp: number;
  totalPairsTested: number;
  overallWinRatePercent: number;
  overallProfitFactor: number;
  totalNetPnlDollars: number;
  pairSummaries: OneYearPairSummary[];
  systemOptimizedRules: string[];
}

export interface PostMortemReview {
  id: string;
  timestamp: number;
  pair: CurrencyPair;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlDollars: number;
  outcome: 'WIN' | 'LOSS';
  rootCauseMs: string;
  rootCauseEn: string;
  lessonLearnedMs: string;
  lessonLearnedEn: string;
  adaptiveRuleMs: string;
  adaptiveRuleEn: string;
  ratingScore: number;
}

export interface TraderProfile {
  id: string;
  fullName: string;
  email: string;
  accountType: 'DEMO' | 'REAL_MONEY';
  accountNumber: string;
  currency: string;
  leverage: string;
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  kycVerified: boolean;
  registeredAt: number;
}

export type BrokerPlatform = 'METATRADER4' | 'METATRADER5' | 'CTRADER' | 'OANDA' | 'INTERACTIVE_BROKERS' | 'BINANCE';

export interface BrokerConnectionConfig {
  id: string;
  platform: BrokerPlatform;
  brokerName: string;
  accountNumber: string;
  serverHost: string;
  apiKeyOrPassword?: string;
  apiSecret?: string;
  environment: 'DEMO' | 'REAL_LIVE';
  isConnected: boolean;
  lastConnectedAt?: number;
  latencyMs?: number;
  liveBalance?: number;
  liveEquity?: number;
  maxDailyLossDollars?: number;
  maxLotSizeCap?: number;
  autoExecuteRealMoney?: boolean;
  senderCompId?: string;
  targetCompId?: string;
  senderSubId?: string;
  port?: number;
}
