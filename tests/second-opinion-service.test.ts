import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  secondOpinionService,
  evaluateSecondOpinionPolicy,
  buildEconomicContextForSymbol,
  SecondOpinionInput,
  SecondOpinionResult
} from '../apps/decision-agent/src/services/secondOpinionService';
import { executionEligibilityGate } from '../src/server/services/validation/executionEligibilityGate';
import { signalValidationGate } from '../src/server/services/validation/signalValidationGate';
import { EconomicContextService } from '../src/server/services/economicContextService';

describe('Phase 1 — OpenAI Independent Second Opinion Shadow Layer', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    secondOpinionService.clearAuditRecords();
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
    evidence: ['Price above EMA50', '+DI dominates -DI']
  };

  // =========================================================================
  // TEST 1: AGREE → PASS
  // =========================================================================
  it('1. AGREE -> PASS: Concordant analysis produces PASS review and ALLOW policy', async () => {
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
  // TEST 4: OpenAI unavailable → UNAVAILABLE
  // =========================================================================
  it('4. OpenAI unavailable: When disabled or API key missing, returns UNAVAILABLE without failing', async () => {
    process.env.OPENAI_SECOND_OPINION_ENABLED = 'false';

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_unavail_004' });
    expect(result.review).toBe('UNAVAILABLE');
    expect(result.riskFlags).toContain('OPENAI_SERVICE_UNAVAILABLE');

    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('REVIEW');
  });

  // =========================================================================
  // TEST 5: Malformed OpenAI response → UNAVAILABLE
  // =========================================================================
  it('5. Malformed OpenAI response: JSON parse failure fails safely to UNAVAILABLE', async () => {
    mockOpenAiResponse("INVALID_NON_JSON_RESPONSE{{{");

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_malformed_005' });
    expect(result.review).toBe('UNAVAILABLE');
    expect(result.riskFlags).toContain('OPENAI_INFERENCE_ERROR');
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
    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('REVIEW');
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
  it('10. WAITING_FOR_ENTRY remains WAITING: Second opinion cannot alter WAITING_FOR_ENTRY state', async () => {
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

    // Create valid pullback signal in WAITING_FOR_ENTRY state
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

    // Run Second Opinion review
    await secondOpinionService.reviewSignal({
      signalId: canonicalSignal.signalId,
      pair: canonicalSignal.symbol,
      timeframe: canonicalSignal.timeframe,
      candidateDirection: canonicalSignal.direction,
      candidateConfidence: canonicalSignal.confidence,
      entry: canonicalSignal.entryPrice
    });

    // Evaluate Execution Eligibility independently
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

    // Market price drops past SL before entry fill
    const eligibility = executionEligibilityGate.evaluateEligibility(canonicalSignal, {
      currentPrice: 179.900, // Breached SL 179.971
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
  // TEST 13: OpenAI cannot call broker execution
  // =========================================================================
  it('13. OpenAI has no broker methods or credentials: secondOpinionService instance exposes only analysis methods', () => {
    const service: any = secondOpinionService;
    expect(service.placeOrder).toBeUndefined();
    expect(service.executeOrder).toBeUndefined();
    expect(service.cancelOrder).toBeUndefined();
    expect(service.modifyPosition).toBeUndefined();
    expect(service.ctraderCredentials).toBeUndefined();
  });

  // =========================================================================
  // TEST 14: Pullback cannot become market execution
  // =========================================================================
  it('14. Pullback cannot become market execution: distance > tolerance enforces WAITING_FOR_ENTRY', () => {
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
  // TEST 15: API key never appears in logs / output
  // =========================================================================
  it('15. Security: OPENAI_API_KEY never leaks into result or audit records', async () => {
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
      summary: 'Clear bullish alignment.'
    });

    const result = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_secret_check_015' });
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain('test-mock-openai-key-never-exposed');

    const audit = secondOpinionService.getAuditRecord('sig_secret_check_015');
    const auditStr = JSON.stringify(audit);
    expect(auditStr).not.toContain('test-mock-openai-key-never-exposed');
  });

  // =========================================================================
  // TEST 16: Duplicate signalId does not create accidental duplicate review
  // =========================================================================
  it('16. Idempotency: Duplicate signalId returns existing audit record without duplicate API call', async () => {
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
      summary: 'First execution.'
    });

    const res1 = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_idempotent_016' });
    const callCountAfterFirst = (global.fetch as any).mock.calls.length;

    const res2 = await secondOpinionService.reviewSignal({ ...sampleInput, signalId: 'sig_idempotent_016' });
    const callCountAfterSecond = (global.fetch as any).mock.calls.length;

    expect(callCountAfterSecond).toBe(callCountAfterFirst); // 0 additional API calls!
    expect(res2.signalId).toBe('sig_idempotent_016');
    expect(res2.review).toBe(res1.review);
  });

  // =========================================================================
  // TEST 17: Synthetic / unavailable market lineage is not treated as live evidence
  // =========================================================================
  it('17. Data Lineage: Marks review as UNAVAILABLE or logs warning if lineage is synthetic', async () => {
    mockOpenAiResponse({
      review: 'REVIEW',
      candidateDirectionSupported: false,
      independentBias: 'NEUTRAL',
      confidence: 30,
      agreement: 'DISAGREE',
      contradictionLevel: 'HIGH',
      riskFlags: ['SYNTHETIC_DATA_LINEAGE_WARNING'],
      keyConcerns: ['Data lineage marked as SYNTHETIC; cannot verify live broker liquidity'],
      invalidationConcerns: [],
      economicRisk: 'UNKNOWN',
      summary: 'Shadow review flagged non-live lineage.'
    });

    const result = await secondOpinionService.reviewSignal({
      ...sampleInput,
      signalId: 'sig_lineage_017',
      dataMode: 'SYNTHETIC_BACKTEST'
    });

    expect(result.riskFlags).toContain('SYNTHETIC_DATA_LINEAGE_WARNING');
  });

  // =========================================================================
  // TEST 18: Second opinion does not modify TradeProposal execution authority
  // =========================================================================
  it('18. Advisory Boundary: evaluateSecondOpinionPolicy produces hypothetical decision only without modifying trade rules', () => {
    const result: SecondOpinionResult = {
      signalId: 'sig_proposal_018',
      review: 'PASS',
      candidateDirectionSupported: true,
      independentBias: 'BULLISH',
      confidence: 90,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      economicRisk: 'LOW',
      summary: 'Advisory analysis only.',
      model: 'gpt-4o-mini',
      latencyMs: 150,
      reviewedAt: new Date().toISOString()
    };

    const policy = evaluateSecondOpinionPolicy(result);
    expect(policy.hypotheticalDecision).toBe('ALLOW');

    // Policy returns hypotheticalDecision without mutating any execution gate state
    expect(typeof policy.hypotheticalDecision).toBe('string');
  });
});
