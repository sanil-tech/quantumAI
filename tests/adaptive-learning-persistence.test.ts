import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';
import { LearningService } from '../src/server/services/learningService';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';

describe('QuantumAI Adaptive Learning Persistence & Server Authority Tests', () => {
  let mockPool: any;
  let repository: TradingRepository;
  let learningService: LearningService;
  let storedPositions: Map<string, any>;
  let storedPostMortems: Map<string, any>; // key: `${tradeId}:${learningVersion}`
  let storedEvents: any[];

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
      if (text.includes('SELECT * FROM positions WHERE position_id = $1 FOR UPDATE') ||
          text.includes('SELECT * FROM positions WHERE position_id = $1')) {
        const pos = storedPositions.get(params![0]);
        return { rows: pos ? [pos] : [] };
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

      if (text.includes('UPDATE account_state') || text.includes('SELECT balance FROM account_state')) {
        return { rows: [{ balance: '10000.00' }] };
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
        return { rows };
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

  it('1. closing a trade automatically triggers learning and creates a persistent PostMortemReview', async () => {
    // Seed an open trade in PostgreSQL DB
    const openPos = {
      position_id: 'pos_100',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      quantity: 0.1,
      entry_price: '1.08500',
      current_price: '1.08500',
      stop_loss: '1.08200',
      take_profit: '1.09000',
      status: 'OPEN',
      opened_at: new Date()
    };
    storedPositions.set('pos_100', openPos);

    // Atomically close trade via repository transaction
    const closeResult = await repository.closePositionTransaction({
      positionId: 'pos_100',
      closePrice: 1.08200,
      realizedProfit: -30.00,
      pnlPips: -30,
      closeReason: 'SL_HIT'
    });

    expect(closeResult.position.status).toBe('CLOSED');

    // Trigger learning
    const payload: TradeClosedPayload = {
      tradeId: 'pos_100',
      positionId: 'pos_100',
      accountId: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      entryPrice: 1.08500,
      exitPrice: 1.08200,
      stopLoss: 1.08200,
      takeProfit: 1.09000,
      pnlDollars: -30.00,
      pnlPips: -30,
      closedAt: new Date()
    };

    const review = await learningService.processClosedTrade(payload);

    expect(review).toBeDefined();
    expect(review.tradeId).toBe('pos_100');
    expect(review.outcome).toBe('LOSS');
    expect(review.learningVersion).toBe('1.0');
    expect(storedPostMortems.size).toBe(1);
  });

  it('2. learning record is persisted in PostgreSQL database and auditable via trade_events', async () => {
    storedPositions.set('pos_101', {
      position_id: 'pos_101',
      account_id: 'DEFAULT',
      symbol: 'GBP/USD',
      direction: 'SELL',
      quantity: 0.2,
      entry_price: '1.34500',
      close_price: '1.34100',
      stop_loss: '1.34800',
      take_profit: '1.34000',
      realized_profit: '80.00',
      pnl_pips: 40,
      status: 'CLOSED',
      closed_at: new Date()
    });

    const review = await learningService.processClosedTrade({ tradeId: 'pos_101' });

    expect(storedPostMortems.has('pos_101:1.0')).toBe(true);

    const auditEvent = storedEvents.find(e => e.event_type === 'TRADE_LEARNING_CREATED');
    expect(auditEvent).toBeDefined();
    expect(auditEvent.trade_id).toBe('pos_101');
  });

  it('3. browser refresh does not lose learning state', async () => {
    storedPositions.set('pos_102', {
      position_id: 'pos_102',
      account_id: 'DEFAULT',
      symbol: 'XAU/USD',
      direction: 'BUY',
      quantity: 0.1,
      entry_price: '2380.00',
      close_price: '2400.00',
      realized_profit: '200.00',
      pnl_pips: 200,
      status: 'CLOSED',
      closed_at: new Date()
    });

    await learningService.processClosedTrade({ tradeId: 'pos_102' });

    // Simulate browser refresh by fetching post-mortem reviews from engine cache/DB
    const reviews = aiDecisionEngine.getPostMortemReviews();
    expect(reviews.some(r => r.tradeId === 'pos_102')).toBe(true);
  });

  it('4. server restart does not lose learning state (recovery from PostgreSQL)', async () => {
    storedPositions.set('pos_103', {
      position_id: 'pos_103',
      account_id: 'DEFAULT',
      symbol: 'USD/JPY',
      direction: 'SELL',
      quantity: 0.5,
      entry_price: '157.000',
      close_price: '156.500',
      realized_profit: '160.00',
      pnl_pips: 50,
      status: 'CLOSED',
      closed_at: new Date()
    });

    await learningService.processClosedTrade({ tradeId: 'pos_103' });

    // SIMULATE SERVER RESTART:
    // 1. Wipe in-memory AI Decision Engine state
    aiDecisionEngine.setPostMortemReviews([]);
    expect(aiDecisionEngine.getPostMortemReviews()).toHaveLength(0);

    // 2. Re-create LearningService on new server boot and reload from PostgreSQL DB
    const newServerLearningService = new LearningService(repository);
    await newServerLearningService.loadPersistedLearning();

    // 3. Verify learning state was fully restored from PostgreSQL database
    const restored = aiDecisionEngine.getPostMortemReviews();
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.some(r => r.tradeId === 'pos_103')).toBe(true);
  });

  it('5. database remains source of truth over memory', async () => {
    storedPositions.set('pos_104', {
      position_id: 'pos_104',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      quantity: 0.1,
      entry_price: '1.08000',
      close_price: '1.08500',
      realized_profit: '50.00',
      pnl_pips: 50,
      status: 'CLOSED',
      closed_at: new Date()
    });

    await learningService.processClosedTrade({ tradeId: 'pos_104' });

    // Destroy in-memory state completely
    aiDecisionEngine.setPostMortemReviews([]);

    // Query directly from PostgreSQL database
    const dbReviews = await repository.getPostMortemReviews();
    expect(dbReviews.some((r: any) => r.tradeId === 'pos_104')).toBe(true);
  });

  it('6. duplicate learning is prevented idempotently', async () => {
    storedPositions.set('pos_105', {
      position_id: 'pos_105',
      account_id: 'DEFAULT',
      symbol: 'GBP/USD',
      direction: 'BUY',
      quantity: 0.2,
      entry_price: '1.34000',
      close_price: '1.33500',
      realized_profit: '-100.00',
      pnl_pips: -50,
      status: 'CLOSED',
      closed_at: new Date()
    });

    // First call
    const firstReview = await learningService.processClosedTrade({ tradeId: 'pos_105' });

    // Second call for the same trade and learning version
    const secondReview = await learningService.processClosedTrade({ tradeId: 'pos_105' });

    expect(secondReview.id).toBe(firstReview.id);
    expect(storedPostMortems.size).toBe(1);
  });

  it('7. nonexistent trade cannot create learning', async () => {
    await expect(
      learningService.processClosedTrade({ tradeId: 'pos_nonexistent_999' })
    ).rejects.toThrow('NONEXISTENT_TRADE');
  });

  it('8. open trade cannot create learning', async () => {
    storedPositions.set('pos_open_200', {
      position_id: 'pos_open_200',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      quantity: 0.1,
      entry_price: '1.08000',
      status: 'OPEN',
      opened_at: new Date()
    });

    await expect(
      learningService.processClosedTrade({ tradeId: 'pos_open_200' })
    ).rejects.toThrow('OPEN_TRADE_LEARNING_REJECTED');
  });

  it('9. fabricated PnL/prices from client cannot enter learning (canonical DB values are enforced)', async () => {
    // Canonical DB position has a LOSS of -$150.00
    storedPositions.set('pos_106', {
      position_id: 'pos_106',
      account_id: 'DEFAULT',
      symbol: 'EUR/USD',
      direction: 'BUY',
      quantity: 0.5,
      entry_price: '1.08500',
      close_price: '1.08200',
      realized_profit: '-150.00',
      pnl_pips: -30,
      status: 'CLOSED',
      closed_at: new Date()
    });

    // Client attempts to send fabricated PnL of +$50000 WIN
    const review = await learningService.processClosedTrade({
      tradeId: 'pos_106',
      pnlDollars: 50000,
      exitPrice: 1.20000
    } as any);

    // Canonical DB values must override client payload!
    expect(review.pnlDollars).toBe(-150);
    expect(review.outcome).toBe('LOSS');
    expect(review.entryPrice).toBe(1.08500);
    expect(review.exitPrice).toBe(1.08200);
  });

  it('10. client cannot fabricate a successful trade via API request payload', async () => {
    // Attempting to process learning for an unrecorded trade ID
    const fakeTradeId = 'fake_trade_999';
    await expect(
      learningService.processClosedTrade({ tradeId: fakeTradeId }, "Fake win notes")
    ).rejects.toThrow('NONEXISTENT_TRADE');
  });

  it('11. persisted lessons load on startup into AI Decision Engine', async () => {
    // Seed DB record directly
    storedPostMortems.set('pos_seed:1.0', {
      id: 'pm-seed-1',
      trade_id: 'pos_seed',
      learning_version: '1.0',
      review: {
        id: 'pm-seed-1',
        tradeId: 'pos_seed',
        pair: 'EUR/USD',
        direction: 'SELL',
        pnlDollars: -45,
        outcome: 'LOSS',
        adaptiveRuleEn: 'ADAPTIVE RULE: Wait for H1 CHOCH confirmation.'
      }
    });

    const loaded = await learningService.loadPersistedLearning();
    expect(loaded.some(r => r.tradeId === 'pos_seed')).toBe(true);
    expect(aiDecisionEngine.getPostMortemReviews().some(r => r.tradeId === 'pos_seed')).toBe(true);
  });
});
