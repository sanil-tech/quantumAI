import * as crypto from 'crypto';
import { RiskApprovalToken, GovernanceDecisionStatus, MarketDirection } from '@iati/core-types';

const GOVERNANCE_SECRET = process.env.GOVERNANCE_SECRET || 'IATI_OS_CANONICAL_RISK_SECRET_2026';

export function generateGovernanceSignature(payload: {
  approvalId: string;
  signalId: string;
  symbol: string;
  direction: string;
  approvedLotSize: number;
  status: string;
  riskCheckTimestamp: number;
}): string {
  const normalizedSymbol = payload.symbol.replace('/', '').toUpperCase();
  const dataString = `${payload.approvalId}:${payload.signalId}:${normalizedSymbol}:${payload.direction}:${Number(payload.approvedLotSize).toFixed(4)}:${payload.status}:${payload.riskCheckTimestamp}:${GOVERNANCE_SECRET}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

export function verifyGovernanceSignature(token: RiskApprovalToken): boolean {
  if (!token || !token.governanceSignature) return false;
  const expectedSignature = generateGovernanceSignature({
    approvalId: token.approvalId,
    signalId: token.signalId,
    symbol: token.symbol,
    direction: token.direction,
    approvedLotSize: token.approvedLotSize,
    status: token.status,
    riskCheckTimestamp: token.riskCheckTimestamp
  });
  return token.governanceSignature === expectedSignature;
}

export interface CreateTokenParams {
  approvalId: string;
  signalId: string;
  symbol: string;
  direction: MarketDirection;
  approvedLotSize: number;
  maxAllowedDrawdown: number;
  calculatedRiskAmount: number;
  status: GovernanceDecisionStatus;
  rejectionReason?: string;
  strategyId?: string;
  strategyVersion?: string;
  timestamp?: number;
}

export function createRiskApprovalToken(params: CreateTokenParams): RiskApprovalToken {
  const riskCheckTimestamp = params.timestamp || Date.now();
  const signature = generateGovernanceSignature({
    approvalId: params.approvalId,
    signalId: params.signalId,
    symbol: params.symbol,
    direction: params.direction,
    approvedLotSize: params.approvedLotSize,
    status: params.status,
    riskCheckTimestamp
  });

  return {
    approvalId: params.approvalId,
    signalId: params.signalId,
    symbol: params.symbol,
    direction: params.direction,
    approvedLotSize: params.approvedLotSize,
    maxAllowedDrawdown: params.maxAllowedDrawdown,
    calculatedRiskAmount: params.calculatedRiskAmount,
    riskCheckTimestamp,
    status: params.status,
    rejectionReason: params.rejectionReason,
    governanceSignature: signature,
    strategyId: params.strategyId || 'DEFAULT_STRATEGY',
    strategyVersion: params.strategyVersion || '1.0'
  };
}
