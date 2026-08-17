export interface Candle {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
  provider?: string;
}

export type MarketDataMode = 'LIVE' | 'HISTORICAL' | 'SIMULATION' | 'SYNTHETIC';

export type MarketDataValidationStatus = 'VALID' | 'INVALID' | 'STALE' | 'UNAVAILABLE';

export interface MarketDataProvenance {
  source: string;
  provider: string;
  receivedAt: number;
  marketTimestamp?: number;
  sequence?: number;
}

export interface MarketDataFreshness {
  isFresh: boolean;
  ageMs: number;
  maxAllowedAgeMs: number;
}

export interface MarketDataEnvelope<T = any> {
  symbol: string;
  timeframe: string;
  dataMode: MarketDataMode;
  status: MarketDataValidationStatus;
  data: T;
  provenance: MarketDataProvenance;
  freshness: MarketDataFreshness;
  executable: boolean;
  reason?: string;
}

export interface Tick {
  symbol: string;
  price: number;
  volume: number;
  bid: number;
  ask: number;
  timestamp: Date;
  provider?: string;
}

export interface PriceFeatures {
  ohlc: Candle;
  priceChange: number;
  percentChange: number;
  bodySize: number;
  upperWick: number;
  lowerWick: number;
  isBullish: boolean;
}

export interface TrendFeatures {
  sma20: number;
  sma50: number;
  ema20: number;
  direction: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  strength: number;
}

export interface VolatilityFeatures {
  atr: number;
  volatilityState: 'HIGH' | 'LOW' | 'NORMAL';
  expansionRatio: number;
}

export interface MomentumFeatures {
  rsi: number;
  momentumScore: number;
  acceleration: number;
}

export interface LiquidityFeatures {
  spread: number;
  condition: 'OPTIMAL' | 'NORMAL' | 'THIN' | 'ILLIQUID';
}

export interface MarketFeatures {
  price: PriceFeatures;
  trend: TrendFeatures;
  volatility: VolatilityFeatures;
  momentum: MomentumFeatures;
  liquidity: LiquidityFeatures;
}

export interface MarketStructure {
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  supportZones: number[];
  resistanceZones: number[];
  isConsolidating: boolean;
  isBreakout: boolean;
  pattern: string;
}

export type MarketRegimeType = 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'BREAKOUT' | 'TRANSITION';

export interface MarketRegime {
  symbol: string;
  regime: MarketRegimeType;
  confidence: number;
  evidence: string[];
}

export interface MarketState {
  symbol: string;
  timestamp: Date;
  trend: TrendFeatures;
  momentum: MomentumFeatures;
  volatility: VolatilityFeatures;
  liquidity: LiquidityFeatures;
  structure: MarketStructure;
  regime: MarketRegime;
  confidence: number;
  evidence: string[];
}

export type MarketDirection = 'BUY' | 'SELL' | 'NEUTRAL';

export interface AgentVote {
  agent_id: string;
  agent_name: string;
  direction: MarketDirection;
  confidence: number;
  evidence: string[];
  reasoning: string;
  timestamp: Date;
}

export interface ForecastResult {
  bullish_probability: number;
  bearish_probability: number;
  neutral_probability: number;
}

export interface TradingAgent {
  id: string;
  name: string;
  analyze(state: MarketState): Promise<AgentVote>;
}

export interface TradeProposal {
  id: string;
  symbol: string;
  direction: MarketDirection;
  confidence: number;
  evidence: string[];
  agent_votes: AgentVote[];
  why_direction: string;
  invalidate_conditions: string[];
  timestamp: Date;
  stop_loss?: number;
  take_profit?: number;
  stopLoss?: number;
  takeProfit?: number;
  lotSize?: number;
  risk_percent?: number;
  riskPercent?: number;
  strategyId?: string;
  strategyVersion?: string;
  strategy_id?: string;
  strategy_version?: string;
}

export interface MarketDataUpdatedPayload {
  symbol: string;
  timeframe: string;
  candle: Candle;
  provider: string;
  timestamp: Date;
}

export interface MarketStateUpdatedPayload {
  symbol: string;
  market_state: MarketState;
  regime: MarketRegimeType;
  confidence: number;
  timestamp: Date;
}

export interface TradeProposedPayload {
  symbol: string;
  direction: MarketDirection;
  confidence: number;
  evidence: string[];
  trade_proposal: TradeProposal;
  timestamp: Date;
}

export interface IProviderAdapter {
  getName(): string;
  fetchCandles(symbol: string, timeframe?: string, limit?: number): Promise<Candle[]>;
  fetchTick(symbol: string): Promise<Tick>;
}

export type RiskLevel = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';

export interface RiskProfile {
  account_id: string;
  max_risk_per_trade: number;
  max_daily_loss: number;
  max_drawdown: number;
  max_open_positions: number;
  max_exposure: number;
  max_frequency: number;
  risk_level: RiskLevel;
}

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type DrawdownAction = 'WARNING' | 'REDUCE_RISK' | 'PAUSE_TRADING' | 'EMERGENCY_STOP';

export type GovernanceDecisionStatus = 'APPROVED' | 'REJECTED' | 'MANUAL_REQUIRED';

export interface RiskApprovalToken {
  approvalId: string;
  signalId: string;
  symbol: string;
  direction: MarketDirection;
  approvedLotSize: number;
  maxAllowedDrawdown: number;
  calculatedRiskAmount: number;
  riskCheckTimestamp: number;
  status: GovernanceDecisionStatus;
  rejectionReason?: string;
  governanceSignature: string;
  strategyId?: string;
  strategyVersion?: string;
  stopLoss?: number;
  takeProfit?: number;
  riskPercent?: number;
  stop_loss?: number;
  take_profit?: number;
  risk_percent?: number;
  accountId?: string;
  account_id?: string;
  brokerId?: string;
  broker_id?: string;
}

export interface GovernanceDecision {
  approval_id: string;
  status: GovernanceDecisionStatus;
  risk_score: number;
  checks: string[];
  timestamp: Date;
  decision_authority: string;
  rejection_reasons?: string[];
  token?: RiskApprovalToken;
}

export interface RiskClearedPayload {
  proposal_id: string;
  symbol: string;
  account_id: string;
  approval_id: string;
  risk_score: number;
  trade_proposal: TradeProposal;
  governance_decision: GovernanceDecision;
  approval_token?: RiskApprovalToken;
  timestamp: Date;
  broker_id?: string;
  brokerId?: string;
}

export interface TradeRejectedPayload {
  proposal_id: string;
  symbol: string;
  account_id: string;
  rejection_id: string;
  risk_score: number;
  rejection_reasons: string[];
  trade_proposal: TradeProposal;
  timestamp: Date;
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'CANCEL';
export type OrderStatus = 'PENDING' | 'SUBMITTED' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';

export interface Order {
  order_id: string;
  proposal_id: string;
  approval_id: string;
  account_id: string;
  symbol: string;
  direction: MarketDirection;
  quantity: number;
  order_type: OrderType;
  price?: number;
  stop_price?: number;
  status: OrderStatus;
  created_at: Date;
  filled_at?: Date;
  broker_id: string;
  stop_loss?: number;
  take_profit?: number;
  risk_percent?: number;
  risk_amount?: number;
  strategy_id?: string;
  strategy_version?: string;

  // Compatibility aliases
  orderId?: string;
  proposalId?: string;
  approvalId?: string;
  accountId?: string;
  brokerId?: string;
  orderType?: OrderType;
  stopLoss?: number;
  takeProfit?: number;
  riskPercent?: number;
  riskAmount?: number;
  strategyId?: string;
  strategyVersion?: string;
  createdAt?: Date;
  filledAt?: Date;
}

export interface ExecutionReport {
  report_id: string;
  order_id: string;
  requested_price: number;
  filled_price: number;
  slippage: number;
  slippage_pct: number;
  latency_ms: number;
  status: OrderStatus;
  reason?: string;
  timestamp: Date;
  broker_id?: string;
  brokerId?: string;
  execution_id?: string;
  broker_order_id?: string;
  brokerOrderId?: string;
  broker_position_id?: string;
  brokerPositionId?: string;
  broker_deal_id?: string;
  brokerDealId?: string;
}

export interface Position {
  position_id: string;
  account_id: string;
  symbol: string;
  direction: MarketDirection;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_profit: number;
  realized_profit: number;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  opened_at: Date;
  updated_at: Date;
  stop_loss?: number;
  take_profit?: number;
  broker_id?: string;
  strategy_id?: string;
  strategy_version?: string;
}

export interface OrderPlacedPayload {
  order_id: string;
  proposal_id: string;
  approval_id: string;
  symbol: string;
  direction: MarketDirection;
  quantity: number;
  order_type: OrderType;
  price?: number;
  stop_loss?: number;
  take_profit?: number;
  timestamp: Date;
  broker_id?: string;
  account_id?: string;
  risk_amount?: number;
  risk_percent?: number;
  strategy_id?: string;
  strategy_version?: string;
}

export interface OrderFilledPayload {
  fill_id: string;
  order_id: string;
  proposal_id: string;
  symbol: string;
  direction: MarketDirection;
  quantity: number;
  filled_price: number;
  slippage: number;
  latency_ms: number;
  timestamp: Date;
}

export interface PositionUpdatedPayload {
  position: Position;
  timestamp: Date;
}

// ==========================================
// PHASE 6: MANUAL TRADING SIGNAL & JOURNAL TYPES
// ==========================================

export type ManualSignalStatus =
  | 'WAITING'
  | 'SETUP_DETECTED'
  | 'SIGNAL_READY'
  | 'EXPIRED'
  | 'INVALIDATED'
  | 'MARKET_DATA_UNAVAILABLE'
  | 'INSUFFICIENT_EVIDENCE';

export interface ManualTradeSignal {
  signalId: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  marketDataStatus: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  setupGrade: string;
  confidence: number;
  entryZone: { min: number; max: number };
  invalidationLevel: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: string;
  marketStructure: string;
  technicalEvidence: string[];
  adaptiveLearningEvidence: {
    status: 'ACTIVE' | 'INACTIVE';
    relevantLessonsCount: number;
    appliedLessons: string[];
  };
  signalStatus: ManualSignalStatus;
  reason?: string;
  generatedAt: number;
  expiresAt: number;
  executionMode: 'MANUAL';
  brokerExecution: false;
}

export interface ManualTradeJournalEntry {
  tradeId: string;
  signalId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  actualEntryTime: string;
  actualExitPrice?: number;
  actualExitTime?: string;
  outcome?: 'WIN' | 'LOSS' | 'OPEN' | 'CANCELLED';
  realizedPnl?: number;
  notes?: string;
  executionMode: 'MANUAL';
  brokerExecution: false;
  source: 'MANUAL_USER_REPORTED';
  createdAt: string;
}

// ============================================================
// PHASE 6B: DUAL-LAYER MANUAL TRADE DATA MODEL
// Distinguishes AI PLANNED SETUP from USER ACTUAL EXECUTION
// ============================================================

export interface AiPlannedSetup {
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  timeframe: string;
  plannedEntry: number;
  entryZone: { min: number; max: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  invalidationLevel: number;
  riskReward: string;
  confidence: number;
  setupGrade: string;
  adaptiveLearningRule?: string;
  createdAt: string;
}

export type ManualTradeStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED';
export type ManualTradeExitReason = 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'STOP_LOSS' | 'INVALIDATED' | 'MANUAL_EXIT';
export type ManualTradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN' | 'PENDING';

export interface UserActualTrade {
  manualTradeId: string;
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  actualEntry: number;
  positionSize: number;
  enteredAt: string;
  status: ManualTradeStatus;
  exitPrice?: number;
  exitReason?: ManualTradeExitReason;
  exitedAt?: string;
  realizedPnl?: number;
  realizedPips?: number;
  result?: ManualTradeResult;
  aiPlannedSetup: AiPlannedSetup;
  executionMode: 'MANUAL';
  brokerExecution: false;
  source: 'MANUAL_USER_REPORTED';
  notes?: string;
}
