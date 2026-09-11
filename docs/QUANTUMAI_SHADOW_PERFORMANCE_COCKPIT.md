# QUANTUMAI / IATI OS ? SHADOW PERFORMANCE & OPERATOR COCKPIT
**Operator-Facing Cockpit Architecture, Authoritative Data Mapping & Steady-State Shadow Monitoring**

---

## 1. Executive Summary & Architecture Overview
The **Shadow Performance & Operator Cockpit** (`src/components/ShadowPerformanceCockpit.tsx`) is an operator-facing workstation interface synthesizing all 11 core surveillance health domains into a single unified cockpit.

```
========================================================================================
COCKPIT OPERATING BASELINE & SAFETY INVARIANTS:
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

## 2. Core Cockpit Functional Modules

| Cockpit Section | Authoritative Backend Source | Functionality & Operator Value |
|---|---|---|
| **Safety Header Matrix** | `executionSafetyGate.ts` | Visually prominent assertion of `READ_ONLY`, `GATE_BLOCKED`, and 0 live positions. |
| **System Health Grid** | `shadowProductionRuntimeService.ts` | Real-time surveillance across 11 health domains (`HEALTHY`, `WATCH`, `DEGRADED`). |
| **Market & Signal State** | `alphaOrchestrator.ts` | Real-time tick quotes, multi-timeframe alignment, and `whyReasons` / `whyNotReasons`. |
| **Economic & Risk Governance**| `economicContextService.ts` / `portfolioRiskEngine.ts` | $pm 30	ext{m}$ high-impact news filter and 2% trade / 5% portfolio risk utilization bar. |
| **Active Shadow Positions** | `shadowExecutionEngine.ts` | 100% simulated paper positions with real-time gross P&L, spread, slippage, and net P&L. |
| **Performance Analytics** | `statisticalEvidenceAuditService.ts` | Win rate, gross/net P&L, profit factor, max drawdown, and safe read-only period filtering. |
| **Evidence & Incident Log**| `steadyStateObservationLedgerService.ts` | SHA-256 hash verification, zero drift confirmation, and active incident log. |

---

## 3. UI Truthfulness & Data Lineage Mapping
1. **Real Market Data:** Real-time cTrader ProtoOA TLS 1.3 tick feed labeled as `REAL READ-ONLY TICK FEED`.
2. **Shadow Execution:** All orders, positions, and balances are explicitly demarcated as `DEMO (Paper)` and `SHADOW SIMULATION`.
3. **Execution Boundary:** All actions in the cockpit are 100% read-only with zero ability to trigger broker transmissions.
