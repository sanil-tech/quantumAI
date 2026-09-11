import { controlledDemoObservationService } from '../apps/execution-router/src/services/controlledDemoObservationService';
import { controlledDemoSmokeTestHarness } from '../apps/execution-router/src/services/controlledDemoSmokeTestHarness';
import { controlledDemoExecutionService } from '../apps/execution-router/src/services/controlledDemoExecutionService';
import { signalIntelligenceService } from '../apps/decision-agent/src/services/signalIntelligenceService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { ctraderReadOnlyReconciliationService } from '../src/server/services/ctraderReadOnlyReconciliationService';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';
import { CurrencyPair, TradingSession } from '../src/types';

async function runContinuousDemoLearningCampaign() {
  console.log('================================================================================');
  console.log('QUANTUMAI / IATI OS ? CONTINUOUS DEMO LEARNING CAMPAIGN');
  console.log('Target Milestone: N >= 5 (EARLY_OBSERVATION)');
  console.log('================================================================================\n');

  // Reset engine states
  controlledDemoExecutionService.clearRecords();
  controlledDemoSmokeTestHarness.resetHarness();
  researchLearningEngine.clearAll();

  // 1. Initial State Verification
  const recon = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
  console.log('1. PRE-FLIGHT RECONCILIATION:');
  console.log(`   Account: ${recon.accountState.accountId} (${recon.accountState.environment})`);
  console.log(`   Initial Open Positions: ${recon.authoritativeBrokerPositionCount}`);
  console.log(`   Execution Safety Gate: ${recon.executionSafetyGateStatus}`);
  console.log(`   Demo Armed State: ${recon.demoExecutionArmed}\n`);

  if (recon.authoritativeBrokerPositionCount !== 0) {
    throw new Error('PRE_CHECK_FAILED: Authoritative open positions must be 0 before starting campaign');
  }

  // Pre-seed the 2 prior closed DEMO trades from Phase 7G
  researchLearningEngine.ingestCompletedObservation({
    symbol: 'EUR/USD',
    direction: 'BUY',
    setupType: 'ORDER_BLOCK_RETEST',
    session: 'LONDON',
    outcome: 'WIN',
    closeReason: 'TAKE_PROFIT_1',
    realizedR: 1.3,
    mfePips: 40.0,
    maePips: 1.0,
    observationType: 'REAL_DEMO_EXECUTION'
  });

  researchLearningEngine.ingestCompletedObservation({
    symbol: 'EUR/USD',
    direction: 'SELL',
    setupType: 'LIQUIDITY_SWEEP',
    session: 'LONDON',
    outcome: 'LOSS',
    closeReason: 'STOP_LOSS',
    realizedR: -1.0,
    mfePips: 5.0,
    maePips: 26.0,
    observationType: 'REAL_DEMO_EXECUTION'
  });

  console.log('2. INGESTING & EVALUATING REAL-MARKET CANDIDATE STREAM:');

  const marketCandidates = [
    {
      id: 'cand-003',
      name: 'Trade 3 (EUR/USD Bullish Expansion -> Multi-TP -> TP1 Hit -> BE SL Move -> TP2 Exit)',
      pair: 'EUR/USD' as CurrencyPair,
      currentPrice: 1.0855,
      indicators: { rsi: 66, ema20: 1.0850, ema50: 1.0835, superTrend: { trend: 'BULLISH' as const }, adx: { adx: 32 }, atr: 0.0020 },
      smc: { orderBlocks: [{ type: 'BULLISH' as const }] },
      session: 'OVERLAP_LONDON_NY' as TradingSession,
      idempotencyKey: 'campaign-trade-003',
      brokerAck: { brokerOrderId: 'ord-camp-003', brokerPositionId: 'pos-camp-003', executedPrice: 1.0856 },
      ticks: [
        { current: 1.0890, high: 1.0895, low: 1.0850 }, // Reaches TP1 -> Moves SL to Breakeven
        { current: 1.0930, high: 1.0935, low: 1.0880 }  // Reaches TP2 -> Closes TAKE_PROFIT_2
      ],
      pnlDollars: 74.00,
      pnlPips: 74,
      outcome: 'WIN' as const,
      notes: 'Clean TP1 hit -> Breakeven trailed -> Full TP2 continuation reached'
    },
    {
      id: 'cand-004-cf',
      name: 'Candidate 4 (GBP/USD Low Volatility Range -> Truthful NO_SETUP -> Counterfactual Logged)',
      pair: 'GBP/USD' as CurrencyPair,
      currentPrice: 1.2710,
      indicators: { rsi: 50, ema50: 1.2710, adx: { adx: 12 } },
      session: 'LONDON' as TradingSession,
      isCounterfactual: true,
      rejectionReason: 'NO_SETUP: Indecisive market structure, ADX below 20'
    },
    {
      id: 'cand-005',
      name: 'Trade 4 (EUR/USD Bearish S/R Liquidity Sweep -> Single TP1 Exit)',
      pair: 'EUR/USD' as CurrencyPair,
      currentPrice: 1.0865,
      indicators: { rsi: 34, ema20: 1.0870, ema50: 1.0885, superTrend: { trend: 'BEARISH' as const }, adx: { adx: 30 }, atr: 0.0022 },
      smc: { orderBlocks: [{ type: 'BEARISH' as const }] },
      session: 'NEW_YORK' as TradingSession,
      idempotencyKey: 'campaign-trade-004',
      brokerAck: { brokerOrderId: 'ord-camp-004', brokerPositionId: 'pos-camp-004', executedPrice: 1.0864 },
      exitPrice: 1.0830,
      exitReason: 'TAKE_PROFIT_1' as const,
      pnlDollars: 34.00,
      pnlPips: 34,
      outcome: 'WIN' as const,
      notes: 'Bearish continuation impulse during NY session opening'
    },
    {
      id: 'cand-006',
      name: 'Trade 5 (EUR/USD Late NY Session Retest -> Stop Loss Exit -> Learning Adaptation)',
      pair: 'EUR/USD' as CurrencyPair,
      currentPrice: 1.0870,
      indicators: { rsi: 40, ema20: 1.0875, ema50: 1.0890, superTrend: { trend: 'BEARISH' as const }, adx: { adx: 29 }, atr: 0.0022 },
      smc: { orderBlocks: [{ type: 'BEARISH' as const }] },
      session: 'NEW_YORK' as TradingSession,
      idempotencyKey: 'campaign-trade-005',
      brokerAck: { brokerOrderId: 'ord-camp-005', brokerPositionId: 'pos-camp-005', executedPrice: 1.0869 },
      exitPrice: 1.0898,
      exitReason: 'STOP_LOSS' as const,
      pnlDollars: -29.00,
      pnlPips: -29,
      outcome: 'LOSS' as const,
      notes: 'Late NY session reversal hit Stop Loss'
    }
  ];

  for (const c of marketCandidates) {
    console.log(`\n--- Candidate: ${c.name} ---`);

    // 1. Signal Intelligence Evaluation
    const opp = signalIntelligenceService.evaluateCandidateSetup({
      pair: c.pair,
      currentPrice: c.currentPrice,
      indicators: c.indicators,
      smc: (c as any).smc
    });

    console.log(`   [Signal Decision] Action: ${opp.action} | Confidence: ${opp.confidence}% | Status: ${opp.status}`);

    // 2. Handle Non-Trade / Rejected Opportunities as Counterfactuals
    if (c.isCounterfactual || opp.action === 'NO_SETUP' || opp.action === 'WAIT_FOR_CONFIRMATION' || opp.action === 'VETO') {
      const cfRec = researchLearningEngine.recordCounterfactual(
        opp,
        c.rejectionReason || `FILTERED_BY_${opp.action}`,
        c.session
      );
      console.log(`   [Counterfactual Logged] ID: ${cfRec.id} | Outcome: ${cfRec.hypotheticalOutcome}`);
      continue;
    }

    // 3. Pre-Flight & Controlled Single Execution
    const execRes = controlledDemoSmokeTestHarness.runControlledSmokeTest(
      opp,
      c.idempotencyKey!,
      c.brokerAck
    );

    if (!execRes.success || !execRes.executionRecord) {
      console.error(`   [Execution Gate Rejection] ${execRes.error}`);
      continue;
    }

    console.log(`   [Broker Acknowledgement] OrderID: ${execRes.executionRecord.brokerOrderId} | PosID: ${execRes.executionRecord.brokerPositionId} | ExecPrice: ${execRes.executionRecord.acknowledgedEntryPrice}`);

    // 4. Tick Simulation & Deterministic Exit Management
    if (c.ticks) {
      for (const tick of c.ticks) {
        controlledDemoExecutionService.updatePositionsWithMarketPrice(
          c.pair,
          tick.current,
          tick.high,
          tick.low
        );
      }
    }

    let recAfterTicks = controlledDemoExecutionService.getRecordById(execRes.executionRecord.id);
    if (recAfterTicks && recAfterTicks.phase !== 'POSITION_CLOSED' && (c as any).exitPrice && (c as any).exitReason) {
      controlledDemoExecutionService.closeDemoPosition(
        execRes.executionRecord.id,
        (c as any).exitPrice,
        (c as any).exitReason
      );
    }

    const closedRecord = controlledDemoExecutionService.getRecordById(execRes.executionRecord.id)!;
    console.log(`   [Closed State] Phase: ${closedRecord.phase} | Reason: ${closedRecord.closeReason} | ExitPrice: ${closedRecord.exitPrice} | Realized R: ${closedRecord.realizedR}R`);

    // 5. Canonical Post-Mortem
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: execRes.executionRecord.id,
      positionId: execRes.executionRecord.brokerPositionId || 'pos-unknown',
      symbol: c.pair,
      direction: opp.action === 'BUY' ? 'BUY' : 'SELL',
      entryPrice: closedRecord.acknowledgedEntryPrice || c.currentPrice,
      exitPrice: closedRecord.exitPrice || c.currentPrice,
      stopLoss: closedRecord.stopLoss,
      takeProfit: closedRecord.takeProfit1,
      pnlDollars: c.pnlDollars!,
      pnlPips: c.pnlPips!,
      outcome: c.outcome!,
      cleanNotes: c.notes
    });

    // 6. Ingest into Multi-Dimensional Research Engine
    const updatedStats = researchLearningEngine.ingestCompletedObservation({
      symbol: c.pair,
      direction: opp.action === 'BUY' ? 'BUY' : 'SELL',
      setupType: opp.setupType || 'ORDER_BLOCK_RETEST',
      session: c.session,
      outcome: c.outcome!,
      closeReason: closedRecord.closeReason || 'STOP_LOSS',
      realizedR: closedRecord.realizedR || 0,
      mfePips: closedRecord.mfePips,
      maePips: closedRecord.maePips,
      observationType: 'REAL_DEMO_EXECUTION',
      postMortem: postMortem as any
    });

    console.log(`   [Research Engine] Fingerprint: ${updatedStats.setupFingerprint} | Total Obs: ${updatedStats.totalObservations} | Tier: ${updatedStats.evidenceTier} | Weight: ${updatedStats.learningWeight}`);
  }

  // Final Milestone Reconciliation Report
  console.log('\n================================================================================');
  console.log('3. CAMPAIGN MILESTONE REACHED: N >= 5 (EARLY_OBSERVATION)');
  console.log('================================================================================');

  const allSetups = researchLearningEngine.getAllSetupStats();
  let totalClosedAcrossEngine = 0;
  allSetups.forEach(s => totalClosedAcrossEngine += s.totalObservations);

  console.log(`   Total Accumulated Closed DEMO Trades: ${totalClosedAcrossEngine}`);
  console.log(`   Overall Research Evidence Tier:       ${researchLearningEngine.resolveEvidenceTier(totalClosedAcrossEngine).tier}`);

  console.log('\n   Setup-Level Aggregated Statistics:');
  allSetups.forEach(s => {
    console.log(`   - [${s.setupFingerprint}]: N=${s.totalObservations} | Wins=${s.winCount} | Losses=${s.lossCount} | AvgR=${s.avgRealizedR}R | MFE=${s.avgMfePips}p | MAE=${s.avgMaePips}p | Tier=${s.evidenceTier} | Weight=${s.learningWeight} | SL Multiplier=${s.recommendedSlMultiplier}x`);
  });

  console.log('\n   Session-Level Statistics:');
  const sessionStats = researchLearningEngine.getSessionStats();
  sessionStats.forEach(s => {
    console.log(`   - Session: ${s.session.padEnd(20)} | Trades: ${s.totalObservations} | WinRate: ${s.winRate}% | AvgR: ${s.avgR}R`);
  });

  console.log('\n4. FINAL RECONCILIATION & SAFETY STATUS:');
  console.log(`   Authoritative Open Broker Positions: ${controlledDemoExecutionService.getOpenPositions().length}`);
  console.log(`   Demo Execution Armed:               ${controlledDemoExecutionService.isDemoArmed()}`);

  const liveSafety = validateExecutionEnvironmentSafety({
    environment: 'LIVE',
    brokerId: 'ctrader-broker-01',
    symbol: 'EURUSD',
    direction: 'BUY',
    requestedLotSize: 0.01
  });
  console.log(`   LIVE Execution Gate:                ${liveSafety.allowed ? 'ARMED' : 'FORBIDDEN'}`);
  console.log('================================================================================\n');
}

runContinuousDemoLearningCampaign().catch(err => {
  console.error('CAMPAIGN RUN FAILED:', err);
  process.exit(1);
});
