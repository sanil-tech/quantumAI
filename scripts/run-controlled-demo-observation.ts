import { controlledDemoObservationService } from '../apps/execution-router/src/services/controlledDemoObservationService';
import { controlledDemoSmokeTestHarness } from '../apps/execution-router/src/services/controlledDemoSmokeTestHarness';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { ctraderReadOnlyReconciliationService } from '../src/server/services/ctraderReadOnlyReconciliationService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair } from '../src/types';

async function runControlledDemoObservationRun() {
  console.log('================================================================================');
  console.log('QUANTUMAI / IATI OS ? CONTROLLED DEMO OBSERVATION RUN');
  console.log('================================================================================\n');

  // 1. Initial State Verification
  console.log('1. INITIAL RECONCILIATION & SAFETY VERIFICATION:');
  const recon = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
  console.log(`   Account: ${recon.accountState.accountId} (${recon.accountState.environment})`);
  console.log(`   Balance: $${recon.accountState.balance.toFixed(2)} | Equity: $${recon.accountState.equity.toFixed(2)}`);
  console.log(`   Authoritative Open Broker Positions: ${recon.authoritativeBrokerPositionCount}`);
  console.log(`   Execution Safety Gate: ${recon.executionSafetyGateStatus}`);
  console.log(`   Demo Armed State: ${recon.demoExecutionArmed}\n`);

  if (recon.authoritativeBrokerPositionCount !== 0) {
    throw new Error('PRE_CHECK_FAILED: Authoritative open positions must be 0 before starting observation run');
  }

  // 2. Define Controlled Trades to Execute & Accumulate
  const tradeScenarios = [
    {
      tradeName: 'Trade 1 (EUR/USD Bullish Order Block Retest -> TP1 Exit)',
      pair: 'EUR/USD' as CurrencyPair,
      currentPrice: 1.0850,
      indicators: { rsi: 62, ema20: 1.0845, ema50: 1.0830, superTrend: { trend: 'BULLISH' as const }, adx: { adx: 28 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' as const }] },
      idempotencyKey: 'demo-run-7g-001',
      brokerAck: { brokerOrderId: 'ord-demo-7g-001', brokerPositionId: 'pos-demo-7g-001', executedPrice: 1.0851 },
      exitPrice: 1.0890,
      exitReason: 'TAKE_PROFIT_1' as const,
      pnlDollars: 39.00,
      pnlPips: 39,
      outcome: 'WIN' as const,
      notes: 'Clean TP1 hit during London session expansion'
    },
    {
      tradeName: 'Trade 2 (EUR/USD Bearish S/R Flip -> Stop Loss Exit -> Learning Adaptation)',
      pair: 'EUR/USD' as CurrencyPair,
      currentPrice: 1.0860,
      indicators: { rsi: 38, ema20: 1.0865, ema50: 1.0880, superTrend: { trend: 'BEARISH' as const }, adx: { adx: 31 }, atr: 0.0022 },
      smc: { orderBlocks: [{ type: 'BEARISH' as const }] },
      idempotencyKey: 'demo-run-7g-002',
      brokerAck: { brokerOrderId: 'ord-demo-7g-002', brokerPositionId: 'pos-demo-7g-002', executedPrice: 1.0859 },
      exitPrice: 1.0885,
      exitReason: 'STOP_LOSS' as const,
      pnlDollars: -26.00,
      pnlPips: -26,
      outcome: 'LOSS' as const,
      notes: 'London close liquidity sweep hit Stop Loss'
    }
  ];

  console.log('2. EXECUTING CONTROLLED OBSERVATION TRADES:');

  for (let i = 0; i < tradeScenarios.length; i++) {
    const s = tradeScenarios[i];
    console.log(`\n--- ${s.tradeName} ---`);

    // A. Generate Signal
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: s.pair,
      currentPrice: s.currentPrice,
      indicators: s.indicators,
      smc: s.smc
    });

    console.log(`   [Signal] Action: ${opp.action} | Confidence: ${opp.confidence}% | Style: ${opp.tradingStyle}`);

    // B. Pre-flight & Controlled Execution
    const execRes = controlledDemoSmokeTestHarness.runControlledSmokeTest(
      opp,
      s.idempotencyKey,
      s.brokerAck
    );

    if (!execRes.success || !execRes.executionRecord) {
      throw new Error(`Execution failed for ${s.tradeName}: ${execRes.error}`);
    }

    console.log(`   [Broker Ack] OrderID: ${execRes.executionRecord.brokerOrderId} | PosID: ${execRes.executionRecord.brokerPositionId} | ExecPrice: ${execRes.executionRecord.acknowledgedEntryPrice}`);
    console.log(`   [Armed State After Transmit] ${controlledDemoExecutionService.isDemoArmed()} (Guaranteed Disarmed)`);

    // C. Monitor & Deterministic Protective Exit
    controlledDemoExecutionService.closeDemoPosition(
      execRes.executionRecord.id,
      s.exitPrice,
      s.exitReason
    );

    const closedRecord = controlledDemoExecutionService.getRecordById(execRes.executionRecord.id)!;
    console.log(`   [Exit] Status: ${closedRecord.phase} | Reason: ${closedRecord.closeReason} | ExitPrice: ${closedRecord.exitPrice} | Realized R: ${closedRecord.realizedRMultiple ?? (closedRecord as any).realizedR}R`);

    // D. Canonical Post-Mortem & Learning Persistence
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: execRes.executionRecord.id,
      positionId: execRes.executionRecord.brokerPositionId || 'pos-unknown',
      symbol: s.pair,
      direction: opp.action === 'BUY' ? 'BUY' : 'SELL',
      entryPrice: closedRecord.acknowledgedEntryPrice || s.currentPrice,
      exitPrice: s.exitPrice,
      stopLoss: closedRecord.stopLoss,
      takeProfit: closedRecord.takeProfit1,
      pnlDollars: s.pnlDollars,
      pnlPips: s.pnlPips,
      outcome: s.outcome,
      cleanNotes: s.notes
    });

    console.log(`   [Post-Mortem] RootCause: ${postMortem.rootCauseEn} | AdaptiveRule: ${postMortem.adaptiveRuleEn}`);

    // E. Record into Observation Accumulation Store
    const obs = controlledDemoObservationService.recordDemoExecution(
      opp,
      closedRecord,
      postMortem as any
    );

    console.log(`   [Obs Store] ExecID: ${obs.executionId} | Snapshot Frozen: ${Object.isFrozen(obs.signalSnapshot)}`);
  }

  // 3. Final Reconciliation & Metric Aggregation
  console.log('\n================================================================================');
  console.log('3. OBSERVATION RUN SUMMARY & METRICS:');
  console.log('================================================================================');

  const metrics = controlledDemoObservationService.getObservationMetrics();
  console.log(`   Total DEMO Executions:          ${metrics.totalDemoExecutions}`);
  console.log(`   Successful Executions:         ${metrics.successfulExecutions}`);
  console.log(`   Open Positions:                ${metrics.openPositions}`);
  console.log(`   Closed Positions:              ${metrics.closedPositions}`);
  console.log(`   Take Profit Exits:             ${metrics.tp1Exits + metrics.tp2Exits}`);
  console.log(`   Stop Loss Exits:               ${metrics.slExits}`);
  console.log(`   Avg Execution Latency:         ${metrics.avgExecutionLatencyMs} ms`);
  console.log(`   Avg Realized R:                ${metrics.avgRealizedR}R`);
  console.log(`   Post-Mortems Generated:        ${metrics.postMortemCount}`);
  console.log(`   Evidence Tier:                 ${metrics.evidenceTier}`);

  console.log('\n4. FINAL RECONCILIATION & SAFETY STATUS:');
  console.log(`   Authoritative Broker Positions: ${controlledDemoExecutionService.getOpenPositions().length}`);
  console.log(`   Demo Execution Armed:          ${controlledDemoExecutionService.isDemoArmed()}`);

  const liveCheck = validateExecutionEnvironmentSafety({
    environment: 'LIVE',
    brokerId: 'ctrader-broker-01',
    symbol: 'EURUSD',
    direction: 'BUY',
    requestedLotSize: 0.01
  });
  console.log(`   LIVE Execution Gate:           ${liveCheck.allowed ? 'ARMED' : 'FORBIDDEN'}`);
  console.log('================================================================================\n');
}

runControlledDemoObservationRun().catch(err => {
  console.error('OBSERVATION RUN FAILED:', err);
  process.exit(1);
});
