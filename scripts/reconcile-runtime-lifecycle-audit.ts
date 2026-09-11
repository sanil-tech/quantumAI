import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
import { TradingRepository } from '../packages/database/src/repository';
import { LearningService } from '../src/server/services/learningService';
import { EnhancedVetoLogic } from '../src/server/services/enhancedVetoLogic';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';

async function runRuntimeLifecycleAudit() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new TradingRepository(pool);
  const learningService = new LearningService(repo);

  const testClosedId = `pos_audit_closed_${Date.now()}`;
  const testOpenId = `pos_audit_open_${Date.now()}`;

  try {
    console.log('================================================================');
    console.log('QUANTUMAI — LIVE POSTGRESQL RUNTIME LIFECYCLE RECONCILIATION');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // PHASE 3 & 5: HISTORICAL BACKFILL & IDEMPOTENCY REPLAY TEST
    // -------------------------------------------------------------
    console.log('--- PHASE 3 & 5: Live Backfill & Idempotency Replay ---');
    
    // Insert synthetic closed position directly to PostgreSQL
    await pool.query(`
      INSERT INTO positions (
        position_id, account_id, symbol, direction, quantity, entry_price, current_price,
        close_price, stop_loss, take_profit, realized_profit, pnl_pips, status,
        opened_at, closed_at
      ) VALUES (
        $1, 'AUDIT_ACCOUNT', 'GBP/USD', 'SELL', 1000, 1.28500, 1.28900,
        1.28900, 1.28900, 1.27500, -40.00, -40, 'CLOSED',
        NOW() - interval '2 hours', NOW() - interval '1 hour'
      )
    `, [testClosedId]);
    console.log(`1. Inserted synthetic unlearned closed position: ${testClosedId}`);

    // Backfill Run #1
    const run1 = await learningService.backfillHistoricalClosedTrades(100);
    console.log(`2. Backfill Run #1: Discovered=${run1.discovered}, Processed=${run1.processed}, Skipped=${run1.skipped}, Failed=${run1.failed}`);

    // Backfill Run #2 (Idempotency Replay)
    const run2 = await learningService.backfillHistoricalClosedTrades(100);
    console.log(`3. Backfill Run #2: Discovered=${run2.discovered}, Processed=${run2.processed}, Skipped=${run2.skipped}, Failed=${run2.failed}`);

    // Check unique constraint in PostgreSQL
    const pmCountRes = await pool.query('SELECT COUNT(*)::int as count FROM post_mortem_reviews WHERE trade_id = $1', [testClosedId]);
    console.log(`4. Post-mortems for ${testClosedId} in PostgreSQL: ${pmCountRes.rows[0].count} (Expected: exactly 1)`);

    // -------------------------------------------------------------
    // PHASE 4: OPEN TRADE ISOLATION PROOF
    // -------------------------------------------------------------
    console.log('\n--- PHASE 4: Live Open Trade Isolation Proof ---');
    await pool.query(`
      INSERT INTO positions (
        position_id, account_id, symbol, direction, quantity, entry_price, current_price,
        status, opened_at
      ) VALUES (
        $1, 'AUDIT_ACCOUNT', 'EUR/USD', 'BUY', 1000, 1.08500, 1.08600,
        'OPEN', NOW()
      )
    `, [testOpenId]);
    console.log(`1. Inserted synthetic OPEN position: ${testOpenId}`);

    // Run backfill again to prove OPEN position is ignored
    const openBackfill = await learningService.backfillHistoricalClosedTrades(100);
    console.log(`2. Backfill with OPEN position present: Discovered=${openBackfill.discovered}, Processed=${openBackfill.processed}`);

    // Attempt direct learning on OPEN position
    let openRejected = false;
    try {
      await learningService.processClosedTrade({ tradeId: testOpenId, positionId: testOpenId });
    } catch (e: any) {
      if (e.message.includes('OPEN_TRADE_LEARNING_REJECTED')) {
        openRejected = true;
      }
    }
    console.log(`3. Direct learning call on OPEN position rejected: ${openRejected ? 'YES (PASS)' : 'NO (FAIL)'}`);

    // -------------------------------------------------------------
    // PHASE 6: POSTGRESQL -> EVENT -> LEARNING TRACE
    // -------------------------------------------------------------
    console.log('\n--- PHASE 6: PostgreSQL -> Event -> Learning Trace ---');
    // Close the open position in PostgreSQL
    await pool.query(`
      UPDATE positions 
      SET status = 'CLOSED', close_price = 1.08200, realized_profit = -30.00, pnl_pips = -30, closed_at = NOW()
      WHERE position_id = $1
    `, [testOpenId]);
    console.log(`1. Updated position ${testOpenId} status to CLOSED in PostgreSQL`);

    // Process event
    const review = await learningService.processClosedTrade({
      tradeId: testOpenId,
      positionId: testOpenId,
      symbol: 'EUR/USD',
      direction: 'BUY',
      pnlDollars: -30.00,
      pnlPips: -30
    });
    console.log(`2. Generated post-mortem review: ID=${review.id}, Outcome=${review.outcome}, AdaptiveRule="${review.adaptiveRuleEn || review.adaptiveRuleMs}"`);

    // Verify DB audit row in trade_events
    const eventRows = await pool.query('SELECT * FROM trade_events WHERE trade_id = $1 ORDER BY timestamp DESC', [testOpenId]);
    console.log(`3. Audit records in trade_events table: ${eventRows.rows.length}`);
    if (eventRows.rows.length > 0) {
      console.log(`   Event Type: ${eventRows.rows[0].event_type}, Actor: ${eventRows.rows[0].actor}`);
    }

    // -------------------------------------------------------------
    // PHASE 7: RESTART RECOVERY PROOF
    // -------------------------------------------------------------
    console.log('\n--- PHASE 7: Restart Recovery Proof ---');
    const beforeRestartDbCount = (await pool.query('SELECT COUNT(*)::int as count FROM post_mortem_reviews')).rows[0].count;
    const beforeRestartMemCount = aiDecisionEngine.getPostMortemReviews().length;
    console.log(`Before restart: DB Count=${beforeRestartDbCount}, In-Memory Cache Count=${beforeRestartMemCount}`);

    // Simulate crash/restart
    aiDecisionEngine.setPostMortemReviews([]);
    console.log(`Simulated restart (cleared in-memory cache): In-Memory Cache Count=${aiDecisionEngine.getPostMortemReviews().length}`);

    // Rehydrate
    const freshLearningService = new LearningService(repo);
    const rehydrated = await freshLearningService.loadPersistedLearning();
    console.log(`After loadPersistedLearning(): Rehydrated Lessons=${rehydrated.length}, In-Memory Cache Count=${aiDecisionEngine.getPostMortemReviews().length}`);
    console.log(`Restart recovery parity: ${rehydrated.length === beforeRestartDbCount ? 'EXACT PARITY (PASS)' : 'MISMATCH (FAIL)'}`);

    // -------------------------------------------------------------
    // PHASE 9: SAMPLE SIZE / VETO SAFETY SEMANTICS
    // -------------------------------------------------------------
    console.log('\n--- PHASE 9: Sample Size & Veto Safety Semantics ---');
    const vetoLogic = EnhancedVetoLogic.getInstance();
    (vetoLogic as any).tradingRepo = repo;

    // N=0
    const ctx0 = await (vetoLogic as any).getHistoricalContext('AUD/NZD', 'NONEXISTENT_SETUP', 'AUDIT_ACCOUNT');
    console.log(`N=0 (no trades): Samples=${ctx0.totalSamples}, FailureRate=${ctx0.failureRate}%, Status=${ctx0.status}`);

    // N=1
    const ctx1 = await (vetoLogic as any).getHistoricalContext('GBP/USD', 'ORDER_BLOCK_RETEST', 'AUDIT_ACCOUNT');
    console.log(`N=1 (single trade): Samples=${ctx1.totalSamples}, FailureRate=${ctx1.failureRate}%, Status=${ctx1.status}`);

    // -------------------------------------------------------------
    // PHASE 12: EXECUTION SAFETY FINAL CHECK
    // -------------------------------------------------------------
    console.log('\n--- PHASE 12: Execution Safety Invariant Check ---');
    const gateEval = FinalExecutionGateService.evaluateFinalExecutionGate({
      requestId: `audit-live-req-${Date.now()}`,
      idempotencyKey: `audit-live-idem-${Date.now()}`,
      strategyId: 'STRAT-AI-TREND-PULSE',
      strategyVersion: 'v2.0.0',
      symbol: 'EUR/USD',
      direction: 'BUY',
      riskPercent: 1.0,
      environment: 'LIVE',
      actorId: 'admin-audit',
      actorRole: 'ADMIN'
    });
    console.log(`LIVE Execution Request Decision: ${gateEval.decision}`);
    console.log(`Broker Order Transmitted:       ${gateEval.brokerOrderTransmitted}`);
    console.log(`Execution Environment:          ${gateEval.executionEnvironment}`);
    console.log(`Gate Evaluation Status:         ${gateEval.decision === 'DENIED' && !gateEval.brokerOrderTransmitted && gateEval.executionEnvironment === 'FORBIDDEN' ? 'FAIL-CLOSED VERIFIED (PASS)' : 'FAIL'}`);

    // -------------------------------------------------------------
    // CLEANUP SYNTHETIC AUDIT ROWS
    // -------------------------------------------------------------
    console.log('\n--- CLEANUP: Removing synthetic audit records ---');
    await pool.query('DELETE FROM trade_events WHERE trade_id IN ($1, $2)', [testClosedId, testOpenId]);
    await pool.query('DELETE FROM post_mortem_reviews WHERE trade_id IN ($1, $2)', [testClosedId, testOpenId]);
    await pool.query('DELETE FROM positions WHERE position_id IN ($1, $2)', [testClosedId, testOpenId]);
    console.log('Cleaned up synthetic test records from PostgreSQL.');

  } catch (err) {
    console.error('Runtime Lifecycle Audit error:', err);
  } finally {
    await pool.end();
  }
}

runRuntimeLifecycleAudit();
