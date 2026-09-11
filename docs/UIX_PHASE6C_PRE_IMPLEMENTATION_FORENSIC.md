# QUANTUMAI / IATI OS ? PHASE 6C PRE-IMPLEMENTATION FORENSIC AUDIT

**Date:** 2026-08-19
**Repository Root:** `C:/Users/sanil/OneDrive/Desktop/studyquest-ai-1/quantumAI`
**Branch:** `agent/ctrader-oauth-diagnostic`
**HEAD Commit:** `75d9aad`
**Safety Mode:** `READ_ONLY_MODE_ENFORCED = true` | `BROKER_EXECUTION = DISABLED`

---

## 1. EXECUTIVE SUMMARY & FORENSIC QUESTIONS (1?20)

### Q1: Can a VALID BUY create a shadow position?
**Yes.** A `VALID BUY` proposal can be ingested by the shadow execution system (`ShadowPerformanceCockpit` / `ShadowEvidenceService`), recording an entry with `provenanceSource = "AI_SHADOW"`.

### Q2: Can a VALID SELL create a shadow position?
**Yes.** Identical to `VALID BUY`, `VALID SELL` produces a structured `AiTradeOpportunity` that is eligible for shadow position creation.

### Q3: Can NO_SETUP create a position?
**No (Blocked).** When `action === "NO_SETUP"`, `entryZone`, `stopLoss`, `takeProfit1`, `takeProfit2` are `null`. The UI disables manual entry and the shadow subsystem does not spawn positions.

### Q4: Can WAIT_FOR_CONFIRMATION create a position?
**No (Blocked).** `WAIT_FOR_CONFIRMATION` carries `entryZone: null` and explicit `confirmationRequirements`. No executable order can be created.

### Q5: Can VETO create a position?
**No (Blocked).** `VETO` carries `status: "VETOED"`, `entryZone: null`, and `vetoReasons`. Position creation is strictly rejected.

### Q6: Can shadow positions be monitored using real market data?
**Yes.** Shadow positions track observed tick/candle price feeds to evaluate whether market price has reached Stop Loss, Take Profit 1, Take Profit 2, or Invalidation.

### Q7: Can they close from real observed price movement?
**Yes.** Real observed prices triggering Stop Loss or Take Profit update the position status from `OPEN` to `CLOSED`.

### Q8: Does closing emit TradeClosed?
**Yes.** When a position closes, `globalEventBus.emit(EventTypes.TradeClosed, { positionId, symbol, outcome, pnlDollars, ... })` is dispatched.

### Q9: Does TradeClosed create a post-mortem?
**Yes.** `LearningService` subscribes to `EventTypes.TradeClosed` and invokes `aiDecisionEngine.createPostMortemFromCanonicalData()`.

### Q10: Is the post-mortem persisted in PostgreSQL?
**Yes.** `TradingRepository.savePostMortemReview()` persists the record to the `post_mortem_reviews` table.

### Q11: Is learning rehydrated?
**Yes.** `learningService.loadPersistedLearning()` loads the most recent reviews from PostgreSQL into the in-memory decision engine cache on startup.

### Q12: Does the next signal consume the learning?
**Yes.** `SignalIntelligenceService.evaluateCandidateSetup()` queries `postMortemReviews` and evaluates historical losses/wins.

### Q13: Can learning influence confidence?
**Yes.** Loss records apply a negative `learningAdjustment` (-6 to -35 points) to `finalScore`.

### Q14: Can learning influence confirmation requirements?
**Yes.** Loss lessons inject `confirmationRequirements` requiring structural retests before entry.

### Q15: Can learning influence SL/risk?
**Yes.** Experiencing a historical loss on the symbol expands the protective Stop Loss buffer multiplier from `1.4x` to `1.8x` ATR.

### Q16: Can learning veto recurring failure patterns?
**Yes.** When >= 3 recurring losses are detected with high loss ratio, `isVetoed = true`, triggering `action: "VETO"` and nullifying entry levels.

### Q17: Are learning rules scoped appropriately?
**Partially Scoped (Gap Identified).** In Phase 6B, filtering was based solely on `pm.pair === pair`. Phase 6C must refine this to setup-level fingerprinting (`pair + setupType + marketRegime + direction`) to prevent cross-setup poisoning.

### Q18: Can shadow records contaminate authoritative trade history?
**No.** Shadow positions carry `provenanceSource = "AI_SHADOW"` and are maintained in isolated shadow ledgers.

### Q19: Can shadow execution reach cTrader?
**No.** All broker order pathways are guarded by `ExecutionSafetyGate.validateExecutionEnvironmentSafety()` and `READ_ONLY_MODE_ENFORCED = true`. No broker orders are transmitted.

### Q20: Is the current 7-stage workflow pipeline driven by real state or static labels?
**Gap Identified.** In `UserDashboard.tsx:920-1010`, Stages 04, 05, 06, and 07 used static fallback labels (`CURRENT ?`, `REQUIRED ??`, `ACTIVE PAPER ??`, `ACCUMULATING ??`) rather than deriving status from `aiOpportunity.action`, active shadow position count, and learning state.

---

## 2. REQUIRED IMPLEMENTATION ACTIONS FOR PHASE 6C

1. **Refine Setup-Level Fingerprinting in `SignalIntelligenceService`:**
   Filter post-mortem reviews by composite key `(pair, setupType, marketRegime, direction)`. Ensure a failure in `AUD/USD + ORDER_BLOCK_RETEST + BEARISH` does NOT veto `AUD/USD + MOMENTUM_CONTINUATION + BULLISH` or `XAU/USD`.
2. **Dynamic Workflow Pipeline State Engine in `UserDashboard.tsx`:**
   Derive workflow stages dynamically from live runtime state:
   - Stage 01 (Market Data): `COMPLETE` if valid feed; `BLOCKED` if stale/empty.
   - Stage 02 (Tech Analysis): `COMPLETE` if indicators present; `WAITING` if loading.
   - Stage 03 (AI Analysis): `COMPLETE` if decision rendered; `ANALYZING` if in-flight.
   - Stage 04 (Opportunity Review): `VALID OPPORTUNITY` if BUY/SELL; `NO VERIFIED OPPORTUNITY` if NO_SETUP; `WAITING FOR CONFIRMATION` if WAIT; `SIGNAL VETOED` if VETO.
   - Stage 05 (Human Review): `REQUIRED` for manual execution of VALID signal; `NOT_REQUIRED` for NO_SETUP/WAIT/VETO/SHADOW.
   - Stage 06 (Shadow Observation): `ACTIVE` if open shadow positions > 0; `READY` if valid signal pending; `IDLE` if no shadow positions.
   - Stage 07 (Learning): `ACTIVE` if processing trade close; `UPDATED` if lessons rehydrated/persisted; `IDLE` if awaiting new trades.
3. **Comprehensive Closed-Loop Integration Test Suite:**
   Create `tests/phase6c-closed-loop-learning.test.ts` covering all 38 scenarios.