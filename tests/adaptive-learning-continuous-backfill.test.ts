import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';
import { LearningService } from '../src/server/services/learningService';
import { EnhancedVetoLogic } from '../src/server/services/enhancedVetoLogic';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';

describe('QUANTUMAI — Continuous PostgreSQL-Authoritative Adaptive Learning Test Suite', () => {
  let storedPositions: Map<string, any>;
  let storedPostMortems: Map<string, any>; // key: `${tradeId}:${learningVersion}`
  let storedEvents: any[];
  let mockPool: any;
  let repository: TradingRepository;
  let learningService: LearningService;

  beforeEach(() => {
    storedPositions = new Map();
    storedPostMortems = new Map();
    storedEvents = [];

    // Reset in-memory cache
    aiDecisionEngine.setPostMortemReviews([]);

    const handleQuery = async (text: string, params?: any[]) => {
      if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) {
        return { rows: [] };
      }

      // 1. Position queries
      if (text.includes('SELECT * FROM positions WHERE position_id = $1')) {
        const pos = storedPositions.get(params![0]);
        return { rows: pos ? [pos] : [] };
      }

      if (text.includes('SELECT * FROM positions WHERE account_id = $1 AND status = \'CLOSED\'') ||
          text.includes('SELECT * FROM positions WHERE status = \'CLOSED\'')) {
        const closed = Array.from(storedPositions.values()).filter(p => p.status === 'CLOSED');
        const limit = params && params[1] ? params[1] : (params && params[0] && typeof params[0] === 'number' ? params[0] : 100);
        return { rows: closed.slice(0, limit) };
      }

      if (text.includes('SELECT * FROM positions WHERE account_id = $1 AND status = \'OPEN\'')) {
        const open = Array.from(storedPositions.values()).filter(p => p.status === 'OPEN' && p.account_id === params![0]);
        return { rows: open };
      }

      if (text.includes('SELECT p.* FROM positions p') && text.includes('LEFT JOIN post_mortem_reviews pm')) {
        const version = params![0] || '1.0';
        const limit = params![1] || 200;
        const unlearned = Array.from(storedPositions.values()).filter(p => {
          if (p.status !== 'CLOSED') return false;
          const key = `${p.position_id}:${version}`;
          return !storedPostMortems.has(key);
        });
        return { rows: unlearned.slice(0, limit) };
      }

      if (text.includes('UPDATE positions') && text.includes("status = 'CLOSED'")) {
        const posId = params![4];
        const pos = storedPositions.get(posId);
        if (pos) {
          pos.status = 'CLOSED';
          pos.close_price = String(params![0]);
          pos.realized_profit = String(params![1]);
          pos.pnl_pips = String(params![2]);
          pos.close_reason = params![3];
          pos.closed_at = new Date();
          storedPositions.set(posId, pos);
          return { rows: [pos] };
        }
        return { rows: [] };
      }

      // 2. Post-mortem review queries
      if (text.includes('SELECT * FROM post_mortem_reviews WHERE trade_id = $1 AND learning_version = $2')) {
        const key = `${params![0]}:${params![1]}`;
        const pm = storedPostMortems.get(key);
        return { rows: pm ? [pm] : [] };
      }

      if (text.includes('INSERT INTO post_mortem_reviews')) {
        const id = params![0];
        const tradeId = params![1];
        const learningVersion = params![2];
        const reviewJson = params![3];
        const key = `${tradeId}:${learningVersion}`;

        const pmRecord = {
          id,
          trade_id: tradeId,
          learning_version: learningVersion,
          review: typeof reviewJson === 'string' ? JSON.parse(reviewJson) : reviewJson,
          created_at: new Date()
        };

        storedPostMortems.set(key, pmRecord);
        return { rows: [pmRecord] };
      }

      if (text.includes('SELECT * FROM post_mortem_reviews ORDER BY created_at DESC')) {
        const rows = Array.from(storedPostMortems.values()).map(r => ({
          ...r,
          review: typeof r.review === 'string' ? r.review : JSON.stringify(r.review)
        }));
        const limit = params && params[0] ? params[0] : rows.length;
        return { rows: rows.slice(0, limit) };
      }

      // 3. Trade event queries
      if (text.includes('INSERT INTO trade_events')) {
        const eventRecord = {
          id: params![0],
          trade_id: params![1],
          order_id: params![2],
          setup_id: params![3],
          event_type: params![4],
          actor: params![5],
          details: params![6],
          timestamp: new Date()
        };
        storedEvents.push(eventRecord);
        return { rows: [eventRecord] };
      }

      if (text.includes('SELECT * FROM trade_events')) {
        return { rows: storedEvents };
      }

      if (text.includes('SELECT balance FROM account_state') || text.includes('UPDATE account_state')) {
        return { rows: [{ balance: '10000.00' }] };
      }

      return { rows: [] };
    };

    mockPool = {
      query: handleQuery,
      connect: async () => ({
        query: handleQuery,
        release: () => {}
      })
    };

    repository = new TradingRepository(mockPool);
    learningService = new LearningService(repository);
  });

  // 1. Initial PostgreSQL Historical Backfill
  it('1. startup backfill discovers unlearned closed trades from PostgreSQL and creates post-mortems', async () => {
    // Seed 3 historical closed trades in PostgreSQL without post-mortems
    for (let i = 1; i <= 3; i++) {
      storedPositions.set(`pos_closed_${i}`, {
        position_id: `pos_closed_${i}`,
        account_id: '5877246',
        symbol: 'EUR/USD',
        direction: 'BUY',
        entry_price: '1.08500',
        current_price: '1.08200',
        close_price: '1.08200',
        stop_loss: '1.08200',
        take_profit: '1.09000',
        realized_profit: '-30.00',
        pnl_pips: '-30',
        status: 'CLOSED',
        opened_at: new Date(Date.now() - 3600000 * (4 - i)),
        closed_at: new Date(Date.now() - 3600000 * (4 - i) + 1800000)
      });
    }

    expect(storedPostMortems.size).toBe(0);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(0);

    // Rehydrate and backfill
    const reviews = await learningService.loadPersistedLearning();

    expect(reviews.length).toBe(3);
    expect(storedPostMortems.size).toBe(3);
    expect(storedPostMortems.has('pos_closed_1:1.0')).toBe(true);
    expect(storedPostMortems.has('pos_closed_2:1.0')).toBe(true);
    expect(storedPostMortems.has('pos_closed_3:1.0')).toBe(true);
  });

  // 2. Open Trades Do NOT Block Backfill
  it('2. 135 currently open trades in PostgreSQL are ignored by backfill and do not block learning', async () => {
    // Seed 135 OPEN trades
    for (let i = 1; i <= 135; i++) {
      storedPositions.set(`pos_open_${i}`, {
        position_id: `pos_open_${i}`,
        account_id: '5877246',
        symbol: i % 2 === 0 ? 'EUR/USD' : 'GBP/USD',
        direction: 'BUY',
        entry_price: '1.08500',
        current_price: '1.08600',
        status: 'OPEN',
        opened_at: new Date()
      });
    }

    // Seed 2 CLOSED trades
    storedPositions.set('pos_closed_alpha', {
      position_id: 'pos_closed_alpha',
      account_id: '5877246',
      symbol: 'USD/JPY',
      direction: 'SELL',
      entry_price: '155.000',
      close_price: '154.500',
      realized_profit: '50.00',
      pnl_pips: '50',
      status: 'CLOSED',
      opened_at: new Date(),
      closed_at: new Date()
    });

    const result = await learningService.backfillHistoricalClosedTrades();

    expect(result.discovered).toBe(1);
    expect(result.processed).toBe(1);
    expect(storedPostMortems.size).toBe(1);
    expect(storedPostMortems.has('pos_closed_alpha:1.0')).toBe(true);
  });

  // 3. Continuous Event-Driven Learning
  it('3. when a position closes, TradeClosed event continuously updates learning in real time', async () => {
    // Seed an open trade
    storedPositions.set('pos_live_1', {
      position_id: 'pos_live_1',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entry_price: '1.08500',
      current_price: '1.08500',
      status: 'OPEN',
      opened_at: new Date()
    });

    // Close position atomically in PostgreSQL
    await repository.closePositionTransaction({
      positionId: 'pos_live_1',
      closePrice: 1.08200,
      realizedProfit: -35.00,
      pnlPips: -30,
      closeReason: 'SL_HIT'
    });

    // Simulate event bus dispatch
    const payload: TradeClosedPayload = {
      tradeId: 'pos_live_1',
      positionId: 'pos_live_1',
      accountId: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.08500,
      exitPrice: 1.08200,
      stopLoss: 1.08200,
      takeProfit: 1.09000,
      pnlDollars: -35.00,
      pnlPips: -30,
      closedAt: new Date()
    };

    const review = await learningService.processClosedTrade(payload);

    expect(review).toBeDefined();
    expect(review.outcome).toBe('LOSS');
    expect(storedPostMortems.has('pos_live_1:1.0')).toBe(true);
    expect(aiDecisionEngine.getPostMortemReviews().some(r => r.tradeId === 'pos_live_1')).toBe(true);
  });

  // 4. Strict Idempotency: Duplicate TradeClosed Event
  it('4. duplicate TradeClosed event does not re-process or duplicate learning', async () => {
    storedPositions.set('pos_dup_1', {
      position_id: 'pos_dup_1',
      account_id: 'DEFAULT',
      symbol: 'GBP/USD',
      direction: 'SELL',
      entry_price: '1.27500',
      close_price: '1.27800',
      realized_profit: '-40.00',
      pnl_pips: '-30',
      status: 'CLOSED',
      opened_at: new Date(),
      closed_at: new Date()
    });

    const payload: TradeClosedPayload = {
      tradeId: 'pos_dup_1',
      positionId: 'pos_dup_1',
      symbol: 'GBP/USD',
      direction: 'SELL',
      entryPrice: 1.27500,
      exitPrice: 1.27800,
      stopLoss: 1.27800,
      takeProfit: 1.27000,
      pnlDollars: -40.00,
      pnlPips: -30,
      closedAt: new Date()
    };

    const firstRun = await learningService.processClosedTrade(payload);
    const secondRun = await learningService.processClosedTrade(payload);

    expect(firstRun.id).toBe(secondRun.id);
    expect(storedPostMortems.size).toBe(1);
    expect(aiDecisionEngine.getPostMortemReviews().filter(r => r.tradeId === 'pos_dup_1').length).toBe(1);
  });

  // 5. Server Restart & Rehydration
  it('5. server restart rehydrates existing learning state and does not duplicate previously processed trades', async () => {
    // 1st Server Lifetime: Process trade A
    storedPositions.set('pos_server_A', {
      position_id: 'pos_server_A',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entry_price: '1.08500',
      close_price: '1.08200',
      realized_profit: '-25.00',
      pnl_pips: '-30',
      status: 'CLOSED',
      opened_at: new Date(),
      closed_at: new Date()
    });

    await learningService.processClosedTrade({ tradeId: 'pos_server_A', positionId: 'pos_server_A' });
    expect(storedPostMortems.size).toBe(1);

    // Simulate Server Crash: Reset in-memory cache
    aiDecisionEngine.setPostMortemReviews([]);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(0);

    // 2nd Server Lifetime: New instance boot
    const newLearningService = new LearningService(repository);
    const rehydrated = await newLearningService.loadPersistedLearning();

    expect(rehydrated.length).toBe(1);
    expect(rehydrated[0].tradeId).toBe('pos_server_A');

    // Trade B closes during 2nd lifetime
    storedPositions.set('pos_server_B', {
      position_id: 'pos_server_B',
      account_id: 'DEFAULT',
      symbol: 'USD/JPY',
      direction: 'BUY',
      entry_price: '155.000',
      close_price: '155.800',
      realized_profit: '80.00',
      pnl_pips: '80',
      status: 'CLOSED',
      opened_at: new Date(),
      closed_at: new Date()
    });

    await newLearningService.processClosedTrade({ tradeId: 'pos_server_B', positionId: 'pos_server_B' });
    expect(storedPostMortems.size).toBe(2);
    expect(aiDecisionEngine.getPostMortemReviews().length).toBe(2);
  });

  // 6. Open Trade Cannot Enter Learning
  it('6. open trade in PostgreSQL is strictly rejected from post-mortem learning', async () => {
    storedPositions.set('pos_open_reject', {
      position_id: 'pos_open_reject',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entry_price: '1.08500',
      current_price: '1.08500',
      status: 'OPEN',
      opened_at: new Date()
    });

    await expect(learningService.processClosedTrade({
      tradeId: 'pos_open_reject',
      positionId: 'pos_open_reject'
    })).rejects.toThrow('OPEN_TRADE_LEARNING_REJECTED');
  });

  // 7. Enhanced Veto Logic: Sample Size & Status Handling
  it('7. Enhanced Veto Logic reports explicit sample size, wins, losses, and NO_DATA / INSUFFICIENT_SAMPLE status', async () => {
    const vetoService = EnhancedVetoLogic.getInstance();
    (vetoService as any).tradingRepo = repository;

    // Case A: 0 closed trades in PostgreSQL
    const contextZero = await (vetoService as any).getHistoricalContext('EUR/USD', 'ORDER_BLOCK_RETEST', 'DEFAULT');
    expect(contextZero.totalSamples).toBe(0);
    expect(contextZero.wins).toBe(0);
    expect(contextZero.losses).toBe(0);
    expect(contextZero.failureRate).toBe(0);
    expect(contextZero.status).toBe('NO_DATA');

    // Case B: 1 loss (insufficient sample)
    storedPositions.set('pos_single_loss', {
      position_id: 'pos_single_loss',
      symbol: 'EUR/USD',
      direction: 'BUY',
      proposalId: 'prop-OB',
      realized_profit: '-20.00',
      status: 'CLOSED'
    });
    const contextOne = await (vetoService as any).getHistoricalContext('EUR/USD', 'ORDER_BLOCK_RETEST', 'DEFAULT');
    expect(contextOne.totalSamples).toBe(1);
    expect(contextOne.losses).toBe(1);
    expect(contextOne.failureRate).toBe(100);
    expect(contextOne.status).toBe('INSUFFICIENT_SAMPLE');

    // Case C: 4 trades with 3 losses (sufficient sample >= 3, failure rate 75%)
    for (let i = 2; i <= 4; i++) {
      storedPositions.set(`pos_loss_${i}`, {
        position_id: `pos_loss_${i}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        proposalId: 'prop-OB',
        realized_profit: i === 4 ? '30.00' : '-25.00',
        status: 'CLOSED'
      });
    }

    const contextFour = await (vetoService as any).getHistoricalContext('EUR/USD', 'ORDER_BLOCK_RETEST', 'DEFAULT');
    expect(contextFour.totalSamples).toBe(4);
    expect(contextFour.losses).toBe(3);
    expect(contextFour.wins).toBe(1);
    expect(contextFour.failureRate).toBe(75);
    expect(contextFour.status).toBe('HIGH_FAILURE_PATTERN');
  });

  // 8. Full Administrative Rebuild from PostgreSQL
  it('8. administrative rebuild reconstructs all learning state deterministically from PostgreSQL', async () => {
    // Seed 4 closed positions
    for (let i = 1; i <= 4; i++) {
      storedPositions.set(`pos_rebuild_${i}`, {
        position_id: `pos_rebuild_${i}`,
        account_id: 'DEFAULT',
        symbol: 'GBP/USD',
        direction: i % 2 === 0 ? 'BUY' : 'SELL',
        entry_price: '1.27000',
        close_price: '1.27200',
        realized_profit: i % 2 === 0 ? '40.00' : '-30.00',
        pnl_pips: i % 2 === 0 ? '20' : '-30',
        status: 'CLOSED',
        opened_at: new Date(Date.now() - 3600000 * (5 - i)),
        closed_at: new Date(Date.now() - 3600000 * (5 - i) + 1800000)
      });
    }

    const result = await learningService.rebuildAdaptiveLearningFromPostgres();

    expect(result.totalClosed).toBe(4);
    expect(result.processed).toBe(4);
    expect(storedPostMortems.size).toBe(4);
  });

  // 9. Fail-Closed Execution Safety Preservation
  it('9. Execution safety gate remains FAIL-CLOSED, LIVE FORBIDDEN, 0 broker orders', () => {
    const liveDecision = FinalExecutionGateService.evaluateFinalExecutionGate({
      requestId: 'test-live-req-p12',
      idempotencyKey: 'test-live-idem-p12',
      strategyId: 'STRAT-AI-TREND-PULSE',
      strategyVersion: 'v2.0.0',
      symbol: 'EUR/USD',
      direction: 'BUY',
      riskPercent: 1.0,
      environment: 'LIVE',
      actorId: 'admin-user',
      actorRole: 'ADMIN'
    });

    expect(liveDecision.decision).toBe('DENIED');
    expect(liveDecision.brokerOrderTransmitted).toBe(false);
    expect(liveDecision.executionEnvironment).toBe('FORBIDDEN');
  });
});
