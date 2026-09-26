-- QuantumAI IATI OS — Phase 2D.1: Performance Evidence Foundation Schema Extension

ALTER TABLE signals ADD COLUMN IF NOT EXISTS setup_id VARCHAR(128);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS planned_rr NUMERIC(8, 2);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS decision VARCHAR(32) DEFAULT 'ACCEPTED';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS decision_reason TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS strategy_version VARCHAR(64) DEFAULT 'QAI_BASELINE_V1';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS model_version VARCHAR(64) DEFAULT 'gemini-2.5-flash';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS configuration_version VARCHAR(64) DEFAULT '1.0';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS provenance VARCHAR(32) DEFAULT 'NATURAL_RUNTIME';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS market_context JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_signals_setup_id ON signals(setup_id);
CREATE INDEX IF NOT EXISTS idx_signals_decision ON signals(decision);
CREATE INDEX IF NOT EXISTS idx_signals_provenance ON signals(provenance);
CREATE INDEX IF NOT EXISTS idx_signals_strategy_version ON signals(strategy_version);
