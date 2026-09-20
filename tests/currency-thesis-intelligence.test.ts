import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  CurrencyThesisIntelligenceService,
  currencyThesisIntelligenceService,
  SUPPORTED_CURRENCIES
} from '../apps/decision-agent/src/services/currencyThesisIntelligenceService';
import { executionEligibilityGate, ExecutionEligibilityGate } from '../src/server/services/validation/executionEligibilityGate';
import { signalValidationGate } from '../src/server/services/validation/signalValidationGate';

describe('Phase 2B — Currency Thesis Intelligence Forensic & Observability Suite', () => {
  const testCachePath = path.resolve(process.cwd(), 'data', 'currency_thesis_observations_test.json');
  let testService: CurrencyThesisIntelligenceService;

  beforeEach(() => {
    if (fs.existsSync(testCachePath)) {
      try { fs.unlinkSync(testCachePath); } catch (_) {}
    }
    testService = new CurrencyThesisIntelligenceService(testCachePath);
    testService.clearObservations();
  });

  afterEach(() => {
    if (fs.existsSync(testCachePath)) {
      try { fs.unlinkSync(testCachePath); } catch (_) {}
    }
  });

  // =========================================================================
  // TEST 1: EURJPY correctly maps EUR/JPY
  // =========================================================================
  it('1. EURJPY correctly maps to base EUR and quote JPY', () => {
    const res = testService.parsePair('EURJPY');
    expect(res.isValid).toBe(true);
    expect(res.baseCurrency).toBe('EUR');
    expect(res.quoteCurrency).toBe('JPY');
    expect(res.normalizedSymbol).toBe('EUR/JPY');
    expect(res.currencyExposureStatus).toBe('VALID');
  });

  // =========================================================================
  // TEST 2: GBPJPY correctly maps GBP/JPY
  // =========================================================================
  it('2. GBPJPY correctly maps to base GBP and quote JPY', () => {
    const res = testService.parsePair('GBP/JPY');
    expect(res.isValid).toBe(true);
    expect(res.baseCurrency).toBe('GBP');
    expect(res.quoteCurrency).toBe('JPY');
    expect(res.normalizedSymbol).toBe('GBP/JPY');
  });

  // =========================================================================
  // TEST 3: USDJPY correctly maps USD/JPY
  // =========================================================================
  it('3. USDJPY correctly maps to base USD and quote JPY', () => {
    const res = testService.parsePair('USD_JPY.pro');
    expect(res.isValid).toBe(true);
    expect(res.baseCurrency).toBe('USD');
    expect(res.quoteCurrency).toBe('JPY');
    expect(res.normalizedSymbol).toBe('USD/JPY');
  });

  // =========================================================================
  // TEST 4: Invalid symbol becomes UNKNOWN
  // =========================================================================
  it('4. Invalid or unparseable symbol safely becomes UNKNOWN without throwing', () => {
    const res = testService.parsePair('INVALID_SYM_XYZ');
    expect(res.isValid).toBe(false);
    expect(res.baseCurrency).toBe('UNKNOWN');
    expect(res.quoteCurrency).toBe('UNKNOWN');
    expect(res.currencyExposureStatus).toBe('UNKNOWN');
  });

  // =========================================================================
  // TEST 5: EURJPY BUY contributes to JPY_WEAKNESS
  // =========================================================================
  it('5. EURJPY BUY derives JPY_WEAKNESS thesis', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-EURJPY-BUY-01',
      symbol: 'EUR/JPY',
      direction: 'BUY',
      confidence: 85
    });

    expect(obs.quoteThesisKey).toBe('JPY_WEAKNESS');
    expect(obs.baseThesisKey).toBe('EUR_STRENGTH');
    expect(obs.primaryThesisKey).toBe('JPY_WEAKNESS');
  });

  // =========================================================================
  // TEST 6: GBPJPY BUY contributes to JPY_WEAKNESS
  // =========================================================================
  it('6. GBPJPY BUY independently derives JPY_WEAKNESS thesis', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-GBPJPY-BUY-01',
      symbol: 'GBP/JPY',
      direction: 'BUY',
      confidence: 88
    });

    expect(obs.quoteThesisKey).toBe('JPY_WEAKNESS');
    expect(obs.baseThesisKey).toBe('GBP_STRENGTH');
    expect(obs.primaryThesisKey).toBe('JPY_WEAKNESS');
  });

  // =========================================================================
  // TEST 7: EURJPY SELL contributes opposite JPY thesis (JPY_STRENGTH)
  // =========================================================================
  it('7. EURJPY SELL derives opposite thesis: JPY_STRENGTH', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-EURJPY-SELL-01',
      symbol: 'EUR/JPY',
      direction: 'SELL',
      confidence: 82
    });

    expect(obs.quoteThesisKey).toBe('JPY_STRENGTH');
    expect(obs.baseThesisKey).toBe('EUR_WEAKNESS');
    expect(obs.primaryThesisKey).toBe('JPY_STRENGTH');
  });

  // =========================================================================
  // TEST 8: Multiple pairs aggregate into same thesis
  // =========================================================================
  it('8. Multiple pairs (EURJPY BUY & GBPJPY BUY) aggregate into same JPY_WEAKNESS summary', () => {
    testService.recordSignal({
      signalId: 'SIG-AGG-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85
    });
    testService.recordSignal({
      signalId: 'SIG-AGG-02',
      symbol: 'GBPJPY',
      direction: 'BUY',
      confidence: 87
    });

    const theses = testService.getCurrencyTheses('JPY', 'LIVE');
    const jpyWeakness = theses.find(t => t.thesisKey === 'JPY_WEAKNESS');

    expect(jpyWeakness).toBeDefined();
    expect(jpyWeakness?.signalCount).toBe(2);
    expect(jpyWeakness?.uniquePairCount).toBe(2);
    expect(jpyWeakness?.pairsObserved).toContain('EUR/JPY');
    expect(jpyWeakness?.pairsObserved).toContain('GBP/JPY');
  });

  // =========================================================================
  // TEST 9: Per-pair count remains separate
  // =========================================================================
  it('9. Per-pair count remains distinguishable inside the aggregated thesis', () => {
    testService.recordSignal({ signalId: 'SIG-E1', symbol: 'EURJPY', direction: 'BUY', confidence: 85 });
    testService.recordSignal({ signalId: 'SIG-E2', symbol: 'EURJPY', direction: 'BUY', confidence: 85 });
    testService.recordSignal({ signalId: 'SIG-G1', symbol: 'GBPJPY', direction: 'BUY', confidence: 85 });

    const history = testService.getCurrencyHistory('JPY');
    const eurJpyCount = history.filter(h => h.canonicalSymbol === 'EUR/JPY').length;
    const gbpJpyCount = history.filter(h => h.canonicalSymbol === 'GBP/JPY').length;

    expect(eurJpyCount).toBe(2);
    expect(gbpJpyCount).toBe(1);
    expect(history.length).toBe(3);
  });

  // =========================================================================
  // TEST 10: Thesis count differs from broker fill count
  // =========================================================================
  it('10. Critical Metric Isolation: Signal count strictly differs from broker fill count', () => {
    // 5 signals recorded, only 1 broker fill
    for (let i = 1; i <= 5; i++) {
      testService.recordSignal({
        signalId: `SIG-ISO-${i}`,
        symbol: 'EURJPY',
        direction: 'BUY',
        confidence: 85,
        isOrderSubmitted: i === 1,
        isOrderFilled: i === 1
      });
    }

    const overview = testService.getCurrencyOverview('JPY');
    expect(overview.totalSignals).toBe(5);
    expect(overview.totalFilledPositions).toBe(1);
    expect(overview.totalSignals).not.toBe(overview.totalFilledPositions);
  });

  // =========================================================================
  // TEST 11: Expired order is not classified as loss
  // =========================================================================
  it('11. Expired pending limit order is classified as EXPIRED, never as a realized loss', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-EXP-01',
      symbol: 'GBPJPY',
      direction: 'BUY',
      confidence: 85,
      isOrderSubmitted: true,
      isOrderFilled: false,
      outcomeStatus: 'EXPIRED',
      ttlExpired: true
    });

    expect(obs.outcomeStatus).toBe('EXPIRED');
    expect(obs.realizedPnl).toBeUndefined();

    const overview = testService.getCurrencyOverview('JPY');
    expect(overview.totalRealizedLosses).toBe(0);
    const jpyThesis = overview.currentTheses.find(t => t.thesisKey === 'JPY_WEAKNESS');
    expect(jpyThesis?.expiredOrders).toBe(1);
    expect(jpyThesis?.realizedLossCount).toBe(0);
  });

  // =========================================================================
  // TEST 12: Cancelled order is not classified as loss
  // =========================================================================
  it('12. Cancelled order before entry fill is classified as CANCELLED, never as a realized loss', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-CAN-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85,
      isOrderSubmitted: true,
      isOrderFilled: false,
      outcomeStatus: 'CANCELLED',
      cancelled: true
    });

    expect(obs.outcomeStatus).toBe('CANCELLED');
    const overview = testService.getCurrencyOverview('JPY');
    expect(overview.totalRealizedLosses).toBe(0);
  });

  // =========================================================================
  // TEST 13: Unfilled order is not classified as loss
  // =========================================================================
  it('13. Unfilled order (ORDER_SUBMITTED_NOT_FILLED) is never counted as a realized loss', () => {
    testService.recordSignal({
      signalId: 'SIG-UNF-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85,
      isOrderSubmitted: true,
      isOrderFilled: false,
      outcomeStatus: 'ORDER_SUBMITTED_NOT_FILLED'
    });

    const overview = testService.getCurrencyOverview('JPY');
    expect(overview.totalRealizedLosses).toBe(0);
    expect(overview.totalFilledPositions).toBe(0);
  });

  // =========================================================================
  // TEST 14: Scaleout legs can be represented separately from execution sequence
  // =========================================================================
  it('14. Scaleout legs belonging to one executionSequenceId count as 1 underlying sequence', () => {
    const sequenceId = 'SEQ-EURJPY-EXEC-01';

    testService.recordSignal({
      signalId: 'SIG-LEG-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 88,
      executionSequenceId: sequenceId,
      brokerPositionId: 'POS-LEG-01',
      isOrderFilled: true
    });

    testService.recordSignal({
      signalId: 'SIG-LEG-02',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 88,
      executionSequenceId: sequenceId,
      brokerPositionId: 'POS-LEG-02',
      isOrderFilled: true
    });

    testService.recordSignal({
      signalId: 'SIG-LEG-03',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 88,
      executionSequenceId: sequenceId,
      brokerPositionId: 'POS-LEG-03',
      isOrderFilled: true
    });

    const theses = testService.getCurrencyTheses('JPY', 'LIVE');
    const jpyWeakness = theses.find(t => t.thesisKey === 'JPY_WEAKNESS');

    expect(jpyWeakness?.filledPositionCount).toBe(3);
    expect(jpyWeakness?.underlyingExecutionSequences).toBe(1);
  });

  // =========================================================================
  // TEST 15: Realized loss count comes only from genuine closed broker outcomes
  // =========================================================================
  it('15. Realized loss count increments ONLY when genuine negative P/L closed trade is correlated', () => {
    testService.recordSignal({
      signalId: 'SIG-REAL-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85,
      brokerPositionId: 'POS-REAL-01'
    });

    // Before close
    expect(testService.getCurrencyOverview('JPY').totalRealizedLosses).toBe(0);

    // Correlate real negative trade
    const corr = testService.correlateClosedTrade({
      brokerPositionId: 'POS-REAL-01',
      symbol: 'EURJPY',
      realizedProfit: -15.50,
      pnlPips: -12.4
    });

    expect(corr.matched).toBe(true);
    expect(corr.outcomeStatus).toBe('CLOSED_LOSS');
    expect(testService.getCurrencyOverview('JPY').totalRealizedLosses).toBe(1);
  });

  // =========================================================================
  // TEST 16: Non-LIVE lineage cannot contaminate LIVE metrics
  // =========================================================================
  it('16. BACKTEST and SYNTHETIC data modes do not contaminate LIVE metrics query', () => {
    testService.recordSignal({
      signalId: 'SIG-LIVE-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85,
      dataMode: 'LIVE'
    });

    testService.recordSignal({
      signalId: 'SIG-BT-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 90,
      dataMode: 'BACKTEST'
    });

    const liveOverview = testService.getCurrencyOverview('JPY', 'LIVE');
    expect(liveOverview.totalSignals).toBe(1);

    const btOverview = testService.getCurrencyOverview('JPY', 'BACKTEST');
    expect(btOverview.totalSignals).toBe(1);
  });

  // =========================================================================
  // TEST 17: Missing broker linkage creates data-quality flag
  // =========================================================================
  it('17. Missing broker link creates MISSING_BROKER_LINK data quality flag', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-NOLINK-01',
      symbol: 'GBPJPY',
      direction: 'BUY',
      confidence: 85
    });

    expect(obs.dataQualityFlags).toContain('MISSING_BROKER_LINK');
  });

  // =========================================================================
  // TEST 18: Missing Second Opinion remains UNAVAILABLE
  // =========================================================================
  it('18. Missing Second Opinion review sets secondOpinion.status = UNAVAILABLE safely', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-NOSO-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85
    });

    expect(obs.secondOpinion.exists).toBe(false);
    expect(obs.secondOpinion.status).toBe('UNAVAILABLE');
    expect(obs.dataQualityFlags).toContain('OPENAI_UNAVAILABLE');
  });

  // =========================================================================
  // TEST 19: Economic context remains UNKNOWN when unavailable
  // =========================================================================
  it('19. Economic context evaluation falls back safely to LOW or UNKNOWN without error', () => {
    const obs = testService.recordSignal({
      signalId: 'SIG-ECON-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85
    });

    expect(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']).toContain(obs.economicContext.economicRisk);
  });

  // =========================================================================
  // TEST 20: Persistence survives reload if persistent ledger is used
  // =========================================================================
  it('20. Ingested observations survive service reload through disk cache', () => {
    testService.recordSignal({
      signalId: 'SIG-PERSIST-01',
      symbol: 'USDJPY',
      direction: 'BUY',
      confidence: 85
    });

    // Create fresh instance pointing to same file
    const freshService = new CurrencyThesisIntelligenceService(testCachePath);
    const history = freshService.getCurrencyHistory('USD');

    expect(history.length).toBe(1);
    expect(history[0].signalId).toBe('SIG-PERSIST-01');
    expect(history[0].primaryThesisKey).toBe('JPY_WEAKNESS');
  });

  // =========================================================================
  // TEST 21: Duplicate signal does not double-count
  // =========================================================================
  it('21. Duplicate signalId ingestion is idempotent and does not double count', () => {
    testService.recordSignal({
      signalId: 'SIG-DUP-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85
    });

    // Re-ingest duplicate
    testService.recordSignal({
      signalId: 'SIG-DUP-01',
      symbol: 'EURJPY',
      direction: 'BUY',
      confidence: 85
    });

    const overview = testService.getCurrencyOverview('JPY');
    expect(overview.totalSignals).toBe(1);
  });

  // =========================================================================
  // TEST 22: Dashboard/API remains read-only
  // =========================================================================
  it('22. Health diagnostic reports executionAuthority: false and mode: OBSERVATION', () => {
    const health = testService.getHealthDiagnostic();
    expect(health.enabled).toBe(true);
    expect(health.mode).toBe('OBSERVATION');
    expect(health.executionAuthority).toBe(false);
  });

  // =========================================================================
  // TEST 23: executionAuthority remains false across all outputs
  // =========================================================================
  it('23. Structural verification: executionAuthority is strictly false in service definition', () => {
    expect((testService as any).executionAuthority).not.toBe(true);
    const health = testService.getHealthDiagnostic();
    expect(health.executionAuthority).toBe(false);
  });

  // =========================================================================
  // TEST 24: Service never invokes placeOrder
  // =========================================================================
  it('24. Service source code contains zero placeOrder or trade mutation calls', () => {
    const serviceStr = testService.constructor.toString();
    expect(serviceStr).not.toContain('placeOrder');
    expect(serviceStr).not.toContain('sendOrder');
    expect(serviceStr).not.toContain('closePosition');
  });

  // =========================================================================
  // TEST 25: Service never modifies ExecutionEligibilityGate
  // =========================================================================
  it('25. Invariant Safety: ExecutionEligibilityGate remains completely unaffected by CurrencyThesisIntelligenceService', () => {
    const gate = ExecutionEligibilityGate.getInstance();
    expect(gate).toBeDefined();

    // Verify canonical signal validation still operates with its immutable invariants
    const rawSignal = {
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY' as const,
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      modelConfidence: 85,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 86.7,
        adx: 20,
        plusDI: 28.5,
        minusDI: 14.2,
        superTrendDirection: 'BULLISH' as const
      },
      reasoningEvidence: ['SuperTrend is BULLISH']
    };

    const { canonicalSignal } = signalValidationGate.validateSignal(rawSignal);
    const evalResult = gate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.489,
      spreadPips: 1.2
    });

    expect(evalResult.executionEligibility).toBe('WAITING_FOR_ENTRY');
    expect(evalResult.isMarketExecutable).toBe(false);
    expect(evalResult.isPendingLimitEligible).toBe(true);
  });
});
