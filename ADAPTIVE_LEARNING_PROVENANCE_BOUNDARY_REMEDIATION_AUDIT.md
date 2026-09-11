# QUANTUMAI — ADAPTIVE LEARNING PROVENANCE BOUNDARY REMEDIATION AUDIT

**Audit Date**: 2026-08-26  
**Status**: Certified & Remediated  
**Author**: Antigravity Forensic Engine  
**Target Project**: QuantumAI / IATI OS  

---

## 1. Executive Summary

A critical provenance confusion was detected and remediated between **Authoritative Closed-Trade Learning** and **1-Year Multi-Pair Backtest Intelligence**.

Prior to remediation, `BacktestEngine.execute1YearMultiPairBacktest()` emitted simulated post-mortems with IDs `pm-1y-${Date.now()}-${i}` into the in-memory learning cache. Because `SignalIntelligenceService` evaluated reviews without provenance checks, repeated simulated backtest losses generated false-positive `[ADAPTIVE LEARNING VETO]` messages that blocked runtime signals with `isVetoed = true`.

### Certified Post-Remediation Behavior
1. **Strict Provenance Partitioning**:
   - `REAL_TRADE` (`authority = 'POSTGRESQL'`): Originates **exclusively** from canonical PostgreSQL closed positions. This is the **only source permitted to issue authoritative execution vetoes** (`isVetoed = true`, `[ADAPTIVE LEARNING VETO]`).
   - `HISTORICAL_BACKTEST` (`authority = 'BACKTEST_ENGINE'`): Originates from the 1-Year (365 daily candles) multi-pair backtest engine. Emits advisory messages `[BACKTEST WARNING]` and `[BACKTEST ADVISORY]`. **Never blocks execution (`isVetoed = false`)**.
   - `SYNTHETIC_SIMULATION` (`authority = 'SIMULATION_ONLY'`): Originates from offline harmonic candle generator fallback. Emits advisory messages `[SIMULATION WARNING]`. **Never blocks execution (`isVetoed = false`)**.
   - `SHADOW_OBSERVATION` (`authority = 'SHADOW_ENGINE'`): Forward-testing observations.
2. **Sample Count Non-Inflation**:
   - Simulated backtest reviews and synthetic reviews do **not** increment or pollute the real-trade sample count $N$.
   - A minimum threshold of $N \ge 3$ verified PostgreSQL closed trade losses is required for an authoritative veto.
3. **Execution Safety Invariants**:
   - `LIVE` broker execution remains forbidden (`EXECUTION_ENVIRONMENT !== 'LIVE'`).
   - 0 broker orders transmitted (fail-closed controls intact).
4. **Automated Verification**:
   - Comprehensive test suite `tests/adaptive-learning-provenance-boundary.test.ts` (8/8 PASS).
   - Full regression suite across 11 test suites (162/162 PASS).

---

## 2. Architecture & Data Flow Matrix

```
                      ┌──────────────────────────────────────────────┐
                      │                 DATA SOURCES                 │
                      └───────┬──────────────────────────────┬───────┘
                              │                              │
          ┌───────────────────┴──────────┐       ┌───────────┴───────────────────┐
          │     PostgreSQL Database      │       │     Backtest & Market Data    │
          │ (Authoritative Closed Trades)│       │ (365 Daily Candles / Offline) │
          └───────────────┬──────────────┘       └───────────┬───────────────────┘
                          │                                  │
                          ▼                                  ▼
          ┌──────────────────────────────┐       ┌───────────────────────────────┐
          │       LearningService        │       │        BacktestEngine         │
          │  provenance: 'REAL_TRADE'    │       │provenance: 'HISTORICAL_BACKTEST'
          │  authority: 'POSTGRESQL'     │       │    or 'SYNTHETIC_SIMULATION'  │
          └───────────────┬──────────────┘       └───────────┬───────────────────┘
                          │                                  │
                          └───────────────┬──────────────────┘
                                          │
                                          ▼
                      ┌──────────────────────────────────────────────┐
                      │          SignalIntelligenceService           │
                      │       Strict Provenance Filter Engine        │
                      └───────┬──────────────────────────────┬───────┘
                              │                              │
         ┌────────────────────┴─────────┐       ┌────────────┴────────────────────┐
         │     REAL_TRADE Losses >= 3   │       │  HISTORICAL_BACKTEST / SYNTHETIC│
         │   (Authoritative Veto Gate)  │       │       (Advisory Warnings)       │
         └──────────────┬───────────────┘       └────────────┬────────────────────┘
                        │                                    │
                        ▼                                    ▼
         ┌──────────────────────────────┐       ┌─────────────────────────────────┐
         │   [ADAPTIVE LEARNING VETO]   │       │       [BACKTEST WARNING]        │
         │       isVetoed = true        │       │      [SIMULATION WARNING]       │
         │      action = 'VETO'         │       │        isVetoed = false         │
         │   Blocks Trade Execution     │       │   Advisory Evidence (Non-Veto)  │
         └──────────────────────────────┘       └─────────────────────────────────┘
```

---

## 3. Provenance & Authority Definitions

| Provenance Type | Authority | Originating Component | Data Source | Can Issue Authoritative Veto? | Sample Size Impact ($N$) |
|---|---|---|---|---|---|
| `REAL_TRADE` | `POSTGRESQL` | `LearningService` | Canonical `positions` table (`status = 'CLOSED'`) | **YES** ($N \ge 3$) | Increments real trade $N$ |
| `HISTORICAL_BACKTEST` | `BACKTEST_ENGINE` | `BacktestEngine.execute1YearMultiPairBacktest` | Yahoo Finance / External 365 daily candles | **NO** (Advisory only) | Isolated from real $N$ |
| `SYNTHETIC_SIMULATION` | `SIMULATION_ONLY` | `fetchRealCandleEnvelopeDetailed` (fallback) | Deterministic synthetic harmonic candle generator | **NO** (Advisory only) | Isolated from real $N$ |
| `SHADOW_OBSERVATION` | `SHADOW_ENGINE` | Forward-testing observatory | Paper trades / observatory executions | **NO** (Telemetry only) | Isolated from real $N$ |

---

## 4. Code Changes Summary

### 1. Types & Interfaces
- **`packages/core-types/src/index.ts`** & **`src/types.ts`**:
  - Added types `LearningProvenance` and `LearningAuthority`.
  - Added optional fields `provenance`, `authority`, `dataSource`, and `fallbackUsed` to `PostMortemReview`.

### 2. Market Data Generator
- **`src/lib/marketDataGenerator.ts`**:
  - Added `fetchRealCandleEnvelopeDetailed()` to return real candles along with metadata:
    - `provenance: 'HISTORICAL_BACKTEST' | 'SYNTHETIC_SIMULATION'`
    - `dataSource: 'EXTERNAL_HISTORICAL' | 'SYNTHETIC_FALLBACK'`
    - `fallbackUsed: boolean`

### 3. Backtest Engine
- **`apps/decision-agent/src/services/backtestEngine.ts`**:
  - `execute1YearMultiPairBacktest()` uses `fetchRealCandleEnvelopeDetailed()`.
  - Injected reviews explicitly carry `provenance: 'HISTORICAL_BACKTEST'` (or `'SYNTHETIC_SIMULATION'`) and `authority: 'BACKTEST_ENGINE'` (or `'SIMULATION_ONLY'`).

### 4. Learning Service
- **`src/server/services/learningService.ts`**:
  - Every review created from a canonical closed position explicitly sets `provenance: 'REAL_TRADE'`, `authority: 'POSTGRESQL'`, and `dataSource: 'POSTGRESQL_CLOSED_POSITION'`.

### 5. Signal Intelligence Service
- **`apps/decision-agent/src/services/signalIntelligenceService.ts`**:
  - Reviews partitioned into `realTradeReviews`, `backtestReviews`, and `syntheticReviews`.
  - `[ADAPTIVE LEARNING VETO]` (`isVetoed = true`) evaluates **only** `realTradeReviews` ($N \ge 3$).
  - `backtestReviews` emit advisory `[BACKTEST WARNING]` / `[BACKTEST ADVISORY]` with `isVetoed = false`.
  - `syntheticReviews` emit advisory `[SIMULATION WARNING]` with `isVetoed = false`.

---

## 5. Automated Verification Results

### Suite 1: Provenance Boundary Tests (`tests/adaptive-learning-provenance-boundary.test.ts`)
| Test Case | Description | Result |
|---|---|---|
| 1 | `REAL_TRADE` + `CLOSED` position: creates authoritative learning record (`POSTGRESQL`) | **PASS** |
| 2 | `REAL_TRADE` + `OPEN` position: strictly rejected from authoritative learning | **PASS** |
| 3 | `HISTORICAL_BACKTEST`: generates advisory warnings, CANNOT trigger authoritative veto | **PASS** |
| 4 | `SYNTHETIC_SIMULATION`: generates simulation warning, never blocks execution | **PASS** |
| 5 | Non-inflation: 2 Real + 20 Backtest = Insufficient Real Sample, No Veto | **PASS** |
| 6 | Genuine `REAL_TRADE` failure pattern ($N \ge 3$) triggers authoritative PostgreSQL veto | **PASS** |
| 7 | Backtest engine executes 1-year multi-pair simulation and assigns `HISTORICAL_BACKTEST` | **PASS** |
| 8 | Execution safety gate remains fail-closed with 0 broker orders | **PASS** |

### Suite 2: Full Regression Suite Run
- **Total Test Suites**: 11 passed (11/11)
- **Total Tests**: 162 passed (162/162)
- **Duration**: ~6.8 seconds
- **Pass Rate**: 100%

---

## 6. Certification Sign-Off

- [x] **Backtest Intelligence Preserved**: 1-Year Multi-Pair Backtest remains fully operational.
- [x] **Provenance Enforced**: Authoritative execution vetoes are strictly reserved for verified PostgreSQL closed trade records.
- [x] **Advisory Separation**: Backtest and synthetic reviews emit non-blocking advisory warnings.
- [x] **Zero Safety Regression**: Execution safety gate remains fail-closed.
