import { RiskApprovalToken, MarketDirection } from '@iati/core-types';
import { verifyGovernanceSignature } from '../../../risk-governance/src/modules/riskTokenService';

export type ExecutionEnvironmentMode = 'PAPER' | 'DEMO' | 'LIVE';

export interface ExecutionSafetyParams {
  environment: ExecutionEnvironmentMode;
  brokerId: string;
  symbol: string;
  direction: MarketDirection;
  requestedLotSize: number;
  stopLoss?: number;
  takeProfit?: number;
  token?: RiskApprovalToken;
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    accountId?: string;
    accessToken?: string;
  };
}

export interface ExecutionSafetyResult {
  allowed: boolean;
  code: string;
  reason: string;
}

export function validateExecutionEnvironmentSafety(params: ExecutionSafetyParams): ExecutionSafetyResult {
  const { environment, brokerId, symbol, direction, requestedLotSize, stopLoss, takeProfit, token, credentials } = params;

  // 1. PAPER Environment rules
  if (environment === 'PAPER') {
    if (brokerId !== 'paper-broker-01') {
      return {
        allowed: false,
        code: 'PAPER_ENVIRONMENT_VIOLATION',
        reason: `PAPER environment ONLY permits PaperBrokerAdapter ('paper-broker-01'). Broker '${brokerId}' is not allowed.`
      };
    }
    return { allowed: true, code: 'ALLOWED_PAPER', reason: 'Execution allowed in PAPER environment.' };
  }

  // 2. DEMO Environment rules
  if (environment === 'DEMO') {
    if (brokerId === 'ctrader-broker-01') {
      const clientId = credentials ? credentials.clientId : process.env.CTRADER_CLIENT_ID;
      const accountId = credentials ? credentials.accountId : process.env.CTRADER_ACCOUNT_ID;
      if (!clientId || !accountId) {
        return {
          allowed: false,
          code: 'DEMO_CREDENTIALS_MISSING',
          reason: 'cTrader DEMO execution rejected: Missing required cTrader credentials (clientId/accountId).'
        };
      }
    }
    return { allowed: true, code: 'ALLOWED_DEMO', reason: 'Execution allowed in DEMO environment.' };
  }

  // 3. LIVE Environment rules — Strict Server-Side Fail-Closed Gate
  if (environment === 'LIVE') {
    // Arming state check
    const isArmed = process.env.ENABLE_LIVE_EXECUTION_ARMED === 'true';
    if (!isArmed) {
      return {
        allowed: false,
        code: 'LIVE_EXECUTION_DISARMED',
        reason: 'LIVE execution rejected: System ENABLE_LIVE_EXECUTION_ARMED flag is DISARMED.'
      };
    }

    // Credentials check
    const clientId = credentials?.clientId || process.env.CTRADER_CLIENT_ID;
    const clientSecret = credentials?.clientSecret || process.env.CTRADER_CLIENT_SECRET;
    const accountId = credentials?.accountId || process.env.CTRADER_ACCOUNT_ID;
    const accessToken = credentials?.accessToken || process.env.CTRADER_ACCESS_TOKEN;

    if (!clientId || !clientSecret || !accountId || !accessToken) {
      return {
        allowed: false,
        code: 'LIVE_CREDENTIALS_MISSING',
        reason: 'LIVE execution rejected: Missing required cTrader production credentials (clientId/clientSecret/accountId/accessToken).'
      };
    }

    // RiskApprovalToken existence
    if (!token) {
      return {
        allowed: false,
        code: 'MISSING_RISK_TOKEN',
        reason: 'LIVE execution rejected: Missing mandatory RiskApprovalToken.'
      };
    }

    // Status check
    if (token.status !== 'APPROVED') {
      return {
        allowed: false,
        code: 'TOKEN_NOT_APPROVED',
        reason: `LIVE execution rejected: RiskApprovalToken status is '${token.status}'.`
      };
    }

    // Signature verification
    if (!verifyGovernanceSignature(token)) {
      return {
        allowed: false,
        code: 'INVALID_GOVERNANCE_SIGNATURE',
        reason: 'LIVE execution rejected: Invalid governanceSignature on RiskApprovalToken.'
      };
    }

    // Expiry check (5 mins)
    if (Date.now() - token.riskCheckTimestamp > 5 * 60 * 1000) {
      return {
        allowed: false,
        code: 'EXPIRED_RISK_TOKEN',
        reason: 'LIVE execution rejected: RiskApprovalToken has expired (>5 minutes old).'
      };
    }

    // Symbol match
    const normTokenSymbol = token.symbol.replace('/', '').toUpperCase();
    const normReqSymbol = symbol.replace('/', '').toUpperCase();
    if (normTokenSymbol !== normReqSymbol) {
      return {
        allowed: false,
        code: 'SYMBOL_MISMATCH',
        reason: `LIVE execution rejected: Token symbol '${token.symbol}' does not match requested symbol '${symbol}'.`
      };
    }

    // Direction match
    if (token.direction !== direction) {
      return {
        allowed: false,
        code: 'DIRECTION_MISMATCH',
        reason: `LIVE execution rejected: Token direction '${token.direction}' does not match requested direction '${direction}'.`
      };
    }

    // Lot size check
    if (requestedLotSize > token.approvedLotSize) {
      return {
        allowed: false,
        code: 'LOT_SIZE_EXCEEDED',
        reason: `LIVE execution rejected: Requested lot size (${requestedLotSize}) exceeds approved lot size (${token.approvedLotSize}).`
      };
    }

    // SL/TP existence validation
    const activeSL = stopLoss ?? token.stopLoss ?? token.stop_loss;
    const activeTP = takeProfit ?? token.takeProfit ?? token.take_profit;

    if (!activeSL || activeSL <= 0) {
      return {
        allowed: false,
        code: 'INVALID_STOP_LOSS',
        reason: 'LIVE execution rejected: Explicit valid stop loss is required.'
      };
    }

    if (!activeTP || activeTP <= 0) {
      return {
        allowed: false,
        code: 'INVALID_TAKE_PROFIT',
        reason: 'LIVE execution rejected: Explicit valid take profit is required.'
      };
    }

    return { allowed: true, code: 'ALLOWED_LIVE', reason: 'All server-side LIVE execution safety gate invariants verified.' };
  }

  return { allowed: false, code: 'UNKNOWN_ENVIRONMENT', reason: `Unknown execution environment '${environment}'.` };
}
