# IATI OS / QuantumAI — Backup & Restore Manual

## Status: CERTIFIED

---

## 1. Overview

This manual documents the database backup, Point-in-Time Recovery (PITR), logical export, and disaster restoration procedures for PostgreSQL database instances supporting **IATI OS / QuantumAI**.

---

## 2. Backup Strategy

### Automated Snapshot Schedule
- **Frequency**: Daily full automated snapshot at 00:00 UTC.
- **Retention**: 30 days retention for daily snapshots; 12 months for monthly backups.
- **Encryption**: Snapshot volumes encrypted at rest using AES-256 / GCP KMS.

### Continuous Archiving & Write-Ahead Logs (WAL)
- **WAL Archiving**: WAL logs streamed continuously to secure Cloud Storage.
- **Point-in-Time Recovery (PITR)**: Enables database recovery to any specific second within the 30-day retention window.

---

## 3. Logical Backup Procedure (`pg_dump`)

For manual backups prior to major database migrations or maintenance:

```bash
# Execute logical backup of IATI OS database
pg_dump -h $DB_HOST -U $DB_USER -d iati_os -Fc -f /backups/iati_os_$(date +%Y%m%d_%H%M%S).dump
```

---

## 4. Restoration Procedure

To restore the IATI OS PostgreSQL database from a logical backup file onto a target database instance:

```bash
# 1. Prepare clean target database
createdb -h $DB_HOST -U $DB_USER iati_os_restored

# 2. Restore schema and data
pg_restore -h $DB_HOST -U $DB_USER -d iati_os_restored --clean --if-exists /backups/iati_os_20260811_000000.dump

# 3. Verify core table row counts and schema integrity
psql -h $DB_HOST -U $DB_USER -d iati_os_restored -c "
SELECT 'execution_commands' AS table_name, COUNT(*) FROM execution_commands
UNION ALL SELECT 'positions', COUNT(*) FROM positions
UNION ALL SELECT 'broker_webhook_events', COUNT(*) FROM broker_webhook_events
UNION ALL SELECT 'outbox_events', COUNT(*) FROM outbox_events
UNION ALL SELECT 'execution_audit_logs', COUNT(*) FROM execution_audit_logs;
"
```

---

## 5. Restoration Verification Checklist

Following a database restoration, the following tables MUST be verified for internal state consistency:

- [x] `execution_commands` (Pending, Claimed, Executed command statuses)
- [x] `positions` (Open and Closed trading positions)
- [x] `broker_webhook_events` (Processed webhook inbox events and idempotency hashes)
- [x] `outbox_events` (Published and pending transactional outbox events)
- [x] `execution_audit_logs` (Immutable audit trails for compliance)
- [x] `reconciliation_records` (Reconciliation audit history)
