# IATI OS / QuantumAI — Phase 5I Operational Runbook

## Executive Summary & System Mandate
This operational runbook governs the production observability, incident response, diagnostic tracing, and operational triage workflows for the **IATI OS / QuantumAI** autonomous trading platform.

> **CRITICAL MANDATE**:
> Operators and automated runbooks MUST NEVER instruct or perform actions that bypass the **Risk Authority** (`RiskAuthorityService`) or manually submit trade orders outside the **Canonical Execution Architecture** (`ExecutionRouter`).

---

## 1. System Health Probes & Endpoint Map

### Liveness Probe
- **Endpoint**: `GET /api/health/liveness` or `GET /api/health`
- **Response**: `200 OK`
- **Purpose**: Confirms the node HTTP service is alive and serving traffic.

```json
{
  "status": "UP",
  "service": "IATI-OS-QuantumAI-Core",
  "timestamp": "2026-08-11T12:00:00.000Z",
  "uptimeSeconds": 86400
}
```

### Readiness Probe
- **Endpoint**: `GET /api/health/readiness`
- **Response**: `200 OK` (Ready) or `503 Service Unavailable` (Not Ready)
- **Purpose**: Evaluates connectivity to core infrastructure (Execution Queue, Broker Adapters, Event Bus, PostgreSQL).

```json
{
  "status": "READY",
  "timestamp": "2026-08-11T12:00:00.000Z",
  "checks": {
    "database": { "status": "UP" },
    "queue": { "status": "UP" },
    "broker": { "status": "UP" },
    "eventBus": { "status": "UP" }
  }
}
```

---

## 2. Observability Metrics & Telemetry

### Promethean Endpoint
- **Endpoint**: `GET /api/observability/metrics?format=prometheus`
- **Content-Type**: `text/plain; version=0.0.4`

Key metrics exposed:
- `execution_latency_seconds_bucket` / `execution_latency_seconds_sum` / `execution_latency_seconds_count`
- `broker_latency_seconds_bucket`
- `execution_total{status="FILLED|REJECTED|FAILED"}`
- `broker_orders_total{broker="paper|live",status="FILLED"}`
- `broker_error_total`
- `queue_depth` / `queue_stuck_total`
- `webhook_received_total` / `webhook_failed_total` / `webhook_duplicate_total`
- `outbox_published_total` / `outbox_failed_total`
- `reconciliation_attempts_total` / `reconciliation_mismatches_total`

### JSON Metrics Endpoint
- **Endpoint**: `GET /api/observability/metrics`
- **Response**: Categorized JSON counters, gauges, and statistical histograms (count, sum, min, avg, p95, max).

---

## 3. Queue & Pipeline Operational Dashboards

| Route | Focus Area | Description |
|---|---|---|
| `GET /api/observability/queue` | Execution Queue | Backlog size, pending/claimed/sent counts, lease expirations, stuck commands |
| `GET /api/observability/broker` | Broker Adapters | Active connection status, fill rates, error rates, average latency |
| `GET /api/observability/webhook` | Webhook Inbox | Total received, processed, duplicates filtered, failed, pending inbox |
| `GET /api/observability/outbox` | Outbox Engine | Published events, outbox backlog, retry counts, failed events |
| `GET /api/observability/reconciliation` | Ledger Reconciler | Reconciled executions, mismatches detected, drift repairs, audit status |

---

## 4. End-to-End Correlation Tracing & Incident Reconstruction

Every trade execution maintains a unified correlation lifecycle mapping `proposalId`, `approvalId`, `commandId`, and `brokerOrderId` to the canonical `executionId`.

### Querying an Incident Trace
- **Endpoint**: `GET /api/observability/trace/:id` or `GET /api/observability/trace?executionId=:id`
- **Supported Identifiers**: Accepts `executionId`, `proposalId`, `approvalId`, `commandId`, or `brokerOrderId`.

```json
{
  "executionId": "exec-987654",
  "found": true,
  "timeline": [
    { "timestamp": 1786451000000, "event": "PROPOSAL_RECEIVED", "data": { "proposalId": "prop-111", "symbol": "EUR/USD" } },
    { "timestamp": 1786451000050, "event": "RISK_EVALUATE_START", "data": { "rule": "MAX_LOT_SIZE" } },
    { "timestamp": 1786451000100, "event": "RISK_APPROVED", "data": { "approvalId": "app-222" } },
    { "timestamp": 1786451000150, "event": "COMMAND_ENQUEUED", "data": { "commandId": "cmd-333" } },
    { "timestamp": 1786451000200, "event": "COMMAND_CLAIMED", "data": { "workerId": "worker-1" } },
    { "timestamp": 1786451000300, "event": "BROKER_ORDER_SENT", "data": { "brokerOrderId": "broker-444" } },
    { "timestamp": 1786451000450, "event": "EXECUTION_FILLED", "data": { "price": 1.0850, "filledLots": 1.5 } }
  ],
  "summary": {
    "proposalId": "prop-111",
    "approvalId": "app-222",
    "commandId": "cmd-333",
    "brokerOrderId": "broker-444",
    "symbol": "EUR/USD",
    "status": "COMPLETED",
    "totalDurationMs": 450,
    "errorsCount": 0,
    "retriesCount": 0
  }
}
```

---

## 5. Operational Incident Triage Matrix

### Alert 1: `QUEUE_BACKLOG_HIGH`
- **Severity**: CRITICAL
- **Trigger**: Queue pending commands > 50
- **Diagnosis**: Worker processing lag, queue lock contention, or database throughput drop.
- **Remediation**:
  1. Inspect `GET /api/observability/queue`.
  2. Verify active worker node health and connection pool metrics.
  3. Check PostgreSQL lock state via DB metrics.

### Alert 2: `STUCK_EXECUTION_DETECTED`
- **Severity**: WARNING
- **Trigger**: Execution command in `CLAIMED` or `SENT` status > 30 seconds without resolution.
- **Diagnosis**: Worker crash after claiming command or broker socket drop during execution.
- **Remediation**:
  1. Query `GET /api/observability/trace/:id` for the stuck execution ID.
  2. Queue worker automatic lease expiration will reclaim stale commands.
  3. Reconciler will safely query broker order state before retrying or marking failed.

### Alert 3: `BROKER_ERROR_BURST`
- **Severity**: CRITICAL
- **Trigger**: Broker errors > 10 in rolling window
- **Diagnosis**: Broker API outage, rate limit exhaustion, or invalid authentication tokens.
- **Remediation**:
  1. Check `GET /api/observability/broker` for connection status and error messages.
  2. Validate broker API key status and network connectivity.
  3. System will default to fail-closed state until broker health recovers.

---

## 6. Security & Redaction Standard
All logs and trace payloads pass through `redactSensitiveData()`.
- API keys, secrets, tokens, signatures, and private credentials are automatically stripped and replaced with `[REDACTED]`.
- Risk approval token hashes preserve essential governance fields (`approvalId`, `status`, `riskCheckTimestamp`) while masking sensitive payload signatures.
