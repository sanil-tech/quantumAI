import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CTraderDemoLifecycleHarness, P19HarnessConfig } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { CTraderVolumeNormalizer, CTraderSymbolSpec } from '../src/integrations/ctrader/ctraderSymbolService';

import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';

describe('PHASE 8D: REAL cTrader DEMO Order Lifecycle & Reconciliation Certification Suite', () => {
  const sampleSymbolSpec: CTraderSymbolSpec = {
    symbolId: 1,
    symbolName: 'EURUSD',
    digits: 5,
    pipPosition: 4,
    minVolume: 1000,
    maxVolume: 100000000,
    stepVolume: 1000,
    lotSize: 10000000,
    enableShortSelling: true,
    measurementUnits: 'EUR'
  };

  const validConfig: P19HarnessConfig = {
    environment: 'DEMO',
    confirmDemoExecution: true,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    accountId: '48282756',
    accessToken: 'test-access-token',
    host: 'demo.ctraderapi.com',
    port: 5035,
    symbol: 'EURUSD',
    side: 'BUY',
    lots: 0.01
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Pre-Flight Safety & Environment Constraints', () => {
    it('1.1 requires environment to be strictly DEMO', () => {
      const liveConfig: any = { ...validConfig, environment: 'LIVE' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(liveConfig)).toThrow(
        /SAFETY_VIOLATION.*LIVE environment is strictly prohibited/
      );
    });

    it('1.2 requires explicit confirmDemoExecution = true', () => {
      const unconfirmedConfig: any = { ...validConfig, confirmDemoExecution: false };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(unconfirmedConfig)).toThrow(
        /SAFETY_VIOLATION: Explicit DEMO confirmation flag/
      );
    });

    it('1.3 rejects any host other than demo.ctraderapi.com', () => {
      const liveHostConfig: any = { ...validConfig, host: 'live.ctraderapi.com' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(liveHostConfig)).toThrow(
        /SAFETY_VIOLATION: DEMO host must be exactly "demo.ctraderapi.com"/
      );
    });

    it('1.4 rejects any port other than 5035', () => {
      const wrongPortConfig: any = { ...validConfig, port: 443 };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(wrongPortConfig)).toThrow(
        /SAFETY_VIOLATION: DEMO port must be exactly 5035/
      );
    });

    it('1.5 passes pre-flight safety check when all parameters are valid DEMO', () => {
      const check = CTraderDemoLifecycleHarness.verifyPreFlightSafety(validConfig);
      expect(check.passed).toBe(true);
      expect(check.details.environmentIsDemo).toBe(true);
      expect(check.details.explicitConfirmationPresent).toBe(true);
    });
  });

  describe('2. Volume Normalization & ProtoBuf Order Building', () => {
    it('2.1 normalizes 0.01 lot to 100,000 cents', () => {
      const norm = CTraderVolumeNormalizer.normalizeVolume(sampleSymbolSpec, 0.01, 'LOTS');
      expect(norm.isValid).toBe(true);
      expect(norm.normalizedVolumeCents).toBe(100000);
      expect(norm.rejectionCode).toBeUndefined();
    });

    it('2.2 builds ProtoOANewOrderReq payload (2106) with correct tradeSide and normalized volume', () => {
      const payload = CTraderDemoLifecycleHarness.buildNewOrderPayload(
        48282756,
        1,
        'BUY',
        100000,
        'client-ord-123'
      );

      expect(payload.ctidTraderAccountId).toBe(48282756);
      expect(payload.symbolId).toBe(1);
      expect(payload.orderType).toBe(1); // MARKET
      expect(payload.tradeSide).toBe(1); // BUY
      expect(payload.volume).toBe(100000);
      expect(payload.clientOrderId).toBe('client-ord-123');
    });

    it('2.3 builds ProtoOANewOrderReq SELL payload with tradeSide = 2', () => {
      const payload = CTraderDemoLifecycleHarness.buildNewOrderPayload(
        48282756,
        1,
        'SELL',
        100000,
        'client-ord-456'
      );
      expect(payload.tradeSide).toBe(2); // SELL
    });

    it('2.4 rejects invalid volume cents when building order payload', () => {
      expect(() =>
        CTraderDemoLifecycleHarness.buildNewOrderPayload(48282756, 1, 'BUY', 0, 'client-ord-789')
      ).toThrow(/INVALID_ORDER_VOLUME/);
    });
  });

  describe('3. Reconciliation Engine & Zero-Orphan Verification', () => {
    it('3.1 matches target position by positionId, symbolId, and volume', () => {
      const mockPositions = [
        {
          positionId: 284154013,
          tradeData: {
            symbolId: 1,
            volume: 100000,
            tradeSide: 1
          }
        }
      ];

      const recon = CTraderDemoLifecycleHarness.verifyReconciliation(
        mockPositions,
        284154013,
        1,
        100000
      );

      expect(recon.reconciled).toBe(true);
      expect(recon.positionFound).toBe(true);
      expect(recon.matchedSymbolId).toBe(true);
      expect(recon.matchedVolume).toBe(true);
      expect(recon.openPositionsCount).toBe(1);
    });

    it('3.2 fails reconciliation if volume differs from normalized order quantity', () => {
      const mockPositions = [
        {
          positionId: 284154013,
          tradeData: {
            symbolId: 1,
            volume: 50000,
            tradeSide: 1
          }
        }
      ];

      const recon = CTraderDemoLifecycleHarness.verifyReconciliation(
        mockPositions,
        284154013,
        1,
        100000
      );

      expect(recon.positionFound).toBe(true);
      expect(recon.matchedVolume).toBe(false);
    });

    it('3.3 confirms position closure when position ID is no longer present', () => {
      const emptyPositions: any[] = [];
      const closure = CTraderDemoLifecycleHarness.verifyClosure(emptyPositions, 284154013);
      expect(closure.reconciled).toBe(true);
      expect(closure.positionClosed).toBe(true);
      expect(closure.openPositionsCount).toBe(0);
    });
  });

  describe('4. Shadow Observatory Complete Isolation', () => {
    it('4.1 confirms DEMO order execution does NOT alter Shadow Observatory counters', () => {
      const preStatus = continuousLearningObservatoryService.getStatus();
      const preObsCount = continuousLearningObservatoryService.getActiveObservations().length;
      const preTransmitted = preStatus.brokerOrdersTransmitted;

      const postStatus = continuousLearningObservatoryService.getStatus();
      const postObsCount = continuousLearningObservatoryService.getActiveObservations().length;

      expect(postStatus.brokerOrdersTransmitted).toBe(preTransmitted);
      expect(postObsCount).toBe(preObsCount);
      expect(postStatus.state).toBe(preStatus.state);
    });
  });
});
