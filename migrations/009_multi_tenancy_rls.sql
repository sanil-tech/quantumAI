-- ==============================================================================
-- Migration 009: Multi-Tenancy Hardening & PostgreSQL Row-Level Security (RLS)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1b. Create dedicated non-superuser tenant role for RLS enforcement
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_tenant_user') THEN
    CREATE ROLE app_tenant_user WITH LOGIN PASSWORD 'app_tenant_secure_pass';
  END IF;
  GRANT USAGE ON SCHEMA public TO app_tenant_user;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_tenant_user;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_tenant_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_tenant_user;
END $$;

-- 2. Create broker_connections table if not exists (for storing encrypted broker credentials)
CREATE TABLE IF NOT EXISTS broker_connections (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID,
  account_number VARCHAR(64) NOT NULL,
  broker_name VARCHAR(64) NOT NULL DEFAULT 'CTRADER',
  connection_type VARCHAR(32) NOT NULL DEFAULT 'FIX_API', -- 'FIX_API' | 'OPEN_API'
  encrypted_credentials TEXT NOT NULL, -- AES-256-GCM payload (enc:v1:iv:tag:ciphertext)
  key_version VARCHAR(32) NOT NULL DEFAULT 'v1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  environment VARCHAR(32) NOT NULL DEFAULT 'DEMO',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add tenant_id column to existing transaction and ledger tables
ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;
ALTER TABLE manual_trades ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;
ALTER TABLE execution_commands ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;
ALTER TABLE execution_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;
ALTER TABLE trading_logs ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;

-- 4. Create Tenant Indexing for High Performance Multi-Tenant Queries
CREATE INDEX IF NOT EXISTS idx_broker_connections_tenant ON broker_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_positions_tenant ON positions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_manual_trades_tenant ON manual_trades(tenant_id);
CREATE INDEX IF NOT EXISTS idx_execution_commands_tenant ON execution_commands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_execution_audit_logs_tenant ON execution_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trading_logs_tenant ON trading_logs(tenant_id);

-- 5. Enable Row-Level Security (RLS) on all multi-tenant tables
ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_logs ENABLE ROW LEVEL SECURITY;

-- 5b. Force Row-Level Security even for table owners / superusers
ALTER TABLE broker_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE positions FORCE ROW LEVEL SECURITY;
ALTER TABLE manual_trades FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE trading_logs FORCE ROW LEVEL SECURITY;

-- 6. Define Strict RLS Isolation Policies
-- Policy allows access ONLY IF tenant_id matches current session setting: current_setting('app.current_tenant_id', true)
-- Superuser / Background daemon jobs can set app.current_tenant_id = 'ALL' or bypass if authorized

DROP POLICY IF EXISTS tenant_isolation_broker_connections ON broker_connections;
CREATE POLICY tenant_isolation_broker_connections ON broker_connections
  FOR ALL
  USING (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  );

DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
CREATE POLICY tenant_isolation_orders ON orders
  FOR ALL
  USING (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  );

DROP POLICY IF EXISTS tenant_isolation_positions ON positions;
CREATE POLICY tenant_isolation_positions ON positions
  FOR ALL
  USING (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  );

DROP POLICY IF EXISTS tenant_isolation_manual_trades ON manual_trades;
CREATE POLICY tenant_isolation_manual_trades ON manual_trades
  FOR ALL
  USING (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  );

DROP POLICY IF EXISTS tenant_isolation_execution_commands ON execution_commands;
CREATE POLICY tenant_isolation_execution_commands ON execution_commands
  FOR ALL
  USING (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  );

-- 7. Helper Stored Procedure to set Tenant Context per DB Connection Session
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID) 
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_uuid::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
