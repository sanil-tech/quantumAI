# IATI OS / QuantumAI — Production Deployment Guide

## Status: CERTIFIED

---

## 1. Overview

This document defines the production deployment architecture, environment configuration, container runtime, and process lifecycle for **IATI OS / QuantumAI**.

---

## 2. Architecture & Entry Points

- **Primary Entry Point**: `server.ts`
- **Production Build Command**: `npm run build`
  - Compiles Vite frontend assets into `dist/`
  - Bundles Express server via `esbuild` into CommonJS artifact: `dist/server.cjs`
- **Production Start Command**: `npm run start` (`node dist/server.cjs`)
- **Port & Host**: Binds to port `3000` on host `0.0.0.0` (required for Cloud Run / Container Ingress).

---

## 3. Environment Separation

The system enforces strict multi-environment isolation:

| Environment | NODE_ENV | APP_ENV | Execution Mode | Market Data Lineage | Broker Adapter |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DEVELOPMENT** | `development` | `DEVELOPMENT` | `SIMULATION` | `SIMULATION` / `HISTORICAL` | `PaperBrokerAdapter` |
| **TEST** | `test` | `TEST` | `SIMULATION` | `SIMULATION` | `PaperBrokerAdapter` |
| **PAPER** | `production` | `PAPER` | `PAPER` | `SIMULATION` / `REAL_TIME` | `PaperBrokerAdapter` |
| **PRODUCTION** | `production` | `PRODUCTION` | `LIVE` | `REAL_TIME` | `CTraderAdapter` / `MT5BridgeAdapter` |

### Environment Configuration Safeguards
- Environment configuration is parsed and validated by `validateProductionConfig()`.
- Ambiguous configuration (e.g., `NODE_ENV=production` with `APP_ENV=TEST`) or missing required production secrets triggers an immediate **FAIL CLOSED** startup halt.
- Non-live market data lineage (`SIMULATED`, `SYNTHETIC`, `HISTORICAL`) is strictly blocked from executing on `LIVE` execution targets by `validateExecutionSafety()`.

---

## 4. Secret Management & Security

- **Zero Credential Exposure**: Broker API keys, signing secrets (`RISK_SECRET_KEY`, `GOVERNANCE_SIGNING_KEY`), and database credentials are strictly injected via runtime environment variables.
- **Log Masking**: All logs, error messages, traces, and metrics pass through `redactSensitiveData()` to scrub secret patterns, API keys, passwords, and authorization tokens.
- **Signing Key Enforcement**: In production mode, signing keys must be at least 32 characters and free of insecure placeholder strings (`change_me`, `test_key`, `123456`).

---

## 5. Health & Readiness Probes

### Liveness Probe (`GET /api/health/liveness`)
- Returns `HTTP 200 OK` with status `UP` as long as the process is responsive.
- Used by container orchestration (Kubernetes / Cloud Run) to detect deadlocked processes.

### Readiness Probe (`GET /api/health/readiness`)
- Validates status of critical dependencies:
  - PostgreSQL Database connection
  - Execution Queue Service
  - Broker Adapter Connectivity
  - Event Bus / Outbox Service
- In `PRODUCTION` mode, failure of any critical dependency returns `HTTP 503 Service Unavailable` with status `NOT_READY`.

---

## 6. Process Lifecycle & Graceful Shutdown

Upon receiving `SIGTERM` or `SIGINT`:
1. Server stops accepting new HTTP connection requests.
2. Active execution queue workers complete current in-flight commands or release worker leases.
3. Database connection pool closes cleanly.
4. Process exits with code `0`.

---

## 7. Deployment Artifact Verification

```bash
# Production Build Verification
npm run lint
npm run build
npm run start
```
