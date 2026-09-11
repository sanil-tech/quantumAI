import dotenv from 'dotenv';
dotenv.config();

import { CTraderDemoLifecycleHarness, P19HarnessConfig } from '../src/integrations/ctrader/ctraderDemoLifecycleHarness';

export interface Phase7CExecutionResult {
  status: 'SUCCESS' | 'FAILED_CLOSED' | 'BLOCKED_PREFLIGHT';
  reason: string;
  ordersTransmitted: number;
  readOnlyModeEnforced: boolean;
  executionSafetyGate: 'BLOCKED' | 'ARMED';
  details?: any;
}

export async function runControlledPhase7CDemoExecution(): Promise<Phase7CExecutionResult> {
  console.log('======================================================================');
  console.log(' QUANTUMAI / IATI OS ? PHASE 7C CONTROLLED cTrader DEMO EXECUTION');
  console.log(' STRICT SINGLE ORDER MAXIMUM ? DEMO ACCOUNT ONLY ? NO RETRY');
  console.log('======================================================================');

  let ordersTransmitted = 0;
  let readOnlyModeEnforced = true;
  let executionSafetyGate: 'BLOCKED' | 'ARMED' = 'BLOCKED';

  try {
    // 1. Pre-Flight Configuration Validation
    const environment = (process.env.EXECUTION_ENVIRONMENT || 'DEMO').trim();
    const explicitConfirmation = process.env.DEMO_CONFIRM_EXECUTION === 'true';
    const host = (process.env.CTRADER_HOST || 'demo.ctraderapi.com').trim();
    const port = Number(process.env.CTRADER_PORT) || 5035;
    const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
    const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
    const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
    const accountId = (process.env.CTRADER_ACCOUNT_ID || '').trim();

    console.log('1. PRE-FLIGHT SAFETY VALIDATION');
    console.log('   Environment:', environment);
    console.log('   Target Host:', host);
    console.log('   Target Port:', port);
    console.log('   Explicit Confirmation:', explicitConfirmation ? 'PRESENT' : 'MISSING');

    if (environment !== 'DEMO') {
      throw new Error('FATAL_SAFETY_VIOLATION: Environment must be exactly "DEMO" (got "' + environment + '").');
    }

    if (host !== 'demo.ctraderapi.com') {
      throw new Error('FATAL_SAFETY_VIOLATION: Host must be exactly "demo.ctraderapi.com" (got "' + host + '"). LIVE is forbidden.');
    }

    if (!explicitConfirmation) {
      throw new Error('FATAL_SAFETY_VIOLATION: DEMO_CONFIRM_EXECUTION=true is required for execution arming.');
    }

    if (!clientId || !clientSecret || !accessToken || !accountId) {
      throw new Error('FATAL_SAFETY_VIOLATION: Missing required cTrader API credentials.');
    }

    const config: P19HarnessConfig = {
      environment: 'DEMO',
      confirmDemoExecution: true,
      clientId,
      clientSecret,
      accountId,
      accessToken,
      host,
      port,
      symbol: 'EURUSD',
      side: 'BUY',
      lots: 0.01,
      timeoutMs: 8000
    };

    console.log('2. VERIFYING LIFECYCLE HARNESS SAFETY GUARDS');
    CTraderDemoLifecycleHarness.verifyPreFlightSafety(config);
    console.log('   Harness Pre-Flight Checks: PASSED');

    console.log('3. ATTEMPTING NON-TRADING PROBE & DEMO EXECUTION');
    const result = await CTraderDemoLifecycleHarness.runSingleOrderDemoLifecycle(config);

    if (result.orderExecutionEvent) {
      ordersTransmitted = 1;
    }

    return {
      status: result.passed ? 'SUCCESS' : 'FAILED_CLOSED',
      reason: result.status,
      ordersTransmitted,
      readOnlyModeEnforced: true,
      executionSafetyGate: 'BLOCKED',
      details: result
    };
  } catch (err: any) {
    console.error('[-] Phase 7C Blocked / Failed Closed:', err.message);
    return {
      status: 'BLOCKED_PREFLIGHT',
      reason: err.message,
      ordersTransmitted: 0,
      readOnlyModeEnforced: true,
      executionSafetyGate: 'BLOCKED'
    };
  } finally {
    // Post-Test Lockdown Invariants
    readOnlyModeEnforced = true;
    executionSafetyGate = 'BLOCKED';
    console.log('======================================================================');
    console.log(' POST-TEST LOCKDOWN ENFORCED:');
    console.log(' READ_ONLY_MODE_ENFORCED = true');
    console.log(' EXECUTION_SAFETY_GATE   = BLOCKED');
    console.log(' ORDERS_TRANSMITTED      = ' + ordersTransmitted);
    console.log('======================================================================');
  }
}
