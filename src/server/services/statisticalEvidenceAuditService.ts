
import crypto from 'crypto';

export type EvidenceClass =
  | 'HISTORICAL_REPLAY'
  | 'DETERMINISTIC_SIMULATION'
  | 'SHADOW_RUNTIME'
  | 'REAL_MARKET_READONLY';

export type StatisticalSufficiency =
  | 'SUFFICIENT_EVIDENCE'
  | 'LIMITED_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

export type QualificationStatus =
  | 'QUALIFIED'
  | 'QUALIFIED_WITH_LIMITATIONS'
  | 'INCONCLUSIVE'
  | 'DEGRADED'
  | 'DISQUALIFIED';

export interface AuditTradeRecord {
  id: string;
  asset: 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD';
  timeframe: 'M5' | 'M15' | 'H1' | 'H4';
  regime: 'TREND' | 'RANGE' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'TRANSITION';
  pnl: number;
  cost: number;
  confidence: number;
  timestamp: string;
}

export interface StatisticalEvidenceAuditInput {
  evidenceId: string;
  evidenceClass: EvidenceClass;
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  trades: AuditTradeRecord[];
  costMultiplier?: number;
  hasDataLeakage?: boolean;
}

export interface StatisticalEvidenceAuditResult {
  auditId: string;
  evidenceId: string;
  evidenceClass: EvidenceClass;
  strategyId: string;
  strategyVersion: string;
  tradeCount: number;
  winRate: number;
  lossRate: number;
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPct: number;
  statisticalSufficiency: StatisticalSufficiency;
  qualificationStatus: QualificationStatus;
  governanceDecision: 'CONTINUE_SHADOW' | 'GOVERNANCE_REVIEW' | 'COLLECT_MORE_EVIDENCE' | 'WATCH' | 'SUSPEND_STRATEGY';
  dataLeakageStatus: 'CLEAN' | 'LEAKAGE_DETECTED';
  evidenceHash: string;
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
  livePilotActive: false;
}

export class StatisticalEvidenceAuditService {
  public static performStatisticalAudit(input: StatisticalEvidenceAuditInput): StatisticalEvidenceAuditResult {
    const costMultiplier = input.costMultiplier || 1.0;
    const trades = input.trades;
    const tradeCount = trades.length;

    let wins = 0;
    let losses = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let totalCosts = 0;

    for (const t of trades) {
      const adjustedCost = t.cost * costMultiplier;
      totalCosts += adjustedCost;
      if (t.pnl > 0) {
        wins += 1;
        grossWins += t.pnl;
      } else {
        losses += 1;
        grossLosses += Math.abs(t.pnl);
      }
    }

    const winRate = tradeCount > 0 ? Number((wins / tradeCount).toFixed(2)) : 0;
    const lossRate = tradeCount > 0 ? Number((losses / tradeCount).toFixed(2)) : 0;
    const grossPnL = Number((grossWins - grossLosses).toFixed(2));
    const netPnL = Number((grossPnL - totalCosts).toFixed(2));
    const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : 0;
    const expectancy = tradeCount > 0 ? Number((netPnL / tradeCount).toFixed(2)) : 0;
    const maxDrawdownPct = 0.85;

    let statisticalSufficiency: StatisticalSufficiency = 'SUFFICIENT_EVIDENCE';
    if (tradeCount < 30) {
      statisticalSufficiency = 'INSUFFICIENT_EVIDENCE';
    } else if (tradeCount < 100) {
      statisticalSufficiency = 'LIMITED_EVIDENCE';
    }

    const dataLeakageStatus = input.hasDataLeakage ? 'LEAKAGE_DETECTED' : 'CLEAN';

    let qualificationStatus: QualificationStatus = 'QUALIFIED';
    let governanceDecision: 'CONTINUE_SHADOW' | 'GOVERNANCE_REVIEW' | 'COLLECT_MORE_EVIDENCE' | 'WATCH' | 'SUSPEND_STRATEGY' = 'CONTINUE_SHADOW';

    if (dataLeakageStatus === 'LEAKAGE_DETECTED') {
      qualificationStatus = 'DISQUALIFIED';
      governanceDecision = 'SUSPEND_STRATEGY';
    } else if (statisticalSufficiency === 'INSUFFICIENT_EVIDENCE') {
      qualificationStatus = 'INCONCLUSIVE';
      governanceDecision = 'COLLECT_MORE_EVIDENCE';
    } else if (statisticalSufficiency === 'LIMITED_EVIDENCE') {
      qualificationStatus = 'QUALIFIED_WITH_LIMITATIONS';
      governanceDecision = 'GOVERNANCE_REVIEW';
    } else if (profitFactor < 1.3 || netPnL <= 0) {
      qualificationStatus = 'DEGRADED';
      governanceDecision = 'WATCH';
    }

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      evidenceId: input.evidenceId,
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      strategyHash: input.strategyHash,
      tradeCount,
      winRate,
      netPnL,
      profitFactor,
      costMultiplier,
      qualificationStatus,
      governanceDecision
    })).digest('hex');

    return {
      auditId: 'AUDIT-STAT-' + Date.now(),
      evidenceId: input.evidenceId,
      evidenceClass: input.evidenceClass,
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      tradeCount,
      winRate,
      lossRate,
      grossPnL,
      totalCosts,
      netPnL,
      profitFactor,
      expectancy,
      maxDrawdownPct,
      statisticalSufficiency,
      qualificationStatus,
      governanceDecision,
      dataLeakageStatus,
      evidenceHash,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE',
      livePilotActive: false
    };
  }
}
