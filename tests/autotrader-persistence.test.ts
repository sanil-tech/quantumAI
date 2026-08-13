import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingRepository, PositionRecord, TradeEventRecord } from '../packages/database/src/repository';
import { mapPositionToAutoTrade, mapPositionToClosedTrade } from '../src/server/routes/execution';

describe('AutoTrader Persistent Trade Ledger & Source of Truth Tests', () => {
  let mockPool: any;
  let repository: TradingRepository;
  let storedPositions: Map<string, any>;
  let storedEvents: any[];
  let storedAccountState: any;

  beforeEach(() => {
    storedPositions = new Map();
    storedEvents = [];
    storedAccountState = {
      account_id: '5877246',
      is_auto_enabled: true,
      balance: '10000.00',
      initial_capital: '10000.00',
      risk_percent: '1.00',
      latest_ai_rule: 'Adaptive Rule #1'
    };

    const handleQuery = async (text: string, params?: any[]) => {
      if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) {
        return { rows: [] };
      }
      if (text.includes('SELECT * FROM positions WHERE position_id = $1 FOR UPDATE')) {
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
      if (text.includes('UPDATE account_state')) {
        const added = parseFloat(params![0]);
        const current = parseFloat(storedAccountState.balance);
        storedAccountState.balance = (current + added).toFixed(2);
        return { rows: [{ balance: storedAccountState.balance }] };
      }
      if (text.includes('SELECT balance FROM account_state')) {
        return { rows: [{ balance: storedAccountState.balance }] };
      }
      if (text.includes('COUNT(*)') || text.includes('total_trades')) {
        const closed = Array.from(storedPositions.values()).filter(p => p.status === 'CLOSED');
        const winCount = closed.filter(p => parseFloat(p.realized_profit) >= 0).length;
        const lossCount = closed.filter(p => parseFloat(p.realized_profit) < 0).length;
        const totalPnlDollars = closed.reduce((acc, p) => acc + parseFloat(p.realized_profit), 0);
        const totalPnlPips = closed.reduce((acc, p) => acc + parseFloat(p.pnl_pips || 0), 0);
        return {
          rows: [{
            total_trades: closed.length,
            win_count: winCount,
            loss_count: lossCount,
            total_pnl_dollars: totalPnlDollars,
            total_pnl_pips: totalPnlPips
          }]
        };
      }
      if (text.includes("status = 'OPEN'")) {
        const accId = params![0] || '5877246';
        const rows = Array.from(storedPositions.values()).filter(p => p.account_id === accId && p.status === 'OPEN');
        return { rows };
      }
      if (text.includes("status = 'CLOSED'")) {
        const accId = params![0] || '5877246';
        const rows = Array.from(storedPositions.values()).filter(p => p.account_id === accId && p.status === 'CLOSED');
        return { rows };
      }
      if (text.includes('WHERE position_id = $1')) {
        const pos = storedPositions.get(params![0]);
        return { rows: pos ? [pos] : [] };
      }
      if (text.includes('WHERE idempotency_key = $1')) {
        const pos = Array.from(storedPositions.values()).find(p => p.idempotency_key === params![0]);
        return { rows: pos ? [pos] : [] };
      }
      if (text.includes('WHERE setup_id = $1')) {
        const pos = Array.from(storedPositions.values()).find(p => p.setup_id === params![0]);
        return { rows: pos ? [pos] : [] };
      }
      if (text.includes('INSERT INTO positions')) {
        const id = params![0];
        const existing = storedPositions.get(id) || {};
        const row = {
          position_id: id,
          ticket_id: params![1] ?? existing.ticket_id,
          setup_id: params![2] ?? existing.setup_id,
          account_id: params![3] ?? existing.account_id ?? '5877246',
          symbol: params![4] ?? existing.symbol,
          direction: params![5] ?? existing.direction,
          quantity: String(params![6] ?? existing.quantity ?? '0.10'),
          entry_price: String(params![7] ?? existing.entry_price ?? '1.0'),
          current_price: String(params![8] ?? existing.current_price ?? '1.0'),
          close_price: params![9] != null ? String(params![9]) : existing.close_price || null,
          stop_loss: params![10] != null ? String(params![10]) : existing.stop_loss || null,
          take_profit: params![11] != null ? String(params![11]) : existing.take_profit || null,
          take_profit_2: params![12] != null ? String(params![12]) : existing.take_profit_2 || null,
          unrealized_profit: String(params![13] ?? existing.unrealized_profit ?? '0'),
          realized_profit: String(params![14] ?? existing.realized_profit ?? '0'),
          pnl_pips: String(params![15] ?? existing.pnl_pips ?? '0'),
          status: params![16] ?? existing.status ?? 'OPEN',
          close_reason: params![17] ?? (existing.close_reason || null),
          broker: params![18] ?? (existing.broker || 'CTRADER'),
          environment: params![19] ?? (existing.environment || 'DEMO'),
          proposal_id: params![20] ?? (existing.proposal_id || null),
          approval_id: params![21] ?? (existing.approval_id || null),
          strategy_id: params![22] ?? (existing.strategy_id || null),
          strategy_version: params![23] ?? (existing.strategy_version || null),
          idempotency_key: params![24] ?? (existing.idempotency_key || null),
          opened_at: params![25] ?? (existing.opened_at || new Date()),
          closed_at: params![26] ?? (existing.closed_at || null)
        };
        storedPositions.set(id, row);
        return { rows: [row] };
      }
      if (text.includes('INSERT INTO trade_events')) {
        const row = {
          id: params![0],
          trade_id: params![1],
          order_id: params![2],
          setup_id: params![3],
          event_type: params![4],
          actor: params![5],
          details: params![6],
          timestamp: new Date()
        };
        storedEvents.push(row);
        return { rows: [row] };
      }
      if (text.includes('FROM trade_events')) {
        const tradeId = params![0];
        const rows = storedEvents.filter(e => e.trade_id === tradeId || e.setup_id === tradeId);
        return { rows };
      }
      if (text.includes('FROM account_state')) {
        return { rows: [storedAccountState] };
      }
      return { rows: [] };
    };

    mockPool = {
      connect: vi.fn().mockImplementation(async () => {
        return {
          query: vi.fn().mockImplementation(handleQuery),
          release: vi.fn()
        };
      }),
      query: vi.fn().mockImplementation(handleQuery)
    };

    repository = new TradingRepository(mockPool as any);
  });

  it('1. Trade survives server restart (database is authoritative)', async () => {
    const posRecord: PositionRecord = {
      positionId: 'trade_99901',
      ticketId: '99901',
      setupId: 'setup_eurusd_buy_01',
      accountId: '5877246',
      symbol: 'EUR/USD',
      direction: 'BUY',
      quantity: 0.1,
      entryPrice: 1.0850,
      currentPrice: 1.0850,
      stopLoss: 1.0820,
      takeProfit: 1.0900,
      status: 'OPEN',
      broker: 'CTRADER',
      environment: 'DEMO'
    };
    await repository.savePosition(posRecord);

    const newRepo = new TradingRepository(mockPool as any);
    const openTrades = await newRepo.getOpenPositions('5877246');

    expect(openTrades.length).toBe(1);
    expect(openTrades[0].positionId).toBe('trade_99901');
    expect(openTrades[0].symbol).toBe('EUR/USD');
  });

  it('2. Closed trade remains closed after server/instance restart', async () => {
    await repository.savePosition({
      positionId: 'trade_99902',
      ticketId: '99902',
      setupId: 'setup_gbpusd_sell_01',
      accountId: '5877246',
      symbol: 'GBP/USD',
      direction: 'SELL',
      quantity: 0.2,
      entryPrice: 1.2700,
      currentPrice: 1.2700,
      status: 'OPEN'
    });

    const closeRes = await repository.closePositionTransaction({
      positionId: 'trade_99902',
      closePrice: 1.2650,
      realizedProfit: 100,
      pnlPips: 50,
      closeReason: 'TP1_HIT',
      accountId: '5877246'
    });

    expect(closeRes.position.status).toBe('CLOSED');
    expect(closeRes.position.realizedProfit).toBe(100);

    const newRepo = new TradingRepository(mockPool as any);
    const closedPositions = await newRepo.getClosedPositions('5877246');

    expect(closedPositions.length).toBe(1);
    expect(closedPositions[0].positionId).toBe('trade_99902');
    expect(closedPositions[0].status).toBe('CLOSED');
  });

  it('3. Duplicate close does not duplicate closure or double-count PnL', async () => {
    await repository.savePosition({
      positionId: 'trade_99903',
      ticketId: '99903',
      accountId: '5877246',
      symbol: 'EUR/USD',
      direction: 'BUY',
      quantity: 0.1,
      entryPrice: 1.0800,
      currentPrice: 1.0800,
      status: 'OPEN'
    });

    const res1 = await repository.closePositionTransaction({
      positionId: 'trade_99903',
      closePrice: 1.0850,
      realizedProfit: 50,
      pnlPips: 50,
      closeReason: 'MANUAL_CLOSE',
      accountId: '5877246'
    });
    expect(res1.newBalance).toBe(10050);

    const res2 = await repository.closePositionTransaction({
      positionId: 'trade_99903',
      closePrice: 1.0850,
      realizedProfit: 50,
      pnlPips: 50,
      closeReason: 'MANUAL_CLOSE',
      accountId: '5877246'
    });

    expect(res2.newBalance).toBe(10050);
    expect(res2.position.status).toBe('CLOSED');
  });

  it('4. Duplicate execution lookup returns existing trade idempotently', async () => {
    await repository.savePosition({
      positionId: 'trade_99904',
      ticketId: '99904',
      setupId: 'setup_xauusd_buy_123',
      accountId: '5877246',
      symbol: 'XAU/USD',
      direction: 'BUY',
      quantity: 0.1,
      entryPrice: 2350.00,
      currentPrice: 2350.00,
      status: 'OPEN',
      idempotencyKey: 'idem_key_99904'
    });

    const found = await repository.getPositionByIdempotencyKeyOrSetupId('idem_key_99904', 'setup_xauusd_buy_123');
    expect(found).not.toBeNull();
    expect(found!.positionId).toBe('trade_99904');
  });

  it('5. Performance metrics are calculated dynamically from persistent records (no fake hardcoded stats)', async () => {
    await repository.savePosition({
      positionId: 't1', accountId: '5877246', symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1,
      entryPrice: 1.0800, currentPrice: 1.0850, closePrice: 1.0850, status: 'CLOSED', realizedProfit: 50, pnlPips: 50
    });
    await repository.savePosition({
      positionId: 't2', accountId: '5877246', symbol: 'GBP/USD', direction: 'SELL', quantity: 0.1,
      entryPrice: 1.2700, currentPrice: 1.2650, closePrice: 1.2650, status: 'CLOSED', realizedProfit: 50, pnlPips: 50
    });
    await repository.savePosition({
      positionId: 't3', accountId: '5877246', symbol: 'USD/JPY', direction: 'BUY', quantity: 0.1,
      entryPrice: 155.00, currentPrice: 154.50, closePrice: 154.50, status: 'CLOSED', realizedProfit: -50, pnlPips: -50
    });

    const perf = await repository.calculatePerformanceMetrics('5877246');
    expect(perf.totalTrades).toBe(3);
    expect(perf.winCount).toBe(2);
    expect(perf.lossCount).toBe(1);
    expect(perf.winRatePercent).toBe(66.67);
    expect(perf.totalPnlDollars).toBe(50);
    expect(perf.totalPnlPips).toBe(50);
  });

  it('6. Trade Audit Events are logged and retrieved correctly', async () => {
    await repository.saveTradeEvent({
      id: 'e1',
      tradeId: 'trade_99905',
      setupId: 'setup_99905',
      eventType: 'AI_SIGNAL',
      details: { pair: 'EUR/USD' }
    });
    await repository.saveTradeEvent({
      id: 'e2',
      tradeId: 'trade_99905',
      setupId: 'setup_99905',
      eventType: 'POSITION_OPENED',
      details: { broker: 'CTRADER' }
    });

    const events = await repository.getTradeEvents('trade_99905');
    expect(events.length).toBe(2);
    expect(events[0].eventType).toBe('AI_SIGNAL');
    expect(events[1].eventType).toBe('POSITION_OPENED');
  });
});
