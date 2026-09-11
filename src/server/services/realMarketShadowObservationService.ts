
import crypto from 'crypto';

export type ObservationSourceType = 'REAL_MARKET_SHADOW' | 'CALIBRATION' | 'BACKTEST' | 'TEST_FIXTURE' | 'SYNTHETIC';
export type SampleSufficiencyStatus = 'NO_REAL_OBSERVATIONS' | 'INSUFFICIENT_SAMPLE' | 'PRELIMINARY' | 'OBSERVATION_ONLY' | 'STATISTICALLY_INFORMATIVE';

export interface ShadowObservationRecord {
  observationId: string;
  observationSource?: ObservationSourceType;
  timestampUtc: string;
  symbol: string;
  currentPrice: number;
  direction: 'BUY' | 'SELL' | 'NO_TRADE';
  confidence: number;
  whyReasons: string[];
  whyNotReasons: string[];
  riskDecision: 'APPROVED' | 'REJECTED';
  economicContextDecision: 'TRADE_ALLOWED' | 'NEWS_BLOCKED' | 'STALE_DATA_BLOCKED';
  simulatedTradeExecuted: boolean;
  grossPnl?: number;
  transactionCost?: number;
  netPnl?: number;
  evidenceHash: string;
}

export interface ShadowObservationSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  environment: 'SHADOW_PRODUCTION';
  marketDataSource: 'REAL_READ_ONLY_MARKET_DATA';
  instrumentsObserved: string[];
  strategyVersion: string;
  initialStateHash: string;
  finalStateHash: string;
  observationCount: number;
  realObservationCount: number;
  calibrationObservationCount: number;
  signalCount: number;
  realSignalCount: number;
  simulatedTradeCount: number;
  realSimulatedTradeCount: number;
  winningSimulatedTrades: number;
  realWinningTrades: number;
  losingSimulatedTrades: number;
  realLosingTrades: number;
  noTradeDecisions: number;
  totalGrossPnl: number;
  realGrossPnl: number;
  totalTransactionCosts: number;
  realTransactionCosts: number;
  totalNetPnl: number;
  realNetPnl: number;
  winRate: number;
  expectancy: number;
  maxDrawdown: number;
  sampleStatus: SampleSufficiencyStatus;
  incidentsCount: number;
  reconciliationStatus: 'RECONCILED' | 'DRIFT_DETECTED';
  evidenceHash: string;
}

export class RealMarketShadowObservationService {
  private static activeSession: ShadowObservationSession | null = null;
  private static observationLedger: ShadowObservationRecord[] = [];

  public static startSession(params?: { strategyVersion?: string; instruments?: string[] }): ShadowObservationSession {
    const startedAt = new Date().toISOString();
    const strategyVersion = params?.strategyVersion || 'ALPHA-ORCHESTRATOR-v1.4.0';
    const instrumentsObserved = params?.instruments || ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
    const sessionId = 'SESSION-SHADOW-' + Date.now();

    const initialStateHash = crypto.createHash('sha256').update(JSON.stringify({
      sessionId,
      startedAt,
      strategyVersion,
      instrumentsObserved,
      environment: 'SHADOW_PRODUCTION'
    })).digest('hex');

    this.activeSession = {
      sessionId,
      startedAt,
      environment: 'SHADOW_PRODUCTION',
      marketDataSource: 'REAL_READ_ONLY_MARKET_DATA',
      instrumentsObserved,
      strategyVersion,
      initialStateHash,
      finalStateHash: initialStateHash,
      observationCount: 0,
      realObservationCount: 0,
      calibrationObservationCount: 0,
      signalCount: 0,
      realSignalCount: 0,
      simulatedTradeCount: 0,
      realSimulatedTradeCount: 0,
      winningSimulatedTrades: 0,
      realWinningTrades: 0,
      losingSimulatedTrades: 0,
      realLosingTrades: 0,
      noTradeDecisions: 0,
      totalGrossPnl: 0,
      realGrossPnl: 0,
      totalTransactionCosts: 0,
      realTransactionCosts: 0,
      totalNetPnl: 0,
      realNetPnl: 0,
      winRate: 0,
      expectancy: 0,
      maxDrawdown: 0,
      sampleStatus: 'INSUFFICIENT_SAMPLE',
      incidentsCount: 0,
      reconciliationStatus: 'RECONCILED',
      evidenceHash: initialStateHash
    };

    this.observationLedger = [];
    return { ...this.activeSession };
  }

  public static recordObservation(record: {
    observationSource?: ObservationSourceType;
    symbol: string;
    currentPrice: number;
    direction: 'BUY' | 'SELL' | 'NO_TRADE';
    confidence: number;
    whyReasons: string[];
    whyNotReasons: string[];
    riskDecision: 'APPROVED' | 'REJECTED';
    economicContextDecision: 'TRADE_ALLOWED' | 'NEWS_BLOCKED' | 'STALE_DATA_BLOCKED';
    simulatedTradeExecuted?: boolean;
    grossPnl?: number;
    transactionCost?: number;
    netPnl?: number;
  }): ShadowObservationRecord {
    if (!this.activeSession) {
      this.startSession();
    }

    const observationSource = record.observationSource || 'REAL_MARKET_SHADOW';
    const timestampUtc = new Date().toISOString();
    const observationId = 'OBS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      observationId,
      observationSource,
      timestampUtc,
      ...record
    })).digest('hex');

    const obs: ShadowObservationRecord = {
      observationId,
      observationSource,
      timestampUtc,
      symbol: record.symbol,
      currentPrice: record.currentPrice,
      direction: record.direction,
      confidence: record.confidence,
      whyReasons: record.whyReasons,
      whyNotReasons: record.whyNotReasons,
      riskDecision: record.riskDecision,
      economicContextDecision: record.economicContextDecision,
      simulatedTradeExecuted: !!record.simulatedTradeExecuted,
      grossPnl: record.grossPnl || 0,
      transactionCost: record.transactionCost || 0,
      netPnl: record.netPnl || 0,
      evidenceHash
    };

    this.observationLedger.push(obs);

    const sess = this.activeSession!;
    sess.observationCount++;
    if (record.direction !== 'NO_TRADE') sess.signalCount++;
    else sess.noTradeDecisions++;

    if (observationSource === 'REAL_MARKET_SHADOW') {
      sess.realObservationCount++;
      if (record.direction !== 'NO_TRADE') sess.realSignalCount++;

      if (record.simulatedTradeExecuted) {
        sess.simulatedTradeCount++;
        sess.realSimulatedTradeCount++;
        sess.totalGrossPnl += record.grossPnl || 0;
        sess.realGrossPnl += record.grossPnl || 0;
        sess.totalTransactionCosts += record.transactionCost || 0;
        sess.realTransactionCosts += record.transactionCost || 0;
        sess.totalNetPnl += record.netPnl || 0;
        sess.realNetPnl += record.netPnl || 0;

        if ((record.netPnl || 0) > 0) {
          sess.winningSimulatedTrades++;
          sess.realWinningTrades++;
        } else {
          sess.losingSimulatedTrades++;
          sess.realLosingTrades++;
        }
      }

      sess.winRate = sess.realSimulatedTradeCount > 0 ? Number((sess.realWinningTrades / sess.realSimulatedTradeCount).toFixed(3)) : 0;
      sess.expectancy = sess.realSimulatedTradeCount > 0 ? Number((sess.realNetPnl / sess.realSimulatedTradeCount).toFixed(2)) : 0;

      if (sess.observationCount < 30) sess.sampleStatus = 'INSUFFICIENT_SAMPLE';
      else if (sess.observationCount < 100) sess.sampleStatus = 'PRELIMINARY';
      else if (sess.observationCount < 500) sess.sampleStatus = 'OBSERVATION_ONLY';
      else sess.sampleStatus = 'STATISTICALLY_INFORMATIVE';
    } else {
      sess.calibrationObservationCount++;
    }

    sess.finalStateHash = crypto.createHash('sha256').update(JSON.stringify({
      sessionId: sess.sessionId,
      observationCount: sess.observationCount,
      realObservationCount: sess.realObservationCount,
      calibrationObservationCount: sess.calibrationObservationCount,
      realNetPnl: sess.realNetPnl,
      evidenceHash: obs.evidenceHash
    })).digest('hex');

    sess.evidenceHash = sess.finalStateHash;

    return obs;
  }

  public static getActiveSession(): ShadowObservationSession {
    if (!this.activeSession) {
      this.startSession();
    }
    return { ...this.activeSession! };
  }

  public static getObservationLedger(): ShadowObservationRecord[] {
    return [...this.observationLedger];
  }

  public static getProductionRealMarketLedger(): ShadowObservationRecord[] {
    return this.observationLedger.filter(r => r.observationSource === 'REAL_MARKET_SHADOW');
  }
}
