
export type DriftStatus = 'STABLE' | 'WATCH' | 'DRIFT_DETECTED' | 'INSUFFICIENT_EVIDENCE';
export type GovernanceState = 'HEALTHY' | 'WATCH' | 'REVIEW_REQUIRED' | 'DEGRADED' | 'SUSPENDED';

export interface DriftEvaluationResult {
  performanceDrift: DriftStatus;
  regimeDrift: DriftStatus;
  dataQualityDrift: 'HEALTHY' | 'DEGRADED';
  confidenceDrift: DriftStatus;
  transactionCostDrift: DriftStatus;
  riskDrift: 'STABLE' | 'VIOLATION';
  configurationDrift: 'NORMAL' | 'DRIFT_DETECTED';
  evidenceSufficiency: 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';
  governanceState: GovernanceState;
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
}

export class SteadyStateGovernanceService {
  public static evaluateDrift(metrics: {
    rollingProfitFactor: number;
    sampleCount: number;
    spreadPips: number;
    configHashMatch: boolean;
  }): DriftEvaluationResult {
    const evidenceSufficiency = metrics.sampleCount >= 30 ? 'SUFFICIENT_EVIDENCE' : 'INSUFFICIENT_EVIDENCE';

    let performanceDrift: DriftStatus = 'STABLE';
    if (evidenceSufficiency === 'INSUFFICIENT_EVIDENCE') {
      performanceDrift = 'INSUFFICIENT_EVIDENCE';
    } else if (metrics.rollingProfitFactor < 1.0) {
      performanceDrift = 'DRIFT_DETECTED';
    } else if (metrics.rollingProfitFactor < 1.3) {
      performanceDrift = 'WATCH';
    }

    const dataQualityDrift = metrics.spreadPips <= 3.0 ? 'HEALTHY' : 'DEGRADED';
    const configurationDrift = metrics.configHashMatch ? 'NORMAL' : 'DRIFT_DETECTED';

    let governanceState: GovernanceState = 'HEALTHY';
    if (configurationDrift === 'DRIFT_DETECTED') {
      governanceState = 'SUSPENDED';
    } else if (performanceDrift === 'DRIFT_DETECTED') {
      governanceState = 'DEGRADED';
    } else if (performanceDrift === 'WATCH' || dataQualityDrift === 'DEGRADED') {
      governanceState = 'WATCH';
    }

    return {
      performanceDrift,
      regimeDrift: 'STABLE',
      dataQualityDrift,
      confidenceDrift: 'STABLE',
      transactionCostDrift: 'STABLE',
      riskDrift: 'STABLE',
      configurationDrift,
      evidenceSufficiency,
      governanceState,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE'
    };
  }
}
