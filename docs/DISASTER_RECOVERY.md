# IATI OS / QuantumAI — Disaster Recovery Plan

## Status: CERTIFIED

---

## 1. Objective & Scope

This document specifies the disaster recovery procedures, failure mode handling, RTO/RPO metrics, and post-recovery state reconciliation protocols for **IATI OS / QuantumAI**.

---

## 2. Recovery Metrics

- **Recovery Time Objective (RTO)**: **< 120 seconds**
  - Process restart + database reconnection + automated position & order state reconciliation.
- **Recovery Point Objective (RPO)**: **0 seconds**
  - All trade proposals, risk tokens, execution commands, and position state transitions are written to durable PostgreSQL storage using transactional boundaries before broker dispatch.

---

## 3. Disaster Scenarios & Recovery Procedures

### Scenario A: Process / Container Crash
1. **Detection**: Container health check fails; container orchestrator terminates and replaces container.
2. **Startup Rehydration**: On boot, `TradingRepository.rehydrateTradingState()` loads active state from PostgreSQL.
3. **Lease Expiration**: Active command leases (`CLAIMED`) held by the crashed process expire after 30 seconds.
4. **Worker Recovery**: Secondary worker instance claims expired commands and initiates broker-first reconciliation prior to re-attempting execution.

### Scenario B: Database Outage / Intermittent Disconnect
1. **Behavior**: System marks `/api/health/readiness` as `NOT_READY` (HTTP 503). New trade executions fail closed.
2. **Database Return**: Upon database connectivity restoration, connection pool reconnects automatically.
3. **Pending Queue Processing**: `ExecutionQueueService` resumes processing `PENDING` commands in creation order.
4. **Outbox & Webhook Replay**: `OutboxService` publishes pending events; `reprocessPendingWebhooks()` processes unprocessed webhook events idempotently.

### Scenario C: Broker Disconnect / API Outage
1. **Detection**: `BrokerAdapter` health status turns `disconnected`; `/api/health/readiness` reports `NOT_READY`.
2. **Order Queuing**: In-flight execution commands transition to `SENT` or remain `PENDING`. Commands are NOT blindly duplicated.
3. **Broker Reconnect**: Once broker communication resumes, `ReconciliationEngine` performs full position & order state sync against the broker's authoritative position ledger.
4. **Mismatch Repair**: Unmatched positions are flagged for manual or automated resolution; closed terminal positions are synchronized.

---

## 4. Recovery Order Sequence

When recovering a full system stack from cold failure, services MUST be initialized in the exact order below:

```text
1. PostgreSQL Database Instance
       ↓
2. Database Schema Migrations (001 - 005)
       ↓
3. Primary API & Server Process (`server.ts`)
       ↓
4. Execution Queue Workers (`ExecutionQueueService`)
       ↓
5. Event Bus & Outbox Publisher (`OutboxService`)
       ↓
6. Broker Connectivity (`BrokerAdapter` sync)
       ↓
7. State Reconciliation Engine (`reconcilePositions()`)
       ↓
8. Health Readiness Check (`/api/health/readiness` -> READY)
```

---

## 5. Post-Recovery Reconciliation

After any infrastructure failure or process restart, post-recovery state reconciliation MUST be executed:

1. **Query Broker Positions**: Fetch live open positions from broker adapter.
2. **Query Local Database Positions**: Fetch `OPEN` positions from `positions` table.
3. **Cross-Check**: Verify matching `symbol`, `direction`, `quantity`, and `ticketId`.
4. **Repair**:
   - Positions closed at broker while system was down transition to `CLOSED_IN_TERMINAL`.
   - Missing local entries are flagged in reconciliation records and trigger system alerts.
