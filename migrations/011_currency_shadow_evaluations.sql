-- Migration: 011_currency_shadow_evaluations.sql
-- Description: Creates persistent, append-only currency governance shadow evaluation telemetry table.

CREATE TABLE IF NOT EXISTS currency_shadow_evaluations (
    id VARCHAR(64) PRIMARY KEY,
    evaluation_id VARCHAR(64) NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    
    -- Correlation Linkages
    signal_id VARCHAR(64),
    proposal_id VARCHAR(64),
    execution_sequence_id VARCHAR(64),
    broker_order_id VARCHAR(64),
    broker_deal_id VARCHAR(64),
    broker_position_id VARCHAR(64),
    
    -- Proposed Trade Parameters
    symbol VARCHAR(32),
    direction VARCHAR(10),
    volume_lots NUMERIC(10, 4),
    risk_percent NUMERIC(8, 4),
    
    -- Exposure Snapshots & Decisions
    actual_exposure_json JSONB NOT NULL,
    hypothetical_exposure_json JSONB,
    decision VARCHAR(32) NOT NULL,
    reasons_json JSONB NOT NULL,
    
    -- Governance Metadata
    policy_version VARCHAR(64) NOT NULL DEFAULT 'UNCONFIGURED',
    data_authority VARCHAR(32) NOT NULL DEFAULT 'BROKER',
    second_opinion_json JSONB,
    execution_authority BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curr_shadow_eval_id ON currency_shadow_evaluations(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_curr_shadow_timestamp ON currency_shadow_evaluations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_curr_shadow_event_type ON currency_shadow_evaluations(event_type);
CREATE INDEX IF NOT EXISTS idx_curr_shadow_symbol ON currency_shadow_evaluations(symbol);
CREATE INDEX IF NOT EXISTS idx_curr_shadow_decision ON currency_shadow_evaluations(decision);
CREATE INDEX IF NOT EXISTS idx_curr_shadow_proposal_id ON currency_shadow_evaluations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_curr_shadow_pos_id ON currency_shadow_evaluations(broker_position_id);
