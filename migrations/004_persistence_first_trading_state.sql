-- Sprint 8 / Phase 2 Migration: Persistence-First Trading State & Transactional Ledger

-- 1. Signals Table
CREATE TABLE IF NOT EXISTS signals (
  id VARCHAR(64) PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  timeframe VARCHAR(16) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  entry_price NUMERIC(12, 5) NOT NULL,
  stop_loss NUMERIC(12, 5) NOT NULL,
  take_profit_1 NUMERIC(12, 5) NOT NULL,
  take_profit_2 NUMERIC(12, 5) DEFAULT 0,
  setup_type VARCHAR(64),
  confidence NUMERIC(5, 2),
  reasoning TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  data_class VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  provider VARCHAR(64) DEFAULT 'UNKNOWN',
  source VARCHAR(64) DEFAULT 'UNKNOWN',
  market_timestamp BIGINT,
  executable BOOLEAN DEFAULT TRUE,
  strategy VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

-- 2. Additive columns for positions if table already created in 002
ALTER TABLE positions ADD COLUMN IF NOT EXISTS ticket_id VARCHAR(128);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS setup_id VARCHAR(128);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS close_price NUMERIC(12, 5);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS stop_loss NUMERIC(12, 5);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS take_profit NUMERIC(12, 5);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS close_reason VARCHAR(64);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS broker VARCHAR(64) DEFAULT 'PAPER';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

-- 3. Additive columns for orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stop_loss NUMERIC(12, 5);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS take_profit NUMERIC(12, 5);

-- 4. Account State Table
CREATE TABLE IF NOT EXISTS account_state (
  account_id VARCHAR(64) PRIMARY KEY,
  is_auto_enabled BOOLEAN DEFAULT FALSE,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 10000.00,
  initial_capital NUMERIC(12, 2) NOT NULL DEFAULT 10000.00,
  risk_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
  latest_ai_rule TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed DEFAULT account state if not present
INSERT INTO account_state (account_id, is_auto_enabled, balance, initial_capital, risk_percent)
VALUES ('DEFAULT', FALSE, 10000.00, 10000.00, 1.00)
ON CONFLICT (account_id) DO NOTHING;

-- 5. Trading Audit Logs Table
CREATE TABLE IF NOT EXISTS trading_logs (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  text TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'INFO'
);

-- 6. Journal Entries Table
CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) DEFAULT 'DEFAULT',
  pair VARCHAR(32) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  entry_price NUMERIC(12, 5) NOT NULL,
  exit_price NUMERIC(12, 5),
  result_pnl NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tags JSONB,
  notes TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Post Mortem Reviews Table
CREATE TABLE IF NOT EXISTS post_mortem_reviews (
  id VARCHAR(64) PRIMARY KEY,
  trade_id VARCHAR(64) NOT NULL,
  review JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
