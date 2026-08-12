import { RiskApprovalToken, MarketDataMode, MarketDirection } from '@iati/core-types';
import { verifyGovernanceSignature } from './riskTokenService';

export interface RequestedOrder {
  symbol: string;
  direction: MarketDirection | 'BUY' | 'SELL';
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  price?: number;
}

export interface AuthorizationRequest {
  signalId?: string;
  requestedOrder: RequestedOrder;
  token?: RiskApprovalToken;
  dataMode?: MarketDataMode;
  executionMode?: 'LIVE' | 'PAPER';
  accountId?: string;
  tradingRepo?: any;
}

export interface AuthorizationResult {
  authorized: boolean;
  token?: RiskApprovalToken;
  reason?: string;
  errorCode?: 'MISSING_TOKEN' | 'REJECTED_TOKEN' | 'EXPIRED_TOKEN' | 'INVALID_SIGNATURE' | 'SYMBOL_MISMATCH' | 'DIRECTION_MISMATCH' | 'LOT_SIZE_EXCEEDED' | 'SIGNAL_MISMATCH' | 'RISK_PERSISTENCE_FAILED' | 'LINEAGE_VIOLATION' | 'UNAUTHORIZED';
}

const MAX_TOKEN_AGE_MS = 5 * 60 * 1000; // 5 minutes

export async function authorizeExecution(request: AuthorizationRequest): Promise<AuthorizationResult> {
  const { signalId, requestedOrder, token, dataMode, executionMode = 'PAPER', accountId = 'DEFAULT', tradingRepo } = request;

  // 1. Missing Token Check
  if (!token) {
    return {
      authorized: false,
      errorCode: 'MISSING_TOKEN',
      reason: 'Execution Authorization Failed: Missing RiskApprovalToken. NO VALID RiskApprovalToken = NO EXECUTION.'
    };
  }

  // 2. Token Status Check
  if (token.status !== 'APPROVED') {
    return {
      authorized: false,
      token,
      errorCode: 'REJECTED_TOKEN',
      reason: `Execution Authorization Failed: RiskApprovalToken status is '${token.status}'. Rejection reason: ${token.rejectionReason || 'None provided'}`
    };
  }

  // 3. Token Expiration Check
  const tokenAge = Date.now() - token.riskCheckTimestamp;
  if (tokenAge > MAX_TOKEN_AGE_MS) {
    return {
      authorized: false,
      token,
      errorCode: 'EXPIRED_TOKEN',
      reason: `Execution Authorization Failed: RiskApprovalToken expired (age: ${Math.round(tokenAge / 1000)}s, max: 300s).`
    };
  }

  // 4. Governance Signature Check
  if (!verifyGovernanceSignature(token)) {
    return {
      authorized: false,
      token,
      errorCode: 'INVALID_SIGNATURE',
      reason: 'Execution Authorization Failed: Invalid or tampered governanceSignature on RiskApprovalToken.'
    };
  }

  // 5. Signal ID Match Check
  if (signalId && token.signalId && signalId !== token.signalId) {
    return {
      authorized: false,
      token,
      errorCode: 'SIGNAL_MISMATCH',
      reason: `Execution Authorization Failed: Token signalId '${token.signalId}' does not match requested signalId '${signalId}'.`
    };
  }

  // 6. Symbol Match Check (normalized)
  const normTokenSymbol = token.symbol.replace('/', '').toUpperCase();
  const normOrderSymbol = requestedOrder.symbol.replace('/', '').toUpperCase();
  if (normTokenSymbol !== normOrderSymbol) {
    return {
      authorized: false,
      token,
      errorCode: 'SYMBOL_MISMATCH',
      reason: `Execution Authorization Failed: Token symbol '${token.symbol}' does not match requested order symbol '${requestedOrder.symbol}'.`
    };
  }

  // 7. Direction Match Check
  if (token.direction !== requestedOrder.direction) {
    return {
      authorized: false,
      token,
      errorCode: 'DIRECTION_MISMATCH',
      reason: `Execution Authorization Failed: Token direction '${token.direction}' does not match requested order direction '${requestedOrder.direction}'.`
    };
  }

  // 8. Lot Size / Quantity Check
  if (requestedOrder.quantity > token.approvedLotSize + 0.0001) {
    return {
      authorized: false,
      token,
      errorCode: 'LOT_SIZE_EXCEEDED',
      reason: `Execution Authorization Failed: Requested lot size (${requestedOrder.quantity}) exceeds approved lot size (${token.approvedLotSize}).`
    };
  }

  // 9. Phase 1B Lineage Invariant Check (LIVE mode rejects SYNTHETIC or SIMULATION data)
  if (executionMode === 'LIVE') {
    if (dataMode === 'SYNTHETIC' || dataMode === 'SIMULATION') {
      return {
        authorized: false,
        token,
        errorCode: 'LINEAGE_VIOLATION',
        reason: `Execution Authorization Failed: LIVE execution rejected for ${dataMode} market data lineage.`
      };
    }
  }

  // 10. Persistence Check
  if (tradingRepo) {
    try {
      const isConnected = typeof tradingRepo.isDbConnected === 'function' ? tradingRepo.isDbConnected() : true;
      if (isConnected && tradingRepo.saveTradingLog) {
        await tradingRepo.saveTradingLog({
          id: `risk-audit-${token.approvalId}`,
          accountId,
          timestamp: new Date(),
          text: `[RISK_GOVERNANCE_APPROVAL] ApprovalId: ${token.approvalId} | Signal: ${token.signalId} | Symbol: ${token.symbol} | Direction: ${token.direction} | ApprovedLot: ${token.approvedLotSize} | RiskAmount: ${token.calculatedRiskAmount} | Status: ${token.status}`,
          type: 'INFO'
        });
      }
    } catch (err: any) {
      return {
        authorized: false,
        token,
        errorCode: 'RISK_PERSISTENCE_FAILED',
        reason: `RISK_PERSISTENCE_FAILED: Database failure while persisting risk decision. ${err.message}`
      };
    }
  }

  return {
    authorized: true,
    token
  };
}
