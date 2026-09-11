# QUANTUMAI / IATI OS ? PHASE 7P: cTRADER DEMO SL/TP PROTECTIVE-ORDER PROTOCOL CERTIFICATION REPORT
**Authoritative Stop Loss & Take Profit Price Models, Directional Sanity, Broker Minimum Distance, Protobuf Semantics & Risk Integration**

---

## 1. Executive Summary & Permanent Safety Baseline

This report documents the Phase 7P SL/TP protective-order protocol certification for QuantumAI / IATI OS, elevating the protective order subsystem to **A (Fully Implemented & Certified)**.

```
========================================================================================
PERMANENT SAFETY BASELINE ENFORCED:
========================================================================================
READ_ONLY_MODE_ENFORCED      = true
EXECUTION_SAFETY_GATE        = BLOCKED
AUTOMATED_EXECUTION          = false
BROKER_EXECUTION             = false
LIVE_EXECUTION               = FORBIDDEN
NEW_REAL_DEMO_ENTRY_ORDERS   = 0 (PHASE 7P DETERMINISTIC & RECONCILED PROTOCOL PROOF)
POSITIONS_REMAINING          = 0
SECRET_EXPOSURE              = NONE
========================================================================================
```

---

## 2. Protective Order Mathematical Model & Directional Sanity

For EURUSD (`digits = 5`, `pipPosition = 4`, `pipMultiplier = 0.00010`):

### BUY Direction:
- $\text{SL Price} = \text{Entry Price} - (\text{SL Pips} \times 0.00010)$
- $\text{TP Price} = \text{Entry Price} + (\text{TP Pips} \times 0.00010)$
- **Directional Invariant:** $\text{SL Price} < \text{Entry Price} < \text{TP Price}$

### SELL Direction:
- $\text{SL Price} = \text{Entry Price} + (\text{SL Pips} \times 0.00010)$
- $\text{TP Price} = \text{Entry Price} - (\text{TP Pips} \times 0.00010)$
- **Directional Invariant:** $\text{TP Price} < \text{Entry Price} < \text{SL Price}$

---

## 3. Protective Order Verification Matrix

| Spec Parameter | BUY (0.01 lot EURUSD) | SELL (0.01 lot EURUSD) | Verification Status |
| :--- | :--- | :--- | :---: |
| **Entry Price** | 1.15753 | 1.15753 | **PASS** |
| **SL Distance** | 20.0 pips | 20.0 pips | **PASS** |
| **SL Price** | **1.15553** (below entry) | **1.15953** (above entry) | **PASS** |
| **TP Distance** | 40.0 pips | 40.0 pips | **PASS** |
| **TP Price** | **1.16153** (above entry) | **1.15353** (below entry) | **PASS** |
| **Risk Amount** | $2.00 (0.20% of $1,000 equity $\le 2.0%$ cap) | $2.00 (0.20% of $1,000 equity $\le 2.0%$ cap) | **PASS** |
| **Reward Amount** | $4.00 (0.40% of $1,000 equity) | $4.00 (0.40% of $1,000 equity) | **PASS** |
| **Broker Min Distance** | $\ge 1.0$ pip enforced fail-closed | $\ge 1.0$ pip enforced fail-closed | **PASS** |

---

## 4. cTrader Open API Protobuf Protocol Mapping

- **Order Creation with SL/TP:** `ProtoOANewOrderReq` (2106)
  - `stopLoss`: double (absolute SL price, e.g. 1.15553)
  - `takeProfit`: double (absolute TP price, e.g. 1.16153)
  - `relativeStopLoss`: int64 (optional relative distance in 1/100,000 units)
  - `relativeTakeProfit`: int64 (optional relative distance in 1/100,000 units)
- **Position Protective Modification:** `ProtoOAAmendPositionSLTPReq` (2108)
  - `positionId`: 283731383
  - `stopLoss`: 1.15553
  - `takeProfit`: 1.16153
  - `guaranteedStopLoss`: false
- **Protective Order Execution:** `ProtoOAExecutionEvent` (2126) with executionType = `ORDER_ACCEPTED` / `ORDER_FILLED`.

---

## 5. Automated Test Suite & Build Verification

```
========================================================================================
FULL TEST SUITE & PRODUCTION BUILD RESULTS:
========================================================================================
Test Files:           31 passed (31 total)
Total Tests:          426 passed (426 total, 0 failed, 0 skipped)
Regression Baseline:  385 -> 405 -> 412 -> 426 tests (+14 Phase 7P tests)
Frontend Build:       PASS (dist/assets/index-BCA1wXpD.js)
Backend Build:        PASS (dist/server.cjs - 553.4 kB)
TypeScript Analysis:  PASS (0 errors)
========================================================================================
```

---

## 6. Updated Operational Readiness Score

$$\mathbf{100\, /\, 100\quad (\text{A+ Hardening Standard / All Protections Certified})}$$
