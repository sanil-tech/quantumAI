-- Sprint 6 Migration: Execution Router & Paper Trading Engine Schemas

CREATE TABLE IF NOT EXISTS brokers (
  broker_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'PAPER',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS broker_accounts (
  account_id VARCHAR(64) PRIMARY KEY,
  broker_id VARCHAR(64) REFERENCES brokers(broker_id),
  balance NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  equity NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  order_id VARCHAR(64) PRIMARY KEY,
  proposal_id VARCHAR(64) NOT NULL,
  approval_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL,
  order_type VARCHAR(16) NOT NULL,
  price NUMERIC(12, 5),
  stop_price NUMERIC(12, 5),
  status VARCHAR(32) NOT NULL,
  broker_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  filled_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS order_fills (
  fill_id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(order_id),
  filled_price NUMERIC(12, 5) NOT NULL,
  filled_quantity NUMERIC(12, 4) NOT NULL,
  slippage NUMERIC(8, 5) NOT NULL DEFAULT 0.00000,
  latency_ms INT NOT NULL DEFAULT 0,
  fee NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS positions (
  position_id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL,
  entry_price NUMERIC(12, 5) NOT NULL,
  current_price NUMERIC(12, 5) NOT NULL,
  unrealized_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  realized_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS execution_reports (
  report_id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(order_id),
  requested_price NUMERIC(12, 5) NOT NULL,
  filled_price NUMERIC(12, 5) NOT NULL,
  slippage NUMERIC(8, 5) NOT NULL,
  slippage_pct NUMERIC(6, 4) NOT NULL,
  latency_ms INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Paper Broker
INSERT INTO brokers (broker_id, name, type, status)
VALUES ('paper-broker-01', 'IATI Paper Broker Simulation', 'PAPER', 'ACTIVE')
ON CONFLICT (broker_id) DO NOTHING;

INSERT INTO broker_accounts (account_id, broker_id, balance, currency, equity)
VALUES ('DEFAULT', 'paper-broker-01', 100000.00, 'USD', 100000.00)
ON CONFLICT (account_id) DO NOTHING;
