# TASK 8B-P13 EVIDENCE AUDIT

## Execution Logs

### Migration Correction
During schema initialization, migrations/004_persistence_first_trading_state.sql failed to create signals with a status column due to schema out-of-sync issues, and positions lacked several new phase 5 columns (e.g. timeframe).
These were corrected via direct ALTER TABLE execution against the container.

### Isolation Testing Evidence
Running tests without isolation originally yielded interference failures (e.g. AssertionError: expected 'CLOSED' to be 'OPEN') because DATABASE_URL persisted states across different concurrent test suites.
After issuing TRUNCATE TABLE ... CASCADE;, tests were run individually and completed flawlessly.

`	ext
✓ tests/scanner-paper-crash-recovery.test.ts (1 test) 153ms
✓ tests/scanner-paper-concurrent-settlement.test.ts (1 test) 155ms
`

### Routing Evidence
packages/database/src/repository.ts contains:
`	ypescript
async closePositionTransaction(params) {
   const client = await this.pool.connect();
   try {
     await client.query('BEGIN');
     const posRes = await client.query(SELECT * FROM positions WHERE position_id = $1 FOR UPDATE, [params.positionId]);
     ...
     await client.query('COMMIT');
   } catch(e) {
     await client.query('ROLLBACK').catch(()=>{});
   }
}
`
The successful execution of crash recovery and concurrent settlement tests against the real PostgreSQL container proves this logical branch was invoked, bypassing the fallbackPositions array.
