# QUANTUMAI / IATI OS ? PHASE 7H
# EARLY LEARNER MODE & VISIBLE LEARNING OBSERVABILITY CERTIFICATION

**Date:** August 19, 2026  
**Status:** FULLY CERTIFIED & AUDITED  
**Branch:** `agent/ctrader-oauth-diagnostic`  
**Safety Gate:** FAIL-CLOSED (`LIVE_EXECUTION = FORBIDDEN`, `DEMO_MAX_VOLUME = 0.01 LOT`, `MAX_CONCURRENT_DEMO_POSITIONS = 1`, `DEMO_DEFAULT_ARMED = false`)

---

## 1. Executive Summary

Phase 7H establishes **QuantumAI Early Learner Mode & Visible Learning Observability**, turning the continuous DEMO execution pipeline into a transparent, fully auditable learning system. 

Every learning parameter modification is sample-size protected, setup-isolated, bounded, and visible to the operator with a complete audit trail.

---

## 2. Invariant & Safety Guard Guarantees

| Invariant / Constraint | Mandated Value | Certified Implementation |
|---|---|---|
| **LIVE Execution Permission** | `FORBIDDEN` | `validateExecutionEnvironmentSafety` rejects all LIVE requests unconditionally |
| **LIVE Account Enforcement** | `FORBIDDEN` | `isLiveAccount(id)` blocks non-DEMO accounts |
| **Automated LIVE Trading** | `false` | Disabled by default in all engine layers |
| **DEMO Maximum Order Volume** | `0.01 LOT` | Hard volume check in `ControlledDemoExecutionService` and `ControlledDemoSmokeTestHarness` |
| **Max Concurrent DEMO Positions** | `1` | Concurrency gate blocks order creation if open count >= 1 |
| **DEMO Default Armed State** | `false` | Automatic reset upon order completion or disarm event |
| **Historical Snapshot Immutability** | Frozen / Immutable | Prior closed trades and post-mortems are immutable; learning affects future signals only |
| **Sample-Size Isolation Rule** | `Campaign N != Setup N` | Setup-specific N governs setup tier and learning weight; campaign aggregate N never substitutes |
| **Counterfactual Segregation** | Strict Separation | Unexecuted candidates (`NO_SETUP`, `WAIT`, `VETO`) recorded as `COUNTERFACTUAL_OBSERVATION` and excluded from real DEMO $N$ |

---

## 3. Evidence Tier & Bounded Learning Weights

| Sample Size ($N$) | Research Evidence Tier | Learning Weight ($W$) | Max Defensive SL Multiplier |
|---|---|---|---|
| $N < 5$ | `NO_EVIDENCE` | `0.00` (0%) | `1.00x` (Baseline preserved) |
| $5 le N < 10$ | `EARLY_OBSERVATION` | `0.05` (5%) | `1.05x` (Max bounded) |
| $10 le N < 30$ | `DEVELOPING` | `0.10` (10%) | `1.10x` (Max bounded) |
| $30 le N < 100$ | `MODERATE_EVIDENCE` | `0.15` (15%) | `1.15x` (Max bounded) |
| $N ge 100$ | `ROBUST_OBSERVATION` | `0.20` (20%) | `1.20x` (Hard ceiling cap) |

---

## 4. Architectural Enhancements

1. **`ResearchLearningEngine` (`apps/decision-agent/src/services/researchLearningEngine.ts`):**
   - Implemented `CampaignSummaryMetrics` aggregating closed trades, win rate, realized R, MFE/MAE excursions, latency telemetry, counterfactual counts, and overall tier.
   - Implemented `SetupLearningStats` tracking isolated fingerprint metrics (`symbol_direction_setupType`), session distribution, sample count, and bounded SL multipliers.
   - Implemented `LearningAdaptationRecord` logging audit events (observed patterns, sample size, previous vs proposed parameter, bounded adjustment, justification, active state).
   - Implemented `EarlyLearnerPayload` exposing the complete audit snapshot to the API and UI.

2. **API Endpoint (`src/server/routes/decision.ts`):**
   - Added `GET /api/forex/learning/early-learner` and `GET /api/learning/early-learner`.

3. **Visible Observability Dashboard (`src/components/EarlyLearnerDashboard.tsx`):**
   - Provides an interactive, real-time cockpit displaying Campaign Summary Cards, Setup Evidence Matrix, Learning Adaptation Audit Trail, Session Intelligence Breakdown, and Counterfactual Observations Ledger.
   - Integrated into primary navigation portal in `src/App.tsx`.

4. **Safety Gate Hardening (`apps/execution-router/src/services/controlledDemoExecutionService.ts`):**
   - Added explicit `MAX_VOLUME_EXCEEDED` rejection for requested volume $> 0.01$ LOT.
   - Preserved single-trade concurrency limit (`MAX_CONCURRENT_LIMIT_EXCEEDED`).

---

## 5. Verification & Regression Suite

```
Test Files  16 passed (16)
Tests       238 passed (238)
Duration    6.44s
```

### Key Verified Tests (`tests/phase7h-early-learner.test.ts`):
1. **Campaign N != Setup N**: Aggregate campaign count ($N=5$) does NOT inflate setup-level evidence tier when setup $N<5$.
2. **Sample-Size Protection**: Insufficient samples ($N<5$) produce 0% learning weight and 0 unearned adaptation.
3. **Threshold Crossing**: $N ge 5$ unlocks bounded 5% learning weight and defensive SL multiplier $le 1.20$.
4. **Setup/Pair/Direction Isolation**: Learning on EUR/USD SELL does not modify EUR/USD BUY or GBP/USD.
5. **Historical Immutability**: Historical snapshots remain untouched; learning affects future signals only.
6. **Counterfactual Segregation**: Counterfactual records never increment real DEMO trade counts.
7. **Fail-Closed Safety**: LIVE execution remains `FORBIDDEN` and DEMO remains disarmed by default.
8. **Volume & Concurrency Limits**: 0.01 LOT cap and 1-position limit strictly enforced.
9. **Telemetry Calculations**: Latencies, win rates, and R statistics calculate truthfully.
10. **Early Learner API Payload**: Complete audit trail exposed to frontend.

### Production Build:
```
vite v6.4.3 building for production...
? 1713 modules transformed.
? built in 12.93s
  dist\server.cjs      577.7kb
  dist\server.cjs.map    1.0mb
Done in 128ms (0 errors)
```
