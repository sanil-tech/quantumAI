import { CurrencyPair, Timeframe, TradingStyle, MarketRegime } from '../../../types';

export type EntryMode =
  | 'BUY_MARKET'
  | 'BUY_PULLBACK'
  | 'BUY_BREAKOUT'
  | 'SELL_MARKET'
  | 'SELL_PULLBACK'
  | 'SELL_BREAKOUT';

export type ValidationStatus = 'PASS' | 'WARNING' | 'REVIEW' | 'REJECTED';

export type SignalLifecycleStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'VALID'
  | 'WAITING_FOR_ENTRY'
  | 'TRIGGERED'
  | 'EXECUTED'
  | 'TP1_HIT'
  | 'RUNNER_ACTIVE'
  | 'CLOSED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'INVALIDATED';

export type ExecutionEligibilityState =
  | 'NOT_ELIGIBLE'
  | 'WAITING_FOR_ENTRY'
  | 'ELIGIBLE_FOR_EXECUTION'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'BLOCKED'
  | 'EXPIRED';

export type SignalType =
  | 'MOMENTUM_CONTINUATION'
  | 'ORDER_BLOCK_RETEST'
  | 'FAIR_VALUE_GAP_FILL'
  | 'STRUCTURE_BREAKOUT'
  | 'LIQUIDITY_SWEEP'
  | 'NONE';

export interface IndicatorSnapshot {
  ema20?: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  superTrendDirection: 'BULLISH' | 'BEARISH';
  atr: number;
  macdHistogram?: number;
  vwap?: number;
}

export interface CanonicalSignal {
  signalId: string;
  symbol: CurrencyPair;
  timeframe: Timeframe;
  generatedAt: number;
  expiryTime: number;
  marketDataTimestamp: number;
  dataSource: string;
  currentPrice: number;

  direction: 'BUY' | 'SELL';
  signalType: SignalType;
  entryPrice: number;
  entryMode: EntryMode;
  distancePips: number;

  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;

  riskPips: number;
  rewardPipsTP1: number;
  rewardPipsTP2?: number;
  rrTP1: number;
  rrTP2?: number;

  recommendedLot: number;

  indicators: IndicatorSnapshot;
  marketRegime: MarketRegime;

  modelConfidence: number; // AI confidence score (Advisory)
  validationConfidence: number; // Deterministic validation score (Authoritative)
  confidence: number; // Final authoritative confidence score

  reasoningEvidence: string[];
  bullishEvidence: string[];
  bearishEvidence: string[];
  riskWarnings: string[];

  validationStatus: ValidationStatus;
  validationErrors: string[];
  validationWarnings: string[];

  executionStatus: SignalLifecycleStatus;
  executionEligibility: ExecutionEligibilityState;
  eligibilityReason: string;
}

export interface ValidationCheckResult {
  checkName: string;
  passed: boolean;
  status: 'PASS' | 'WARNING' | 'REJECT' | 'REVIEW';
  message: string;
  details?: any;
}

export interface ValidationReport {
  signalId: string;
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entryMode: EntryMode;
  currentPrice: number;
  plannedEntry: number;
  distancePips: number;
  timestamp: number;
  dataCheck: ValidationCheckResult;
  indicatorSemantics: ValidationCheckResult;
  directionConsistency: ValidationCheckResult;
  rsiInterpretation: ValidationCheckResult;
  adxInterpretation: ValidationCheckResult;
  entryConsistency: ValidationCheckResult;
  riskRewardCheck: ValidationCheckResult;
  confidenceCheck: ValidationCheckResult;
  explanationCheck: ValidationCheckResult;
  overallStatus: ValidationStatus;
  finalLifecycleStatus: SignalLifecycleStatus;
  executionEligibility: ExecutionEligibilityState;
  eligibilityReason: string;
  errors: string[];
  warnings: string[];
  sanitizedReasons: string[];
  isExecutable: boolean;
}
