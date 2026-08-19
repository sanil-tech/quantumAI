# QUANTUMAI / IATI OS ? PHASE 7I CERTIFICATION
## Controlled DEMO 30-Trade Early Learner Campaign & Learning Journal Audit

**Project:** QUANTUMAI / IATI OS  
**Branch:** `agent/ctrader-oauth-diagnostic`  
**Date:** August 19, 2026  
**Status:** FULLY CERTIFIED ? PRODUCTION READY (DEMO LEARNER ONLY)

---

## 1. Executive Summary & Safety Contract

Phase 7I establishes QuantumAI's comprehensive campaign management lifecycle, orchestrating real-market cTrader DEMO observations up to the $N=30$ target milestone while enforcing mathematical setup isolation, non-negotiable execution safety bounds, and an immutable Learning Journal audit ledger.

### Non-Negotiable Safety Contract Verification:
- `LIVE_EXECUTION = FORBIDDEN` (Hard Gate: Active & Enforced)
- `LIVE_ACCOUNT = FORBIDDEN` (Unconditional Rejection)
- `AUTOMATED_LIVE_EXECUTION = false` (Permanently Disabled)
- `DEMO_EXECUTION = CONTROLLED ONLY` (Single-Order Gated Pipeline)
- `DEMO_EXECUTION_ARMED = false BY DEFAULT` (Auto-Disarm after Every Execution/Failure)
- `MAX_CONCURRENT_DEMO_POSITIONS = 1` (Strictly Enforced)
- `MAX_DEMO_ORDER_VOLUME = 0.01 LOT` (Single Micro-Lot Invariant)
- `CAMPAIGN_TARGET_TRADES = 30` (Authoritative Closed Trades Target)
- `CAMPAIGN N != SETUP N` (Strict Setup-Level Isolation Maintained)

---

## 2. Architecture & Components Implemented

### A. ControlledDemoLearningCampaignService (`apps/execution-router/src/services/controlledDemoLearningCampaignService.ts`)
- **Finite State Machine:** Manages states `STOPPED`, `RUNNING`, `PAUSED`, `COMPLETED`.
- **Operator Controls:** `startCampaign()`, `pauseCampaign()`, `resumeCampaign()`, `stopCampaign()`.
- **Execution Pipeline:**
  1. Validates operator campaign state (`RUNNING`).
  2. Evaluates 17-point pre-flight safety check (`ControlledDemoSmokeTestHarness.evaluatePreFlight`).
  3. Reconciles live cTrader DEMO broker state (0 positions, 0 pending orders).
  4. Requires fresh valid BUY/SELL signal within entry zone.
  5. Arms DEMO execution for a single 0.01-lot transaction.
  6. Dispatches order via `ControlledDemoExecutionService`.
  7. Ingests trade close post-mortem into `ResearchLearningEngine`.
  8. Auto-disarms execution and increments campaign $N$.
  9. Halts / pauses automatically on any broker irregularity or reconciliation discrepancy.

### B. LearningJournalService (`src/server/services/learningJournalService.ts`)
- **Immutable Ledger:** Records 15 distinct learning event types:
  - `CAMPAIGN_STARTED`, `CAMPAIGN_PAUSED`, `CAMPAIGN_RESUMED`, `CAMPAIGN_STOPPED`, `CAMPAIGN_COMPLETED`
  - `SETUP_EVALUATED`, `ORDER_SUBMITTED`, `TRADE_CLOSED`, `POST_MORTEM_CREATED`
  - `LEARNING_EVALUATED`, `PARAMETER_ADAPTED`, `SAFETY_BLOCK`
  - `COUNTERFACTUAL_RECORDED`, `SHADOW_RECORDED`, `RECONCILIATION_PERFORMED`
- **Snapshot Integrity:** Supports export, reload, filtering, and cross-session verification.

### C. EarlyLearnerDashboard UI (`src/components/EarlyLearnerDashboard.tsx`)
- **Live Campaign Progress Bar:** Real-time visual tracking of closed trades ($N=5 	o N=30$) and remaining counts.
- **Operator Command Bar:** Interactive START, PAUSE, RESUME, STOP, and SYNC controls with immediate safety feedback.
- **Authoritative Learning Journal Sub-Tab:** Searchable, real-time audit stream detailing event types, fingerprints, timestamps, evidence tiers, realized R, previous vs. proposed parameters, and bounded adjustments.

---

## 3. Campaign N vs. Setup N Invariant Verification

Phase 7I strictly upholds the mathematical invariant that **Campaign N is NOT Setup N**:
$$	ext{Campaign } N = sum_{i=1}^{K} 	ext{Setup } N_i$$
- When the aggregate campaign reaches $N = 30$, an individual setup (e.g. `EUR/USD_BUY_ORDER_BLOCK_RETEST`) with only $N = 2$ remains strictly in `NO_EVIDENCE` tier with **0.0% learning weight**.
- Early Learner parameter adaptation ($5%$ bounded weight) triggers **only** when that specific setup's individual sample size reaches $N_i ge 5$ (`EARLY_OBSERVATION`).
- Counterfactual observations, shadow telemetry, and test fixtures are strictly segregated and **never** increment real DEMO campaign $N$.

---

## 4. Test Suite Certification (30 Scenarios)

The comprehensive test suite `tests/phase7i-early-learner-campaign.test.ts` certifies all 30 non-negotiable scenarios:

| # | Scenario Tested | Result |
|---|-----------------|--------|
| 1 | Campaign starts disarmed & STOPPED by default | PASSED |
| 2 | LIVE execution is rejected unconditionally | PASSED |
| 3 | DEMO environment required for execution | PASSED |
| 4 | Account identity matches authorized DEMO (5881460) | PASSED |
| 5 | Volume > 0.01 LOT rejected by execution gates | PASSED |
| 6 | Concurrent position > 1 rejected | PASSED |
| 7 | Invalid signal action (NO_SETUP) recorded as counterfactual | PASSED |
| 8 | Stale signal timestamp rejected during pre-flight | PASSED |
| 9 | Invalid geometry (SL >= Entry for BUY) rejected | PASSED |
| 10 | Duplicate idempotency key rejected | PASSED |
| 11 | Campaign pauses on pre-flight or reconciliation failure | PASSED |
| 12 | Campaign pause records SAFETY_BLOCK in Learning Journal | PASSED |
| 13 | Automatic disarm after successful trade execution & close | PASSED |
| 14 | Automatic disarm on trade failure | PASSED |
| 15 | Campaign N increments only after authoritative closed DEMO trade | PASSED |
| 16 | Shadow observation does NOT increment campaign N | PASSED |
| 17 | Counterfactual does NOT increment campaign N | PASSED |
| 18 | Test fixture does NOT increment production campaign N | PASSED |
| 19 | Campaign N != Setup N isolation strictly maintained | PASSED |
| 20 | Learning remains 0% for setup N < 5 | PASSED |
| 21 | Setup reaches EARLY_OBSERVATION at N=5 with bounded 5% weight | PASSED |
| 22 | Learning affects only future matching setup (strict isolation) | PASSED |
| 23 | Historical snapshot remains immutable | PASSED |
| 24 | Learning journal records adaptation (prev vs proposed params) | PASSED |
| 25 | Restart preserves campaign state through snapshot restore | PASSED |
| 26 | Unexpected broker position causes campaign pause / halt | PASSED |
| 27 | Unexpected pending order causes campaign pause / halt | PASSED |
| 28 | LIVE credentials / environment remain impossible | PASSED |
| 29 | Stop campaign prevents new execution | PASSED |
| 30 | Resume requires safety reconciliation before RUNNING | PASSED |

---

## 5. Full Repository Regression & Build Verification

- **Total Test Suites:** 17 passed (17 / 17)
- **Total Unit & Integration Tests:** 268 passed (268 / 268) ? 100% PASS RATE
- **Vite & esbuild Bundle:** Clean build with 0 TypeScript/compilation errors (`dist/assets` and `dist/server.cjs` generated).
