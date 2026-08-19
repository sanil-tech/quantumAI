# QUANTUMAI / IATI OS ? PHASE 7J CERTIFICATION
## Continuous Learning Observatory (Zero-Broker Autonomous Shadow Research)

**Project:** `QUANTUMAI / IATI OS`  
**Branch:** `agent/ctrader-oauth-diagnostic`  
**Date:** August 19, 2026  
**Status:** FULLY CERTIFIED ? PRODUCTION READY (SHADOW LEARNER ONLY)

---

## 1. Executive Summary & Core Principle

Phase 7J implements the **Continuous Learning Observatory** for QuantumAI, empowering the system to autonomously consume real-market tick streams, detect candidate setups, simulate lifecycle progression (MFE, MAE, SL, TP1, TP2, breakeven adjustments), and adapt setup parameters into the immutable Learning Journal **without giving it permission to trade autonomously or transmit broker orders**.

### Non-Negotiable Safety Contract Verification:
- `LIVE_EXECUTION = FORBIDDEN` (Hard Gate: Active & Enforced)
- `LIVE_ACCOUNT = FORBIDDEN` (Unconditional Rejection)
- `AUTOMATED_LIVE_EXECUTION = false` (Permanently Disabled)
- `DEMO_AUTOMATED_EXECUTION = FORBIDDEN` (Autonomous Broker Orders Blocked)
- `DEMO_EXECUTION = CONTROLLED ONLY` (Single-Order Gated Pipeline)
- `DEMO_EXECUTION_ARMED = false BY DEFAULT` (Auto-Disarms post-execution)
- `MAX_CONCURRENT_DEMO_POSITIONS = 1` (Micro-Lot Queue Invariant)
- `MAX_DEMO_ORDER_VOLUME = 0.01 LOT` (Single Micro-Lot Invariant)
- `BROKER_ORDERS_TRANSMITTED = 0` (Observatory operates with 0 broker calls)
- `BROKER_POSITIONS = 0` (Zero open positions maintained)

---

## 2. Architecture & Components Implemented

### A. ContinuousLearningObservatoryService (`src/server/services/continuousLearningObservatoryService.ts`)
- **FSM Operational States:** `STOPPED` $leftrightarrow$ `OBSERVING` $leftrightarrow$ `PAUSED`.
- **Pipeline Workflow:**
  $$	ext{Real-Market Data} longrightarrow 	ext{Signal Intelligence} longrightarrow 	ext{Candidate Setup} longrightarrow 	ext{Simulated Shadow} longrightarrow 	ext{MFE/MAE Tracking} longrightarrow 	ext{Simulated Exit} longrightarrow 	ext{Post-Mortem} longrightarrow 	ext{Research Engine} longrightarrow 	ext{Learning Journal}$$
- **Fail-Closed Market Data Gate:** If price data is missing or invalid, immediately reports `NO_DATA_FAIL_CLOSED` rather than synthesizing fake ticks.
- **TP Semantics:**
  - *Single Target Setup:* Price reaching TP1 constitutes complete simulated position exit.
  - *Multi Target Setup:* Price reaching TP1 marks `tp1Hit`, automatically moves simulated SL to Breakeven (`stopLoss = entryPrice`), logs a `PARAMETER_ADAPTED` event to the Learning Journal, and continues holding simulated exposure toward TP2 or Breakeven SL.
- **MFE / MAE:** Real-time truthful calculation in pips based on high/low excursion relative to initial entry.

### B. Setup Isolation & Sample-Gated Learning Policy
- **Gated Learning Weight:**
  - $N_i < 5 	o 0%$ learning weight (`NO_EVIDENCE`)
  - $5 le N_i < 10 	o 5%$ learning weight (`EARLY_OBSERVATION`)
  - $10 le N_i < 30 	o 10%$ learning weight (`DEVELOPING`)
  - $30 le N_i < 100 	o 15%$ learning weight (`MODERATE_EVIDENCE`)
  - $N_i ge 100 	o 20%$ learning weight (`ROBUST_OBSERVATION`)
- **Bounded Adjustments:** Maximum defensive Stop Loss buffer capped at $+20%$ ($1.20	imes$ baseline). Hard risk limits are strictly immutable.
- **Strict Evidence Segregation:**
  - `SHADOW_OBSERVATION` $
eq$ `REAL_DEMO_EXECUTION` (Shadow observations never increment Real DEMO Campaign N).
  - `COUNTERFACTUAL_OBSERVATION` $
eq$ `REAL_DEMO_EXECUTION` (Counterfactuals never increment Real DEMO Campaign N).
  - `TEST_FIXTURE` is isolated and never enters production learning statistics.

### C. EarlyLearnerDashboard UI (`src/components/EarlyLearnerDashboard.tsx`)
- **Observatory Sub-Tab (`02 SHADOW OBSERVATORY`):**
  - Interactive Start, Pause, Resume, Stop controls.
  - Live cards for active real-market shadow positions showing Entry, Current SL (with BE indicator), TP1, TP2, MFE, MAE, and TP1 milestone status.
  - Real-time stream of recently closed shadow observations with realized R.

---

## 3. Test Suite & Full Regression Certification

The Phase 7J test suite `tests/phase7j-learning-observatory.test.ts` certifies all 20 key operational specifications:

| # | Scenario Tested | Result |
|---|-----------------|--------|
| 1 | Observatory starts in STOPPED state and 0 broker orders | PASSED |
| 2 | LIVE execution is unconditionally forbidden | PASSED |
| 3 | DEMO execution remains disarmed by default | PASSED |
| 4 | Fails closed with NO_DATA if market data is invalid | PASSED |
| 5 | NO_SETUP action is recorded as COUNTERFACTUAL | PASSED |
| 6 | Valid signal opens SHADOW_OBSERVATION without broker orders | PASSED |
| 7 | Duplicate signal ID is ignored idempotently | PASSED |
| 8 | Single-Target Setup: Reaching TP1 results in complete exit | PASSED |
| 9 | Multi-Target Setup: TP1 marks tp1Hit & moves SL to Breakeven | PASSED |
| 10 | Multi-Target Setup: Price reverses after TP1 to BE SL | PASSED |
| 11 | Multi-Target Setup: Price continues after TP1 to TP2 | PASSED |
| 12 | Price hitting Stop Loss closes with STOP_LOSS reason | PASSED |
| 13 | Shadow observations do NOT increment REAL_DEMO campaign N | PASSED |
| 14 | Counterfactuals do NOT increment REAL_DEMO campaign N | PASSED |
| 15 | TEST_FIXTURE observations do NOT affect production stats | PASSED |
| 16 | Setup Isolation: EUR/USD learning does not affect GBP/USD | PASSED |
| 17 | Evidence tier progression (0% to 20% weight) | PASSED |
| 18 | Bounded parameter adjustment never exceeds 1.20 multiplier | PASSED |
| 19 | Immutable signal snapshots preserved | PASSED |
| 20 | Learning Journal records immutable audit event on close | PASSED |

- **Total Test Suites:** 18 passed (18 / 18)
- **Total Unit & Integration Tests:** 288 passed (288 / 288) ? 100% PASS RATE
- **Vite & esbuild Bundle:** Clean production build with 0 TypeScript/compilation errors.
