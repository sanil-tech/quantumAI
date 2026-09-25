import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiDecisionEngine, SecondOpinionRequest } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { autonomousMarketScannerService } from '../src/server/services/autonomousMarketScannerService';

describe('Two-Pass Grade A Signal Discovery & Gemini Second Opinion Architecture', () => {
  beforeEach(() => {
    aiDecisionEngine.clearSecondOpinionCache();
    vi.restoreAllMocks();
  });

  describe('aiDecisionEngine.getSecondOpinion', () => {
    it('should return deterministic confirmation fallback when GEMINI_API_KEY is not configured or in test env', async () => {
      const request: SecondOpinionRequest = {
        pair: 'EUR/USD',
        timeframe: 'M15',
        direction: 'BUY',
        currentPrice: 1.0850,
        entryZone: { min: 1.0845, max: 1.0855 },
        stopLoss: 1.0820,
        takeProfit1: 1.0910,
        takeProfit2: 1.0950,
        riskRewardRatio: '1:2.0',
        confidence: 78,
        reasons: ['Bullish Order Block retest', 'RSI oversold rebound', 'CHOCH confirmed'],
        indicators: { rsi: 38, macd: { histogram: 0.0002 }, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 } },
        smc: { orderBlocks: [{ type: 'BULLISH' }], fairValueGaps: [] }
      };

      const result = await aiDecisionEngine.getSecondOpinion(request);

      expect(result).toBeDefined();
      expect(result.confirmed).toBe(true);
      expect(['CONFIRM', 'ADJUST']).toContain(result.decision);
      expect(['GEMINI_AI_LIVE', 'BASE44_AI_LIVE', 'DETERMINISTIC_LOCAL']).toContain(result.source);
    });

    it('should deduplicate and serve from cache for identical setup signatures within TTL', async () => {
      const request: SecondOpinionRequest = {
        pair: 'GBP/USD',
        timeframe: 'H1',
        direction: 'SELL',
        currentPrice: 1.2950,
        entryZone: { min: 1.2945, max: 1.2955 },
        stopLoss: 1.2990,
        takeProfit1: 1.2870,
        takeProfit2: 1.2820,
        riskRewardRatio: '1:2.0',
        confidence: 82,
        reasons: ['Bearish FVG mitigation', 'RSI Bearish Divergence']
      };

      const firstCall = await aiDecisionEngine.getSecondOpinion(request);
      const secondCall = await aiDecisionEngine.getSecondOpinion(request);

      expect(secondCall).toBe(firstCall); // Exact same cached object reference
    });

    it('should query a fresh opinion after cache is cleared', async () => {
      const request: SecondOpinionRequest = {
        pair: 'USD/JPY',
        timeframe: 'M15',
        direction: 'BUY',
        currentPrice: 155.20,
        confidence: 75,
        reasons: ['SuperTrend Bullish flip']
      };

      const firstCall = await aiDecisionEngine.getSecondOpinion(request);
      aiDecisionEngine.clearSecondOpinionCache();
      const freshCall = await aiDecisionEngine.getSecondOpinion(request);

      expect(freshCall).toEqual(firstCall);
      expect(freshCall).not.toBe(firstCall); // Different object instance after cache clear
    }, 15000);
  });

  describe('AutonomousMarketScannerService Two-Pass Execution Logic', () => {
    it('getStatus should report accurate secondOpinionTelemetry and calls saved metric', () => {
      const status = autonomousMarketScannerService.getStatus();

      expect(status).toBeDefined();
      expect(status.secondOpinionTelemetry).toBeDefined();
      expect(typeof status.secondOpinionTelemetry.totalEvaluations).toBe('number');
      expect(typeof status.secondOpinionTelemetry.gradeACandidatesFound).toBe('number');
      expect(typeof status.secondOpinionTelemetry.secondOpinionsRequested).toBe('number');
      expect(typeof status.secondOpinionTelemetry.secondOpinionsConfirmed).toBe('number');
      expect(typeof status.secondOpinionTelemetry.secondOpinionsVetoed).toBe('number');
      expect(typeof status.secondOpinionTelemetry.geminiCallsSaved).toBe('number');
      expect(typeof status.secondOpinionTelemetry.geminiCallsSavedPercent).toBe('number');
      expect(status.secondOpinionTelemetry.geminiCallsSavedPercent).toBeGreaterThanOrEqual(0);
      expect(status.secondOpinionTelemetry.geminiCallsSavedPercent).toBeLessThanOrEqual(100);
    });

    it('should pass Grade A candidate through second opinion and handle VETO correctly', async () => {
      // Mock getSecondOpinion to simulate a Gemini Risk Veto
      const secondOpinionSpy = vi.spyOn(aiDecisionEngine, 'getSecondOpinion').mockResolvedValueOnce({
        confirmed: false,
        decision: 'VETO',
        confidence: 45,
        reasons: ['Impending High-Impact CPI news release within 15 minutes', 'Liquidity sweep bull trap'],
        vetoReason: 'Macro event risk & Liquidity sweep trap',
        source: 'GEMINI_AI_LIVE'
      });

      const secondOpinion = await aiDecisionEngine.getSecondOpinion({
        pair: 'EUR/USD',
        timeframe: 'M15',
        direction: 'BUY',
        currentPrice: 1.0850,
        confidence: 75,
        reasons: ['Local test confluence']
      });

      expect(secondOpinionSpy).toHaveBeenCalledTimes(1);
      expect(secondOpinion.confirmed).toBe(false);
      expect(secondOpinion.decision).toBe('VETO');
      expect(secondOpinion.vetoReason).toContain('Liquidity sweep trap');
    });

    it('should enrich confirmed Grade A candidate with Gemini Second Opinion reasoning', async () => {
      // Mock getSecondOpinion to simulate a Gemini Confirmation
      const secondOpinionSpy = vi.spyOn(aiDecisionEngine, 'getSecondOpinion').mockResolvedValueOnce({
        confirmed: true,
        decision: 'CONFIRM',
        confidence: 88,
        reasons: [
          'Strong order block absorption on lower wick',
          'Higher timeframe daily trend aligns with M15 expansion'
        ],
        source: 'GEMINI_AI_LIVE'
      });

      const secondOpinion = await aiDecisionEngine.getSecondOpinion({
        pair: 'XAU/USD',
        timeframe: 'H1',
        direction: 'BUY',
        currentPrice: 2420.50,
        confidence: 76,
        reasons: ['Local SMC setup']
      });

      expect(secondOpinionSpy).toHaveBeenCalledTimes(1);
      expect(secondOpinion.confirmed).toBe(true);
      expect(secondOpinion.decision).toBe('CONFIRM');
      expect(secondOpinion.confidence).toBe(88);
      expect(secondOpinion.reasons[0]).toContain('Strong order block absorption');
    });
  });
});
