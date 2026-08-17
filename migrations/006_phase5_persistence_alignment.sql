-- Sprint 9 / Phase 5 Migration: Persistence Alignment

-- 1. Add missing Phase 5 columns to positions table
ALTER TABLE positions ADD COLUMN IF NOT EXISTS timeframe VARCHAR(16) DEFAULT 'M15';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS take_profit_2 NUMERIC(12, 5);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS pnl_pips NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS commission NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS swap NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'DEMO';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS proposal_id VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS approval_id VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS strategy_id VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS strategy_version VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS learning_version VARCHAR(32) DEFAULT '1.0';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS broker_order_id VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS broker_position_id VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS broker_deal_id VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(32) DEFAULT 'MATCHED';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- Add unique constraint or index for idempotency_key on positions if needed
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_idempotency_key ON positions(idempotency_key);

-- 2. Add missing status and error columns to broker_webhook_events (due to migration 003 vs 005 mismatch)
ALTER TABLE broker_webhook_events ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE broker_webhook_events ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE broker_webhook_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Recreate index that failed in 005
CREATE INDEX IF NOT EXISTS idx_broker_webhook_status ON broker_webhook_events(status);

-- 3. Alter post_mortem_reviews to align with schema
ALTER TABLE post_mortem_reviews ADD COLUMN IF NOT EXISTS learning_version VARCHAR(32) NOT NULL DEFAULT '1.0';
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_mortem_trade_version ON post_mortem_reviews(trade_id, learning_version);

-- 4. Create missing trade_events table
CREATE TABLE IF NOT EXISTS trade_events (
  id VARCHAR(64) PRIMARY KEY,
  trade_id VARCHAR(128),
  order_id VARCHAR(128),
  setup_id VARCHAR(128),
  event_type VARCHAR(64) NOT NULL,
  actor VARCHAR(64) DEFAULT 'SYSTEM',
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for trade_events
CREATE INDEX IF NOT EXISTS idx_trade_events_trade ON trade_events(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_type ON trade_events(event_type);
CREATE INDEX IF NOT EXISTS idx_trade_events_timestamp ON trade_events(timestamp);
