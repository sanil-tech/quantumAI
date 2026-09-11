# QUANTUMAI / IATI OS ? PHASE 44: OPERATIONAL RUNBOOK
**Standard Operating Procedures, Diagnostics, Incident Remediation & Recovery**

---

## 1. Quick Operator Checklist
1. **Verify Runtime Status:** Confirm `systemStatus = RUNNING` and `safetyStatus = FAIL_CLOSED_LOCKED`.
2. **Verify Broker Orders:** Confirm `brokerOrdersTransmitted = 0` and `livePositions = 0`.
3. **Verify Economic Calendar:** Confirm active high-impact events intercept signals fail-closed.
4. **Verify Health Domains:** Confirm 24/24 health domains report `HEALTHY`.

## 2. Incident Recovery Procedures
- **Stale Market Data:** Re-establish TLS 1.3 session; system holds positions in shadow mode without new orders.
- **High-Impact News:** Automatic `NO_TRADE` filter active $pm 30	ext{ mins}$ around release.
- **Risk Budget Exceeded:** Reservation ledger rejects new orders fail-closed.
