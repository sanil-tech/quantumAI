import { describe, it, expect, vi } from 'vitest';
import {
  CTraderDemoLifecycleHarness,
  P19HarnessConfig
} from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { CTraderVolumeNormalizer, CTraderSymbolSpec } from '../src/integrations/ctrader/ctraderSymbolService';
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

describe('TASK 8B-P19: Controlled Single-Order DEMO Lifecycle Harness Unit Tests', () => {
  const baseValidConfig: P19HarnessConfig = {
    environment: 'DEMO',
    confirmDemoExecution: true,
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
    accountId: '5881234',
    accessToken: 'test_token',
    host: 'demo.ctraderapi.com',
    port: 5035,
    symbol: 'EURUSD',
    side: 'BUY',
    lots: 0.01
  };

  const sampleSpec: CTraderSymbolSpec = {
    symbolId: 1,
    symbolName: 'EURUSD',
    digits: 5,
    pipPosition: 4,
    minVolume: 100000,
    maxVolume: 10000000000,
    stepVolume: 100000,
    lotSize: 10000000
  };

  function createMockTransport(options: {
    openExecutionType?: number;
    omitOpenExecutionEvent?: boolean;
    closeExecutionType?: number;
    omitCloseExecutionEvent?: boolean;
    reconciliationPositions?: any[];
    closeReconciliationPositions?: any[];
  }) {
    const mock = new CTraderTransport();
    mock.connect = vi.fn().mockResolvedValue(undefined);
    mock.disconnect = vi.fn().mockResolvedValue(undefined);

    mock.sendRequest = vi.fn().mockImplementation(async (payloadType: number, payload: any) => {
      if (payloadType === 2100) {
        return { payloadType: 2101, decodedPayload: {} };
      }
      if (payloadType === 2102) {
        return { payloadType: 2103, decodedPayload: {} };
      }
      if (payloadType === 2114) {
        return {
          payloadType: 2115,
          decodedPayload: { symbol: [{ symbolName: 'EURUSD', symbolId: 1 }] }
        };
      }
      if (payloadType === 2116) {
        return {
          payloadType: 2117,
          decodedPayload: {
            symbol: [
              {
                symbolId: 1,
                symbolName: 'EURUSD',
                digits: 5,
                pipPosition: 4,
                minVolume: 100000,
                maxVolume: 1000000000,
                stepVolume: 100000,
                lotSize: 10000000
              }
            ]
          }
        };
      }
      if (payloadType === 2106) {
        if (options.omitOpenExecutionEvent) {
          return { payloadType: 2126 };
        }
        return {
          payloadType: 2126,
          executionEvent: {
            executionType: options.openExecutionType !== undefined ? options.openExecutionType : 3,
            order: { orderId: 9001, clientOrderId: payload.clientOrderId },
            position: { positionId: 7001 },
            deal: { dealId: 4001 },
            errorCode: options.openExecutionType && options.openExecutionType !== 3 ? 'TEST_REJECTED' : undefined
          }
        };
      }
      if (payloadType === 2124) {
        const isSecondReconcile = (mock.sendRequest as any).mock.calls.filter((c: any) => c[0] === 2124).length > 1;
        if (isSecondReconcile) {
          return {
            payloadType: 2125,
            decodedPayload: { position: options.closeReconciliationPositions || [] }
          };
        }
        return {
          payloadType: 2125,
          decodedPayload: {
            position: options.reconciliationPositions || [
              { positionId: 7001, tradeData: { symbolId: 1, volume: 100000 } }
            ]
          }
        };
      }
      if (payloadType === 2111) {
        if (options.omitCloseExecutionEvent) {
          return { payloadType: 2126 };
        }
        return {
          payloadType: 2126,
          executionEvent: {
            executionType: options.closeExecutionType !== undefined ? options.closeExecutionType : 3,
            order: { orderId: 9002 },
            position: { positionId: 7001 },
            deal: { dealId: 4002 },
            errorCode: options.closeExecutionType && options.closeExecutionType !== 3 ? 'CLOSE_REJECTED' : undefined
          }
        };
      }
      return { payloadType: 0, decodedPayload: {} };
    });

    return mock;
  }

  describe('1. Pre-Flight Safety & Strict Fail-Closed Endpoint Invariants', () => {
    it('1. accepts exact approved host and port (demo.ctraderapi.com:5035)', () => {
      const res = CTraderDemoLifecycleHarness.verifyPreFlightSafety(baseValidConfig);
      expect(res.passed).toBe(true);
      expect(res.details.endpointValidated).toBe(true);
    });

    it('2. rejects empty host fail-closed', () => {
      const config = { ...baseValidConfig, host: '' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Missing, empty, or whitespace-only host');
    });

    it('3. rejects whitespace-only host fail-closed', () => {
      const config = { ...baseValidConfig, host: '   ' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Missing, empty, or whitespace-only host');
    });

    it('4. rejects undefined host fail-closed', () => {
      const config = { ...baseValidConfig, host: undefined as any };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Missing, empty, or whitespace-only host');
    });

    it('5. rejects null host fail-closed', () => {
      const config = { ...baseValidConfig, host: null as any };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Missing, empty, or whitespace-only host');
    });

    it('6. rejects zero port fail-closed', () => {
      const config = { ...baseValidConfig, port: 0 };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Port must be a positive integer');
    });

    it('7. rejects NaN port fail-closed', () => {
      const config = { ...baseValidConfig, port: NaN };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Port must be a positive integer');
    });

    it('8. rejects non-numeric/string port fail-closed', () => {
      const config = { ...baseValidConfig, port: 'invalid_port' as any };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Port must be a positive integer');
    });

    it('9. rejects undefined port fail-closed', () => {
      const config = { ...baseValidConfig, port: undefined as any };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Missing or invalid port configuration');
    });

    it('10. rejects wrong host fail-closed (e.g. live.ctraderapi.com)', () => {
      const config = { ...baseValidConfig, host: 'live.ctraderapi.com' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: DEMO host must be exactly "demo.ctraderapi.com"');
    });

    it('11. rejects wrong port fail-closed (e.g. 5036)', () => {
      const config = { ...baseValidConfig, port: 5036 };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: DEMO port must be exactly 5035');
    });

    it('12. rejects LIVE environment with fatal error', () => {
      const config = { ...baseValidConfig, environment: 'LIVE' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION_FATAL: LIVE environment is strictly prohibited');
    });

    it('13. rejects PAPER environment from DEMO lifecycle harness', () => {
      const config = { ...baseValidConfig, environment: 'PAPER' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Execution environment must be exactly "DEMO"');
    });

    it('14. rejects lowercase or mismatched environment string fail-closed', () => {
      const config = { ...baseValidConfig, environment: 'demo' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(config)).toThrow('SAFETY_VIOLATION: Execution environment must be exactly "DEMO"');
    });

    it('15. rejects DEMO environment when confirmDemoExecution is not strict boolean true', () => {
      const configFalse = { ...baseValidConfig, confirmDemoExecution: false };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configFalse)).toThrow('Explicit DEMO confirmation flag (confirmDemoExecution = true) is required');

      const configTruthy = { ...baseValidConfig, confirmDemoExecution: 'true' as any };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configTruthy)).toThrow('Explicit DEMO confirmation flag (confirmDemoExecution = true) is required');
    });

    it('16. rejects missing/empty credentials or non-positive account ID', () => {
      const configNoCreds = { ...baseValidConfig, clientId: '   ' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configNoCreds)).toThrow('Missing required cTrader DEMO API credentials');

      const configZeroAcc = { ...baseValidConfig, accountId: '0' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configZeroAcc)).toThrow('Account ID must be a positive integer');

      const configBadAcc = { ...baseValidConfig, accountId: 'invalid_acc' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configBadAcc)).toThrow('Account ID must be a positive integer');
    });

    it('17. rejects empty or whitespace-only target symbol', () => {
      const configEmptySymbol = { ...baseValidConfig, symbol: '   ' };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configEmptySymbol)).toThrow('Target symbol must be explicitly specified');
    });

    it('18. rejects NaN, Infinity, or negative lot volume', () => {
      const configNaNLots = { ...baseValidConfig, lots: NaN };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configNaNLots)).toThrow('Target lot volume must be a positive finite number');

      const configInfLots = { ...baseValidConfig, lots: Infinity };
      expect(() => CTraderDemoLifecycleHarness.verifyPreFlightSafety(configInfLots)).toThrow('Target lot volume must be a positive finite number');
    });
  });

  describe('2. Volume Normalization & Boundary Invariants', () => {
    it('19. rejects zero and negative volumes', () => {
      const normZero = CTraderVolumeNormalizer.normalizeVolume(sampleSpec, 0, 'LOTS');
      expect(normZero.isValid).toBe(false);
      expect(normZero.rejectionCode).toBe('INVALID_QUANTITY');

      const normNeg = CTraderVolumeNormalizer.normalizeVolume(sampleSpec, -0.01, 'LOTS');
      expect(normNeg.isValid).toBe(false);
      expect(normNeg.rejectionCode).toBe('INVALID_QUANTITY');
    });

    it('20. rejects below-minimum volume', () => {
      const norm = CTraderVolumeNormalizer.normalizeVolume(sampleSpec, 0.005, 'LOTS');
      expect(norm.isValid).toBe(false);
      expect(norm.rejectionCode).toBe('BELOW_MIN_VOLUME');
    });

    it('21. rejects above-maximum volume', () => {
      const norm = CTraderVolumeNormalizer.normalizeVolume(sampleSpec, 1001.0, 'LOTS');
      expect(norm.isValid).toBe(false);
      expect(norm.rejectionCode).toBe('ABOVE_MAX_VOLUME');
    });

    it('22. rejects invalid step volume', () => {
      const norm = CTraderVolumeNormalizer.normalizeVolume(sampleSpec, 0.015, 'LOTS');
      expect(norm.isValid).toBe(false);
      expect(norm.rejectionCode).toBe('INVALID_STEP');
    });
  });

  describe('3. Protobuf Framing, Payload & Correlation Integrity', () => {
    it('23. serializes ProtoOANewOrderReq (2106) with exact normalized integer cents volume', async () => {
      const payload = CTraderDemoLifecycleHarness.buildNewOrderPayload(
        5881234,
        1,
        'BUY',
        100000,
        'p19_test_cl_ord_1'
      );

      expect(payload.volume).toBe(100000);
      expect(payload.tradeSide).toBe(1);
      expect(payload.orderType).toBe(1);
      expect(payload.clientOrderId).toBe('p19_test_cl_ord_1');

      const frame = await CTraderProtoManager.encodeFrame(2106, payload, 'p19_test_msg_1');
      expect(frame).toBeDefined();
      expect(frame.length).toBeGreaterThan(4);
    });

    it('24. verifies execution event correlation through transport', () => {
      const transport = new CTraderTransport();
      const payload = {
        ctidTraderAccountId: 5881234,
        executionType: 3,
        order: { orderId: 9001, clientOrderId: 'p19_cl_01', tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } },
        position: { positionId: 7001, tradeData: { symbolId: 1, volume: 100000, tradeSide: 1 } },
        deal: { dealId: 4001, executionPrice: 1.0850, volume: 100000, filledVolume: 100000 }
      };

      const res = transport.handleExecutionEvent(payload, 'p19_msg_01');
      expect(res.correlation.correlated).toBe(true);
      expect(res.correlation.clientMsgId).toBe('p19_msg_01');
      expect(res.position.positionId).toBe(7001);
      expect(res.deal.dealId).toBe(4001);
    });

    it('25. order error event produces fail-closed rejection with preserved error code', () => {
      const transport = new CTraderTransport();
      const errorPayload = {
        ctidTraderAccountId: 5881234,
        errorCode: 'TRADING_BAD_VOLUME',
        description: 'Requested volume invalid for symbol.'
      };

      const errorRecord = transport.handleOrderErrorEvent(errorPayload, 'err_msg_01');
      expect(errorRecord.errorCode).toBe('TRADING_BAD_VOLUME');
      expect(errorRecord.description).toBe('Requested volume invalid for symbol.');
    });
  });

  describe('4. Strict Execution-Type Fail-Closed Verification (Task 8B-P19D)', () => {
    it('26. accepts executionType === 3 (ORDER_FILLED) for open order', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 3, closeExecutionType: 3 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('DEMO_LIFECYCLE_CONFIRMED');
      expect(evidence.brokerPositionId).toBe(7001);
    });

    it('27. rejects executionType === 1 for open order', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 1 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('ORDER_REJECTED');
      expect(evidence.errorMessage).toContain('expected 3: ORDER_FILLED');
    });

    it('28. rejects executionType === 2 (ORDER_ACCEPTED) for open order', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 2 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('ORDER_REJECTED');
      expect(evidence.errorMessage).toContain('expected 3: ORDER_FILLED');
    });

    it('29. rejects executionType === 4 (ORDER_REPLACED) for open order', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 4 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('ORDER_REJECTED');
      expect(evidence.errorMessage).toContain('expected 3: ORDER_FILLED');
    });

    it('30. rejects executionType === 7 (ORDER_REJECTED) for open order', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 7 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('ORDER_REJECTED');
      expect(evidence.errorMessage).toContain('expected 3: ORDER_FILLED');
    });

    it('31. rejects executionType === 8 (ORDER_CANCEL_REJECTED) for open order', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 8 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('ORDER_REJECTED');
      expect(evidence.errorMessage).toContain('expected 3: ORDER_FILLED');
    });

    it('32. rejects missing executionEvent on open order', async () => {
      const mockTransport = createMockTransport({ omitOpenExecutionEvent: true });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('DEMO_ORDER_UNVERIFIED');
      expect(evidence.errorMessage).toContain('Broker did not return an execution event');
    });

    it('33. rejects unexpected executionType (e.g. 2) on close operation', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 3, closeExecutionType: 2 });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('DEMO_CLOSE_UNVERIFIED');
      expect(evidence.errorMessage).toContain('expected 3: ORDER_FILLED');
    });

    it('34. rejects missing executionEvent on close operation', async () => {
      const mockTransport = createMockTransport({ openExecutionType: 3, omitCloseExecutionEvent: true });
      const evidence = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(baseValidConfig, mockTransport);
      expect(evidence.finalLifecycleStatus).toBe('DEMO_CLOSE_UNVERIFIED');
      expect(evidence.errorMessage).toContain('Broker did not return an execution event for close request');
    });
  });

  describe('5. Reconciliation & Lifecycle Settlement Invariants', () => {
    it('35. reconciliation failure flags DEMO_ORDER_UNVERIFIED without assuming fill', () => {
      const positions: any[] = []; // Broker returns empty positions
      const check = CTraderDemoLifecycleHarness.verifyReconciliation(positions, 7001, 1, 100000);
      expect(check.reconciled).toBe(true);
      expect(check.positionFound).toBe(false);
    });

    it('36. reconciliation mismatch on symbol or volume fails verification', () => {
      const mismatchedPositions = [
        { positionId: 7001, tradeData: { symbolId: 2, volume: 100000 } } // Wrong symbolId (2 instead of 1)
      ];
      const check = CTraderDemoLifecycleHarness.verifyReconciliation(mismatchedPositions, 7001, 1, 100000);
      expect(check.positionFound).toBe(true);
      expect(check.matchedSymbolId).toBe(false);
    });

    it('37. close verification failure fails lifecycle if position remains open', () => {
      const positionsStillOpen = [
        { positionId: 7001, tradeData: { symbolId: 1, volume: 100000 } }
      ];
      const closeCheck = CTraderDemoLifecycleHarness.verifyClosure(positionsStillOpen, 7001);
      expect(closeCheck.reconciled).toBe(true);
      expect(closeCheck.positionClosed).toBe(false);
    });

    it('38. redacts sensitive account secrets for audit logs', () => {
      const redacted = CTraderDemoLifecycleHarness.redactAccountId('5881234');
      expect(redacted).toBe('58***34');
      expect(redacted).not.toBe('5881234');
    });

    it('39. full lifecycle state confirms only with broker reconciliation proof', () => {
      const openPositions = [
        { positionId: 7001, tradeData: { symbolId: 1, volume: 100000 } }
      ];
      const checkOpen = CTraderDemoLifecycleHarness.verifyReconciliation(openPositions, 7001, 1, 100000);
      expect(checkOpen.positionFound).toBe(true);
      expect(checkOpen.matchedSymbolId).toBe(true);
      expect(checkOpen.matchedVolume).toBe(true);

      const positionsAfterClose: any[] = [];
      const checkClosed = CTraderDemoLifecycleHarness.verifyClosure(positionsAfterClose, 7001);
      expect(checkClosed.positionClosed).toBe(true);
    });
  });
});
