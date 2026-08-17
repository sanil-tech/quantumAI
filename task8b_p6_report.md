# TASK 8B-P6 — CONCURRENT SETTLEMENT HARDENING

## A. Production Path
Inspected `closePositionTransaction` in `packages/database/src/repository.ts`.

## B. Concurrency Model
The implementation relies on PostgreSQL `FOR UPDATE` row-level locks at the initial READ boundary. Any simultaneous transactions block until the first transaction commits. Once unblocked, they recheck the `status`.

## C. Locking Analysis
Locks are applied at the position level. Balance updates are atomic (`update account_state set balance = balance + $1`). After the first commit, the position status is `CLOSED`. Concurrent transactions see this upon rusuming and abort before mutating or applying PnL.

## D. Concurrent Test
Verified via `tests/scanner-paper-concurrent-settlement.test.ts`, which issues 3 simultaneous close promises (via `Promise.allSettled`) with different payloads (1.1010, 1.1020, 1.1030).

## E. Settlement Winner
Exactly 1 settlement won, and its integrity was preserved (price = 1.1010, profit = 10.00, reason = TP_HIT_A). No mixing of payloads occurred.

## F. PnL Invariant
Verified. The final PnL recorded matched only the winner's payload.


## G. Balance Invariant
Verified. Balance was not double-updated because concurrent runs stopped at the `idempotency` check before back-end mutation.

## H. Metrics Invariant
Verified. `totalTrades` and `winCount` incremented by EXACTLY 1.

## I. Identity Invariant
Verified. positionId and setupId remained immutable.


## J. Duplicate Record Check
Verified. `select count(*)` for the test positionId returned exactly 1.

## K. Fallback Path
Verified. The fallback/memory path also passed the concurrency test because Node.js is single-threaded, and the `find` -> `match.status = 'CLOSED' `transition happens synchronously without interleaving `await` blocks.


## L. cTrader Safety
READ_ONLY_MODE_ENFORCED is ACTIVE.

There are no calls to FIX 35=D/F/G or ProtoOANewOrderReq 2106.

## M. Regression Results
All 11 suites and 54 tests passed, including the new concurrency test.


## N. Build Result
Exit Code: 0
Build successfully completed in ~11s.


## O. Git State
untracked:
- tests/scanner-paper-concurrent-settlement.test.ts
- task8b_p6_report.md

- No production modifications were necessary or made.

## P. Limitations
None.


## Q. Final Verdict
A. FULLY VERIFIED