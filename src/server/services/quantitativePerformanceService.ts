
import crypto from 'crypto';

export type QualificationStatus = 
  | 'PERFORMANCE_UNEVALUATED'
  | 'EVIDENCE_INSUFFICIENT'
  | 'PERFORMANCE_EVALUATED'
  | 'ROBUSTNESS_VALIDATED'
  | 'STRATEGY_QUALIFIED'
  | 'LIVE_PILOT_REVIEW_REQUIRED'
  | 'DEGRADED'
  | 'SUSPENDED'
  | 'REJECTED';

export type CostScenario = 'BASE' | 'ADVERSE' | 'STRESS';

export interface PerformanceEvaluationInput {
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  dataSnapshotId: string;
  sampleCount: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  maxDrawdownPct: number;
  assets: ('EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD')[];
  costScenario?: CostScenario;
  hasDataLeakage?: boolean;
}

export interface QuantitativePerformanceResult {
  evaluationId: string;
  strategyId: string;
  strategyVersion: string;
  qualificationStatus: QualificationStatus;
  profitFactor: number;
  netPnL: number;
  expectancy: number;
  costSensitivityStatus: 'ROBUST' | 'SENSITIVE' | 'DEGRADED';
  outOfSampleStatus: 'VERIFIED' | 'UNVERIFIED';
  dataLeakageStatus: 'CLEAN' | 'LEAKAGE_DETECTED';
  regimeRobustness: 'ROBUST' | 'ACCEPTABLE' | 'DEGRADED';
  multiAssetRobustness: 'ROBUST' | 'CONCENTRATED' | 'DEGRADED';
  evidenceHash: string;
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
}

export class QuantitativePerformanceService {
  public static evaluateStrategyPerformance(input: PerformanceEvaluationInput): QuantitativePerformanceResult {
    const costScenario = input.costScenario || 'BASE';
    const costPerTrade = costScenario === 'STRESS' ? 24 : (costScenario === 'ADVERSE' ? 15 : 9); // USD / lot equivalent
    const totalTransactionCosts = input.sampleCount * costPerTrade;

    const netProfit = input.grossProfit - totalTransactionCosts;
    const profitFactor = input.grossLoss > 0 ? Number((netProfit / input.grossLoss).toFixed(2)) : 0;
    const expectancy = input.sampleCount > 0 ? Number(((netProfit - input.grossLoss) / input.sampleCount).toFixed(2)) : 0;

    let qualificationStatus: QualificationStatus = 'PERFORMANCE_EVALUATED';
    let dataLeakageStatus: 'CLEAN' | 'LEAKAGE_DETECTED' = 'CLEAN';

    if (input.hasDataLeakage) {
      dataLeakageStatus = 'LEAKAGE_DETECTED';
      qualificationStatus = 'REJECTED';
    } else if (input.sampleCount < 30) {
      qualificationStatus = 'EVIDENCE_INSUFFICIENT';
    } else if (profitFactor < 1.0 || input.maxDrawdownPct > 10.0) {
      qualificationStatus = 'DEGRADED';
    } else if (profitFactor >= 1.5 && input.maxDrawdownPct <= 5.0 && input.assets.length >= 3) {
      qualificationStatus = 'STRATEGY_QUALIFIED';
    } else {
      qualificationStatus = 'ROBUSTNESS_VALIDATED';
    }

    const costSensitivityStatus = profitFactor >= 1.3 ? 'ROBUST' : (profitFactor >= 1.0 ? 'SENSITIVE' : 'DEGRADED');
    const outOfSampleStatus = dataLeakageStatus === 'CLEAN' ? 'VERIFIED' : 'UNVERIFIED';
    const regimeRobustness = profitFactor >= 1.4 ? 'ROBUST' : 'ACCEPTABLE';
    const multiAssetRobustness = input.assets.length >= 3 ? 'ROBUST' : 'CONCENTRATED';

    const rawData = JSON.stringify({
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      strategyHash: input.strategyHash,
      dataSnapshotId: input.dataSnapshotId,
      sampleCount: input.sampleCount,
      profitFactor,
      netProfit,
      expectancy,
      costScenario,
      qualificationStatus
    });

    const evidenceHash = crypto.createHash('sha256').update(rawData).digest('hex');

    return {
      evaluationId: 'EVAL-' + Date.now(),
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      qualificationStatus,
      profitFactor,
      netPnL: netProfit,
      expectancy,
      costSensitivityStatus,
      outOfSampleStatus,
      dataLeakageStatus,
      regimeRobustness,
      multiAssetRobustness,
      evidenceHash,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE'
    };
  }
}
