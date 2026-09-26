-- Migration 015: Phase 2D Amendment - QAI_M5_SCALP_BASELINE_V1 Foundation
-- Additive columns and tables for M5 Forex Scalp DEMO Forward Validation and Shadow Observation

DO $$
BEGIN
    -- 1. Add additive columns to signals table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'execution_mode') THEN
        ALTER TABLE signals ADD COLUMN execution_mode VARCHAR(30) DEFAULT 'DEMO_FORWARD';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'forward_validation') THEN
        ALTER TABLE signals ADD COLUMN forward_validation BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'market_opportunity_id') THEN
        ALTER TABLE signals ADD COLUMN market_opportunity_id VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'execution_command_id') THEN
        ALTER TABLE signals ADD COLUMN execution_command_id VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'risk_percent') THEN
        ALTER TABLE signals ADD COLUMN risk_percent NUMERIC(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'risk_amount') THEN
        ALTER TABLE signals ADD COLUMN risk_amount NUMERIC(15,4);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'sl_distance_pips') THEN
        ALTER TABLE signals ADD COLUMN sl_distance_pips NUMERIC(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'sl_atr_ratio') THEN
        ALTER TABLE signals ADD COLUMN sl_atr_ratio NUMERIC(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'spread_pips') THEN
        ALTER TABLE signals ADD COLUMN spread_pips NUMERIC(5,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'h4_regime') THEN
        ALTER TABLE signals ADD COLUMN h4_regime VARCHAR(30);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'm15_context') THEN
        ALTER TABLE signals ADD COLUMN m15_context VARCHAR(30);
    END IF;
END $$;

-- 2. Create M5 Shadow Observations table for rejected M5 opportunities
CREATE TABLE IF NOT EXISTS m5_shadow_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_opportunity_id VARCHAR(100) NOT NULL,
    signal_id VARCHAR(100) NOT NULL,
    setup_id VARCHAR(100),
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) DEFAULT 'M5',
    direction VARCHAR(10) NOT NULL,
    rejection_reason VARCHAR(100) NOT NULL,
    rejection_details JSONB,
    planned_entry NUMERIC(15,5) NOT NULL,
    planned_sl NUMERIC(15,5) NOT NULL,
    planned_tp NUMERIC(15,5) NOT NULL,
    planned_rr NUMERIC(5,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    outcome VARCHAR(20) DEFAULT 'PENDING',
    max_favorable_pips NUMERIC(10,2),
    max_adverse_pips NUMERIC(10,2),
    execution_mode VARCHAR(30) DEFAULT 'SHADOW'
);

-- Index for efficient querying by symbol, rejection_reason, and execution_mode
CREATE INDEX IF NOT EXISTS idx_m5_shadow_symbol ON m5_shadow_observations(symbol);
CREATE INDEX IF NOT EXISTS idx_m5_shadow_mode ON m5_shadow_observations(execution_mode);
CREATE INDEX IF NOT EXISTS idx_m5_shadow_opp ON m5_shadow_observations(market_opportunity_id);
