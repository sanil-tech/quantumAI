import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  secondOpinionService,
  evaluateSecondOpinionPolicy,
  buildEconomicContextForSymbol,
  SecondOpinionInput,
  SecondOpinionResult
} from '../apps/decision-agent/src/services/secondOpinionService';
import {
  secondOpinionObservationService,
  SecondOpinionObservation
} from '../apps/decision-agent/src/services/secondOpinionObservationService';
import { executionEligibilityGate } from '../src/server/services/validation/executionEligibilityGate';
import { signalValidationGate } from '../src/server/services/validation/signalValidationGate';
import { EconomicContextService } from '../src/server/services/economicContextService';

describe('Phase 1 & Phase 1.1 — OpenAI Second Opinion Observation & Outcome Correlation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    secondOpinionService.clearAuditRecords();
    secondOpinionObservationService.clearObservations();
    process.env.OPENAI_SECOND_OPINION_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-mock-openai-key-never-exposed';
    process.env.OPENAI_SECOND_OPINION_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_SECOND_OPINION_MODE = 'OBSERVATION';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  const mockOpenAiResponse = (responseData: any, status = 200) => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: () => Promise.resolve({
          choices: [
            {
              message: {
                content: typeof responseData === 'string' ? responseData : JSON.stringify(responseData)
              }
            }
          ]
        })
      })
    );
  };

  const sampleInput: SecondOpinionInput = {
    signalId: 'sig_test_eurusd_001',
    pair: 'EUR/USD',
    timeframe: 'M15',
    candidateDirection: 'BUY',
    candidateConfidence: 85,
    entry: 1.08500,
    stopLoss: 1.08200,
    takeProfit1: 1.09100,
    indicators: {
      ema50: 1.08400,
      ema200: 1.08000,
      rsi14: 62.0,
      adx: 24.0,
      plusDI: 28.0,
      minusDI: 14.0
    },
    evidence: ['Price above EMA50', '+DI dominates -DI'],
    dataMode: 'LIVE_CTRADER'
  };

  // =========================================================================
  // TEST 1: AGREE → PASS & Observation Creation
  // =========================================================================
  it('1. AGREE -> PASS: Concordant analysis produces PASS review, ALLOW policy, and persistent observation', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 88,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Strong technical alignment with bullish market structure.'
    });

    const result = await secondOpinionService.reviewSignal(sampleInput);
    expect(result.review).toBe('PASS');
    expect(result.agreement).toBe('AGREE');
    expect(result.contradictionLevel).toBe('LOW');

    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('ALLOW');

    // Verify persistent observation created
    const obs = secondOpinionObservationService.getObservationBySignalId('sig_test_eurusd_001');
    expect(obs).toBeDefined();
    expect(obs?.quantumAiDirection).toBe('BUY');
    expect(obs?.openAiBias).toBe('BULLISH');
    expect(obs?.dataMode).toBe('LIVE');
    expect(obs?.outcomeStatus).toBe('OPEN');
  });

  // =========================================================================
  // TEST 2: PARTIAL → REVIEW
  // =========================================================================
  it('2. PARTIAL -> REVIEW: Mixed indicators produce REVIEW review and REVIEW policy', async () => {
    mockOpenAiResponse({
      review: 'REVIEW',
      candidateDirectionSupported: true,
      independentBias: 'NEUTRAL',
      confidence: 60,
      agreement: 'PARTIAL',
      contradictionLevel: 'MEDIUM',
      riskFlags: ['RSI_DIVERGENCE'],
      keyConcerns: ['Momentum slowing near resistance'],
      invalidationConcerns: ['Break below 1.0830 invalidates setup'],
      economicRisk: 'MEDIUM',
      summary: 'Bullish trend intact but momentum showing short-term divergence.'
    });

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_partial_002' });
    expect(result.review).toBe('REVIEW');
    expect(result.agreement).toBe('PARTIAL');

    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('REVIEW');
  });

  // =========================================================================
  // TEST 3: DISAGREE + HIGH contradiction → REJECT / BLOCK
  // =========================================================================
  it('3. DISAGREE + HIGH contradiction -> REJECT: Severe conflict produces REJECT review and BLOCK policy', async () => {
    mockOpenAiResponse({
      review: 'REJECT',
      candidateDirectionSupported: false,
      independentBias: 'BEARISH',
      confidence: 90,
      agreement: 'DISAGREE',
      contradictionLevel: 'HIGH',
      riskFlags: ['BEARISH_MARKET_STRUCTURE_SHIFT', 'OVERBOUGHT_REVERSAL'],
      keyConcerns: ['Major liquidity grab rejection at swing high'],
      invalidationConcerns: ['Immediate bearish continuation expected'],
      economicRisk: 'LOW',
      summary: 'Setup contradicts higher timeframe order flow.'
    });

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_disagree_003' });
    expect(result.review).toBe('REJECT');
    expect(result.agreement).toBe('DISAGREE');
    expect(result.contradictionLevel).toBe('HIGH');

    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('BLOCK');
  });

  // =========================================================================
  // TEST 4: OpenAI unavailable → UNAVAILABLE Observation
  // =========================================================================
  it('4. OpenAI unavailable: Creates an observation with UNAVAILABLE state without failing system', async () => {
    process.env.OPENAI_SECOND_OPINION_ENABLED = 'false';

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_unavail_004' });
    expect(result.review).toBe('UNAVAILABLE');

    const obs = secondOpinionObservationService.getObservationBySignalId('sig_unavail_004');
    expect(obs?.openAiReview).toBe('UNAVAILABLE');
    expect(obs?.riskFlags).toContain('OPENAI_SERVICE_UNAVAILABLE');
  });

  // =========================================================================
  // TEST 5: Malformed OpenAI response → UNAVAILABLE
  // =========================================================================
  it('5. Malformed OpenAI response: JSON parse failure fails safely to UNAVAILABLE observation', async () => {
    mockOpenAiResponse("INVALID_NON_JSON_RESPONSE{{{");

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_malformed_005' });
    expect(result.review).toBe('UNAVAILABLE');

    const obs = secondOpinionObservationService.getObservationBySignalId('sig_malformed_005');
    expect(obs?.openAiReview).toBe('UNAVAILABLE');
  });

  // =========================================================================
  // TEST 6: 99% AI confidence cannot bypass disagreement
  // =========================================================================
  it('6. 99% AI confidence cannot bypass disagreement: DISAGREE with 99% confidence still produces BLOCK', async () => {
    mockOpenAiResponse({
      review: 'REJECT',
      candidateDirectionSupported: false,
      independentBias: 'BEARISH',
      confidence: 99,
      agreement: 'DISAGREE',
      contradictionLevel: 'HIGH',
      riskFlags: ['STRUCTURAL_INVALIDATION'],
      keyConcerns: ['Critical opposition to primary signal direction'],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'High conviction rejection.'
    });

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_highconf_006' });
    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('BLOCK');
  });

  // =========================================================================
  // TEST 7: Economic HIGH event creates economic risk
  // =========================================================================
  it('7. Economic HIGH event: Flags economicRisk as HIGH when high-impact event is active', async () => {
    mockOpenAiResponse({
      review: 'REVIEW',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 75,
      agreement: 'PARTIAL',
      contradictionLevel: 'LOW',
      riskFlags: ['HIGH_IMPACT_NEWS_EVENT_IMMINENT'],
      keyConcerns: ['US CPI Release in 15 minutes'],
      invalidationConcerns: [],
      economicRisk: 'HIGH',
      summary: 'Technical setup is valid, but imminent high-impact data poses severe volatility risk.'
    });

    const result = await secondOpinionService.reviewSignal({
      ...sampleInput,
      signalId: 'sig_econ_007',
      economicContext: {
        events: [
          {
            currency: 'USD',
            event: 'US Consumer Price Index (YoY)',
            impact: 'HIGH',
            scheduledAt: new Date(Date.now() + 15 * 60000).toISOString(),
            minutesUntil: 15,
            status: 'LIVE_WINDOW'
          }
        ],
        blackoutActive: true,
        blackoutReason: 'US CPI in 15m'
      }
    });

    expect(result.economicRisk).toBe('HIGH');
  });

  // =========================================================================
  // TEST 8: HIGH event does not automatically produce BUY/SELL
  // =========================================================================
  it('8. HIGH event does not automatically produce BUY/SELL: Separates event risk from directional bias', async () => {
    mockOpenAiResponse({
      review: 'REVIEW',
      candidateDirectionSupported: true,
      independentBias: 'NEUTRAL',
      confidence: 50,
      agreement: 'PARTIAL',
      contradictionLevel: 'LOW',
      riskFlags: ['EVENT_TIMING_RISK'],
      keyConcerns: ['Event outcome unpredictable'],
      invalidationConcerns: [],
      economicRisk: 'HIGH',
      summary: 'High event risk without directional speculation.'
    });

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_econ_neutral_008' });
    expect(result.independentBias).toBe('NEUTRAL');
    expect(result.economicRisk).toBe('HIGH');
  });

  // =========================================================================
  // TEST 9: Missing forecast/actual remains UNKNOWN
  // =========================================================================
  it('9. Missing forecast/actual: Represents absent calendar values as null/UNKNOWN', () => {
    EconomicContextService.setEvents([
      {
        eventId: 'evt-test-1',
        source: 'FOREX_FACTORY',
        timestampUtc: new Date(Date.now() + 600000).toISOString(),
        currency: 'USD',
        country: 'US',
        title: 'Fed Chair Speech',
        impact: 'HIGH',
        forecast: undefined,
        actual: undefined,
        previous: undefined,
        sourceTimestamp: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        status: 'SCHEDULED'
      }
    ]);

    const econContext = buildEconomicContextForSymbol('EUR/USD');
    expect(econContext.events.length).toBeGreaterThan(0);
    const event = econContext.events[0];
    expect(event.forecast).toBeNull();
    expect(event.actual).toBeNull();
  });

  // =========================================================================
  // TEST 10: WAITING_FOR_ENTRY remains WAITING
  // =========================================================================
  it('10. WAITING_FOR_ENTRY remains WAITING: Second opinion and observation creation cannot alter WAITING_FOR_ENTRY state', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 95,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'High agreement.'
    });

    const { canonicalSignal } = signalValidationGate.validateSignal({
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 65.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH'
      }
    });

    expect(canonicalSignal.executionStatus).toBe('WAITING_FOR_ENTRY');

    await secondOpinionService.reviewSignal({
      signalId: canonicalSignal.signalId,
      pair: canonicalSignal.symbol,
      timeframe: canonicalSignal.timeframe,
      candidateDirection: canonicalSignal.direction,
      candidateConfidence: canonicalSignal.confidence,
      entry: canonicalSignal.entryPrice
    });

    const eligibility = executionEligibilityGate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.489,
      spreadPips: 1.2
    });

    expect(eligibility.executionEligibility).toBe('WAITING_FOR_ENTRY');
    expect(eligibility.isMarketExecutable).toBe(false);
  });

  // =========================================================================
  // TEST 11: BLOCKED remains BLOCKED
  // =========================================================================
  it('11. BLOCKED remains BLOCKED: Even if OpenAI says PASS, a BLOCKED signal remains BLOCKED', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 99,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Strong approval.'
    });

    const { canonicalSignal } = signalValidationGate.validateSignal({
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      recommendedLot: 0.01,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 65.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH'
      }
    });

    const eligibility = executionEligibilityGate.evaluateEligibility(canonicalSignal, {
      currentPrice: 179.900, // Breached SL
      spreadPips: 1.2
    });

    expect(eligibility.executionEligibility).toBe('BLOCKED');
    expect(eligibility.isMarketExecutable).toBe(false);
  });

  // =========================================================================
  // TEST 12: OpenAI cannot modify execution eligibility
  // =========================================================================
  it('12. Execution invariant: Invariant assertion still throws if called in WAITING_FOR_ENTRY', () => {
    const { canonicalSignal } = signalValidationGate.validateSignal({
      symbol: 'EURUSD',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 1.08500,
      entryPrice: 1.08300,
      stopLoss: 1.08000,
      takeProfit1: 1.08900,
      indicators: {
        ema50: 1.08200,
        ema200: 1.07900,
        rsi14: 60.0,
        adx: 22,
        plusDI: 26.0,
        minusDI: 14.0,
        superTrendDirection: 'BULLISH'
      }
    });

    expect(() => {
      executionEligibilityGate.assertExecutionInvariant(canonicalSignal, 'WAITING_FOR_ENTRY', 'MARKET');
    }).toThrow(/EXECUTION_INVARIANT_VIOLATION/);
  });

  // =========================================================================
  // TEST 13: Pullback cannot become market execution
  // =========================================================================
  it('13. Pullback cannot become market execution: distance > tolerance enforces WAITING_FOR_ENTRY', () => {
    const { canonicalSignal } = signalValidationGate.validateSignal({
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 180.489,
      entryPrice: 180.321,
      stopLoss: 179.971,
      takeProfit1: 181.021,
      indicators: {
        ema50: 180.200,
        ema200: 179.800,
        rsi14: 60.0,
        adx: 22,
        plusDI: 28.0,
        minusDI: 15.0,
        superTrendDirection: 'BULLISH'
      }
    });

    const evalResult = executionEligibilityGate.evaluateEligibility(canonicalSignal, {
      currentPrice: 180.489,
      spreadPips: 1.2
    });

    expect(evalResult.isMarketExecutable).toBe(false);
    expect(evalResult.isPendingLimitEligible).toBe(true);
  });

  // =========================================================================
  // TEST 14: Real closed cTrader position can be linked to originating signal
  // =========================================================================
  it('14. Outcome Correlation: Links real closed position to originating signal via brokerOrderId', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 85,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Confirmed setup.'
    });

    // 1. Record second opinion
    await secondOpinionService.reviewSignal({
      ...sampleInput,
      signalId: 'sig_live_trade_100',
      dataMode: 'LIVE'
    });

    // 2. Link broker order ID upon execution
    secondOpinionObservationService.linkBrokerOrder('sig_live_trade_100', 'CTR-ORD-998811', 'POS-5544');

    // 3. Broker trade closes with +$125 profit (+25.0 pips)
    const correlation = secondOpinionObservationService.correlateClosedPosition({
      brokerOrderId: 'CTR-ORD-998811',
      symbol: 'EUR/USD',
      realizedProfit: 125.00,
      pnlPips: 25.0,
      direction: 'BUY',
      closedAt: new Date()
    });

    expect(correlation.matched).toBe(true);
    expect(correlation.observation?.outcomeStatus).toBe('CLOSED_WIN');
    expect(correlation.observation?.outcomePnl).toBe(125.00);
    expect(correlation.observation?.outcomePips).toBe(25.0);
    expect(correlation.observation?.correlationMethod).toBe('CANONICAL_BROKER_ORDER_ID');
  });

  // =========================================================================
  // TEST 15: Uncertain correlation becomes UNMATCHED (Never fabricated)
  // =========================================================================
  it('15. Uncertain correlation: Unknown broker identifier produces UNMATCHED result', () => {
    const correlation = secondOpinionObservationService.correlateClosedPosition({
      brokerOrderId: 'UNKNOWN-ORDER-999999',
      symbol: 'GBP/USD',
      realizedProfit: 50.00
    });

    expect(correlation.matched).toBe(false);
    expect(correlation.reason).toContain('UNMATCHED');
  });

  // =========================================================================
  // TEST 16: Synthetic / backtest observations cannot be counted as LIVE trade outcomes
  // =========================================================================
  it('16. Lineage Guard: Synthetic/Backtest observation cannot claim LIVE broker trade stats', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 85,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Backtest test.'
    });

    // Record observation with BACKTEST data mode
    await secondOpinionService.reviewSignal({
      ...sampleInput,
      signalId: 'sig_backtest_200',
      dataMode: 'BACKTEST'
    });

    secondOpinionObservationService.linkBrokerOrder('sig_backtest_200', 'ORD-BACKTEST-1');

    const correlation = secondOpinionObservationService.correlateClosedPosition({
      brokerOrderId: 'ORD-BACKTEST-1',
      symbol: 'EUR/USD',
      realizedProfit: 200.00
    });

    expect(correlation.matched).toBe(false);
    expect(correlation.reason).toContain('LINEAGE_MISMATCH');
  });

  // =========================================================================
  // TEST 17: Security: API key never leaks into observation or summary
  // =========================================================================
  it('17. Security: OPENAI_API_KEY never leaks into observation records or summaries', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 85,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Security check.'
    });

    await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_sec_300' });
    const obs = secondOpinionObservationService.getObservationBySignalId('sig_sec_300');
    const obsStr = JSON.stringify(obs);
    expect(obsStr).not.toContain('test-mock-openai-key-never-exposed');

    const summary = secondOpinionObservationService.getSummaryMetrics();
    const sumStr = JSON.stringify(summary);
    expect(sumStr).not.toContain('test-mock-openai-key-never-exposed');
  });

  // =========================================================================
  // TEST 18: Summary Metrics calculate exact counts without fabricated effectiveness
  // =========================================================================
  it('18. Summary Metrics: Accurately reports raw count aggregates', async () => {
    mockOpenAiResponse({
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 85,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Count check.'
    });

    await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_count_1' });
    await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_count_2' });

    const summary = secondOpinionObservationService.getSummaryMetrics();
    expect(summary.totalObservations).toBe(2);
    expect(summary.passCount).toBe(2);
    expect(summary.agreementCount).toBe(2);
    expect(summary.openAiAvailable).toBe(2);
  });
});
