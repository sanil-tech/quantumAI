# QUANTUMAI / IATI OS ? PHASE 6A-FORENSIC
# ADAPTIVE LEARNING ? AI SIGNAL DECISION INTEGRATION AUDIT

**Date:** 2026-08-19  
**Repository Root:** `C:/Users/sanil/OneDrive/Desktop/studyquest-ai-1/quantumAI`  
**Branch:** `agent/ctrader-oauth-diagnostic`  
**HEAD Commit:** `75d9aad`  
**Audit Classification:** READ-ONLY FORENSIC AUDIT (ZERO SOURCE / DATABASE / BROKER MODIFICATIONS)

---

## 1. EXECUTIVE SUMMARY

A specialized read-only forensic audit was performed on the QuantumAI / IATI OS codebase to determine the exact functional relationship between the **Adaptive Learning System** and **AI Signal Decision Generation**.

### Core Findings:
1. **Downstream Parameter Adjustment Only (Not Signal Validation):**
   In the current implementation, Adaptive Learning **does NOT participate in validating whether a market setup is a valid trade opportunity**.
   The pipeline strictly follows:
   ```
   MARKET DATA ? INDICATORS ? FORCED BUY/SELL ? ADAPTIVE SL EXPANSION
   ```
2. **Sole Mathematical Effect in Deterministic Mode (`aiDecisionEngine.ts:217-235`):**
   When a closed trade post-mortem review with `outcome === 'LOSS'` exists for a symbol, the engine's **only mathematical adaptation is expanding the Stop Loss ATR multiplier from 1.4x to 1.8x**.
3. **No Filtering, Veto, or NO_SETUP Capability:**
   Adaptive Learning cannot reject a trade signal, cannot reduce position score to zero, cannot veto an entry direction, and cannot emit a `NO_SETUP` / `WAIT` state.
4. **LLM Context Injection in Gemini Mode (`aiDecisionEngine.ts:76-80`):**
   In the Gemini 1.5 Flash path, the last 5 post-mortem lessons are serialized into the user/system prompt as natural language text (`ADAPTIVE AI MEMORY - PAST TRADE LOSS LESSONS`), advising the LLM not to repeat past execution errors. However, due to schema constraints, the LLM cannot emit a structured `NO_SETUP` output.
5. **Robust Persistence & Rehydration (`learningService.ts` & `server.ts:54, 466`):**
   Post-mortem lessons are durably saved to the PostgreSQL table `post_mortem_reviews` and reliably rehydrated into `aiDecisionEngine` on server startup.

---

## 2. COMPLETE DATA FLOW & LIFECYCLE

### A. Closed Trade ? Adaptive Learning Persistence Lifecycle
```
1. Trade Closes (Manual Exit / Stop Loss Hit / TP Reached)
      ?
2. Global Event Bus dispatches: EventTypes.TradeClosed (src/server/services/learningService.ts:33)
      ?
3. learningService.processClosedTrade(payload, userNotes)
      ?
4. Idempotency Check against PostgreSQL (tradeId, learningVersion)
      ?
5. aiDecisionEngine.createPostMortemFromCanonicalData()
      - Evaluates Root Cause (En / Ms)
      - Formulates Lesson Learned (En / Ms)
      - Generates Adaptive Rule (En / Ms) (e.g. "Expand Stop Loss buffer to 1.8x ATR")
      ?
6. TradingRepository.savePostMortemReview() ? INSERT into post_mortem_reviews (PostgreSQL)
      ?
7. TradingRepository.saveTradeEvent('TRADE_LEARNING_CREATED')
      ?
8. In-Memory Cache Updated: aiDecisionEngine.addPostMortemReview(savedRecord)
```

### B. Startup Rehydration Lifecycle
```
1. Server Boot (server.ts:54 & server.ts:466)
      ?
2. learningService.loadPersistedLearning()
      ?
3. TradingRepository.getPostMortemReviews(100) / rehydrateTradingState('DEFAULT')
      ?
4. SELECT * FROM post_mortem_reviews ORDER BY created_at DESC
      ?
5. aiDecisionEngine.setPostMortemReviews(persistedReviews)
```

### C. Live Market Data ? AI Opinion Generation Lifecycle
```
1. User Selects Pair (e.g. EUR/USD) in Client Dashboard (src/App.tsx)
      ?
2. POST /api/forex/ai-opinion { pair, currentPrice, indicators, smc, ... }
      ?
3. src/server/routes/decision.ts -> aiDecisionEngine.generateOpinion(body)
      ?
4. Query in-memory postMortemReviews for matching symbol:
   const symbolLossReviews = postMortemReviews.filter(pm => pm.pair === pair && pm.outcome === 'LOSS');
      ?
5. Multiplier Assignment:
   hasLossHistory ? slMultiplier = 1.8 : slMultiplier = 1.4
      ?
6. Calculation:
   sl = priceNum ? (atr * slMultiplier)
      ?
7. TradeProposal constructed with evidence string:
   "[ADAPTIVE LEARNING MEMORY] Applied rule from pm-...: Expand SL buffer to 1.8x ATR"
      ?
8. UI renders TradeProposal in AiAnalysisCard.tsx with expanded SL and evidence tag
```

---

## 3. ANSWERS TO SPECIFIC AUDIT QUESTIONS

### 1. What exactly does Adaptive Learning learn?
It learns post-mortem attributes from closed trades:
- `rootCauseEn` / `rootCauseMs` (e.g. "Premature stop out from standard tight SL buffer during volatility surge")
- `lessonLearnedEn` / `lessonLearnedMs` (e.g. "Expand SL buffer to 1.8x ATR for EUR/USD")
- `adaptiveRuleEn` / `adaptiveRuleMs` (e.g. "Expand Stop Loss buffer to 1.8x ATR for EUR/USD setups")
- `ratingScore` (quantitative review score 0-100)
- Execution provenance: `strategyId`, `strategyVersion`, `learningVersion`, `pnlDollars`, `pnlPips`, `outcome` (`WIN` / `LOSS`).

### 2. What exact database records represent learned knowledge?
Records in the `post_mortem_reviews` PostgreSQL table.

### 3. Which PostgreSQL tables contain the learned state?
- **Primary Table:** `post_mortem_reviews` (schema defined in `packages/database/src/schema.ts:215-227`).
- **Audit Table:** `trade_events` (records `eventType: 'TRADE_LEARNING_CREATED'`).

### 4. Which service writes learned rules?
`LearningService` (`src/server/services/learningService.ts:133-145`) via `TradingRepository.savePostMortemReview()`.

### 5. Which service reads learned rules?
- `LearningService.loadPersistedLearning()` (`src/server/services/learningService.ts:47`)
- `TradingRepository.rehydrateTradingState()` (`packages/database/src/repository.ts:964`)
- `aiDecisionEngine` reads them via `postMortemReviews` cache.

### 6. Where are learned rules rehydrated after application restart?
1. `server.ts:54`: `learningService.loadPersistedLearning()` executes on startup.
2. `server.ts:466`: `tradingRepo.rehydrateTradingState('DEFAULT')` calls `aiDecisionEngine.setPostMortemReviews(rehydrated.postMortemReviews)`.

### 7. Is the learned state actually available inside `aiDecisionEngine.generateOpinion()`?
**YES.**
- In the Gemini path (`aiDecisionEngine.ts:76-80`), `recentLessonsText` formats the last 5 lessons into the prompt.
- In the deterministic fallback (`aiDecisionEngine.ts:217-220`), `symbolLossReviews` filters matching symbol loss reviews.

### 8. Does Adaptive Learning currently influence:
| Decision Attribute | Influenced? | Forensic Details |
|---|---|---|
| **a. BUY/SELL direction** | **NO** | Binary logic: `rsi >= 48 && priceNum >= ema50 ? 'BUY' : 'SELL'`. |
| **b. NO_SETUP decision** | **NO** | Fallback has no `NO_SETUP` branch. |
| **c. Confidence score** | **NO** | Formula: `70 + (pairHash % 19) + (Math.abs(rsi - 50) * 0.5)`. |
| **d. Entry Zone** | **NO** | Formula: `priceNum ? (atr * 0.1 / 0.2)`. |
| **e. Stop Loss** | **YES** | Multiplier changes from `1.4x` to `1.8x` ATR on loss history. |
| **f. Take Profit** | **NO** | Fixed at `priceNum ? (atr * 2.1)` and `priceNum ? (atr * 3.8)`. |
| **g. ATR Multiplier** | **YES** | `slMultiplier = hasLossHistory ? 1.8 : 1.4`. |
| **h. Strategy Selection** | **NO** | Hardcoded to `SMC_QUANT_V1` / `SMC_QUANT_V2`. |
| **i. Risk Classification** | **NO** | Handled downstream by `PortfolioRiskEngine` / `RiskGovernanceEngine`. |

### 9. Can an Adaptive Learning rule currently REJECT a signal?
**NO.** There is no conditional rejection or filter in `aiDecisionEngine.ts`.

### 10. Can an Adaptive Learning rule force NO_SETUP?
**NO.**

### 11. Can an Adaptive Learning rule merely modify SL?
**YES.** In deterministic mode, modifying the Stop Loss buffer (`1.4x` -> `1.8x` ATR) is its sole mathematical consequence.

### 12. If no learning history exists, what happens?
The baseline `slMultiplier = 1.4` is applied, and no `[ADAPTIVE LEARNING MEMORY]` reason is added.

### 13. If learning history exists, exactly what changes?
- If the symbol has at least one `LOSS` post-mortem review: `slMultiplier` expands to `1.8`, invalidation level widens by `0.1 * ATR`, and an evidence string citing the lesson ID and rule text is prepended to `tradeProposal.evidence`.
- If the symbol only has `WIN` reviews: No parameters are altered (`slMultiplier` remains `1.4`).

### 14. Is learning global or scoped?
- **Scoped strictly by symbol** (`pm.pair === pair || pm.symbol === pair`).
- It is **not** scoped by timeframe (M15 vs H1), setup type (OB vs FVG), or market regime (trending vs ranging).

### 15. Can learned rules conflict with technical indicators?
No direct conflict is possible in the current code because indicators determine Direction (`BUY`/`SELL`), while learning only expands the defensive SL distance.

### 16. If they conflict, which source wins?
Technical indicators unconditionally dictate the trade direction; learned rules cannot override or alter the indicator-driven direction.

### 17. Is there a priority hierarchy?
1. **Indicator Direction Engine** (Calculates BUY vs SELL based on RSI/EMA)
2. **Adaptive Memory Buffer** (Calculates defensive SL distance based on loss memory)
3. **Fixed Ratio Projections** (Calculates TP1 and TP2 based on fixed ATR multiples)

---

## 4. CRITICAL ARCHITECTURAL COMPARISON

### Observed Architecture (Code Reality):
```
MARKET DATA
    ?
INDICATORS (RSI / EMA)
    ?
FORCED BUY/SELL (Binary Choice)
    ?
ADAPTIVE SL ADJUSTMENT (1.4x -> 1.8x ATR)
    ?
TRADE PROPOSAL (Always non-null)
```

### Intended Future Architecture (Target Model):
```
MARKET DATA VALIDATION
    ?
TECHNICAL / SMC / MTF CONFLUENCE EVALUATION
    ?
OBJECTIVE SETUP EXISTS?
??? NO  ? NO_VALID_OPPORTUNITY (entryZone = null)
??? YES ? ADAPTIVE LEARNING EVALUATION
              ??? Evaluate Historical Loss Patterns for Setup Class
              ??? High Risk Pattern? ? VETO / NO_SETUP
              ??? Acceptable Setup   ? Adjust Confidence, Adjust SL Buffer, Adjust Entry Zone
                    ?
             FINAL SIGNAL VALIDATION & PROPOSAL
                    ?
             DUAL-CONTROL HUMAN REVIEW
```

---

## 5. TEST COVERAGE AUDIT

| Test File | Tests Run | What It Proves | What It Does NOT Prove |
|---|---|---|---|
| `tests/production-adaptive-learning-e2e.test.ts` | 4 tests | Proves SL buffer widens from 1.08220 (1.4x) to 1.08140 (1.8x) via `/api/forex/ai-opinion` when loss history exists; proves symbol isolation and restart survival. | Does NOT prove that learning can reject a signal or decide whether a setup is valid. |
| `tests/adaptive-learning-lifecycle.test.ts` | 5 tests | Proves memory loading, deterministic calculation adaptation, pair isolation, and engine reload. | Does NOT test signal rejection, confluence gating, or `NO_SETUP` conditions. |
| `tests/adaptive-learning-safety-guards.test.ts` | 3 tests | Proves that adaptive learning cannot override hard risk limits (2% cap) or bypass ExecutionSafetyGate. | Does NOT test pre-signal decision logic. |
| `tests/adaptive-learning-reality-check.test.ts` | 6 tests | Proves PostgreSQL table schema integrity, loss vs win lesson behavior, and in-memory cache sync. | Does NOT test market setup validation. |

---

## 6. SAFETY & GOVERNANCE BOUNDARIES

1. **Subordination to Risk Governance:**
   Adaptive Learning outputs are advisory proposals only. The downstream `RiskGovernanceEngine` and `ExecutionSafetyGate` retain absolute authority to block execution.
2. **Subordination to Real Market Data:**
   Adaptive Learning relies strictly on real candlestick inputs; it does not fabricate synthetic price feeds.
3. **Execution Safety:**
   Adaptive Learning has **zero execution paths** and cannot transmit broker orders (`BROKER_EXECUTION_PATHS = 0`).

---

## 7. DEFINITIVE CONCLUSION

### Question:
> *"Does QuantumAI's existing Adaptive Learning system currently participate in deciding whether a NEW market setup is a valid BUY/SELL opportunity?"*

### Definitive Answer:
**NO.**

### Precise Rationale:
In the current codebase, the decision of whether to issue a `BUY` or `SELL` opportunity is **100% determined by a hardcoded indicator ternary** (`rsi >= 48 && priceNum >= ema50`). 

Adaptive Learning is invoked **only after** the trade direction has already been determined, and its role is strictly limited to:
1. Expanding the defensive Stop Loss distance (`1.4x ATR` to `1.8x ATR`) if a prior loss lesson exists for that symbol.
2. Attaching an advisory explanation string to the proposal's evidence list.
3. Supplying historical text context to the Gemini LLM prompt.

Adaptive Learning currently **cannot reject, filter, invalidate, or veto a setup**, nor can it emit a `NO_SETUP` or `WAIT_FOR_CONFIRMATION` state.

---

## 8. CONFIRMATION OF ZERO MODIFICATIONS

```
========================================================================================
READ-ONLY FORENSIC AUDIT FINAL VERIFICATION
========================================================================================
SOURCE_FILES_CHANGED                 = 0
TEST_FILES_CHANGED                   = 0
DATABASE_RECORDS_CHANGED             = 0
BROKER_ORDERS_SENT                   = 0
LIVE_POSITIONS_CREATED               = 0
SAFETY_GATES_CHANGED                 = 0
REPORT_GENERATED                     = docs/UIX_PHASE6A_ADAPTIVE_LEARNING_INTEGRATION_FORENSIC.md
AUDIT_STATUS                         = COMPLETE (READ-ONLY)
========================================================================================
```
