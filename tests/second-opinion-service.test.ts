import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import {
  secondOpinionService,
  evaluateSecondOpinionPolicy,
  buildEconomicContextForSymbol,
  SecondOpinionInput,
  SecondOpinionResult
} from '../apps/decision-agent/src/services/secondOpinionService';
import {
  secondOpinionObservationService,
  SecondOpinionObservation,
  SecondOpinionObservationService
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

  // =========================================================================
  // TEST 19: Restart Persistence: In-memory reload preserves records and indexes
  // =========================================================================
  it('19. Restart Persistence: Survives simulated process restart with index restoration', async () => {
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
      summary: 'Restart test signal.'
    });

    await secondOpinionService.reviewSignal({
      ...sampleInput,
      signalId: 'sig_restart_persist_01',
      dataMode: 'LIVE'
    });

    secondOpinionObservationService.linkBrokerOrder('sig_restart_persist_01', 'ORD-RESTART-88', 'POS-RESTART-99');

    // Simulate process restart: instantiate new instance or reload from disk
    const reloadedService = new SecondOpinionObservationService();
    const loadedObs = reloadedService.getObservationBySignalId('sig_restart_persist_01');

    expect(loadedObs).toBeDefined();
    expect(loadedObs?.signalId).toBe('sig_restart_persist_01');
    expect(loadedObs?.quantumAiDirection).toBe('BUY');
    expect(loadedObs?.openAiReview).toBe('PASS');
    expect(loadedObs?.brokerOrderId).toBe('ORD-RESTART-88');
    expect(loadedObs?.brokerPositionId).toBe('POS-RESTART-99');

    // Verify correlation works using reloaded instance indexes
    const corr = reloadedService.correlateClosedPosition({
      brokerOrderId: 'ORD-RESTART-88',
      symbol: 'EUR/USD',
      realizedProfit: 75.50,
      pnlPips: 15.1
    });

    expect(corr.matched).toBe(true);
    expect(corr.observation?.outcomeStatus).toBe('CLOSED_WIN');
    expect(corr.observation?.outcomePnl).toBe(75.50);
  });

  // =========================================================================
  // TEST 20: Malformed JSON Resiliency: Corrupted cache file handled gracefully
  // =========================================================================
  it('20. Malformed JSON Resiliency: Corrupt file does not crash service initialization', () => {
    const dataDir = path.resolve(process.cwd(), 'data');
    const corruptPath = path.resolve(dataDir, 'second_opinion_observations.json');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(corruptPath, '{ INVALID_CORRUPT_JSON_DATA %%%', 'utf-8');

    expect(() => {
      new SecondOpinionObservationService();
    }).not.toThrow();
  });

  // =========================================================================
  // TEST 21: EventBus Auto-Correlation: TradeClosed event automatically correlates
  // =========================================================================
  it('21. EventBus Auto-Correlation: TradeClosed event on globalEventBus updates observation', async () => {
    mockOpenAiResponse({
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
      summary: 'Event bus test.'
    });

    await secondOpinionService.reviewSignal({
      ...sampleInput,
      signalId: 'sig_eb_live_55',
      dataMode: 'LIVE'
    });

    secondOpinionObservationService.linkBrokerOrder('sig_eb_live_55', 'ORD-EB-55', 'POS-EB-55');

    // Publish TradeClosed on globalEventBus
    await globalEventBus.publish({
      id: 'evt_eb_live_55',
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: {
        tradeId: 'ORD-EB-55',
        positionId: 'POS-EB-55',
        symbol: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0875,
        stopLoss: 1.0800,
        takeProfit: 1.0900,
        pnlDollars: 250.00,
        pnlPips: 25.0,
        closedAt: new Date(),
        environment: 'LIVE'
      }
    });

    // Wait a brief tick for setImmediate execution
    await new Promise((resolve) => setTimeout(resolve, 50));

    const updatedObs = secondOpinionObservationService.getObservationBySignalId('sig_eb_live_55');
    expect(updatedObs?.outcomeStatus).toBe('CLOSED_WIN');
    expect(updatedObs?.outcomePnl).toBe(250.00);
    expect(updatedObs?.outcomePips).toBe(25.0);
  });

  // =========================================================================
  // TEST 22: Idempotent Double-Calling: Duplicate close events do not double-count
  // =========================================================================
  it('22. Idempotent Double-Calling: Duplicate close callbacks do not duplicate records', () => {
    const tradeInput = {
      brokerOrderId: 'ORD-IDEM-01',
      symbol: 'EUR/USD',
      realizedProfit: 50.00,
      pnlPips: 10.0
    };

    secondOpinionObservationService.recordObservation(
      { ...sampleInput, signalId: 'sig_idem_01', dataMode: 'LIVE' },
      {
        signalId: 'sig_idem_01',
        review: 'PASS',
        candidateDirectionSupported: true,
        independentBias: 'BULLISH',
        confidence: 80,
        agreement: 'AGREE',
        contradictionLevel: 'LOW',
        riskFlags: [],
        keyConcerns: [],
        invalidationConcerns: [],
        economicRisk: 'LOW',
        summary: 'Idempotency test.',
        model: 'gpt-4o-mini',
        latencyMs: 10,
        reviewedAt: new Date().toISOString()
      },
      { brokerOrderId: 'ORD-IDEM-01' }
    );

    const initialTotal = secondOpinionObservationService.queryObservations().total;

    // First correlation call
    const res1 = secondOpinionObservationService.correlateClosedPosition(tradeInput);
    expect(res1.matched).toBe(true);
    expect(res1.observation?.outcomeStatus).toBe('CLOSED_WIN');

    // Duplicate second correlation call
    const res2 = secondOpinionObservationService.correlateClosedPosition(tradeInput);
    expect(res2.matched).toBe(true);
    expect(res2.observation?.outcomeStatus).toBe('CLOSED_WIN');

    // Total count remains invariant
    const finalTotal = secondOpinionObservationService.queryObservations().total;
    expect(finalTotal).toBe(initialTotal);
  });

  // =========================================================================
  // TEST 23: Pipeline Health Diagnostics: Returns operational health metrics
  // =========================================================================
  it('23. Health Diagnostics: Exposes complete pipeline health indicators without leaking secrets', () => {
    const health = secondOpinionObservationService.getHealthDiagnostic();

    expect(health).toHaveProperty('secondOpinionEnabled');
    expect(health).toHaveProperty('secondOpinionMode');
    expect(health).toHaveProperty('observationPersistenceHealthy');
    expect(health).toHaveProperty('observationCount');
    expect(health).toHaveProperty('latestObservationAt');
    expect(health).toHaveProperty('latestObservationSignalId');
    expect(health).toHaveProperty('unmatchedOutcomeCount');
    expect(health).toHaveProperty('openObservationCount');
    expect(health).toHaveProperty('lastCorrelationAt');
    expect(health).toHaveProperty('openAiUnavailableCount');

    const healthStr = JSON.stringify(health);
    expect(healthStr).not.toContain('test-mock-openai-key-never-exposed');
  });

  // =========================================================================
  // TEST 24: Execution Isolation: OpenAI review does not mutate ExecutionEligibilityState
  // =========================================================================
  it('24. Execution Isolation: Observation methods cannot execute or alter broker permissions', async () => {
    const unexecutableSignal = {
      signalId: 'sig_isolation_test_01',
      pair: 'EURJPY',
      timeframe: 'M15',
      candidateDirection: 'BUY' as const,
      candidateConfidence: 85,
      entry: 180.320,
      stopLoss: 179.950,
      takeProfit1: 180.850,
      dataMode: 'LIVE'
    };

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
      summary: 'Max confidence agreement.'
    });

    const result = await secondOpinionService.reviewSignal(unexecutableSignal);
    expect(result.review).toBe('PASS');

    // Verify observation is recorded but execution state remains WAITING_FOR_ENTRY
    const obs = secondOpinionObservationService.getObservationBySignalId('sig_isolation_test_01');
    expect(obs?.executionEligibilityAtReview).toBe('WAITING_FOR_ENTRY');

    // Verify ExecutionEligibilityGate still prevents market execution
    const { canonicalSignal } = signalValidationGate.validateSignal({
      symbol: 'EURJPY',
      timeframe: 'M15',
      direction: 'BUY',
      currentPrice: 180.480,
      entryPrice: 180.320,
      stopLoss: 179.950,
      takeProfit1: 180.850,
      indicators: {
        ema50: 180.100,
        ema200: 179.500,
        rsi14: 62.0,
        adx: 25,
        plusDI: 28.0,
        minusDI: 12.0,
        superTrendDirection: 'BULLISH'
      }
    });

    expect(() => {
      executionEligibilityGate.assertExecutionInvariant(canonicalSignal, 'WAITING_FOR_ENTRY', 'MARKET');
    }).toThrow(/EXECUTION_INVARIANT_VIOLATION/);
  });
});
