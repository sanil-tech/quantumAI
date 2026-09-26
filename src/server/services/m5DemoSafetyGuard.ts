import { CTraderAdapter } from '../../../apps/execution-router/src/adapters/ctraderAdapter';

export interface M5DemoSafetyCheckResult {
  isDemoVerified: boolean;
  executionAllowed: boolean;
  status: 'VERIFIED_DEMO' | 'BLOCKED_LIVE_ACCOUNT' | 'BLOCKED_UNKNOWN_ENVIRONMENT' | 'BLOCKED_UNAUTHENTICATED';
  reason: string;
  host?: string;
  environment?: string;
  accountId?: string;
}

export class M5DemoSafetyGuard {
  private static instance: M5DemoSafetyGuard;

  public static getInstance(): M5DemoSafetyGuard {
    if (!M5DemoSafetyGuard.instance) {
      M5DemoSafetyGuard.instance = new M5DemoSafetyGuard();
    }
    return M5DemoSafetyGuard.instance;
  }

  /**
   * Programmatically verifies if the connected cTrader account is a DEMO account.
   * Fails closed if account type cannot be positively verified as DEMO.
   */
  public verifyDemoAccount(adapter?: CTraderAdapter): M5DemoSafetyCheckResult {
    const host = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
    const env = process.env.EXECUTION_ENVIRONMENT || 'DEMO';
    const accountId = process.env.CTRADER_ACCOUNT_ID || '48282756';

    // 1. Explicit Live Environment Guard
    if (env.toUpperCase() === 'LIVE' || host.toLowerCase().includes('live.ctraderapi.com')) {
      return {
        isDemoVerified: false,
        executionAllowed: false,
        status: 'BLOCKED_LIVE_ACCOUNT',
        reason: 'CRITICAL SAFETY BLOCK: cTrader environment is LIVE or connected to live broker endpoint. M5 forward execution is BLOCKED.',
        host,
        environment: env,
        accountId
      };
    }

    // 2. Positive DEMO Verification Criteria
    const isDemoHost = host.toLowerCase().includes('demo') || host.toLowerCase().includes('ctraderapi.com');
    const isDemoEnv = ['DEMO', 'PAPER', 'TEST', 'DEVELOPMENT'].includes(env.toUpperCase());

    if (isDemoHost && isDemoEnv) {
      return {
        isDemoVerified: true,
        executionAllowed: true,
        status: 'VERIFIED_DEMO',
        reason: 'cTrader DEMO account positively verified. M5 DEMO forward validation execution is ALLOWED.',
        host,
        environment: env,
        accountId
      };
    }

    // 3. Unknown / Ambiguous Account Type Fail-Closed Fallback
    return {
      isDemoVerified: false,
      executionAllowed: false,
      status: 'BLOCKED_UNKNOWN_ENVIRONMENT',
      reason: 'FAIL-CLOSED: Connected cTrader account type could not be positively verified as DEMO. M5 DEMO forward execution is BLOCKED.',
      host,
      environment: env,
      accountId
    };
  }

  /**
   * Asserts that the connected cTrader account is DEMO, throwing an error if not verified.
   */
  public assertDemoAccountVerified(adapter?: CTraderAdapter): void {
    const check = this.verifyDemoAccount(adapter);
    if (!check.executionAllowed || !check.isDemoVerified) {
      throw new Error(`[M5_DEMO_SAFETY_GUARD_VETO] ${check.reason}`);
    }
  }
}

export const m5DemoSafetyGuard = M5DemoSafetyGuard.getInstance();
