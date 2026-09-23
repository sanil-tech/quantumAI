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

export type CurrencyPair =
  | 'EUR/USD'
  | 'GBP/USD'
  | 'USD/JPY'
  | 'AUD/USD'
  | 'USD/CHF'
  | 'NZD/USD'
  | 'USD/CAD'
  | 'EUR/GBP'
  | 'AUD/JPY'
  | 'EUR/CHF'
  | 'EUR/AUD'
  | 'GBP/AUD'
  | 'EUR/JPY'
  | 'GBP/JPY'
  | 'EUR/CAD'
  | 'EUR/NZD'
  | 'GBP/CAD'
  | 'GBP/CHF'
  | 'GBP/NZD'
  | 'AUD/CAD'
  | 'AUD/CHF'
  | 'AUD/NZD'
  | 'NZD/JPY'
  | 'NZD/CAD'
  | 'NZD/CHF'
  | 'CAD/JPY'
  | 'CAD/CHF'
  | 'CHF/JPY'
  | 'XAU/USD'
  | 'NASDAQ'
  | 'BTC/USD';

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

export type SignalAction = 'BUY' | 'SELL' | 'NO_SETUP' | 'WAIT_FOR_CONFIRMATION' | 'VETO' | 'WAIT / NO SETUP';
export type SignalStatus = 'VALID_PROPOSAL' | 'NO_SETUP' | 'WAIT_FOR_CONFIRMATION' | 'VETOED';
export type SetupType = 'ORDER_BLOCK_RETEST' | 'FAIR_VALUE_GAP_FILL' | 'LIQUIDITY_SWEEP' | 'STRUCTURE_BREAKOUT' | 'MOMENTUM_CONTINUATION' | 'NONE';
export type EntryType = 'MARKET_ENTRY' | 'PULLBACK_LIMIT' | 'BREAKOUT_STOP' | 'NONE';
export type MarketRegime = 'TRENDING_BULLISH' | 'TRENDING_BEARISH' | 'RANGING_CHOPPY' | 'HIGH_VOLATILITY_NEWS' | 'LOW_LIQUIDITY';
export type ProvenanceSource = 'AI_DECISION_ENGINE' | 'AI_SHADOW' | 'MANUAL';

export interface ConfidenceBreakdown {
  technicalScore: number;
  structureScore: number;
  mtfScore: number;
  regimeScore: number;
  learningAdjustment: number;
  finalScore: number;
}

export interface AiTradeOpportunity {
  pair: CurrencyPair;
  timestamp: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // e.g. 82
  action: SignalAction;
  status?: SignalStatus;
  reasons: string[];
  entryZone: {
    min: number;
    max: number;
  } | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  riskRewardRatio: string | null; // e.g. "1:2.5"
  invalidationLevel: number | null;
  tradingStyle: TradingStyle;
  probabilityNotes: string;
  disclaimer: string;
  setupType?: SetupType;
  entryType?: EntryType;
  marketRegime?: MarketRegime;
  grade?: 'A+' | 'A' | 'B' | 'C';
  isMultiTarget?: boolean;
  breakEvenTrigger?: number | null;
  executionPolicy?: string;
  technicalEvidence?: string[];
  learningEvidence?: string[];
  learningRuleIds?: string[];
  vetoReasons?: string[];
  confirmationRequirements?: string[];
  confidenceBreakdown?: ConfidenceBreakdown;
  proposalId?: string;
  id?: string;
  strategyId?: string;
  strategyVersion?: string;
  provenanceSource?: ProvenanceSource;
  executable?: boolean;
  decisionProvider?: string;
  geminiConfigured?: boolean;
  geminiCalled?: boolean;
  geminiSucceeded?: boolean;
  dataMode?: string;
}

export interface EconomicEvent {
  id: string;
  title: string;
  currency: string; // e.g. EUR, USD, GBP, JPY, AUD, CAD, CHF, NZD
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  date?: string;
  time: string; // e.g. "13:30 UTC"
  timestamp: number;
  forecast?: string;
  previous?: string;
  actual?: string;
  unit?: string;
  category?: 'INFLATION' | 'EMPLOYMENT' | 'CENTRAL_BANK' | 'GROWTH_GDP' | 'RETAIL_CONSUMER' | 'PMI_BUSINESS' | 'SPEECH';
  country?: string;
  flag?: string;
  betterThanExpected?: boolean;
  affectedPairs?: string[];
  warningText?: string;
  aiImpactRule?: string;
  aiDetailedBreakdown?: string;
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

export type LearningProvenance =
  | 'REAL_TRADE'
  | 'HISTORICAL_BACKTEST'
  | 'SYNTHETIC_SIMULATION'
  | 'SHADOW_OBSERVATION';

export type LearningAuthority =
  | 'POSTGRESQL'
  | 'BACKTEST_ENGINE'
  | 'SIMULATION_ONLY'
  | 'SHADOW_ENGINE';

export interface PostMortemReview {
  id: string;
  tradeId?: string;
  positionId?: string;
  learningVersion?: string;
  timestamp: number;
  pair: CurrencyPair;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlDollars: number;
  pnlPips?: number;
  outcome: 'WIN' | 'LOSS';
  rootCauseMs: string;
  rootCauseEn: string;
  lessonLearnedMs: string;
  lessonLearnedEn: string;
  adaptiveRuleMs: string;
  adaptiveRuleEn: string;
  ratingScore: number;
  proposalId?: string;
  approvalId?: string;
  strategyId?: string;
  strategyVersion?: string;
  provenanceSource?: ProvenanceSource;
  setupType?: SetupType;
  marketRegime?: MarketRegime;
  provenance?: LearningProvenance;
  authority?: LearningAuthority;
  dataSource?: string;
  fallbackUsed?: boolean;
  executionEnvironment?: 'SHADOW' | 'DEMO' | 'LIVE';
  outcomeSource?: 'SIMULATED_MARKET_OUTCOME' | 'BROKER_CONFIRMED_OUTCOME';
  brokerConfirmed?: boolean;
  brokerOrderId?: string;
  brokerPositionId?: string;
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

// --- PHASE 7B: SHADOW PERFORMANCE & ADAPTIVE LEARNING EFFECTIVENESS ---

export type EvidenceClassification =
  | 'INSUFFICIENT_SAMPLE'
  | 'EARLY_SIGNAL'
  | 'PRELIMINARY'
  | 'MEANINGFUL_SAMPLE'
  | 'STRONGER_EVIDENCE';

export interface ShadowPerformanceRecord {
  id: string;
  signalId: string;
  pair: CurrencyPair;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  setupType: SetupType;
  entryType: EntryType;
  marketRegime: MarketRegime;
  signalStatus: SignalStatus;
  provenanceSource: ProvenanceSource;
  signalTimestamp: number;
  entryTimestamp: number;
  closeTimestamp?: number;

  // Signal Price Geometry
  plannedEntry: number;
  actualShadowEntry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  invalidationLevel?: number;

  // Learning Information
  learningVersion: string;
  learningAdjustment: number;
  learningRuleIds: string[];
  learningEvidence: string[];
  vetoed: boolean;
  confirmationRequired: boolean;

  // Outcome Metrics
  outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitPrice?: number;
  exitReason?: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'MANUAL_CLOSE' | 'INVALIDATION';
  realizedR?: number;
  pnlPips?: number;
  mfePips?: number; // Maximum Favorable Excursion
  maePips?: number; // Maximum Adverse Excursion
  holdingDurationMs?: number;
}

export interface CohortMetrics {
  cohortName: 'BASELINE' | 'LEARNING_AFFECTED' | 'TOTAL';
  sampleSize: number;
  evidenceTier: EvidenceClassification;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  observedWinRate: number; // 0.0 - 1.0
  averageR: number;
  medianR: number;
  expectancy: number;
  cumulativeR: number;
  maxDrawdownR: number;
  maxConsecutiveLosses: number;
  averageMfePips: number;
  averageMaePips: number;
}

export interface ShadowSelectivityMetrics {
  totalEvaluations: number;
  validBuyCount: number;
  validSellCount: number;
  noSetupCount: number;
  waitCount: number;
  vetoCount: number;
  validSignalRate: number;
  noSetupRate: number;
  waitRate: number;
  vetoRate: number;
}

export interface LearningEffectivenessComparison {
  baselineCohort: CohortMetrics;
  learningAffectedCohort: CohortMetrics;
  winRateDifference: number;
  expectancyDifference: number;
  vetoPrecisionRatio?: number;
  evidenceStatus: EvidenceClassification;
  summaryNote: string;
}

export type TradingSession = 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'SYDNEY' | 'OVERLAP_LONDON_NY' | 'OFF_HOURS';
export type ObservationType =
  | 'REAL_DEMO_EXECUTION'
  | 'SHADOW_OBSERVATION'
  | 'COUNTERFACTUAL_OBSERVATION'
  | 'TEST_FIXTURE';

export type ResearchEvidenceTier =
  | 'NO_EVIDENCE'
  | 'EARLY_OBSERVATION'
  | 'DEVELOPING'
  | 'MODERATE_EVIDENCE'
  | 'ROBUST_OBSERVATION';

export type EvidenceSource = 'REAL_MARKET' | 'TEST_FIXTURE';

export interface ShadowTelemetryCounters {
  signalsEvaluated: number;
  validBuyCount: number;
  validSellCount: number;
  noSetupCount: number;
  waitCount: number;
  vetoCount: number;
  admittedCount: number;
  rejectedCount: number;
  currentlyOpenCount: number;
  closedCount: number;
  slExitCount: number;
  tp1HitCount: number;
  tp2ExitCount: number;
  invalidStaleCount: number;
  duplicateRejectedCount: number;
  postMortemsGeneratedCount: number;
  postMortemsPersistedCount: number;
  learningUpdatesAppliedCount: number;
}

export type ExecutionEnvironment = 'PAPER' | 'DEMO' | 'LIVE';
export type DemoExecutionPhase =
  | 'DISARMED'
  | 'ORDER_REQUEST_CREATED'
  | 'ORDER_TRANSMITTED'
  | 'BROKER_ACKNOWLEDGED'
  | 'POSITION_CONFIRMED'
  | 'POSITION_CLOSED'
  | 'EXECUTION_REJECTED'
  | 'EXECUTION_FAILED';

export interface DemoExecutionRecord {
  id: string;
  signalId: string;
  symbol: CurrencyPair;
  direction: 'BUY' | 'SELL';
  executionEnvironment: 'DEMO';
  phase: DemoExecutionPhase;
  requestedLotSize: number;
  normalizedVolume: number;
  requestedEntryPrice: number;
  acknowledgedEntryPrice?: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  brokerOrderId?: string;
  brokerPositionId?: string;
  openTimestamp: number;
  closeTimestamp?: number;
  exitPrice?: number;
  closeReason?: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'INVALIDATION' | 'MANUAL_CLOSE' | 'TIMEOUT';
  realizedPnlDollars?: number;
  realizedR?: number;
  mfePips: number;
  maePips: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  postMortemId?: string;
  learningVersion: string;
  signalSnapshot: Readonly<AiTradeOpportunity>;
}
