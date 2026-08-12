-- Sprint 5 Migration: Risk Governance Engine Schemas

CREATE TABLE IF NOT EXISTS risk_profiles (
  account_id VARCHAR(64) PRIMARY KEY,
  max_risk_per_trade NUMERIC(5, 4) NOT NULL DEFAULT 0.0200,
  max_daily_loss NUMERIC(5, 4) NOT NULL DEFAULT 0.0500,
  max_drawdown NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,
  max_open_positions INT NOT NULL DEFAULT 5,
  max_exposure NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
  max_frequency INT NOT NULL DEFAULT 10,
  risk_level VARCHAR(32) NOT NULL DEFAULT 'MODERATE',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exposure_records (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  symbol_exposure NUMERIC(12, 2) NOT NULL,
  portfolio_exposure NUMERIC(12, 2) NOT NULL,
  has_concentration_risk BOOLEAN NOT NULL DEFAULT FALSE,
  is_overexposed BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drawdown_records (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  current_drawdown NUMERIC(5, 4) NOT NULL,
  daily_loss NUMERIC(5, 4) NOT NULL,
  weekly_loss NUMERIC(5, 4) NOT NULL,
  max_historical_drawdown NUMERIC(5, 4) NOT NULL,
  action VARCHAR(32) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_events (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  risk_score NUMERIC(4, 3) NOT NULL,
  details JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS governance_decisions (
  approval_id VARCHAR(64) PRIMARY KEY,
  proposal_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  risk_score NUMERIC(4, 3) NOT NULL,
  checks JSONB NOT NULL,
  rejection_reasons JSONB,
  decision_authority VARCHAR(64) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Risk Profile
INSERT INTO risk_profiles (account_id, max_risk_per_trade, max_daily_loss, max_drawdown, max_open_positions, max_exposure, max_frequency, risk_level)
VALUES ('DEFAULT', 0.0200, 0.0500, 0.1500, 5, 100000.00, 10, 'MODERATE')
ON CONFLICT (account_id) DO NOTHING;
