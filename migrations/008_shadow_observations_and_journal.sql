-- Migration: 008_shadow_observations_and_journal.sql
-- Description: Creates isolated shadow forward-testing observations and learning journal persistence tables.

CREATE TABLE IF NOT EXISTS shadow_observations (
    id VARCHAR(64) PRIMARY KEY,
    signal_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    setup_type VARCHAR(64) NOT NULL,
    setup_fingerprint VARCHAR(128) NOT NULL,
    session VARCHAR(32) NOT NULL,
    market_regime VARCHAR(64) NOT NULL,
    
    -- Price & Execution Parameters
    entry_price NUMERIC(12, 5) NOT NULL,
    stop_loss NUMERIC(12, 5) NOT NULL,
    initial_stop_loss NUMERIC(12, 5) NOT NULL,
    take_profit_1 NUMERIC(12, 5) NOT NULL,
    take_profit_2 NUMERIC(12, 5),
    is_multi_target BOOLEAN NOT NULL DEFAULT FALSE,
    tp1_hit BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Lifecycle & Exit Outcome
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    close_reason VARCHAR(64),
    exit_price NUMERIC(12, 5),
    realized_r NUMERIC(8, 2),
    
    -- High-Water Mark & Excursion Metrics
    mfe_pips NUMERIC(8, 1) NOT NULL DEFAULT 0.0,
    mae_pips NUMERIC(8, 1) NOT NULL DEFAULT 0.0,
    highest_price_seen NUMERIC(12, 5) NOT NULL,
    lowest_price_seen NUMERIC(12, 5) NOT NULL,
    
    -- Observational Metadata & Immutable Snapshot
    monitoring_state VARCHAR(32) NOT NULL DEFAULT 'LIVE_MONITORING',
    observation_type VARCHAR(32) NOT NULL DEFAULT 'SHADOW_OBSERVATION',
    execution_quality_assumptions JSONB NOT NULL,
    immutable_signal_snapshot JSONB NOT NULL,
    
    -- Timestamps
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shadow_obs_symbol ON shadow_observations(symbol);
CREATE INDEX IF NOT EXISTS idx_shadow_obs_status ON shadow_observations(status);
CREATE INDEX IF NOT EXISTS idx_shadow_obs_signal ON shadow_observations(signal_id);
CREATE INDEX IF NOT EXISTS idx_shadow_obs_opened_at ON shadow_observations(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_obs_closed_at ON shadow_observations(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_obs_fingerprint ON shadow_observations(setup_fingerprint);

CREATE TABLE IF NOT EXISTS learning_journal_events (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    setup_fingerprint VARCHAR(128),
    symbol VARCHAR(32),
    direction VARCHAR(10),
    session VARCHAR(32),
    observation_type VARCHAR(32),
    observation_id VARCHAR(64),
    trade_id VARCHAR(64),
    outcome VARCHAR(16),
    realized_r NUMERIC(8, 2),
    mfe_pips NUMERIC(8, 1),
    mae_pips NUMERIC(8, 1),
    sample_count INTEGER NOT NULL DEFAULT 0,
    evidence_tier VARCHAR(32),
    previous_learning_weight NUMERIC(6, 4),
    new_learning_weight NUMERIC(6, 4),
    previous_parameter TEXT,
    proposed_parameter TEXT,
    applied_parameter TEXT,
    bounded_adjustment TEXT,
    reason TEXT NOT NULL,
    confidence_basis TEXT,
    affected_future_setup_fingerprint VARCHAR(128),
    payload JSONB,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lje_fingerprint ON learning_journal_events(setup_fingerprint);
CREATE INDEX IF NOT EXISTS idx_lje_type ON learning_journal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lje_timestamp ON learning_journal_events(timestamp DESC);
