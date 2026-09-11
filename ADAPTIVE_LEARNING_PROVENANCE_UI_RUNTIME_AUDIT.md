# QUANTUMAI — PRESENTATION-LAYER PROVENANCE & VETO RUNTIME AUDIT

**Audit Date**: 2026-08-26  
**Status**: Certified & Verified  
**Author**: Antigravity Presentation & Execution Systems Auditor  
**Scope**: Full Presentation-Layer Provenance & VETO Runtime Audit  
**Target Architecture**: QuantumAI / IATI OS  

---

## A. Final Verdict

# **PRESENTATION PROVENANCE BOUNDARY — PASS**

The presentation and UI runtime layers strictly preserve and render all 4 distinct provenance streams without cross-contamination. Simulated backtest reviews and synthetic fallbacks are visibly tagged with advisory banners and **NEVER appear as authoritative execution vetoes** on ANY dashboard, card, or modal. Authoritative execution vetoes are strictly reserved for genuine `REAL_TRADE` PostgreSQL closed positions ($N \ge 3$).

---

## B. Backend → API → UI Data Lineage

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               COMPLETE DATA LINEAGE ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

 [1] BACKEND SOURCE
     • PostgreSQL `positions` (status = 'CLOSED')
     • 1-Year Multi-Pair Backtest (365 Daily Candles)
     • Synthetic Fallback Generator / Shadow Forward Test
                 │
                 ▼
 [2] ENGINE & SERVICES
     • LearningService (attaches provenance: 'REAL_TRADE', authority: 'POSTGRESQL')
     • BacktestEngine (attaches provenance: 'HISTORICAL_BACKTEST', authority: 'BACKTEST_ENGINE')
     • SignalIntelligenceService (evaluates candidate setups & separates real vs. advisory reviews)
                 │
                 ▼
 [3] API DTO / SERIALIZATION
     • GET/POST `/api/forex/post-mortem-lessons` (serializes full PostMortemReview[] with provenance)
     • POST `/api/forex/ai-opinion` (serializes AiTradeOpportunity with vetoReasons, reasons, isVetoed)
     • Zero serialization loss (provenance, authority, dataSource, fallbackUsed intact)
                 │
                 ▼
 [4] FRONTEND STATE & HOOKS
     • fetchLessons() in AdaptiveLearningModal.tsx
     • activeOpportunity in UserDashboard.tsx / AiAnalysisCard.tsx
                 │
                 ▼
 [5] RENDERED PRESENTATION LAYER
     • Real Trade Veto: [SIGNAL VETOED] [ADAPTIVE RISK BLOCK] + [ADAPTIVE LEARNING VETO]
     • Backtest Warning: [BACKTEST WARNING] ... Execution Veto: NO (Advisory confluences list)
     • Simulation Warning: [SIMULATION WARNING] ... Execution Veto: NO (Advisory confluences list)
     • Review Cards: Explicit Provenance Badges [REAL TRADE (PG)], [1-YR BACKTEST], [SYNTHETIC SIM]
```

---

## C. 12-Instrument Presentation Matrix

Every configured trading pair and asset was evaluated across the UI runtime path:

| Instrument | Real Trade UI | Backtest UI | Synthetic UI | Shadow UI | Provenance Visible | Result |
|---|---|---|---|---|---|---|
| `EUR/USD` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `GBP/USD` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `USD/JPY` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `AUD/USD` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `USD/CHF` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `NZD/USD` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `USD/CAD` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `EUR/JPY` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `GBP/JPY` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `XAU/USD` | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `NASDAQ`  | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |
| `BTC/USD`  | `[ADAPTIVE LEARNING VETO]` | `[BACKTEST WARNING]` | `[SIMULATION WARNING]` | `[SHADOW OBS]` | **YES** (Explicit) | **PASS** |

---

## D. Provenance Rendering Matrix

| Provenance Stream | Visual Badge & Color | Header / Banner | Execution Impact | Sample Size ($N$) Impact |
|---|---|---|---|---|
| 🟢 `REAL_TRADE` | `[REAL TRADE (PG)]` (Emerald) | `[SIGNAL VETOED]` `ADAPTIVE RISK BLOCK` `ADAPTIVE LEARNING VETO ACTIVATED` | **Blocks Trade Execution** (`isVetoed = true`, `entryZone = null`) when $N \ge 3$ | Increments real trade $N$ |
| 🟡 `HISTORICAL_BACKTEST` | `[1-YR BACKTEST]` (Amber) | `[BACKTEST WARNING]` (Technical Confluences List) | **Non-Blocking Advisory** (`isVetoed = false`, trade remains executable) | Isolated from real $N$ |
| 🟠 `SYNTHETIC_SIMULATION` | `[SYNTHETIC SIM]` (Orange) | `[SIMULATION WARNING]` (Technical Confluences List) | **Non-Blocking Advisory** (`isVetoed = false`, trade remains executable) | Isolated from real $N$ |
| 🔵 `SHADOW_OBSERVATION` | `[SHADOW OBS]` (Blue) | `[SHADOW OBSERVATION]` (Telemetry Panel) | **Telemetry Only** (`isVetoed = false`, zero execution influence) | Isolated from real $N$ |

---

## E. Fail-Closed & Malformed Provenance Tests

1. **Undefined Provenance (`provenance = undefined`, `authority = undefined`)**:
   - Legacy reviews without provenance fields are safely handled as unverified and **never upgraded** to trigger an authoritative veto.
2. **Mismatched Authority (`HISTORICAL_BACKTEST` claiming `POSTGRESQL` authority)**:
   - Evaluated by `SignalIntelligenceService` and strictly checked against real closed trade count; single or invalid records fail safely with `isVetoed = false`.
3. **Mismatched Provenance (`REAL_TRADE` with `BACKTEST_ENGINE` authority)**:
   - Filtered into backtest bucket and cannot issue an authoritative execution veto.

---

## F. EUR/USD Regression Revalidation

The specific records previously observed in runtime logs:
- `pm-1y-1787680102312-36`
- `pm-1y-1787679502288-36`
- `pm-1y-1787678903133-36`

### Presentation Verification
- **Rendered Title**: `[BACKTEST WARNING]`
- **Root Cause Text Preserved**: `"1-Year Backtest Evaluation: BUY setup on EUR/USD stopped out at SL 1.16770 during daily volatility expansion."`
- **Execution Veto State**: `isVetoed = false`, `status = 'VALID_PROPOSAL'`, `action = 'BUY'`
- **Badge in Modal**: `[1-YR BACKTEST]` (Amber badge)

---

## G. Sample Size Transparency & Gating

- $N = 0 \implies$ `status: 'NO_DATA'` (Veto decision: `ALLOW`, confidence: 0%)
- $N = 1, 2 \implies$ `status: 'INSUFFICIENT_SAMPLE'` (Veto decision: `ALLOW`, confidence: 0%, never claiming 0% failure rate as certainty)
- $N \ge 3 \implies$ `status: 'HIGH_FAILURE_PATTERN'` or `'LOW_FAILURE_PATTERN'` (Eligible for authoritative veto evaluation based on failure rate $\ge 60\%$)

---

## H. Execution Safety Display

The UI truthfully reflects the non-live, fail-closed operational mode:
- **Broker Orders**: `0` (`Broker Orders: 0` badge visible on trade cards)
- **Execution Banner**: `MANUAL REVIEW REQUIRED — QUANTUMAI DOES NOT PLACE BROKER ORDERS`
- **Execution Environment**: `LIVE_EXECUTION = FORBIDDEN`, `BROKER_EXECUTION = DISABLED`

---

## I. Automated Test Suite Results

Full 13-suite regression test run executed:

```text
 ✓ tests/adaptive-learning-provenance-ui-runtime.test.ts (12 tests)
 ✓ tests/adaptive-learning-provenance-multi-pair-runtime.test.ts (56 tests)
 ✓ tests/adaptive-learning-provenance-boundary.test.ts (8 tests)
 ✓ tests/adaptive-learning-continuous-backfill.test.ts (9 tests)
 ✓ tests/adaptive-learning-persistence.test.ts (11 tests)
 ✓ tests/production-adaptive-learning-e2e.test.ts (4 tests)
 ✓ tests/signal-intelligence-adaptive-loop.test.ts (22 tests)
 ✓ tests/phase26-learning-reconciliation.test.ts (10 tests)
 ✓ tests/phase6c-closed-loop-learning.test.ts (38 tests)
 ✓ tests/autotrader-persistence.test.ts (6 tests)
 ✓ tests/market-data-safety.test.ts (20 tests)
 ✓ tests/manual-signal-mode.test.ts (26 tests)
 ✓ tests/admin-auth-security.test.ts (8 tests)

Test Files  13 passed (13)
     Tests  230 passed (230)
  Duration  9.54s
```

* **Total Passed**: **230 / 230 (100%)**
* **Total Failed**: **0**

---

## J. Final Acceptance Verification Checklist

- [x] Backend provenance survives API serialization
- [x] UI distinguishes REAL_TRADE from BACKTEST
- [x] UI distinguishes REAL_TRADE from SYNTHETIC
- [x] UI distinguishes REAL_TRADE from SHADOW
- [x] Backtest cannot visually appear as authoritative veto
- [x] Synthetic cannot visually appear as authoritative veto
- [x] Shadow cannot visually appear as authoritative veto
- [x] Missing provenance fails safely
- [x] Mismatched authority fails safely
- [x] Sample size is visible/correct
- [x] $N < 3$ cannot be presented as high-confidence learning
- [x] Cross-pair isolation preserved
- [x] Mixed-provenance isolation preserved
- [x] All 12 configured instruments verified
- [x] EUR/USD pm-1y regression verified
- [x] Execution status is truthful
- [x] No live execution enabled
- [x] Broker orders transmitted = 0
- [x] Existing regression suite remains 100% green
