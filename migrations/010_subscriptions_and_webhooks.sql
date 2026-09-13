-- ==============================================================================
-- Migration 010: Subscriptions & Webhook Inbox (Stripe Automation & Idempotency)
-- ==============================================================================

-- 1. Tenants Table (If not already created)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'PENDING'
  tier VARCHAR(32) NOT NULL DEFAULT 'PRO',      -- 'STARTER' | 'PRO' | 'ENTERPRISE'
  max_accounts INTEGER NOT NULL DEFAULT 1,
  max_risk_cap NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- 2. Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(128) NOT NULL,
  stripe_subscription_id VARCHAR(128) UNIQUE,
  plan_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED' | 'UNPAID'
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_cust ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- 3. Webhook Inbox Table (Idempotent Event Log)
CREATE TABLE IF NOT EXISTS webhook_inbox (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'STRIPE',
  event_type VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'PROCESSED' | 'FAILED' | 'DUPLICATE'
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint ensuring exact (provider, event_id) idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_inbox_provider_event ON webhook_inbox(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status ON webhook_inbox(status);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_created_at ON webhook_inbox(created_at);

-- 4. Enable Row-Level Security for Subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions;
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  FOR ALL
  USING (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  )
  WITH CHECK (
    current_setting('app.current_tenant_id', true) = 'ALL' OR
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
  );
