# QUANTUMAI / IATI OS ? PHASE 8: MANUAL SIGNAL OPERATIONS
**User Review Workflow, Approval Separation, Shadow Mode Simulation & Expiration Policies**

---

## 1. User-Facing Manual Signal Operations

1. **Signal Generation**: Engine generates candidate proposal with regime, direction, entry, SL, TP, and confidence.
2. **User Review**: User inspects technical explainability and risk metrics on dashboard.
3. **Manual Approval**: User clicks Approve $\rightarrow$ Signal state transitions to `APPROVED`.
4. **Execution Safety Boundary**: Approval does NOT equal execution. Order dispatch reaches `ExecutionSafetyGate` and remains **BLOCKED BY DEFAULT**.

---

## 2. Shadow Execution Mode

Shadow mode tracks simulated performance:
- Simulated Entry, Stop Loss, Take Profit.
- Real-time PnL, Maximum Favorable Excursion (MFE), Maximum Adverse Excursion (MAE).
- Zero transmission to cTrader Open API gateway.
