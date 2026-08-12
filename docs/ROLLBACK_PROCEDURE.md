# IATI OS / QuantumAI — Rollback Procedure

## Status: CERTIFIED

---

## 1. Overview

This document specifies the rollback procedures for application releases, database migrations, and environment configurations for **IATI OS / QuantumAI**.

---

## 2. Application Rollback (Version N+1 -> Version N)

When a deployment failure or operational bug is identified in a newly deployed application release:

1. **Traffic Shift**: Revert container router / Cloud Run traffic percentage to previous stable release image artifact (`Version N`).
2. **State Compatibility**: Because all database schemas maintain backward compatibility (additive columns, idempotent migrations), `Version N` can safely run against the current schema.
3. **Lease Preservation**: Active worker leases are released gracefully upon `SIGTERM`.
4. **Verification**: Verify `/api/health/readiness` returns `READY` on `Version N`.

---

## 3. Configuration Rollback

When an invalid or unsafe environment configuration is applied:

1. **Fail-Closed Guard**: `validateProductionConfig()` detects improper configurations (e.g. missing secrets, weak keys, mismatched mode/lineage) and prevents service startup.
2. **Configuration Reversion**: Revert environment variable settings to verified production manifest.
3. **Restart Service**: Trigger process restart. Verify startup logs confirm `[CONFIG] Production environment configuration verified.`

---

## 4. Database Migration Rollback Strategy

- **Backward-Compatible Migrations**: All migrations (`001_risk_governance.sql` through `005_phase5g_durability.sql`) are designed to be strictly non-destructive and additive.
- **Forward-Fix Principle**: In the event of a schema migration issue, apply a forward-fix migration (`006_...sql`) rather than executing destructive `DROP` or `DOWN` migrations in production.
- **Data Protection**: Production database schema modifications MUST NOT delete or truncate historical execution audit logs, position state, or risk tokens.
