# QUANTUMAI / IATI OS ? SHADOW EVIDENCE PROVENANCE AUDIT
**Forensic Lineage Audit of Entry 001, Dataset Source Demarcation & Evidence Classification**

---

## 1. Executive Summary & Permanent Safety Baseline
This audit establishes the rigorous mathematical and data provenance of Entry 001 in `docs/QUANTUMAI_SHADOW_OBSERVATION_LOG.md`.

```
========================================================================================
SAFETY BASELINE ENFORCED:
========================================================================================
READ_ONLY_MODE_ENFORCED      = true
EXECUTION_SAFETY_GATE        = BLOCKED
AUTOMATED_EXECUTION          = false
BROKER_EXECUTION             = false
LIVE_EXECUTION               = FORBIDDEN
BROKER_EXECUTION_PATHS       = 0
BROKER_ORDERS_TRANSMITTED    = 0
LIVE_POSITIONS               = 0
SECRET_EXPOSURE              = NONE
LIVE_PILOT_ACTIVE            = false
========================================================================================
```

---

## 2. Forensic Data Lineage & Provenance Trace

| Subsystem Level | Data Type / Origin | Provenance Classification | Lineage Evidence |
|---|---|---|---|
| **Market Data Layer** | Simulated Tick Sequence based on EURUSD/GBPUSD/USDJPY/XAUUSD | `SIMULATED_CERTIFICATION_DATA` | Generated during Phase 47 certification script (`scripts/phase47-longitudinal-evidence-accumulation.ts`). |
| **Indicators & MTF** | Deterministic Formula Evaluation | `VERIFIED_ALGORITHM` | Formulas (EMA, RSI, ATR) audited and mathematically verified. |
| **Economic Context** | Hard-coded/Configured Macro Events | `CACHED_CONTEXT` | Evaluated via `EconomicContextService` ($pm 30	ext{m}$ filter). |
| **Strategy & Signal** | `ALPHA-ORCHESTRATOR-v1.4.0` with `whyReasons` | `VERIFIED_ALGORITHM` | Produces discrete `BUY`, `SELL`, or `NO_TRADE` states. |
| **Risk Gate** | 2% Single Trade / 5% Portfolio Limit | `VERIFIED_ALGORITHM` | `PortfolioRiskEngine` enforces allocation bounds. |
| **Shadow Execution** | 100% Paper Execution Simulator | `SIMULATED_EXECUTION` | 0 broker orders transmitted; simulated positions only. |
| **P&L & Friction Accounting**| Spread ($10) + Slippage ($5) per trade | `ESTIMATED_COST_ACCOUNTING` | Gross: $2,250.00 | Costs: $450.00 | Net: $1,800.00. |
| **Aggregation Ledger** | `Phase47LongitudinalEvidenceService` | `VERIFIED_AGGREGATION` | Reconstructs identical SHA-256 hash (`3025a7c5...`). |

---

## 3. Critical Findings & Statistical Honesty
1. **Source Identification:** Entry 001 was produced by `scripts/phase47-longitudinal-evidence-accumulation.ts` as a deterministic calibration dataset to verify multi-period rollup, regime segregation, and cost drag logic.
2. **Real Market Separation:** While the cTrader ProtoOA TLS 1.3 tick listener is connected and capable of real-time market data processing, Entry 001 is a **harness-generated calibration sample** used for algorithm verification rather than continuous multi-week live real-time shadow capture.
3. **Classification:** In accordance with institutional transparency standards, the dataset is classified as **`PARTIALLY_VERIFIED`** (Mathematical algorithms and evidence hashing are verified; historical origin is certification-harness derived).

---

## 4. Final Provenance Decision
- **EVIDENCE_PROVENANCE:** `PARTIALLY_VERIFIED`
- **FINAL_DECISION:** `CONTINUE_SHADOW_WITH_EVIDENCE_LIMITATION`
- **ACTION:** Allow the running live server (`realMarketShadowObservationService`) to passively record real-time tick observations into Entry 002+ during actual market hours without resetting or fabricating historical data.
