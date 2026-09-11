import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { LearningService } from '../src/server/services/learningService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { BacktestEngine } from '../apps/decision-agent/src/services/backtestEngine';
import { CurrencyPair, PostMortemReview } from '../src/types';

describe('QUANTUMAI — MULTI-PAIR PROVENANCE BOUNDARY RUNTIME ATTACK SUITE', () => {
  // Authoritative Full Configured Universe
  const FULL_CONFIGURED_PAIR_UNIVERSE: CurrencyPair[] = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'AUD/USD',
    'USD/CHF',
    'NZD/USD',
    'USD/CAD',
    'EUR/JPY',
    'GBP/JPY',
    'XAU/USD',
    'NASDAQ',
    'BTC/USD'
  ];

  const MULTI_PAIR_BACKTEST_UNIVERSE: CurrencyPair[] = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'AUD/USD',
    'XAU/USD',
    'NASDAQ',
    'BTC/USD'
  ];

  let signalService: SignalIntelligenceService;
  let mockRepo: any;
  let learningService: LearningService;

  beforeEach(() => {
    mockRepo = {
      getPostMortemReviews: vi.fn().mockResolvedValue([]),
      getUnlearnedClosedPositions: vi.fn().mockResolvedValue([]),
      getPostMortemByTradeAndVersion: vi.fn().mockResolvedValue(null),
      getPositionById: vi.fn(),
      savePostMortemReview: vi.fn().mockImplementation(async ({ review }) => review),
      saveTradeEvent: vi.fn().mockResolvedValue({ id: 'evt_test_attack' }),
      getClosedPositions: vi.fn().mockResolvedValue([]),
      getClosedPositionsAcrossAccounts: vi.fn().mockResolvedValue([])
    };

    signalService = SignalIntelligenceService.getInstance();
    learningService = new LearningService(mockRepo);
    aiDecisionEngine.setPostMortemReviews([]);
  });

  it('1. Pair Universe Discovery: Confirms exact universe matches configuration', () => {
    expect(FULL_CONFIGURED_PAIR_UNIVERSE.length).toBe(12);
    expect(MULTI_PAIR_BACKTEST_UNIVERSE.length).toBe(7);
    console.log('[PAIR_UNIVERSE_DISCOVERY] Full Configured Pairs (12):', FULL_CONFIGURED_PAIR_UNIVERSE.join(', '));
    console.log('[PAIR_UNIVERSE_DISCOVERY] Multi-Pair Backtest Universe (7):', MULTI_PAIR_BACKTEST_UNIVERSE.join(', '));
  });

  describe('2. Multi-Pair Backtest Provenance Isolation: Cannot Issue Authoritative Veto Across ANY Pair', () => {
    FULL_CONFIGURED_PAIR_UNIVERSE.forEach(pair => {
      it(`Pair ${pair}: 3 HISTORICAL_BACKTEST losses emit advisory warnings and CANNOT veto`, () => {
        const backtestReviews: PostMortemReview[] = [1, 2, 3].map(i => ({
          id: `pm-1y-${pair.replace('/', '')}-${Date.now()}-${i}`,
          timestamp: Date.now() - i * 3600000,
          pair: pair as any,
          direction: 'BUY',
          entryPrice: 1.0000,
          exitPrice: 0.9900,
          stopLoss: 0.9900,
          takeProfit: 1.0200,
          pnlDollars: -50.00,
          outcome: 'LOSS',
          rootCauseMs: `Simulasi backtest 1-tahun ${pair}`,
          rootCauseEn: `1-Year Backtest Evaluation: BUY setup on ${pair} stopped out at SL.`,
          lessonLearnedMs: 'Perlu buffer lebih lebar',
          lessonLearnedEn: 'Expand SL buffer',
          adaptiveRuleMs: 'Expand SL Buffer',
          adaptiveRuleEn: 'Expand SL Buffer',
          ratingScore: 3,
          provenance: 'HISTORICAL_BACKTEST',
          authority: 'BACKTEST_ENGINE',
          dataSource: 'EXTERNAL_HISTORICAL'
        }));

        aiDecisionEngine.setPostMortemReviews(backtestReviews);

        const result = signalService.evaluateCandidateSetup({
          pair,
          timeframe: 'H1',
          currentPrice: 1.0000,
          indicators: { rsi: 55, ema50: 0.9950, adx: 25 },
          smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0005, low: 0.9995 }] },
          postMortemReviews: aiDecisionEngine.getPostMortemReviews()
        });

        // Invariant: NEVER VETO on backtest reviews
        expect(result.action).not.toBe('VETO');
        expect(result.status).not.toBe('VETOED');
        expect(result.vetoReasons.length).toBe(0);

        // Advisory warning MUST be present in learningEvidence
        const hasWarning = result.learningEvidence.some(e => e.includes('[BACKTEST WARNING]'));
        expect(hasWarning).toBe(true);
        expect(result.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
      });
    });
  });

  describe('3. Multi-Pair Synthetic Simulation Isolation: Cannot Issue Authoritative Veto Across ANY Pair', () => {
    FULL_CONFIGURED_PAIR_UNIVERSE.forEach(pair => {
      it(`Pair ${pair}: 3 SYNTHETIC_SIMULATION losses emit [SIMULATION WARNING] and CANNOT veto`, () => {
        const syntheticReviews: PostMortemReview[] = [1, 2, 3].map(i => ({
          id: `pm-sim-${pair.replace('/', '')}-${Date.now()}-${i}`,
          timestamp: Date.now() - i * 3600000,
          pair: pair as any,
          direction: 'BUY',
          entryPrice: 1.0000,
          exitPrice: 0.9900,
          stopLoss: 0.9900,
          takeProfit: 1.0200,
          pnlDollars: -40.00,
          outcome: 'LOSS',
          rootCauseMs: `Simulasi sintetik offline ${pair}`,
          rootCauseEn: `Synthetic simulation fallback stopped out on ${pair}.`,
          lessonLearnedMs: 'Simulasi offline',
          lessonLearnedEn: 'Offline simulation pattern',
          adaptiveRuleMs: 'Buffer expansion',
          adaptiveRuleEn: 'Buffer expansion',
          ratingScore: 2,
          provenance: 'SYNTHETIC_SIMULATION',
          authority: 'SIMULATION_ONLY',
          dataSource: 'SYNTHETIC_FALLBACK',
          fallbackUsed: true
        }));

        aiDecisionEngine.setPostMortemReviews(syntheticReviews);

        const result = signalService.evaluateCandidateSetup({
          pair,
          timeframe: 'H1',
          currentPrice: 1.0000,
          indicators: { rsi: 55, ema50: 0.9950, adx: 25 },
          smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0005, low: 0.9995 }] },
          postMortemReviews: aiDecisionEngine.getPostMortemReviews()
        });

        // Invariant: NEVER VETO on synthetic simulation reviews
        expect(result.action).not.toBe('VETO');
        expect(result.status).not.toBe('VETOED');
        expect(result.vetoReasons.length).toBe(0);

        // Simulation warning must be present
        const hasSimWarning = result.learningEvidence.some(e => e.includes('[SIMULATION WARNING]'));
        expect(hasSimWarning).toBe(true);
        expect(result.learningEvidence.some(e => e.includes('[ADAPTIVE LEARNING VETO]'))).toBe(false);
      });
    });
  });

  describe('4. Multi-Pair Real Trade Authority: Produces Legitimate Veto on Verified PostgreSQL Losses (N >= 3)', () => {
    FULL_CONFIGURED_PAIR_UNIVERSE.forEach(pair => {
      it(`Pair ${pair}: 3 REAL_TRADE losses with POSTGRESQL authority TRIGGER authoritative veto`, () => {
        const realReviews: PostMortemReview[] = [1, 2, 3].map(i => ({
          id: `pm-real-${pair.replace('/', '')}-${i}`,
          timestamp: Date.now() - i * 86400000,
          pair: pair as any,
          direction: 'BUY',
          entryPrice: 1.0000,
          exitPrice: 0.9900,
          stopLoss: 0.9900,
          takeProfit: 1.0200,
          pnlDollars: -45.00,
          outcome: 'LOSS',
          rootCauseMs: `Kegagalan order block sebenar ${pair}`,
          rootCauseEn: `Real trade order block failure on ${pair}`,
          lessonLearnedMs: 'Elak beli dalam regime penurunan',
          lessonLearnedEn: 'Avoid buying during downtrend expansion',
          adaptiveRuleMs: 'Veto belian retest',
          adaptiveRuleEn: 'Veto retest buying',
          ratingScore: 3,
          provenance: 'REAL_TRADE',
          authority: 'POSTGRESQL',
          dataSource: 'POSTGRESQL_CLOSED_POSITION'
        }));

        aiDecisionEngine.setPostMortemReviews(realReviews);

        const result = signalService.evaluateCandidateSetup({
          pair,
          timeframe: 'H1',
          currentPrice: 1.0000,
          indicators: { rsi: 55, ema50: 0.9950, adx: 25 },
          smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0005, low: 0.9995 }] },
          postMortemReviews: aiDecisionEngine.getPostMortemReviews()
        });

        // Invariant: Authoritative VETO MUST trigger for real trades
        expect(result.action).toBe('VETO');
        expect(result.status).toBe('VETOED');
        expect(result.vetoReasons.length).toBeGreaterThanOrEqual(1);
        expect(result.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
        expect(result.vetoReasons[0]).toContain('Source: REAL_TRADE. Authority: POSTGRESQL.');
      });
    });
  });

  describe('5. Multi-Pair Sample-Size Contamination Attack: 2 Real + 20 Backtest + 20 Synthetic', () => {
    FULL_CONFIGURED_PAIR_UNIVERSE.forEach(pair => {
      it(`Pair ${pair}: 2 Real + 40 Simulated/Backtest does NOT trigger veto (N=2 < 3)`, () => {
        const mixedPopulation: PostMortemReview[] = [
          // 2 REAL_TRADE losses
          {
            id: `pm-real-${pair.replace('/', '')}-1`,
            timestamp: Date.now() - 86400000,
            pair: pair as any,
            direction: 'BUY',
            entryPrice: 1.0000,
            exitPrice: 0.9900,
            stopLoss: 0.9900,
            takeProfit: 1.0200,
            pnlDollars: -30.00,
            outcome: 'LOSS',
            rootCauseMs: 'Real loss 1',
            rootCauseEn: 'Real loss 1',
            lessonLearnedMs: '...',
            lessonLearnedEn: '...',
            adaptiveRuleMs: '...',
            adaptiveRuleEn: '...',
            ratingScore: 3,
            provenance: 'REAL_TRADE',
            authority: 'POSTGRESQL'
          },
          {
            id: `pm-real-${pair.replace('/', '')}-2`,
            timestamp: Date.now() - 43200000,
            pair: pair as any,
            direction: 'BUY',
            entryPrice: 1.0000,
            exitPrice: 0.9900,
            stopLoss: 0.9900,
            takeProfit: 1.0200,
            pnlDollars: -30.00,
            outcome: 'LOSS',
            rootCauseMs: 'Real loss 2',
            rootCauseEn: 'Real loss 2',
            lessonLearnedMs: '...',
            lessonLearnedEn: '...',
            adaptiveRuleMs: '...',
            adaptiveRuleEn: '...',
            ratingScore: 3,
            provenance: 'REAL_TRADE',
            authority: 'POSTGRESQL'
          }
        ];

        // 20 HISTORICAL_BACKTEST losses
        for (let i = 0; i < 20; i++) {
          mixedPopulation.push({
            id: `pm-1y-${pair.replace('/', '')}-${Date.now()}-${i}`,
            timestamp: Date.now() - (i + 1) * 3600000,
            pair: pair as any,
            direction: 'BUY',
            entryPrice: 1.0000,
            exitPrice: 0.9900,
            stopLoss: 0.9900,
            takeProfit: 1.0200,
            pnlDollars: -50.00,
            outcome: 'LOSS',
            rootCauseMs: 'Backtest loss',
            rootCauseEn: 'Backtest loss',
            lessonLearnedMs: '...',
            lessonLearnedEn: '...',
            adaptiveRuleMs: '...',
            adaptiveRuleEn: '...',
            ratingScore: 3,
            provenance: 'HISTORICAL_BACKTEST',
            authority: 'BACKTEST_ENGINE'
          });
        }

        // 20 SYNTHETIC_SIMULATION losses
        for (let i = 0; i < 20; i++) {
          mixedPopulation.push({
            id: `pm-sim-${pair.replace('/', '')}-${Date.now()}-${i}`,
            timestamp: Date.now() - (i + 1) * 1800000,
            pair: pair as any,
            direction: 'BUY',
            entryPrice: 1.0000,
            exitPrice: 0.9900,
            stopLoss: 0.9900,
            takeProfit: 1.0200,
            pnlDollars: -40.00,
            outcome: 'LOSS',
            rootCauseMs: 'Sim loss',
            rootCauseEn: 'Sim loss',
            lessonLearnedMs: '...',
            lessonLearnedEn: '...',
            adaptiveRuleMs: '...',
            adaptiveRuleEn: '...',
            ratingScore: 2,
            provenance: 'SYNTHETIC_SIMULATION',
            authority: 'SIMULATION_ONLY'
          });
        }

        aiDecisionEngine.setPostMortemReviews(mixedPopulation);

        const result = signalService.evaluateCandidateSetup({
          pair,
          timeframe: 'H1',
          currentPrice: 1.0000,
          indicators: { rsi: 55, ema50: 0.9950, adx: 25 },
          smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0005, low: 0.9995 }] },
          postMortemReviews: aiDecisionEngine.getPostMortemReviews()
        });

        // Invariant: REAL_TRADE N=2 (< 3 threshold). Authoritative VETO MUST NOT trigger.
        expect(result.action).not.toBe('VETO');
        expect(result.status).not.toBe('VETOED');
        expect(result.vetoReasons.length).toBe(0);
      });
    });
  });

  describe('6. Cross-Pair Contamination Attack: Pair A Real Losses Must Never Veto Pair B', () => {
    it('EUR/USD has 5 REAL_TRADE losses; GBP/USD has 0 losses -> GBP/USD is NOT vetoed', () => {
      const eurLosses: PostMortemReview[] = [1, 2, 3, 4, 5].map(i => ({
        id: `pm-real-eurusd-${i}`,
        timestamp: Date.now() - i * 86400000,
        pair: 'EUR/USD',
        direction: 'BUY',
        entryPrice: 1.0850,
        exitPrice: 1.0800,
        stopLoss: 1.0800,
        takeProfit: 1.0950,
        pnlDollars: -40.00,
        outcome: 'LOSS',
        rootCauseMs: 'EUR/USD real loss',
        rootCauseEn: 'EUR/USD real loss',
        lessonLearnedMs: '...',
        lessonLearnedEn: '...',
        adaptiveRuleMs: '...',
        adaptiveRuleEn: '...',
        ratingScore: 3,
        provenance: 'REAL_TRADE',
        authority: 'POSTGRESQL'
      }));

      aiDecisionEngine.setPostMortemReviews(eurLosses);

      // Evaluate GBP/USD
      const gbpResult = signalService.evaluateCandidateSetup({
        pair: 'GBP/USD',
        timeframe: 'H1',
        currentPrice: 1.2700,
        indicators: { rsi: 55, ema50: 1.2650, adx: 25 },
        smc: { orderBlocks: [{ type: 'BULLISH', high: 1.2705, low: 1.2695 }] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      expect(gbpResult.action).not.toBe('VETO');
      expect(gbpResult.status).not.toBe('VETOED');
      expect(gbpResult.vetoReasons.length).toBe(0);

      // Evaluate EUR/USD -> Must be vetoed
      const eurResult = signalService.evaluateCandidateSetup({
        pair: 'EUR/USD',
        timeframe: 'H1',
        currentPrice: 1.0850,
        indicators: { rsi: 55, ema50: 1.0800, adx: 25 },
        smc: { orderBlocks: [{ type: 'BULLISH', high: 1.0855, low: 1.0845 }] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      expect(eurResult.action).toBe('VETO');
      expect(eurResult.status).toBe('VETOED');
      expect(eurResult.vetoReasons[0]).toContain('[ADAPTIVE LEARNING VETO]');
    });

    it('USD/JPY Backtest Losses do NOT contaminate XAU/USD Real Trade Learning', () => {
      const mixed: PostMortemReview[] = [
        // USD/JPY Backtest losses
        {
          id: 'pm-1y-usdjpy-1',
          timestamp: Date.now(),
          pair: 'USD/JPY',
          direction: 'BUY',
          entryPrice: 155.00,
          exitPrice: 154.00,
          stopLoss: 154.00,
          takeProfit: 157.00,
          pnlDollars: -50.00,
          outcome: 'LOSS',
          rootCauseMs: '...',
          rootCauseEn: 'USD/JPY backtest loss',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 3,
          provenance: 'HISTORICAL_BACKTEST',
          authority: 'BACKTEST_ENGINE'
        },
        // XAU/USD Real Win
        {
          id: 'pm-real-xauusd-win',
          timestamp: Date.now(),
          pair: 'XAU/USD',
          direction: 'BUY',
          entryPrice: 2400.00,
          exitPrice: 2450.00,
          stopLoss: 2380.00,
          takeProfit: 2450.00,
          pnlDollars: 150.00,
          outcome: 'WIN',
          rootCauseMs: '...',
          rootCauseEn: 'Gold structural breakout',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 5,
          provenance: 'REAL_TRADE',
          authority: 'POSTGRESQL'
        }
      ];

      aiDecisionEngine.setPostMortemReviews(mixed);

      const xauResult = signalService.evaluateCandidateSetup({
        pair: 'XAU/USD',
        timeframe: 'H1',
        currentPrice: 2420.00,
        indicators: { rsi: 60, ema50: 2400.00, adx: 30 },
        smc: { orderBlocks: [{ type: 'BULLISH', high: 2422.00, low: 2418.00 }] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      expect(xauResult.action).not.toBe('VETO');
      expect(xauResult.vetoReasons.length).toBe(0);
    });
  });

  describe('7. Mixed-Provenance Isolation: REAL_TRADE, HISTORICAL_BACKTEST, SYNTHETIC, SHADOW', () => {
    it('Mixed population on BTC/USD with 1 Real Loss + 10 Backtest + 10 Synthetic + 10 Shadow = NO VETO', () => {
      const mixed: PostMortemReview[] = [
        // 1 Real Trade Loss
        {
          id: 'pm-real-btc-1',
          timestamp: Date.now() - 86400000,
          pair: 'BTC/USD',
          direction: 'BUY',
          entryPrice: 65000,
          exitPrice: 63000,
          stopLoss: 63000,
          takeProfit: 68000,
          pnlDollars: -100.00,
          outcome: 'LOSS',
          rootCauseMs: '...',
          rootCauseEn: 'BTC real loss',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 3,
          provenance: 'REAL_TRADE',
          authority: 'POSTGRESQL'
        }
      ];

      // 10 Backtest losses
      for (let i = 0; i < 10; i++) {
        mixed.push({
          id: `pm-1y-btc-${Date.now()}-${i}`,
          timestamp: Date.now() - (i + 1) * 3600000,
          pair: 'BTC/USD',
          direction: 'BUY',
          entryPrice: 65000,
          exitPrice: 63000,
          stopLoss: 63000,
          takeProfit: 68000,
          pnlDollars: -50.00,
          outcome: 'LOSS',
          rootCauseMs: '...',
          rootCauseEn: 'BTC backtest loss',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 3,
          provenance: 'HISTORICAL_BACKTEST',
          authority: 'BACKTEST_ENGINE'
        });
      }

      // 10 Synthetic losses
      for (let i = 0; i < 10; i++) {
        mixed.push({
          id: `pm-sim-btc-${Date.now()}-${i}`,
          timestamp: Date.now() - (i + 1) * 1800000,
          pair: 'BTC/USD',
          direction: 'BUY',
          entryPrice: 65000,
          exitPrice: 63000,
          stopLoss: 63000,
          takeProfit: 68000,
          pnlDollars: -40.00,
          outcome: 'LOSS',
          rootCauseMs: '...',
          rootCauseEn: 'BTC sim loss',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 2,
          provenance: 'SYNTHETIC_SIMULATION',
          authority: 'SIMULATION_ONLY'
        });
      }

      // 10 Shadow observations
      for (let i = 0; i < 10; i++) {
        mixed.push({
          id: `pm-shadow-btc-${Date.now()}-${i}`,
          timestamp: Date.now() - (i + 1) * 900000,
          pair: 'BTC/USD',
          direction: 'BUY',
          entryPrice: 65000,
          exitPrice: 63000,
          stopLoss: 63000,
          takeProfit: 68000,
          pnlDollars: -20.00,
          outcome: 'LOSS',
          rootCauseMs: '...',
          rootCauseEn: 'BTC shadow observation',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 2,
          provenance: 'SHADOW_OBSERVATION',
          authority: 'SHADOW_ENGINE'
        });
      }

      aiDecisionEngine.setPostMortemReviews(mixed);

      const result = signalService.evaluateCandidateSetup({
        pair: 'BTC/USD',
        timeframe: 'H1',
        currentPrice: 65000,
        indicators: { rsi: 55, ema50: 64000, adx: 28 },
        smc: { orderBlocks: [{ type: 'BULLISH', high: 65100, low: 64900 }] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      // Total population is 31 reviews, but REAL_TRADE is only 1. Must NOT veto!
      expect(result.action).not.toBe('VETO');
      expect(result.status).not.toBe('VETOED');
      expect(result.vetoReasons.length).toBe(0);
    });
  });

  describe('8. 1-Year Backtest Engine Preservation', () => {
    it('Executes multi-pair 1-year backtest across all 7 backtest pairs with explicit provenance', async () => {
      const engine = new BacktestEngine();
      const result = await engine.execute1YearMultiPairBacktest();

      expect(result).toBeDefined();
      expect(result?.totalPairsTested).toBe(7);
      expect(result?.pairSummaries.map(p => p.pair)).toEqual(MULTI_PAIR_BACKTEST_UNIVERSE);

      const reviews = aiDecisionEngine.getPostMortemReviews();
      const backtestPms = reviews.filter(r => String(r.id || '').startsWith('pm-1y-'));
      expect(backtestPms.length).toBeGreaterThan(0);

      backtestPms.forEach(pm => {
        expect(['HISTORICAL_BACKTEST', 'SYNTHETIC_SIMULATION']).toContain(pm.provenance);
        expect(['BACKTEST_ENGINE', 'SIMULATION_ONLY']).toContain(pm.authority);
      });
    });
  });

  describe('9. EUR/USD Previous Forensic Records Revalidation', () => {
    it('Specifically validates pm-1y-1787680102312-36, pm-1y-1787679502288-36, pm-1y-1787678903133-36 emit warnings, not vetoes', () => {
      const previousReviews: PostMortemReview[] = [
        {
          id: 'pm-1y-1787680102312-36',
          timestamp: 1787680102312,
          pair: 'EUR/USD',
          direction: 'BUY',
          entryPrice: 1.17385,
          exitPrice: 1.16770,
          stopLoss: 1.16770,
          takeProfit: 1.18500,
          pnlDollars: -45.00,
          outcome: 'LOSS',
          rootCauseMs: '1-Year Backtest Evaluation...',
          rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 3,
          provenance: 'HISTORICAL_BACKTEST',
          authority: 'BACKTEST_ENGINE'
        },
        {
          id: 'pm-1y-1787679502288-36',
          timestamp: 1787679502288,
          pair: 'EUR/USD',
          direction: 'BUY',
          entryPrice: 1.17385,
          exitPrice: 1.16770,
          stopLoss: 1.16770,
          takeProfit: 1.18500,
          pnlDollars: -45.00,
          outcome: 'LOSS',
          rootCauseMs: '1-Year Backtest Evaluation...',
          rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 3,
          provenance: 'HISTORICAL_BACKTEST',
          authority: 'BACKTEST_ENGINE'
        },
        {
          id: 'pm-1y-1787678903133-36',
          timestamp: 1787678903133,
          pair: 'EUR/USD',
          direction: 'BUY',
          entryPrice: 1.17385,
          exitPrice: 1.16770,
          stopLoss: 1.16770,
          takeProfit: 1.18500,
          pnlDollars: -45.00,
          outcome: 'LOSS',
          rootCauseMs: '1-Year Backtest Evaluation...',
          rootCauseEn: '1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion.',
          lessonLearnedMs: '...',
          lessonLearnedEn: '...',
          adaptiveRuleMs: '...',
          adaptiveRuleEn: '...',
          ratingScore: 3,
          provenance: 'HISTORICAL_BACKTEST',
          authority: 'BACKTEST_ENGINE'
        }
      ];

      aiDecisionEngine.setPostMortemReviews(previousReviews);

      const result = signalService.evaluateCandidateSetup({
        pair: 'EUR/USD',
        timeframe: 'H1',
        currentPrice: 1.17500,
        indicators: { rsi: 58, ema50: 1.17200, adx: 28 },
        smc: { orderBlocks: [{ type: 'BULLISH', high: 1.17450, low: 1.17350 }] },
        postMortemReviews: aiDecisionEngine.getPostMortemReviews()
      });

      expect(result.action).not.toBe('VETO');
      expect(result.status).not.toBe('VETOED');
      expect(result.vetoReasons.length).toBe(0);
      expect(result.learningEvidence.some(e => e.includes('[BACKTEST WARNING]'))).toBe(true);
    });
  });

  describe('10. PostgreSQL Authority & Restart Recovery Invariants', () => {
    it('Restores persisted REAL_TRADE reviews on boot without promoting in-memory backtest records', async () => {
      mockRepo.getPostMortemReviews.mockResolvedValue([
        {
          id: 'pm-pos_persisted_1-1.0',
          tradeId: 'pos_persisted_1',
          pair: 'USD/CHF',
          direction: 'SELL',
          outcome: 'LOSS',
          provenance: 'REAL_TRADE',
          authority: 'POSTGRESQL',
          rootCauseEn: 'Persisted real loss',
          adaptiveRuleEn: 'Expand SL',
          ratingScore: 3
        }
      ]);

      const loaded = await learningService.loadPersistedLearning();
      expect(loaded.length).toBe(1);
      expect(loaded[0].provenance).toBe('REAL_TRADE');
      expect(loaded[0].authority).toBe('POSTGRESQL');
    });

    it('Execution safety gate remains strictly fail-closed', () => {
      expect((signalService as any).transmitOrder).toBeUndefined();
      expect(process.env.EXECUTION_ENVIRONMENT).not.toBe('LIVE');
    });
  });
});
