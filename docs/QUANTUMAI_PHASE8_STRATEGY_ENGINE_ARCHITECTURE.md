# QUANTUMAI / IATI OS ? PHASE 8: STRATEGY ENGINE ARCHITECTURE
**Autonomous Strategy Selection, Market Regime Classification, Multi-Timeframe Evaluation & Canonical Signal Schema**

---

## 1. Executive Summary & Permanent Safety Baseline

This document defines the architecture of the QuantumAI / IATI OS Strategy Engine and Intelligence Layer.

```
========================================================================================
PERMANENT SAFETY BASELINE ENFORCED:
========================================================================================
READ_ONLY_MODE_ENFORCED      = true
EXECUTION_SAFETY_GATE        = BLOCKED
AUTOMATED_EXECUTION          = false
BROKER_EXECUTION             = false
LIVE_EXECUTION               = FORBIDDEN
BROKER_ORDERS_TRANSMITTED    = 0
POSITIONS_REMAINING          = 0
========================================================================================
```

---

## 2. End-to-End Intelligence Pipeline

$$\text{Market Data} \longrightarrow \text{Data Validation} \longrightarrow \text{Feature Engine} \longrightarrow \text{Market Regime} \longrightarrow \text{Multi-Timeframe Analysis} \longrightarrow \text{Strategy Evaluation} \longrightarrow \text{Signal Generation} \longrightarrow \text{Confidence Scoring} \longrightarrow \text{Risk Proposal} \longrightarrow \text{Signal Explanation} \longrightarrow \text{User Review} \longrightarrow \text{Manual Approval} \longrightarrow \text{Execution Request} \longrightarrow [\text{ExecutionSafetyGate} = \mathbf{BLOCKED}]$$

---

## 3. Market Regime Engine

The market regime engine deterministically classifies market structure into:
- **TRENDING**: Directional persistence ($ADX \ge 25, ATR \le 0.0020$).
- **HIGH_VOLATILITY**: Elevated price fluctuation ($ADX \ge 25, ATR > 0.0020$).
- **RANGING**: Mean-reverting consolidation ($ADX < 20, ATR \ge 0.0008$).
- **LOW_VOLATILITY**: Tight price compression ($ADX < 20, ATR < 0.0008$).
- **BREAKOUT**: Structural boundary expansion.
- **UNCERTAIN**: Incomplete candle series or non-finite inputs (fails closed to `NO_TRADE`).

---

## 4. Confidence & Explainability Models

- **Confidence Score**: Derived deterministically from weighted components:
  $$\text{Confidence} = 0.25 \times \text{Trend} + 0.25 \times \text{Momentum} + 0.15 \times \text{Volatility} + 0.15 \times \text{Structure} + 0.20 \times \text{Risk/Reward}$$
- **Explainability**: Every signal produces granular `whyReasons` (supporting evidence) and `whyNotReasons` (risk warnings and contradictions).
