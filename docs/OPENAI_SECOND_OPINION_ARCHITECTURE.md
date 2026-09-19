# Phase 1 — OpenAI Independent Second Opinion Shadow Layer Architecture

## 1. Purpose & Scope
The **OpenAI Independent Second Opinion Shadow Layer** provides an independent, objective second-opinion evaluation for candidate trade setups generated within the QuantumAI IATI OS platform.

### Strict Architectural Boundaries:
- **QuantumAI IATI OS Only**: This layer is strictly confined to the backend server and decision agent inside QuantumAI IATI OS.
- **Primary AI Engine**: Google Gemini remains the primary AI reasoning and signal generation engine.
- **Independent Advisory Role**: OpenAI functions strictly as an independent reviewer in **OBSERVATION shadow mode**.
- **No Execution Authority**: OpenAI is never given broker credentials, cTrader API access, or execution authority. It cannot call `placeOrder()`, modify orders, modify positions, or alter execution eligibility.

---

## 2. System Architecture & Layer Hierarchy

Execution decisions follow a strict multi-layer deterministic hierarchy:

```
[ LEVEL 1 ] Live Market Data Integrity & Feed Lineage (cTrader Spot Feed)
      ↓
[ LEVEL 2 ] SMC & Quantitative Indicator Engine (EMAs, SuperTrend, RSI, ADX, +DI/-DI)
      ↓
[ LEVEL 3 ] Primary QuantumAI Multi-Agent Decision Engine (Gemini & SMC Analysis)
      ↓
[ LEVEL 4 ] Deterministic Signal Validation Gate (Technical Consistency & SL/TP Geometry)
      ↓
[ LEVEL 5 ] OpenAI Independent Second Opinion (Shadow Observation Mode — ADVISORY ONLY)
      ↓
[ LEVEL 6 ] Deterministic Risk Governance & Economic Blackout Defense (±30m Window)
      ↓
[ LEVEL 7 ] Execution Eligibility Gate (Deterministic Invariants & Retracement Triggers)
      ↓
[ LEVEL 8 ] Broker Execution Adapter (cTrader OpenAPI Master & Copier Bridge)
```

---

## 3. Data Flow & Zero Confirmation Bias Prompting

To prevent confirmation bias, QuantumAI does not ask leading questions (e.g. *"QuantumAI says BUY with 85% confidence, do you agree?"*). Instead, the system supplies raw, objective market evidence:

```
Candidate Trade Setup
  ├── Pair & Timeframe (e.g. EUR/USD M15)
  ├── Planned Entry Geometry (Entry, Entry Zone, SL, TP1, TP2)
  ├── Quantitative Indicators (EMAs, RSI, ADX, DI+, DI-, SuperTrend, ATR)
  ├── Market Structure (SMC Order Blocks, FVGs, Liquidity Sweeps)
  └── Normalized Economic Calendar Context (Relevant currency events)
        ↓
OpenAI Independent Evaluator (Strict JSON Output)
  ├── review: PASS | REVIEW | REJECT | UNAVAILABLE
  ├── candidateDirectionSupported: boolean
  ├── independentBias: BULLISH | BEARISH | NEUTRAL
  ├── confidence: 0 - 100
  ├── agreement: AGREE | PARTIAL | DISAGREE
  ├── contradictionLevel: LOW | MEDIUM | HIGH
  ├── riskFlags: string[]
  ├── keyConcerns: string[]
  ├── economicRisk: LOW | MEDIUM | HIGH | UNKNOWN
  └── summary: string
```

---

## 4. Economic Context Handling

1. **Shared Economic Source**: Reuses `EconomicContextService` and `economicCalendarProvider` without maintaining duplicate scrapers.
2. **Relevance Mapping**: Filters and passes only events directly affecting base and quote currencies of the traded asset (e.g., EUR and USD for EUR/USD; USD for XAU/USD).
3. **Event Risk vs. Directional Speculation**: High-impact news releases do not automatically mean BUY or SELL. The model treats event timing risk as distinct from technical directional bias.
4. **Handling Missing Data**: If forecasts, previous values, or actuals are missing, they are treated strictly as `UNKNOWN`.
5. **Deterministic Blackout Priority**: If `blackoutActive === true`, the deterministic execution gate vetoes live orders regardless of any advisory AI opinion.

---

## 5. Failure Behavior & Fail-Closed Guarantees

If any of the following occur:
- `OPENAI_API_KEY` missing or unconfigured
- `OPENAI_SECOND_OPINION_MODEL` missing or blank
- `OPENAI_SECOND_OPINION_ENABLED !== 'true'`
- Network timeout (`OPENAI_SECOND_OPINION_TIMEOUT_MS`)
- HTTP 429 (Rate limit) or HTTP 500 (API outage)
- Malformed JSON output

The service fails closed gracefully and returns:
```json
{
  "review": "UNAVAILABLE",
  "candidateDirectionSupported": false,
  "independentBias": "NEUTRAL",
  "confidence": 0,
  "agreement": "DISAGREE",
  "contradictionLevel": "LOW",
  "riskFlags": ["OPENAI_SERVICE_UNAVAILABLE"],
  "economicRisk": "UNKNOWN"
}
```
An `UNAVAILABLE` review produces an advisory policy of `REVIEW` and **never halts, mutates, or crashes** the core trading engine.

---

## 6. Security & Credential Protection

- **Server-Side Only**: Environment variables (`OPENAI_API_KEY`, `OPENAI_SECOND_OPINION_MODEL`, etc.) are consumed strictly on the Node.js backend.
- **Zero Leakage**: API keys, bearer tokens, and broker secrets are never exposed to React clients, API responses, diagnostic logs, Telegram alerts, or database records.
- **Diagnostic Endpoint Protection**: The `/api/admin/second-opinion/review` diagnostic endpoint is protected by `adminAuthMiddleware` with constant-time API key verification.

---

## 7. Shadow Mode & Hypothetical Policy Evaluation

In Phase 1, `OPENAI_SECOND_OPINION_MODE=OBSERVATION`. The deterministic policy evaluator calculates a hypothetical decision:

| Review | Agreement | Contradiction | Economic Risk | Hypothetical Policy |
|---|---|---|---|---|
| `PASS` | `AGREE` | `LOW` | `LOW` / `MEDIUM` | **ALLOW** |
| `REVIEW` | `PARTIAL` | `MEDIUM` | `ANY` | **REVIEW** |
| `ANY` | `ANY` | `ANY` | `HIGH` | **REVIEW** |
| `REJECT` | `DISAGREE` | `HIGH` | `ANY` | **BLOCK** |
| `UNAVAILABLE` | `ANY` | `ANY` | `UNKNOWN` | **REVIEW** |

**Note**: In OBSERVATION mode, the hypothetical decision is logged to the in-memory audit ledger and does not alter live execution.

---

## 8. Audit Record Schema & Idempotency

Every review is recorded in an in-memory audit ledger indexed by `signalId`. Duplicate calls for the same `signalId` return the cached audit record without generating duplicate API requests or broker actions.

Audit Record Fields:
```ts
interface SecondOpinionAuditRecord {
  signalId: string;
  pair: string;
  timeframe: string;
  candidateDirection: "BUY" | "SELL" | "NEUTRAL";
  candidateConfidence: number;
  independentBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  independentConfidence: number;
  agreement: "AGREE" | "PARTIAL" | "DISAGREE";
  contradictionLevel: "LOW" | "MEDIUM" | "HIGH";
  review: "PASS" | "REVIEW" | "REJECT" | "UNAVAILABLE";
  economicRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  riskFlags: string[];
  keyConcerns: string[];
  entry?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  executionEligibilityAtReview: string;
  model: string;
  latencyMs: number;
  reviewedAt: string;
}
```

---

## 9. Verification & Safety Assurance

All audited order-execution paths are protected by the deterministic execution controls and regression coverage currently implemented.

### Test Coverage (`tests/second-opinion-service.test.ts`):
- [x] AGREE $\to$ PASS review and ALLOW policy
- [x] PARTIAL $\to$ REVIEW review and REVIEW policy
- [x] DISAGREE + HIGH Contradiction $\to$ REJECT review and BLOCK policy
- [x] Service unconfigured / disabled $\to$ UNAVAILABLE
- [x] Malformed JSON response $\to$ UNAVAILABLE
- [x] 99% AI confidence cannot bypass DISAGREE / BLOCK policy
- [x] High economic impact events correctly flag `economicRisk = HIGH`
- [x] High event risk does not force directional speculation
- [x] Absent calendar numbers represented as `UNKNOWN` / `null`
- [x] `WAITING_FOR_ENTRY` state preserved independently of second opinion
- [x] `BLOCKED` state preserved independently of second opinion
- [x] Invariant assertion throws on illegal execution calls
- [x] Absence of broker execution methods on second opinion service
- [x] Pullback signals cannot become market orders
- [x] Zero secret leakage in logs and audit records
- [x] Idempotency preventing duplicate executions for the same `signalId`
- [x] Synthetic data lineage identified and flagged
- [x] TradeProposal execution authority preserved

---

## 10. Future Rollout Stages

1. **Phase 1 (Current)**: **OBSERVE $\to$ RECORD $\to$ COMPARE $\to$ LEARN** (Shadow observation layer, 0 execution impact).
2. **Phase 2**: **Advisory Telemetry Dashboard** (Expose shadow audit reports to admin UI for accuracy benchmarking vs. Gemini).
3. **Phase 3**: **Selective Veto Gate** (Enable deterministic policy gating only after extensive shadow sample validation and statistical threshold confirmation).
