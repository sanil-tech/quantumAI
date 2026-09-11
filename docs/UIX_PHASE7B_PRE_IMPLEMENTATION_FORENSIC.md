# QUANTUMAI / IATI OS ? PHASE 7B PRE-IMPLEMENTATION FORENSIC AUDIT
## Shadow Performance & Adaptive Learning Effectiveness Telemetry Audit

**Date:** 2026-08-19
**Repository Root:** `C:/Users/sanil/OneDrive/Desktop/studyquest-ai-1/quantumAI`
**Branch:** `agent/ctrader-oauth-diagnostic`
**HEAD Commit:** `75d9aad`
**Audit Mode:** READ-ONLY FORENSIC AUDIT

---

## 1. TELEMETRY FIELD AUDIT MATRIX (1?19)

| Metric / Field | Status | Current Source / Implementation | Missing / Required Enhancements |
|---|---|---|---|
| **1. Signal Decision** | **PRESENT** | `AiTradeOpportunity.action`, `status` in `src/types.ts` | Complete (5 states: `BUY`, `SELL`, `NO_SETUP`, `WAIT`, `VETO`) |
| **2. Setup Type** | **PRESENT** | `AiTradeOpportunity.setupType` | `ORDER_BLOCK_RETEST`, `FAIR_VALUE_GAP_FILL`, etc. |
| **3. Symbol / Pair** | **PRESENT** | `AiTradeOpportunity.pair` | Canonical currency pair |
| **4. Timeframe** | **PRESENT** | `AiTradeOpportunity.timeframe` | Evaluated timeframe (e.g. `M15`) |
| **5. Market Regime** | **PRESENT** | `AiTradeOpportunity.marketRegime` | `TRENDING_BULLISH`, `RANGING_CHOPPY`, etc. |
| **6. Learning Adjustment** | **PRESENT** | `confidenceBreakdown.learningAdjustment` | Signed integer (-35 to +5) |
| **7. Learning Rule IDs** | **PRESENT** | `AiTradeOpportunity.learningRuleIds` | Array of cited `pm-*` rule IDs |
| **8. Entry Zone** | **PRESENT** | `AiTradeOpportunity.entryZone` | `{ min, max }` or `null` |
| **9. Stop Loss (SL)** | **PRESENT** | `AiTradeOpportunity.stopLoss` | Numeric level or `null` |
| **10. Take Profit 1 (TP1)** | **PRESENT** | `AiTradeOpportunity.takeProfit1` | Numeric level or `null` |
| **11. Take Profit 2 (TP2)** | **PRESENT** | `AiTradeOpportunity.takeProfit2` | Numeric level or `null` |
| **12. Shadow Entry Time** | **PARTIAL** | Position `openedAt` in memory/DB | Needs canonical field in `ShadowPerformanceRecord` |
| **13. Shadow Close Time** | **PARTIAL** | Position `closedAt` in memory/DB | Needs canonical field in `ShadowPerformanceRecord` |
| **14. Shadow Outcome** | **PRESENT** | Position `outcome` / `PostMortemReview.outcome` | `WIN`, `LOSS`, `BREAKEVEN` |
| **15. MFE (Max Favorable Excursion)** | **MISSING** | Not recorded in position tracking | Compute `MFE = maxPriceReached` during position holding |
| **16. MAE (Max Adverse Excursion)** | **MISSING** | Not recorded in position tracking | Compute `MAE = adversePriceReached` during position holding |
| **17. Realized R Multiple** | **PARTIAL** | PnL pips recorded, but not normalized to initial R risk | Add `realizedR = (exit - entry) / (entry - SL)` |
| **18. Post-Mortem Record** | **PRESENT** | `PostMortemReview` in PostgreSQL | Structured root cause, rule, rating |
| **19. Learning Version** | **PRESENT** | `learningVersion` (e.g. `1.0`) | Versioned in DB and reviews |

---

## 2. COHORT CLASSIFICATION CAPABILITY

- **Baseline Cohort:** Signals where `learningAdjustment === 0` and no historical learning rule modified the candidate.
- **Learning-Affected Cohort:** Signals where `learningAdjustment !== 0` or defensive Stop Loss buffer was widened or a capital-preservation VETO occurred.
- **Requirement:** Provide a dedicated service (`ShadowAnalyticsService`) to compute comparative performance metrics (win rate, average R, expectancy, drawdown) between Baseline vs. Learning-Affected cohorts without generating synthetic mock trades.

---

## 3. SAMPLE SIZE & STATISTICAL EVIDENCE TIERS

| Sample Size ($N$) | Evidence Classification | Statistical Interpretation |
|---|---|---|
| $N < 5$ | `INSUFFICIENT_SAMPLE` | No statistical conclusion allowed; observational only |
| $5 le N le 14$ | `EARLY_SIGNAL` | Preliminary observational signal; high variance |
| $15 le N le 29$ | `PRELIMINARY` | Emerging pattern; moderate confidence |
| $30 le N le 99$ | `MEANINGFUL_SAMPLE` | Statistically meaningful sample for setup evaluation |
| $N ge 100$ | `STRONGER_EVIDENCE` | Robust evidence for strategy refinement / live readiness |

---

## 4. SAFETY INVARIANTS STATUS

```
READ_ONLY_MODE_ENFORCED              = true
LIVE_EXECUTION                       = FORBIDDEN
BROKER_EXECUTION                     = DISABLED
AUTOMATED_EXECUTION                  = false
EXECUTION_SAFETY_GATE                = BLOCKED
BROKER_EXECUTION_PATHS               = 0
BROKER_ORDERS_TRANSMITTED            = 0
LIVE_POSITIONS                       = 0
AUTHORITATIVE_BROKER_POSITIONS       = 0
```