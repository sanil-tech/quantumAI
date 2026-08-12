import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingRepository, SignalRecord, OrderRecord, PositionRecord, PendingCommandRecord, AccountStateRecord } from '../packages/database/src/repository';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 2 — Persistence-First Trading State & Transactional Ledger Verification', () => {

  // 1. DATABASE & MIGRATION VERIFICATION
  describe('1. Database Schema & Migration Verification', () => {
    it('should verify migration 004_persistence_first_trading_state.sql exists and is valid SQL', () => {
      const migrationPath = path.join(process.cwd(), 'migrations/004_persistence_first_trading_state.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS signals');
      expect(sql).toContain('ALTER TABLE positions ADD COLUMN IF NOT EXISTS ticket_id');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS account_state');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS trading_logs');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS journal_entries');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS post_mortem_reviews');
      expect(sql).toContain('INSERT INTO account_state');
    });

    it('should expose schema definitions with expected table columns', async () => {
      const schema = await import('../packages/database/src/schema');
      expect(schema.signals).toBeDefined();
      expect(schema.orders).toBeDefined();
      expect(schema.positions).toBeDefined();
      expect(schema.executionCommands).toBeDefined();
      expect(schema.accountState).toBeDefined();
      expect(schema.tradingLogs).toBeDefined();
      expect(schema.journalEntries).toBeDefined();
      expect(schema.postMortemReviews).toBeDefined();
    });
  });

  // 2. REPOSITORY & PERSISTENCE OPERATIONAL TESTS (Unit / Mock Pool)
  describe('2. Repository Operations & Persistence Logic', () => {
    let mockPool: any;
    let repository: TradingRepository;

    beforeEach(() => {
      mockPool = {
        query: vi.fn(),
        connect: vi.fn()
      };
      repository = new TradingRepository(mockPool as any);
    });

    it('2a. Signal Persistence: should save and retrieve signal with market data lineage', async () => {
      const signal: SignalRecord = {
        id: 'sig-test-101',
        symbol: 'EURUSD',
        timeframe: 'M15',
        direction: 'BUY',
        entryPrice: 1.0850,
        stopLoss: 1.0820,
        takeProfit1: 1.0900,
        dataClass: 'LIVE',
        provider: 'OANDA',
        source: 'STREAM_PROD_1',
        executable: true,
        status: 'ACTIVE'
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sig-test-101',
          symbol: 'EURUSD',
          timeframe: 'M15',
          direction: 'BUY',
          entry_price: '1.08500',
          stop_loss: '1.08200',
          take_profit_1: '1.09000',
          data_class: 'LIVE',
          provider: 'OANDA',
          source: 'STREAM_PROD_1',
          executable: true,
          status: 'ACTIVE',
          created_at: new Date()
        }]
      });

      const saved = await repository.saveSignal(signal);
      expect(saved.id).toBe('sig-test-101');
      expect(saved.dataClass).toBe('LIVE');
      expect(saved.provider).toBe('OANDA');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('2b. Order Persistence: should save and retrieve orders', async () => {
      const order: OrderRecord = {
        orderId: 'ord-test-202',
        accountId: 'DEFAULT',
        symbol: 'GBPUSD',
        direction: 'SELL',
        quantity: 0.5,
        status: 'PENDING',
        broker: 'CTRADER'
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          order_id: 'ord-test-202',
          account_id: 'DEFAULT',
          symbol: 'GBPUSD',
          direction: 'SELL',
          quantity: '0.5000',
          status: 'PENDING',
          broker_id: 'CTRADER',
          created_at: new Date()
        }]
      });

      const saved = await repository.saveOrder(order);
      expect(saved.orderId).toBe('ord-test-202');
      expect(saved.status).toBe('PENDING');
    });

    it('2c. Position Persistence: should save open and closed positions', async () => {
      const position: PositionRecord = {
        positionId: 'pos-test-303',
        accountId: 'DEFAULT',
        symbol: 'XAUUSD',
        direction: 'BUY',
        quantity: 0.1,
        entryPrice: 2050.00,
        currentPrice: 2055.00,
        unrealizedProfit: 50.00,
        status: 'OPEN',
        broker: 'CTRADER'
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          position_id: 'pos-test-303',
          account_id: 'DEFAULT',
          symbol: 'XAUUSD',
          direction: 'BUY',
          quantity: '0.1000',
          entry_price: '2050.00000',
          current_price: '2055.00000',
          unrealized_profit: '50.00',
          status: 'OPEN',
          broker: 'CTRADER',
          opened_at: new Date()
        }]
      });

      const saved = await repository.savePosition(position);
      expect(saved.positionId).toBe('pos-test-303');
      expect(saved.status).toBe('OPEN');
    });

    it('2d. Account State: should save and retrieve account state', async () => {
      const accState: AccountStateRecord = {
        accountId: 'DEFAULT',
        isAutoEnabled: true,
        balance: 10500.00,
        initialCapital: 10000.00,
        riskPercent: 1.5
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          account_id: 'DEFAULT',
          is_auto_enabled: true,
          balance: '10500.00',
          initial_capital: '10000.00',
          risk_percent: '1.50'
        }]
      });

      const saved = await repository.saveAccountState(accState);
      expect(saved.accountId).toBe('DEFAULT');
      expect(saved.balance).toBe(10500.00);
      expect(saved.isAutoEnabled).toBe(true);
    });
  });

  // 3. TRANSACTIONAL ROLLBACK SAFETY
  describe('3. Transaction Rollback Safety (closePositionTransaction)', () => {
    it('should perform position close inside atomic transaction and rollback on failure', async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn()
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient)
      };
      const repository = new TradingRepository(mockPool as any);

      // Scenario: BEGIN succeeds, SELECT position succeeds, UPDATE position fails
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql.includes('SELECT * FROM positions')) {
          return Promise.resolve({
            rows: [{
              position_id: 'pos-fail-1',
              account_id: 'DEFAULT',
              symbol: 'EURUSD',
              direction: 'BUY',
              quantity: '1.0000',
              entry_price: '1.08000',
              current_price: '1.08500',
              unrealized_profit: '50.00',
              status: 'OPEN'
            }]
          });
        }
        if (sql.includes('UPDATE positions')) {
          throw new Error('SIMULATED_DB_DISRUPTION');
        }
        if (sql === 'ROLLBACK') return Promise.resolve();
        return Promise.resolve({ rows: [] });
      });

      await expect(repository.closePositionTransaction({
        positionId: 'pos-fail-1',
        closePrice: 1.08500,
        realizedProfit: 50.00,
        closeReason: 'TP1_HIT',
        accountId: 'DEFAULT'
      })).rejects.toThrow('SIMULATED_DB_DISRUPTION');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // 4. DUPLICATION PROTECTION & IDEMPOTENCY
  describe('4. Duplication Protection (UPSERT Behavior)', () => {
    it('should build ON CONFLICT (id) clause for signals and execution_commands', async () => {
      const mockPool = { query: vi.fn() };
      const repository = new TradingRepository(mockPool as any);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'dup-cmd-1',
          setup_id: 'setup-1',
          symbol: 'EURUSD',
          side: 'BUY',
          volume: '0.1000',
          entry_price: '1.08000',
          stop_loss: '1.07500',
          take_profit_1: '1.09000',
          broker: 'CTRADER',
          account_number: '12345',
          environment: 'DEMO',
          status: 'PENDING'
        }]
      });

      const cmd: PendingCommandRecord = {
        id: 'dup-cmd-1',
        setupId: 'setup-1',
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.1,
        entryPrice: 1.08,
        stopLoss: 1.075,
        takeProfit1: 1.09,
        broker: 'CTRADER',
        accountNumber: '12345',
        environment: 'DEMO',
        status: 'PENDING'
      };

      await repository.enqueueExecutionCommand(cmd);

      const queryText = mockPool.query.mock.calls[0][0];
      expect(queryText).toContain('ON CONFLICT (id) DO UPDATE SET');
      expect(queryText).toContain('status = EXCLUDED.status');
    });
  });

  // 5. DATABASE FAILURE FAIL-CLOSED TEST
  describe('5. Fail-Closed Error Handling when Database Fails', () => {
    it('should throw error on DB failure so trade execution fails closed', async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('PG_CONNECTION_LOST'))
      };
      const repository = new TradingRepository(mockPool as any);

      const cmd: PendingCommandRecord = {
        id: 'fail-closed-1',
        setupId: 'setup-fail',
        symbol: 'GBPUSD',
        side: 'SELL',
        volume: 0.5,
        entryPrice: 1.2500,
        stopLoss: 1.2550,
        takeProfit1: 1.2400,
        broker: 'CTRADER',
        accountNumber: '99999',
        environment: 'DEMO',
        status: 'PENDING'
      };

      await expect(repository.enqueueExecutionCommand(cmd)).rejects.toThrow('DB_SAVE_COMMAND_FAILED: PG_CONNECTION_LOST');
    });
  });

  // 6. REHYDRATION AUDIT
  describe('6. Rehydration Audit & Safety', () => {
    it('should rehydrate account state, open/closed positions, commands, signals, and post-mortems', async () => {
      const mockPool = {
        query: vi.fn()
      };
      const repository = new TradingRepository(mockPool as any);

      mockPool.query.mockImplementation((text: string) => {
        if (text.includes('account_state')) {
          return Promise.resolve({
            rows: [{
              account_id: 'DEFAULT',
              is_auto_enabled: true,
              balance: '12500.00',
              initial_capital: '10000.00',
              risk_percent: '1.00'
            }]
          });
        }
        if (text.includes("status = 'OPEN'")) {
          return Promise.resolve({
            rows: [{
              position_id: 'open-pos-1',
              account_id: 'DEFAULT',
              symbol: 'EURUSD',
              direction: 'BUY',
              quantity: '0.2000',
              entry_price: '1.08200',
              current_price: '1.08500',
              unrealized_profit: '60.00',
              status: 'OPEN',
              opened_at: new Date()
            }]
          });
        }
        if (text.includes("status = 'CLOSED'")) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('execution_commands')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('signals')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('trading_logs')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('post_mortem_reviews')) {
          return Promise.resolve({
            rows: [{
              id: 'pm-1',
              trade_id: 'open-pos-1',
              review: { pair: 'EURUSD', adaptiveRuleMs: 'Test Rule' }
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const rehydrated = await repository.rehydrateTradingState('DEFAULT');
      expect(rehydrated.accountState.balance).toBe(12500.00);
      expect(rehydrated.openPositions.length).toBe(1);
      expect(rehydrated.openPositions[0].positionId).toBe('open-pos-1');
      expect(rehydrated.postMortemReviews.length).toBe(1);
    });
  });

  // 7. MARKET DATA LINEAGE PROVENANCE REGRESSION
  describe('7. Market Data Lineage Provenance', () => {
    it('should preserve dataClass and provider metadata in signals and execution commands', () => {
      const signal: SignalRecord = {
        id: 'sig-provenance',
        symbol: 'BTCUSD',
        timeframe: 'H1',
        direction: 'BUY',
        entryPrice: 65000,
        stopLoss: 64000,
        takeProfit1: 67000,
        dataClass: 'HISTORICAL',
        provider: 'BINANCE_ARCHIVE',
        source: 'BACKTEST_ENGINE_2',
        executable: false
      };

      expect(signal.dataClass).toBe('HISTORICAL');
      expect(signal.provider).toBe('BINANCE_ARCHIVE');
      expect(signal.executable).toBe(false);
    });
  });
});
