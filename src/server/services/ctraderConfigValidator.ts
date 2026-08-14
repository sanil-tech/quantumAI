export interface CTraderSanitizedStatus {
  status: 'NOT_CONFIGURED' | 'AUTHENTICATION_FAILED' | 'BROKER_UNAVAILABLE' | 'ACCOUNT_UNAVAILABLE' | 'CONNECTED';
  connected: boolean;
  environment: 'PAPER' | 'DEMO' | 'LIVE';
  brokerId: string;
  accountId?: string;
  balance?: number;
  equity?: number;
  currency?: string;
  leverage?: number;
  lastSyncedAt?: Date;
  error?: string;
}

export interface CTraderValidatedConfig {
  clientId: string;
  clientSecret: string;
  accountId: string;
  accessToken: string;
  environment: 'DEMO';
  host: string;
  port: number;
}

export class CTraderConfigValidator {
  public static validateDemoConfig(overrides?: Partial<CTraderValidatedConfig>): CTraderValidatedConfig {
    const env = (process.env.EXECUTION_ENVIRONMENT || 'DEMO').toUpperCase();

    if (env !== 'DEMO') {
      throw new Error('CTRADER_CONFIG_ERROR: Phase 3B requires EXECUTION_ENVIRONMENT=DEMO. Current environment is ' + env + '.');
    }

    const clientId = overrides?.clientId !== undefined ? overrides.clientId : process.env.CTRADER_CLIENT_ID;
    const clientSecret = overrides?.clientSecret !== undefined ? overrides.clientSecret : process.env.CTRADER_CLIENT_SECRET;
    const accountId = overrides?.accountId !== undefined ? overrides.accountId : process.env.CTRADER_ACCOUNT_ID;
    const accessToken = overrides?.accessToken !== undefined ? overrides.accessToken : process.env.CTRADER_ACCESS_TOKEN;

    if (!clientId || !clientSecret || !accountId || !accessToken) {
      const missing: string[] = [];
      if (!clientId) missing.push('CTRADER_CLIENT_ID');
      if (!clientSecret) missing.push('CTRADER_CLIENT_SECRET');
      if (!accountId) missing.push('CTRADER_ACCOUNT_ID');
      if (!accessToken) missing.push('CTRADER_ACCESS_TOKEN');

      throw new Error('CTRADER_DEMO_CREDENTIALS_MISSING: Required cTrader DEMO credentials missing: [' + missing.join(', ') + ']. Server-side failure.');
    }

    const requestedHost = overrides?.host || process.env.CTRADER_HOST;
    const expectedHost = env === 'DEMO' ? 'demo.ctraderapi.com' : 'live.ctraderapi.com';

    if (requestedHost && requestedHost !== expectedHost) {
      throw new Error('CTRADER_ENDPOINT_ENVIRONMENT_MISMATCH: Declared environment ' + env + ' requires host ' + expectedHost + ', but host ' + requestedHost + ' was configured.');
    }

    return {
      clientId,
      clientSecret,
      accountId,
      accessToken,
      environment: 'DEMO',
      host: expectedHost,
      port: Number(process.env.CTRADER_PORT || 5035)
    };
  }

  public static sanitizeAccountStatus(
    status: 'NOT_CONFIGURED' | 'AUTHENTICATION_FAILED' | 'BROKER_UNAVAILABLE' | 'ACCOUNT_UNAVAILABLE' | 'CONNECTED',
    rawDetails?: any,
    errorMsg?: string
  ): CTraderSanitizedStatus {
    const environment = (process.env.EXECUTION_ENVIRONMENT as any) || 'DEMO';
    const accountId = rawDetails?.accountId || process.env.CTRADER_ACCOUNT_ID;

    const sanitizedAccountId = accountId
      ? (accountId.length > 4 ? accountId.slice(0, 4) + '***' : accountId)
      : undefined;

    return {
      status,
      connected: status === 'CONNECTED',
      environment,
      brokerId: 'ctrader-broker-01',
      accountId: sanitizedAccountId,
      balance: rawDetails?.balance,
      equity: rawDetails?.equity,
      currency: rawDetails?.currency,
      leverage: rawDetails?.leverage,
      lastSyncedAt: status === 'CONNECTED' ? new Date() : undefined,
      error: errorMsg
    };
  }
}
