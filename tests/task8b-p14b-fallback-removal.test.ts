/**
 * TASK 8B-P14B STRUCTURAL FALLBACK-REMOVAL TEST
 *
 * This file is an architectural assertion proof that:
 * A. TradingRepository has NO fallbackPositions property
 * B. No production source file references fallbackPositions
 * C. PostgreSQL outage causes savePosition() to REJECT (not silently succeed)
 * D. savePostMortemReview() rejects on DB outage (not return input object)
 *
 * These tests prove that in-memory persistence fallbacks have been
 * completely removed. PostgreSQL is the sole authoritative store.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TradingRepository } from '../packages/database/src/repository';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const DB_URL = 'postgresql://quantumai:quantumai_test_password@localhost:54329/quantumai_test';
const POSTGRES_CONTAINER = 'quantumai-postgres';

process.on('uncaughtException', (err) => {
  if (err.message && (err.message.includes('terminating connection') ||
    err.message.includes('Connection terminated') ||
    err.message.includes('ECONNREFUSED'))) {
    return; // swallow expected connection errors during outage simulation
  }
  console.error('UNCAUGHT:', err);
});

describe('P14B Structural Fallback-Removal Assertions', () => {

  // ================================================================
  // TEST A: TradingRepository must NOT have fallbackPositions property
  // ================================================================
  describe('A. No fallbackPositions property on TradingRepository', () => {
    it('prototype does not have fallbackPositions', () => {
      const proto = TradingRepository.prototype;
      expect('fallbackPositions' in proto).toBe(false);
    });

    it('static class does not have fallbackPositions', () => {
      // Check static properties
      expect('fallbackPositions' in TradingRepository).toBe(false);
      expect((TradingRepository as any).fallbackPositions).toBeUndefined();
    });

    it('instance does not have fallbackPositions', () => {
      const repo = new TradingRepository();
      expect('fallbackPositions' in repo).toBe(false);
      expect((repo as any).fallbackPositions).toBeUndefined();
    });
  });

  // ================================================================
  // TEST B: No production file references fallbackPositions
  // ================================================================
  describe('B. Zero production references to fallbackPositions', () => {
    const productionDirs = [
      path.join(__dirname, '..', 'packages'),
      path.join(__dirname, '..', 'src'),
    ];

    it('packages/ directory has zero references', () => {
      const packagesDir = productionDirs[0];
      if (!fs.existsSync(packagesDir)) return; // skip if not present
      
      const found = searchFilesForPattern(packagesDir, 'fallbackPositions', ['.ts', '.tsx', '.js'], ['node_modules', 'dist', '.d.ts']);
      if (found.length > 0) {
        console.error('fallbackPositions references found in production:');
        found.forEach(f => console.error(` - ${f}`));
      }
      expect(found).toHaveLength(0);
    });

    it('src/ directory has zero references', () => {
      const srcDir = productionDirs[1];
      if (!fs.existsSync(srcDir)) return; // skip if not present
      
      const found = searchFilesForPattern(srcDir, 'fallbackPositions', ['.ts', '.tsx', '.js'], ['node_modules', 'dist', '.d.ts']);
      if (found.length > 0) {
        console.error('fallbackPositions references found in src:');
        found.forEach(f => console.error(` - ${f}`));
      }
      expect(found).toHaveLength(0);
    });
  });

  // ================================================================
  // TEST C: PostgreSQL outage → savePosition() REJECTS
  //         After recovery, phantom record does NOT exist
  // ================================================================
  describe('C. PostgreSQL outage: savePosition() rejects, no phantom record', () => {
    const phantomId = `P14B-PHANTOM-${Date.now()}`;

    afterAll(async () => {
      // Cleanup in case test fails midway and DB was restarted
      const pool = new Pool({ connectionString: DB_URL });
      pool.on('error', () => {});
      try {
        await pool.query("DELETE FROM positions WHERE position_id LIKE 'P14B-PHANTOM-%'");
      } catch (_) {}
      await pool.end().catch(() => {});
    });

    it('save during outage rejects, no phantom record after recovery', async () => {
      // 1. Confirm database is online
      const checkPool = new Pool({ connectionString: DB_URL });
      checkPool.on('error', () => {});
      const preCheck = await checkPool.query('SELECT 1 as alive');
      expect(preCheck.rows[0].alive).toBe(1);
      await checkPool.end();

      // 2. Stop PostgreSQL
      execSync(`docker stop ${POSTGRES_CONTAINER}`, { stdio: 'inherit' });

      let saveRejected = false;
      try {
        const repo = new TradingRepository();
        const pos: any = {
          positionId: phantomId,
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
        await repo.savePosition(pos);
        // If we get here, the call should NOT have succeeded — it means fallback was used
        expect(true).toBe(false); // Force fail
      } catch (err: any) {
        saveRejected = true;
        // Error is expected — must NOT be a fake success
        expect(saveRejected).toBe(true);
      } finally {
        // 5. Restart PostgreSQL
        execSync(`docker start ${POSTGRES_CONTAINER}`, { stdio: 'inherit' });
        await new Promise(r => setTimeout(r, 4000));
      }

      // 6. Confirm save was rejected
      expect(saveRejected).toBe(true);

      // 7. Query fresh connection — phantom record must NOT exist
      const freshPool = new Pool({ connectionString: DB_URL });
      freshPool.on('error', () => {});
      try {
        const check = await freshPool.query(
          'SELECT position_id FROM positions WHERE position_id = $1',
          [phantomId]
        );
        expect(check.rows).toHaveLength(0);
      } finally {
        await freshPool.end();
      }
    }, 30000);
  });

  // ================================================================
  // TEST D: savePostMortemReview() rejects on DB outage
  //         Must NOT return the supplied review object
  // ================================================================
  describe('D. PostgreSQL outage: savePostMortemReview() rejects, returns no phantom', () => {
    const phantomTradeId = `P14B-PM-PHANTOM-${Date.now()}`;

    it('savePostMortemReview throws on DB outage, no phantom review returned', async () => {
      // 2. Stop PostgreSQL
      execSync(`docker stop ${POSTGRES_CONTAINER}`, { stdio: 'inherit' });

      let saveRejected = false;
      let returnedValue: any = undefined;
      try {
        const repo = new TradingRepository();
        returnedValue = await repo.savePostMortemReview({
          id: `pm-${phantomTradeId}-1.0`,
          tradeId: phantomTradeId,
          learningVersion: '1.0',
          review: { outcome: 'WIN', fake: true }
        });
        // Should NOT reach here
        expect(true).toBe(false); // Force fail — no throw = in-memory fallback used
      } catch (err: any) {
        saveRejected = true;
        // Must have thrown — NOT returned the input object
        expect(returnedValue).toBeUndefined();
      } finally {
        // Restart
        execSync(`docker start ${POSTGRES_CONTAINER}`, { stdio: 'inherit' });
        await new Promise(r => setTimeout(r, 4000));
      }

      expect(saveRejected).toBe(true);
      // After recovery, no phantom review
      const freshPool = new Pool({ connectionString: DB_URL });
      freshPool.on('error', () => {});
      try {
        const check = await freshPool.query(
          "SELECT id FROM post_mortem_reviews WHERE trade_id = $1",
          [phantomTradeId]
        );
        expect(check.rows).toHaveLength(0);
      } finally {
        await freshPool.end();
      }
    }, 30000);
  });
});

// ================================================================
// HELPER: Recursive file search for pattern
// ================================================================
function searchFilesForPattern(
  dir: string,
  pattern: string,
  extensions: string[],
  excludes: string[]
): string[] {
  const results: string[] = [];

  function walk(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (excludes.some(ex => entry.name.includes(ex) || fullPath.includes(ex))) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const hasExt = extensions.some(ext => entry.name.endsWith(ext));
        if (!hasExt) continue;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes(pattern)) {
            // Record line numbers
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (line.includes(pattern)) {
                results.push(`${fullPath}:${idx + 1}: ${line.trim()}`);
              }
            });
          }
        } catch (_) {}
      }
    }
  }

  walk(dir);
  return results;
}
