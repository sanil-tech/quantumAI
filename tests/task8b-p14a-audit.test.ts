import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';
import { learningService } from '../src/server/services/learningService';
import { execSync } from 'child_process';
import { Pool } from 'pg';

process.on('uncaughtException', (err) => {
    if (err.message && (err.message.includes('terminating connection') || err.message.includes('Connection terminated unexpectedly'))) {
        return; // swallow PostgreSQL outage simulation errors
    }
    console.error('UNCAUGHT:', err);
});

describe('P14B Audit & Certification Test Suite', () => {
    let repo: TradingRepository;
    let pool: Pool;
    const testPosId = 'P14B-TEST-' + Date.now();
    const fallbackPosId = 'P14B-FALLBACK-' + Date.now();

    beforeAll(async () => {
        process.env.DATABASE_URL = 'postgresql://quantumai:quantumai_test_password@localhost:54329/quantumai_test';
        repo = new TradingRepository();
        pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.on('error', () => {}); // swallow pool connection errors during outage
        
        // Clean out P14B test records
        await pool.query("DELETE FROM post_mortem_reviews WHERE trade_id LIKE 'P14B-%'");
        await pool.query("DELETE FROM trade_events WHERE trade_id LIKE 'P14B-%'");
        await pool.query("DELETE FROM positions WHERE position_id LIKE 'P14B-%'");
    });

    afterAll(async () => {
        await pool.end();
    });

    it('1. AI paper trade is successfully persisted to PostgreSQL', async () => {
        const pos = {
            positionId: testPosId,
            accountId: 'DEFAULT',
            symbol: 'EURUSD',
            direction: 'BUY',
            quantity: 1.5, // verified naming
            entryPrice: 1.1000,
            currentPrice: 1.1000,
            status: 'OPEN',
            environment: 'PAPER',
            strategyId: 'SMC_QUANT_V1',
            strategyVersion: '1.0',
            learningVersion: '1.0',
            proposalId: 'PROP-1',
            approvalId: 'APP-1',
            openedAt: new Date()
        };
        await repo.savePosition(pos as any);
        
        // Query DB directly
        const res = await pool.query('SELECT * FROM positions WHERE position_id = $1', [testPosId]);
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].status).toBe('OPEN');
        expect(parseFloat(res.rows[0].quantity)).toBe(1.5);
    });

    it('2. Position exists after repository restart', async () => {
        const repoB = new TradingRepository();
        const pos = await repoB.getPositionById(testPosId);
        expect(pos).toBeDefined();
        expect(pos!.positionId).toBe(testPosId);
    });

    it('3. Node/Application restart recovery of OPEN position', async () => {
        const repoC = new TradingRepository();
        const state = await repoC.rehydrateTradingState('DEFAULT');
        const match = state.openPositions.find(p => p.positionId === testPosId);
        expect(match).toBeDefined();
        expect(match!.status).toBe('OPEN');
    });

    it('4. Outcome persistence (closed trade)', async () => {
        const pos = await repo.getPositionById(testPosId);
        pos!.status = 'CLOSED';
        pos!.closePrice = 1.1050;
        pos!.realizedProfit = 75; // Win
        pos!.closedAt = new Date();
        await repo.savePosition(pos!);
        
        // Query DB directly
        const res = await pool.query('SELECT * FROM positions WHERE position_id = $1', [testPosId]);
        expect(res.rows[0].status).toBe('CLOSED');
        expect(parseFloat(res.rows[0].close_price)).toBe(1.1050);
        expect(parseFloat(res.rows[0].realized_profit)).toBe(75);
    });

    it('5. AI learning and PostMortem persistence', async () => {
        const pm = await learningService.processClosedTrade({
            tradeId: testPosId,
            learningVersion: '1.0',
            isOfflineMock: false
        });
        
        expect(pm).toBeDefined();
        expect(pm.tradeId).toBe(testPosId);
        
        // Query DB directly
        const res = await pool.query('SELECT * FROM post_mortem_reviews WHERE trade_id = $1', [testPosId]);
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].learning_version).toBe('1.0');
    });

    it('6. PostgreSQL outage fails closed', async () => {
        // Stop PostgreSQL
        execSync('docker stop quantumai-postgres', { stdio: 'inherit' });
        
        try {
            const pos = {
                positionId: fallbackPosId,
                accountId: 'DEFAULT',
                symbol: 'GBPUSD',
                direction: 'SELL',
                quantity: 1.0,
                entryPrice: 1.2000,
                currentPrice: 1.2000,
                status: 'OPEN',
                environment: 'PAPER',
                openedAt: new Date()
            };
            
            // This MUST throw an error
            await expect(repo.savePosition(pos as any)).rejects.toThrow();
        } finally {
            // Restart DB
            execSync('docker start quantumai-postgres', { stdio: 'inherit' });
            // Wait for pg to warm up
            await new Promise(r => setTimeout(r, 4000));
        }

        // Connect a fresh client and check DB
        const freshPool = new Pool({ connectionString: process.env.DATABASE_URL });
        freshPool.on('error', () => {});
        try {
            const check = await freshPool.query('SELECT * FROM positions WHERE position_id = $1', [fallbackPosId]);
            expect(check.rows.length).toBe(0);
        } finally {
            await freshPool.end();
        }
    }, 20000);

    it('7. AI learning persistence outage fails closed', async () => {
        // Setup another test position that is closed
        const outagePosId = 'P14B-OUTAGE-' + Date.now();
        const pos = {
            positionId: outagePosId,
            accountId: 'DEFAULT',
            symbol: 'USDJPY',
            direction: 'BUY',
            quantity: 2.0,
            entryPrice: 150.00,
            currentPrice: 151.00,
            closePrice: 151.00,
            realizedProfit: 200,
            status: 'CLOSED',
            environment: 'PAPER',
            openedAt: new Date(),
            closedAt: new Date()
        };
        await repo.savePosition(pos as any);

        // Stop DB
        execSync('docker stop quantumai-postgres', { stdio: 'inherit' });

        try {
            // Learning service should throw instead of returning fallback review
            await expect(learningService.processClosedTrade({
                tradeId: outagePosId,
                learningVersion: '1.0',
                isOfflineMock: false
            })).rejects.toThrow();
        } finally {
            // Restart DB
            execSync('docker start quantumai-postgres', { stdio: 'inherit' });
            // Wait for pg to warm up
            await new Promise(r => setTimeout(r, 4000));
        }

        // Verify no review exists in DB
        const freshPool = new Pool({ connectionString: process.env.DATABASE_URL });
        freshPool.on('error', () => {});
        try {
            const check = await freshPool.query('SELECT * FROM post_mortem_reviews WHERE trade_id = $1', [outagePosId]);
            expect(check.rows.length).toBe(0);
        } finally {
            await freshPool.end();
        }
    }, 20000);

    it('10. Duplicate close event handling', async () => {
        // The event processing should be idempotent
        const pm1 = await learningService.processClosedTrade({
            tradeId: testPosId,
            learningVersion: '1.0',
            isOfflineMock: false
        });
        
        const pm2 = await learningService.processClosedTrade({
            tradeId: testPosId,
            learningVersion: '1.0',
            isOfflineMock: false
        });

        expect(pm1.id).toBe(pm2.id);

        const res = await pool.query('SELECT * FROM post_mortem_reviews WHERE trade_id = $1', [testPosId]);
        expect(res.rows.length).toBe(1);
    });
});
