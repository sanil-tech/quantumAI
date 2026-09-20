-- QuantumAI IATI OS — Phase 2C.6: Trade Observations Schema
-- Append-oriented, auditable, immutable lifecycle linkage table.

CREATE TABLE IF NOT EXISTS trade_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provenance VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    linkage_status VARCHAR(32) NOT NULL DEFAULT 'UNLINKED',
    
    -- Linkage Identifiers
    signal_id VARCHAR(128),
    proposal_id VARCHAR(128),
    execution_sequence_id VARCHAR(128),
    broker_position_id VARCHAR(64),
    broker_deal_ids JSONB DEFAULT '[]'::jsonb,
    
    -- Stage Payloads (JSONB)
    proposal_json JSONB,
    second_opinion_json JSONB,
    macro_context_json JSONB,
    broker_position_json JSONB,
    outcome_json JSONB,
    
    -- Shadow Governance Reference
    shadow_evaluation_id VARCHAR(128),
    shadow_decision VARCHAR(32),
    shadow_reasons JSONB,
    
    -- Lifecycle Completeness Flag
    is_complete_lifecycle BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indices for rapid lookup by lifecycle keys
CREATE INDEX IF NOT EXISTS idx_trade_obs_created_at ON trade_observations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_obs_proposal_id ON trade_observations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_trade_obs_broker_pos_id ON trade_observations(broker_position_id);
CREATE INDEX IF NOT EXISTS idx_trade_obs_provenance ON trade_observations(provenance);
CREATE INDEX IF NOT EXISTS idx_trade_obs_shadow_decision ON trade_observations(shadow_decision);
