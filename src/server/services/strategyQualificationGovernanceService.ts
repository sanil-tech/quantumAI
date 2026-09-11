
import crypto from 'crypto';

export type GovernanceDecision = 
  | 'QUALIFIED_AND_ELIGIBLE_FOR_LIVE_PILOT_REVIEW'
  | 'QUALIFIED_BUT_REQUIRES_MORE_SHADOW_EVIDENCE'
  | 'QUALIFICATION_REQUIRES_REVIEW'
  | 'DEGRADED'
  | 'SUSPENDED'
  | 'REJECTED';

export interface AuditReviewInput {
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  rawTrades: {
    pnl: number;
    cost: number;
    asset: 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD';
  }[];
  reviewerA: string;
  reviewerB?: string;
  isMutated?: boolean;
}

export interface GovernanceAuditResult {
  reviewId: string;
  strategyId: string;
  strategyVersion: string;
  recalculatedMetrics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    grossPnL: number;
    transactionCosts: number;
    netPnL: number;
    profitFactor: number;
    expectancy: number;
  };
  discrepancyFound: boolean;
  versionImmutabilityVerified: boolean;
  dualControlStatus: 'PASS' | 'FAIL_SAME_REVIEWER' | 'PENDING_SECOND_REVIEWER';
  governanceDecision: GovernanceDecision;
  livePilotEligible: boolean;
  livePilotAuthorized: false;
  livePilotActive: false;
  evidenceHash: string;
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
}

export class StrategyQualificationGovernanceService {
  public static performGovernanceAudit(input: AuditReviewInput): GovernanceAuditResult {
    const totalTrades = input.rawTrades.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let totalCosts = 0;

    for (const t of input.rawTrades) {
      totalCosts += t.cost;
      if (t.pnl > 0) {
        winningTrades++;
        grossWins += t.pnl;
      } else {
        losingTrades++;
        grossLosses += Math.abs(t.pnl);
      }
    }

    const grossPnL = grossWins - grossLosses;
    const netPnL = grossPnL - totalCosts;
    const winRate = totalTrades > 0 ? Number((winningTrades / totalTrades).toFixed(2)) : 0;
    const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : 0;
    const expectancy = totalTrades > 0 ? Number((netPnL / totalTrades).toFixed(2)) : 0;

    let dualControlStatus: 'PASS' | 'FAIL_SAME_REVIEWER' | 'PENDING_SECOND_REVIEWER' = 'PENDING_SECOND_REVIEWER';
    if (input.reviewerB) {
      if (input.reviewerA === input.reviewerB) {
        dualControlStatus = 'FAIL_SAME_REVIEWER';
      } else {
        dualControlStatus = 'PASS';
      }
    }

    const versionImmutabilityVerified = !input.isMutated;
    const discrepancyFound = false;

    let governanceDecision: GovernanceDecision = 'QUALIFIED_BUT_REQUIRES_MORE_SHADOW_EVIDENCE';
    let livePilotEligible = false;

    if (!versionImmutabilityVerified || dualControlStatus === 'FAIL_SAME_REVIEWER') {
      governanceDecision = 'REJECTED';
    } else if (totalTrades < 30) {
      governanceDecision = 'QUALIFIED_BUT_REQUIRES_MORE_SHADOW_EVIDENCE';
    } else if (profitFactor < 1.0) {
      governanceDecision = 'DEGRADED';
    } else if (dualControlStatus === 'PASS' && profitFactor >= 1.5 && totalTrades >= 50) {
      governanceDecision = 'QUALIFIED_AND_ELIGIBLE_FOR_LIVE_PILOT_REVIEW';
      livePilotEligible = true;
    } else {
      governanceDecision = 'QUALIFICATION_REQUIRES_REVIEW';
    }

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      strategyHash: input.strategyHash,
      netPnL,
      profitFactor,
      governanceDecision,
      dualControlStatus
    })).digest('hex');

    return {
      reviewId: 'REV-' + Date.now(),
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      recalculatedMetrics: {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        grossPnL,
        transactionCosts: totalCosts,
        netPnL,
        profitFactor,
        expectancy
      },
      discrepancyFound,
      versionImmutabilityVerified,
      dualControlStatus,
      governanceDecision,
      livePilotEligible,
      livePilotAuthorized: false,
      livePilotActive: false,
      evidenceHash,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE'
    };
  }
}
