-- Sprint 9 / Phase 5G Migration: Durable State, Event Outbox, Webhook Inbox & Concurrency Locks

-- 1. Execution Commands Additions (Concurrency Locks)
ALTER TABLE execution_commands ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(64);
ALTER TABLE execution_commands ADD COLUMN IF NOT EXISTS lease_expiry TIMESTAMP WITH TIME ZONE;

-- 2. Broker Webhook Events / Inbox
CREATE TABLE IF NOT EXISTS broker_webhook_events (
  event_id VARCHAR(128) PRIMARY KEY,
  broker VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  account_number VARCHAR(64),
  order_id VARCHAR(128),
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_broker_webhook_status ON broker_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_broker_webhook_order ON broker_webhook_events(order_id);

-- 3. Outbox Events Table (Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  retry_count INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status);
CREATE INDEX IF NOT EXISTS idx_outbox_events_created_at ON outbox_events(created_at);

-- 4. Execution Audit Trail (Append-Only)
CREATE TABLE IF NOT EXISTS execution_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  command_id VARCHAR(64) NOT NULL,
  setup_id VARCHAR(128),
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exec_audit_command ON execution_audit_logs(command_id);
CREATE INDEX IF NOT EXISTS idx_exec_audit_timestamp ON execution_audit_logs(timestamp);

-- 5. Reconciliation Records Table
CREATE TABLE IF NOT EXISTS reconciliation_records (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  broker VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_id VARCHAR(128) NOT NULL,
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_target ON reconciliation_records(target_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_timestamp ON reconciliation_records(timestamp);

-- 6. Durable Idempotency Records
CREATE TABLE IF NOT EXISTS idempotency_records (
  key VARCHAR(128) PRIMARY KEY,
  scope VARCHAR(64) NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
