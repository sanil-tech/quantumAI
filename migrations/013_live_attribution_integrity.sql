-- QuantumAI IATI OS — Phase 2C.12: Live Attribution Integrity Schema
-- Durable, auditable, append-oriented execution attribution table.

CREATE TABLE IF NOT EXISTS quantumai_execution_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribution_id VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    schema_version VARCHAR(16) NOT NULL DEFAULT '1.0',

    -- Provenance & Governance
    provenance VARCHAR(32) NOT NULL DEFAULT 'REAL_QUANTUMAI',
    data_authority VARCHAR(32) NOT NULL DEFAULT 'QUANTUMAI_INTERNAL',
    execution_status VARCHAR(32) NOT NULL DEFAULT 'UNBOUND',
    attribution_status VARCHAR(32) NOT NULL DEFAULT 'UNBOUND',
    is_verified_quantumai BOOLEAN NOT NULL DEFAULT FALSE,
    is_performance_eligible BOOLEAN NOT NULL DEFAULT FALSE,

    -- Causal Identifier Chain
    signal_id VARCHAR(128),
    thesis_id VARCHAR(128),
    proposal_id VARCHAR(128),
    risk_reservation_id VARCHAR(128),
    execution_sequence_id VARCHAR(128),

    -- Broker Authoritative Identifiers
    broker_order_ids JSONB DEFAULT '[]'::jsonb,
    broker_deal_ids JSONB DEFAULT '[]'::jsonb,
    broker_position_id VARCHAR(64),

    -- Trade Parameters
    symbol VARCHAR(32) NOT NULL,
    direction VARCHAR(16) NOT NULL,
    requested_volume NUMERIC NOT NULL,
    filled_volume NUMERIC,

    -- Timestamps
    order_submitted_at TIMESTAMPTZ,
    broker_acknowledged_at TIMESTAMPTZ,
    position_confirmed_at TIMESTAMPTZ,
    position_closed_at TIMESTAMPTZ,

    -- Post-Execution & Learning Linkage
    outcome_id VARCHAR(128),
    post_mortem_id VARCHAR(128),

    -- Payloads & Context
    second_opinion_assessment JSONB,
    broker_pnl JSONB,
    mfe_mae JSONB,
    conflict_reason TEXT
);

-- Indices for rapid, deterministic lookup by lifecycle keys
CREATE INDEX IF NOT EXISTS idx_exec_attr_created_at ON quantumai_execution_attributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_attr_attribution_id ON quantumai_execution_attributions(attribution_id);
CREATE INDEX IF NOT EXISTS idx_exec_attr_signal_id ON quantumai_execution_attributions(signal_id);
CREATE INDEX IF NOT EXISTS idx_exec_attr_proposal_id ON quantumai_execution_attributions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_exec_attr_exec_seq_id ON quantumai_execution_attributions(execution_sequence_id);
CREATE INDEX IF NOT EXISTS idx_exec_attr_broker_pos_id ON quantumai_execution_attributions(broker_position_id);
CREATE INDEX IF NOT EXISTS idx_exec_attr_status ON quantumai_execution_attributions(attribution_status);
CREATE INDEX IF NOT EXISTS idx_exec_attr_perf_eligible ON quantumai_execution_attributions(is_performance_eligible);
