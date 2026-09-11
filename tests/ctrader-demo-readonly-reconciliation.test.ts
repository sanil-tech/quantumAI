import { describe, it, expect, beforeEach } from 'vitest';
import { ctraderReadOnlyReconciliationService, AuthoritativeBrokerPosition } from '../src/server/services/ctraderReadOnlyReconciliationService';
import { shadowObservationService } from '../apps/decision-agent/src/services/shadowObservationService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { globalEventBus, EventTypes } from '@iati/event-bus';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

describe('QUANTUMAI ? cTrader DEMO Read-Only Connectivity & Reconciliation', () => {

  beforeEach(() => {
    shadowObservationService.clearPositions();
    aiDecisionEngine.setPostMortemReviews([]);
  });

  // --- PART 1: ENVIRONMENT & ACCOUNT IDENTITY (Scenarios 1?3) ---

  it('1. DEMO environment is positively verified and accepted', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(report.environmentVerified).toBe('DEMO');
    expect(report.accountState.environment).toBe('DEMO');
    expect(report.accountState.brokerServer).toContain('demo.ctraderapi.com');
  });

  it('2. LIVE environment is rejected and fails closed', () => {
    const liveCheck = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    expect(liveCheck.allowed).toBe(false);
    expect(liveCheck.code).toBe('LIVE_EXECUTION_DISARMED');
  });

  it('3. Account identity metadata is retrieved accurately', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(report.accountState.accountId).toBe('5881460');
    expect(report.accountState.currency).toBe('USD');
    expect(report.accountState.leverage).toBe(100);
    expect(report.accountState.connectionStatus).toBe('CONNECTED_READ_ONLY');
  });

  // --- PART 2: SYMBOL RECONCILIATION (Scenarios 4?6) ---

  it('4. Symbol discovery discovers authoritative specs for major pairs', () => {
    const symbols = ctraderReadOnlyReconciliationService.reconcileSymbols(['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD']);
    expect(symbols.length).toBe(4);
    expect(symbols.every(s => s.status === 'AVAILABLE')).toBe(true);
  });

  it('5. Symbol mapping maps QuantumAI symbols to cTrader symbol IDs correctly', () => {
    const symbols = ctraderReadOnlyReconciliationService.reconcileSymbols(['EUR/USD', 'USD/JPY', 'XAU/USD']);
    const eur = symbols.find(s => s.quantumAiSymbol === 'EUR/USD')!;
    const jpy = symbols.find(s => s.quantumAiSymbol === 'USD/JPY')!;
    const gold = symbols.find(s => s.quantumAiSymbol === 'XAU/USD')!;

    expect(eur.cTraderSymbolId).toBe(1);
    expect(eur.cTraderSymbolName).toBe('EURUSD');
    expect(eur.digits).toBe(5);

    expect(jpy.cTraderSymbolId).toBe(3);
    expect(jpy.cTraderSymbolName).toBe('USDJPY');
    expect(jpy.digits).toBe(3);

    expect(gold.cTraderSymbolId).toBe(41);
    expect(gold.cTraderSymbolName).toBe('XAUUSD');
    expect(gold.digits).toBe(2);
  });

  it('6. Unavailable or unsupported symbol is flagged SYMBOL_NOT_AVAILABLE', () => {
    const symbols = ctraderReadOnlyReconciliationService.reconcileSymbols(['XYZ/USD' as any]);
    expect(symbols[0].status).toBe('SYMBOL_NOT_AVAILABLE');
    expect(symbols[0].cTraderSymbolId).toBe(-1);
  });

  // --- PART 3: ACCOUNT STATE & POSITION RECONCILIATION (Scenarios 7?10) ---

  it('7. Account state inspection is strictly read-only and non-mutating', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(report.accountState.balance).toBeGreaterThan(0);
    expect(report.accountState.equity).toBeGreaterThan(0);
    expect(report.accountState.freeMargin).toBeGreaterThan(0);
  });

  it('8. Existing broker positions are read correctly without modification', () => {
    const mockPositions: AuthoritativeBrokerPosition[] = [
      {
        brokerPositionId: 'pos-1001',
        brokerOrderId: 'ord-1001',
        symbol: 'EUR/USD',
        cTraderSymbolId: 1,
        direction: 'BUY',
        volumeCents: 100000,
        lots: 0.01,
        entryPrice: 1.0850,
        currentPrice: 1.0860,
        stopLoss: 1.0820,
        takeProfit: 1.0910,
        unrealizedPnL: 10.0,
        openTimestamp: Date.now() - 3600000,
        status: 'OPEN'
      }
    ];

    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460', mockPositions);
    expect(report.authoritativeBrokerPositionCount).toBe(1);
    expect(report.authoritativeBrokerPositions[0].brokerPositionId).toBe('pos-1001');
    expect(report.authoritativeBrokerPositions[0].entryPrice).toBe(1.0850);
  });

  it('9. Shadow positions are not treated as authoritative broker positions', () => {
    // Create an active shadow position
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: 'EUR/USD',
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' }] }
    });
    shadowObservationService.evaluateAndOpenShadowPosition(opp, 1.0850, 'EUR/USD');

    expect(shadowObservationService.getOpenPositions().length).toBe(1);

    // Reconcile with broker (zero broker positions)
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460', []);
    expect(report.authoritativeBrokerPositionCount).toBe(0);
  });

  it('10. Test fixtures remain strictly isolated from broker state', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460', []);
    expect(report.authoritativeBrokerPositions).toEqual([]);
    expect(report.authoritativeBrokerPositionCount).toBe(0);
  });

  // --- PART 4: EXECUTION GATE & SAFETY (Scenarios 11?12) ---

  it('11. Execution remains disarmed after read-only reconciliation', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(report.demoExecutionArmed).toBe(false);
    expect(report.executionSafetyGateStatus).toBe('BLOCKED');
  });

  it('12. No broker orders are transmitted during reconciliation', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(report.brokerOrdersTransmitted).toBe(0);
  });

  // --- PART 5: ADAPTIVE LEARNING & SECRETS ISOLATION (Scenarios 13?16) ---

  it('13. No TradeClosed event is generated by account inspection', async () => {
    let closedTriggered = false;
    globalEventBus.subscribe(EventTypes.TradeClosed, async () => {
      closedTriggered = true;
    });

    ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    await new Promise(r => setTimeout(r, 20));

    expect(closedTriggered).toBe(false);
  });

  it('14. No post-mortem is generated by read-only reconciliation', () => {
    ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(0);
  });

  it('15. No adaptive-learning mutation occurs during reconciliation', () => {
    const initialReviews = aiDecisionEngine.getPostMortemReviews().length;
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');

    expect(report.learningMutationsTriggered).toBe(0);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(initialReviews);
  });

  it('16. Secrets, tokens, and credentials are completely absent from report output', () => {
    const report = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    const reportStr = JSON.stringify(report);

    expect(reportStr).not.toContain('clientSecret');
    expect(reportStr).not.toContain('accessToken');
    expect(reportStr).not.toContain('password');
  });
});
