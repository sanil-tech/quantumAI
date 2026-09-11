-- =========================================================================
-- MIGRATION 007: DURABLE MANUAL TRADING LEDGER & MONITORING ALERTS
-- Phase 6E: Decoupled immutable AI Planned Setups & User Actual Trades
-- =========================================================================

-- 1. Manual Trades Table (User Actual Executions with Immutable AI Planned Setup)
CREATE TABLE IF NOT EXISTS manual_trades (
    manual_trade_id VARCHAR(64) PRIMARY KEY,
    signal_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    actual_entry NUMERIC(12, 5) NOT NULL CHECK (actual_entry > 0),
    position_size NUMERIC(8, 4) NOT NULL CHECK (position_size > 0 AND position_size <= 10.0),
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'CANCELLED')),
    exit_price NUMERIC(12, 5),
    exit_reason VARCHAR(64),
    exited_at TIMESTAMPTZ,
    realized_pnl NUMERIC(12, 2),
    realized_pips NUMERIC(10, 2),
    result VARCHAR(16) CHECK (result IN ('WIN', 'LOSS', 'BREAKEVEN', 'PENDING')),
    execution_mode VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    broker_execution BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_USER_REPORTED',
    notes TEXT,
    ai_planned_setup JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for manual_trades
CREATE INDEX IF NOT EXISTS idx_manual_trades_status ON manual_trades(status);
CREATE INDEX IF NOT EXISTS idx_manual_trades_signal ON manual_trades(signal_id);
CREATE INDEX IF NOT EXISTS idx_manual_trades_symbol ON manual_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_manual_trades_created ON manual_trades(created_at DESC);

-- Unique index to prevent duplicate ACTIVE manual trades for the same AI signal
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_trades_active_signal 
ON manual_trades(signal_id) 
WHERE status = 'ACTIVE';

-- 2. Manual Trade Alerts Table (Deduplicated Exit Monitoring Triggers)
CREATE TABLE IF NOT EXISTS manual_trade_alerts (
    alert_id VARCHAR(128) PRIMARY KEY, -- Deterministic: `{manualTradeId}_{triggerType}`
    manual_trade_id VARCHAR(64) NOT NULL REFERENCES manual_trades(manual_trade_id) ON DELETE CASCADE,
    signal_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    trigger_type VARCHAR(64) NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_price NUMERIC(12, 5) NOT NULL,
    threshold_price NUMERIC(12, 5) NOT NULL,
    unrealized_pips NUMERIC(10, 2) NOT NULL,
    unrealized_pnl NUMERIC(12, 2) NOT NULL,
    message TEXT NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for manual_trade_alerts
CREATE INDEX IF NOT EXISTS idx_manual_trade_alerts_trade ON manual_trade_alerts(manual_trade_id);
CREATE INDEX IF NOT EXISTS idx_manual_trade_alerts_trigger ON manual_trade_alerts(trigger_type);
CREATE INDEX IF NOT EXISTS idx_manual_trade_alerts_created ON manual_trade_alerts(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_trade_alerts_unique ON manual_trade_alerts(manual_trade_id, trigger_type);
