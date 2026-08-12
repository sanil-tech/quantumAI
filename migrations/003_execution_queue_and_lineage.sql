-- Sprint 7 Migration: Persistent Execution Queue and Data Lineage Schemas

CREATE TABLE IF NOT EXISTS execution_commands (
  id VARCHAR(64) PRIMARY KEY,
  setup_id VARCHAR(128) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  side VARCHAR(10) NOT NULL, -- 'BUY' | 'SELL'
  volume NUMERIC(12, 4) NOT NULL,
  entry_price NUMERIC(12, 5) NOT NULL,
  stop_loss NUMERIC(12, 5) NOT NULL,
  take_profit_1 NUMERIC(12, 5) NOT NULL,
  take_profit_2 NUMERIC(12, 5) DEFAULT 0,
  broker VARCHAR(64) NOT NULL DEFAULT 'CTRADER', -- 'MT5' | 'CTRADER' | 'PAPER'
  account_number VARCHAR(64) NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'DEMO', -- 'DEMO' | 'REAL_LIVE' | 'PAPER'
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CLAIMED', 'SENT', 'ACKNOWLEDGED', 'EXECUTED', 'FAILED', 'CANCELLED', 'EXPIRED'
  data_class VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN', -- 'LIVE', 'DELAYED', 'HISTORICAL', 'PAPER', 'SIMULATED'
  provider VARCHAR(64) DEFAULT 'UNKNOWN',
  timeframe VARCHAR(16) DEFAULT 'M15',
  idempotency_key VARCHAR(128) UNIQUE,
  attempt_count INT DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  executed_at TIMESTAMP WITH TIME ZONE,
  broker_order_id VARCHAR(128),
  error TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_execution_commands_status ON execution_commands(status);
CREATE INDEX IF NOT EXISTS idx_execution_commands_setup ON execution_commands(setup_id);
CREATE INDEX IF NOT EXISTS idx_execution_commands_account ON execution_commands(account_number);
CREATE INDEX IF NOT EXISTS idx_execution_commands_idempotency ON execution_commands(idempotency_key);

CREATE TABLE IF NOT EXISTS broker_webhook_events (
  event_id VARCHAR(128) PRIMARY KEY,
  broker VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  account_number VARCHAR(64),
  order_id VARCHAR(128),
  payload JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
