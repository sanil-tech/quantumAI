# QUANTUMAI / IATI OS ? PHASE 6A FORENSIC AUDIT
## MANUAL TRADE MODE + SIGNAL QUALITY VALIDATION

### 1. Existing Architecture Overview
- **Decision Agent (`apps/decision-agent/src/services/aiDecisionEngine.ts`):**
  - Primary decision engine: `aiDecisionEngine.generateOpinion(body)`.
  - Produces multi-timeframe SMC analysis, technical indicators (RSI, ATR, EMAs, SuperTrend), entry min/max zone, SL, TP1, TP2, RR ratio, invalidation level, confidence score, and setup reasons.
  - Interlocks with `postMortemReviews` in-memory and PostgreSQL database (`post_mortem_reviews` table).
  - Employs deterministic adaptive SL rules (e.g. 1.8x ATR for loss-history symbols vs 1.4x baseline).
- **Execution & Safety Gate Layer (`apps/risk-governance/`, `apps/execution-router/`):**
  - Hard invariant: `READ_ONLY_MODE_ENFORCED = true`.
  - `ExecutionSafetyGate` and `authorizeExecution()` reject all automated order transmissions.
  - `Orders Transmitted = 0`.
- **Database Repository (`packages/database/src/repository.ts`):**
  - PostgreSQL schema includes `positions`, `trade_events`, `post_mortem_reviews`, `trade_learning_lessons`, `reconciliation_records`.
  - `savePostMortemReview()` and `getPostMortemReviews()` provide full persistence.
- **Market Data Pipeline (`/api/forex/candles`):**
  - Backed by Yahoo Finance with strict UTC timestamps and zero synthetic production fallback.
  - Fail-closed behavior on missing or unverified market data.

---

### 2. Reusable Components & Schemas
1. **`ManualTradeSignal` (`packages/core-types/src/index.ts`):**
   - Standardized schema for manual trade signals capturing signal ID, symbol, timeframe, direction, entry zone, invalidation level, SL, TP1, TP2, RR, market structure, technical evidence, adaptive learning evidence, and expiration window.
2. **`aiDecisionEngine.generateOpinion`:**
   - Fully reusable as the core signal engine.
3. **`LearningService` & `TradingRepository`:**
   - `learningService.processClosedTrade()` and `repo.savePostMortemReview()` handle post-mortems for closed manual trades.
4. **Market Data Feed:**
   - `/api/forex/candles` and `fetchRealCandleEnvelope()` provide authoritative live data.
5. **UI Components:**
   - `AiAnalysisCard.tsx`, `UserDashboard.tsx`, `ChartWidget.tsx`, `AdaptiveLearningModal.tsx`.

---

### 3. Missing Components Required for Phase 6
1. **Manual Trade Data Model:**
   - Clearly separated model: **AI Planned Setup** vs **User Actual Execution**.
   - Ensures AI original planned levels are never overwritten by user execution drift.
2. **User Manual Entry Flow (`[I ENTERED THIS TRADE]` Modal/Panel):**
   - User inputs actual entry price, position size, and entry timestamp.
   - Validates numerical validity and sanity against live market price and SL/TP bounds.
3. **Real Market Trade Monitoring & Exit Detector Engine:**
   - Monitors active manual trades against real Yahoo Finance candles.
   - Evaluates:
     - BUY: Current Price $le$ Stop Loss ($	o$ `STOP_LOSS_REACHED`), Current Price $ge$ TP1 / TP2 ($	o$ `TAKE_PROFIT_REACHED`), Invalidation level breach ($	o$ `INVALIDATED`).
     - SELL: Current Price $ge$ Stop Loss ($	o$ `STOP_LOSS_REACHED`), Current Price $le$ TP1 / TP2 ($	o$ `TAKE_PROFIT_REACHED`), Invalidation level breach ($	o$ `INVALIDATED`).
   - Dispatches non-executing visual alerts recommending user manual broker action.
4. **User Manual Exit Flow (`[I CLOSED THIS TRADE]` Modal/Panel):**
   - Allows user to record actual exit price and reason.
   - Computes realized PnL and Pips without fabricating broker confirmations.
   - Feeds outcome into Adaptive Learning pipeline with explicit source tag: `MANUAL_USER_REPORTED`.
5. **Historical Signal Quality Validation Harness:**
   - Runs backtesting on real historical candles without look-ahead bias to measure win rate, average R:R, expectancy, time-to-TP, time-to-SL, and breakdown by instrument/timeframe.

---

### 4. Safety Risks & Mitigation
- **Risk:** Automatic trade transmission or accidental socket logon.
  - **Mitigation:** `READ_ONLY_MODE_ENFORCED = true`, cTrader socket remains disconnected, `brokerExecution: false`, zero broker orders.
- **Risk:** Fabrication of market data or synthetic prices.
  - **Mitigation:** Zero Math.random in live price paths; fail-closed `MARKET_DATA_UNAVAILABLE` status.
- **Risk:** Conflation of manual user entries with broker-verified executions.
  - **Mitigation:** Strict schema separation: `executionMode: "MANUAL"`, `source: "MANUAL_USER_REPORTED"`, `brokerExecution: false`.

---

### 5. Files to be Modified / Created in Phase 6
- `src/server/services/manualSignalService.ts` (Extend with active trade monitoring and exit detection)
- `src/server/routes/decision.ts` (Add manual trade entry, monitoring, and exit routes)
- `src/components/AiAnalysisCard.tsx` (Add `[I ENTERED THIS TRADE]` and `[I CLOSED THIS TRADE]` triggers)
- `src/components/UserDashboard.tsx` (Add Manual Trade Desk & Active Trade Monitor widget)
- `tests/manual-signal-mode.test.ts` (Add comprehensive lifecycle & exit detection tests)
- `scripts/validate-historical-signals.ts` (Historical signal validation harness)
