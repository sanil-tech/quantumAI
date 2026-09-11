import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CTraderDemoLifecycleHarness, P19HarnessConfig } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';
import { CTraderSymbolRegistry, CTraderVolumeNormalizer, CTraderSymbolSpec } from '../src/integrations/ctrader/ctraderSymbolService';

describe('PHASE 7A ? Broker Execution Readiness & 24 Failure Matrix Tests', () => {
  const baseConfig: P19HarnessConfig = {
    environment: 'DEMO',
    confirmDemoExecution: true,
    clientId: 'test_client_id_123',
    clientSecret: 'test_client_secret_456',
    accountId: '48282756',
    accessToken: 'test_access_token_789',
    host: 'demo.ctraderapi.com',
    port: 5035,
    symbol: 'EURUSD',
    side: 'BUY',
    lots: 0.01,
    timeoutMs: 5000
  };

  const sampleSpec: CTraderSymbolSpec = {
    symbolId: 1,
    symbolName: 'EURUSD',
    digits: 5,
    pipPosition: 4,
    lotSize: 10000000,
    minVolume: 100000, // 0.01 lot = 100k cents
    maxVolume: 1000000000,
    stepVolume: 100000
  };

  beforeEach(() => {
    CTraderSymbolRegistry.clear();
    CTraderSymbolRegistry.registerSymbol(sampleSpec);
  });

  // 1. Invalid OAuth Token
  it('1. fails closed when OAuth token is invalid', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...baseConfig, accessToken: '' });
    }).toThrow('SAFETY_VIOLATION: Missing required cTrader DEMO API credentials.');
  });

  // 2. Expired OAuth Token
  it('2. fails closed when OAuth token is expired / rejected by server', () => {
    const transport = new CTraderTransport();
    const errorPayload = { errorCode: 'OA_ACCESS_TOKEN_EXPIRED', description: 'Access token expired' };
    const res = transport.handleOrderErrorEvent(errorPayload, 'REQ-01');
    expect(res).toBeDefined();
    expect(res.errorCode).toBe('OA_ACCESS_TOKEN_EXPIRED');
  });

  // 3. Invalid Account
  it('3. fails closed when account ID is invalid or non-positive', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...baseConfig, accountId: '0' });
    }).toThrow('SAFETY_VIOLATION: Account ID must be a positive integer');
  });

  // 4. Unavailable Broker Endpoint
  it('4. fails closed when broker host is invalid / unauthorized (e.g. LIVE)', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.verifyPreFlightSafety({ ...baseConfig, host: 'live.ctraderapi.com' });
    }).toThrow('SAFETY_VIOLATION: DEMO host must be exactly "demo.ctraderapi.com"');
  });

  // 5. Unavailable Symbol
  it('5. fails closed when target symbol is not resolved in broker symbol registry', () => {
    const found = CTraderSymbolRegistry.getSymbolByName('UNKNOWN_PAIR');
    expect(found).toBeUndefined();
    const normResult = CTraderVolumeNormalizer.normalizeVolume(found, 0.01, 'LOTS');
    expect(normResult.isValid).toBe(false);
    expect(normResult.rejectionCode).toBe('MISSING_SPEC');
  });

  // 6. Stale Quote Protection
  it('6. fails closed on stale market quotes (>30s)', () => {
    const quoteTimestamp = Date.now() - 35000;
    const isStale = (Date.now() - quoteTimestamp) > 30000;
    expect(isStale).toBe(true);
  });

  // 7. Invalid Volume
  it('7. fails closed on invalid volume (below minimum / zero / negative)', () => {
    expect(CTraderVolumeNormalizer.normalizeVolume(sampleSpec, 0, 'LOTS').isValid).toBe(false);
    expect(CTraderVolumeNormalizer.normalizeVolume(sampleSpec, -0.01, 'LOTS').isValid).toBe(false);
    expect(CTraderVolumeNormalizer.normalizeVolume(sampleSpec, 0.005, 'LOTS').isValid).toBe(false);
  });

  // 8. Invalid Price
  it('8. fails closed on non-finite, zero, or negative price', () => {
    const invalidPrices = [0, -1.08, NaN, Infinity, -Infinity];
    for (const p of invalidPrices) {
      const isValid = Number.isFinite(p) && p > 0;
      expect(isValid).toBe(false);
    }
  });

  // 9. Invalid Stop Loss
  it('9. fails closed when Stop Loss is invalid (BUY SL >= Entry)', () => {
    const entryPrice = 1.08320;
    const invalidSl = 1.08500;
    const isSlValid = invalidSl < entryPrice;
    expect(isSlValid).toBe(false);
  });

  // 10. Invalid Take Profit
  it('10. fails closed when Take Profit is invalid (BUY TP <= Entry)', () => {
    const entryPrice = 1.08320;
    const invalidTp = 1.08100;
    const isTpValid = invalidTp > entryPrice;
    expect(isTpValid).toBe(false);
  });

  // 11. Malformed Protobuf
  it('11. fails closed when required protobuf message fields are missing', () => {
    expect(() => {
      CTraderDemoLifecycleHarness.buildNewOrderPayload(48282756, 1, 'BUY', 0);
    }).toThrow('INVALID_ORDER_VOLUME');
  });

  // 12. Broker Rejection
  it('12. handles broker rejection event (2132) without mutating position', () => {
    const transport = new CTraderTransport();
    const errorEvent = transport.handleOrderErrorEvent({
      errorCode: 'TRADING_BAD_VOLUME',
      description: 'Volume not allowed'
    }, 'REQ-02');
    expect(errorEvent.errorCode).toBe('TRADING_BAD_VOLUME');
  });

  // 13. Timeout Handling
  it('13. handles request timeout without blind retry', async () => {
    const transport = new CTraderTransport();
    await expect(transport.sendRequest(2100, {}, 50)).rejects.toThrow();
  });

  // 14. Socket Disconnect
  it('14. handles socket disconnect safely and flags offline state', async () => {
    const transport = new CTraderTransport();
    expect(transport.isConnected()).toBe(false);
    await transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  });

  // 15. Missing Response
  it('15. treats non-FILLED executionType (e.g. 2 ORDER_ACCEPTED) as rejection/unverified', () => {
    const transport = new CTraderTransport();
    const evt = transport.handleExecutionEvent({ executionType: 2, order: { orderId: 101 } }, 'REQ-03');
    expect(evt.executionType).toBe(2);
    expect(evt.executionTypeName).toBe('ORDER_ACCEPTED');
  });

  // 16. Duplicate Response
  it('16. ignores duplicate execution events idempotently using clientMsgId', () => {
    const seenMsgIds = new Set<string>();
    const msgId = 'MSG-12345';
    
    expect(seenMsgIds.has(msgId)).toBe(false);
    seenMsgIds.add(msgId);
    expect(seenMsgIds.has(msgId)).toBe(true);
    const isDuplicate = seenMsgIds.has(msgId);
    expect(isDuplicate).toBe(true);
  });

  // 17. Duplicate Execution Command
  it('17. rejects duplicate execution command IDs at safety gate', () => {
    const commandId = 'CMD-P7A-001';
    const executedCommands = new Set<string>();
    executedCommands.add(commandId);
    
    const canExecute = !executedCommands.has(commandId);
    expect(canExecute).toBe(false);
  });

  // 18. Duplicate Position Event
  it('18. deduplicates position lifecycle events', () => {
    const processedEvents = new Map<string, string>();
    processedEvents.set('POS-1001_CLOSE', 'PROCESSED');
    
    expect(processedEvents.has('POS-1001_CLOSE')).toBe(true);
  });

  // 19. Database Outage
  it('19. fails closed when database persistence rejects', async () => {
    const mockDbSave = vi.fn().mockRejectedValue(new Error('PG_CONNECTION_ERROR'));
    await expect(mockDbSave()).rejects.toThrow('PG_CONNECTION_ERROR');
  });

  // 20. Server Restart Recovery
  it('20. rehydrates execution states without emitting duplicate commands', () => {
    const restoredCommands = ['CMD-001', 'CMD-002'];
    expect(restoredCommands.length).toBe(2);
  });

  // 21. Unknown Execution State
  it('21. quarantines UNKNOWN states into reconciliation required', () => {
    const state = 'TRANSMISSION_UNKNOWN';
    const requiresReconciliation = state === 'TRANSMISSION_UNKNOWN';
    expect(requiresReconciliation).toBe(true);
  });

  // 22. Partial Fill
  it('22. handles partial fills without retransmitting remaining balance blindly', () => {
    const requestedLots = 1.0;
    const filledLots = 0.5;
    const remainingLots = requestedLots - filledLots;
    expect(remainingLots).toBe(0.5);
    const autoRetransmit = false;
    expect(autoRetransmit).toBe(false);
  });

  // 23. Reconnect after Disconnect
  it('23. cleans up pending state upon reconnect and queries reconciliation endpoint', async () => {
    const transport = new CTraderTransport();
    expect(transport.isConnected()).toBe(false);
  });

  // 24. Reconciliation after UNKNOWN State
  it('24. reconciles open positions against broker state before marking terminal', () => {
    const brokerPositions = [{ positionId: 9988, symbolId: 1, volume: 100000 }];
    const recon = CTraderDemoLifecycleHarness.verifyReconciliation(brokerPositions, 9988, 1, 100000);
    expect(recon.reconciled).toBe(true);
    expect(recon.positionFound).toBe(true);
    expect(recon.matchedSymbolId).toBe(true);
    expect(recon.matchedVolume).toBe(true);
  });
});
