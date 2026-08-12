import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    throw new Error('Invalid environment variables');
  }
  return parsed.data;
};

export const config = parseEnv();

export interface ProductionConfigResult {
  valid: boolean;
  environment: 'DEVELOPMENT' | 'TEST' | 'PAPER' | 'PRODUCTION';
  errors: string[];
  warnings: string[];
}

export function validateProductionConfig(env: Record<string, string | undefined> = process.env): ProductionConfigResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  const appEnv = (env.APP_ENV || nodeEnv).toUpperCase();
  
  const isProduction = nodeEnv === 'production' || appEnv === 'PRODUCTION';
  const isPaper = appEnv === 'PAPER' || appEnv === 'SIMULATED';
  const isTest = nodeEnv === 'test' || appEnv === 'TEST';

  let environment: 'DEVELOPMENT' | 'TEST' | 'PAPER' | 'PRODUCTION' = 'DEVELOPMENT';
  if (isProduction) environment = 'PRODUCTION';
  else if (isPaper) environment = 'PAPER';
  else if (isTest) environment = 'TEST';

  // 1. Ambiguous Environment checks
  if (nodeEnv === 'production' && appEnv === 'TEST') {
    errors.push('AMBIGUOUS_ENV: NODE_ENV is production but APP_ENV is TEST.');
  }
  if (nodeEnv === 'test' && appEnv === 'PRODUCTION') {
    errors.push('AMBIGUOUS_ENV: NODE_ENV is test but APP_ENV is PRODUCTION.');
  }

  // 2. Production Strict Checks
  if (isProduction) {
    // Database URL required in production
    if (!env.DATABASE_URL) {
      errors.push('MISSING_CONFIG: DATABASE_URL is required in production mode.');
    } else if (env.DATABASE_URL.includes('sqlite') || env.DATABASE_URL.includes('memory')) {
      errors.push('INVALID_CONFIG: Production mode requires a durable PostgreSQL DATABASE_URL.');
    }

    // Risk Secret Key required in production
    const secret = env.RISK_SECRET_KEY || env.GOVERNANCE_SIGNING_KEY;
    if (!secret) {
      errors.push('MISSING_SECRET: RISK_SECRET_KEY or GOVERNANCE_SIGNING_KEY is required in production mode.');
    } else {
      if (secret.length < 32) {
        errors.push('WEAK_SECRET: Production signing key must be at least 32 characters long.');
      }
      const forbiddenPlaceholders = ['change_me', 'secret', 'test_key', '123456', 'mock_secret', 'example'];
      if (forbiddenPlaceholders.some(p => secret.toLowerCase().includes(p))) {
        errors.push('INSECURE_SECRET: Production signing key contains known insecure placeholder text.');
      }
    }

    // Broker validation
    const executionMode = (env.EXECUTION_MODE || '').toUpperCase();
    const dataMode = (env.MARKET_DATA_MODE || '').toUpperCase();

    if (executionMode === 'LIVE') {
      if (dataMode && ['SYNTHETIC', 'SIMULATION', 'SIMULATED', 'HISTORICAL'].includes(dataMode)) {
        errors.push('MISMATCHED_LINEAGE: Cannot enable EXECUTION_MODE=LIVE with non-live MARKET_DATA_MODE.');
      }
      if (!env.BROKER_API_KEY || env.BROKER_API_KEY.includes('mock') || env.BROKER_API_KEY.includes('paper')) {
        errors.push('INVALID_BROKER_CREDS: LIVE execution mode requires valid non-mock BROKER_API_KEY.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    environment,
    errors,
    warnings
  };
}

