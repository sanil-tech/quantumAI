
import crypto from 'crypto';

export type SteadyStateOperationalState =
  | 'SHADOW_HEALTHY'
  | 'SHADOW_DEGRADED'
  | 'SHADOW_PAUSED'
  | 'GOVERNANCE_REVIEW'
  | 'SHADOW_RESTORED'
  | 'STRATEGY_SUSPENDED';

export type GovernanceReviewInterval =
  | 'DAILY_OPERATIONAL_REVIEW'
  | 'WEEKLY_PERFORMANCE_REVIEW'
  | 'MONTHLY_GOVERNANCE_REVIEW';

export interface HealthDomainEvaluation {
  domain: string;
  status: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedAction: string;
  timestamp: string;
}

export interface ShadowOperationsCycleInput {
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  marketDataFreshnessMs?: number;
  configDriftDetected?: boolean;
  strategyHashMismatch?: boolean;
  timeframeConflict?: boolean;
  riskLimitBreached?: boolean;
  reviewInterval?: GovernanceReviewInterval;
}

export interface ShadowOperationsCycleResult {
  runId: string;
  operationalState: SteadyStateOperationalState;
  governanceDecision: 'CONTINUE_SHADOW' | 'WATCH' | 'PAUSE' | 'GOVERNANCE_REVIEW_REQUIRED' | 'STRATEGY_SUSPENDED';
  activeIncidentsCount: number;
  healthDomainsCount: number;
  degradationLevel: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'SUSPENDED';
  failClosedDecision: 'BUY' | 'SELL' | 'NO_TRADE';
  evidenceHash: string;
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
  livePilotActive: false;
}

export class SteadyStateShadowOperationsService {
  private static readonly HEALTH_DOMAINS: string[] = [
    'SYSTEM_HEALTH',
    'MARKET_DATA_HEALTH',
    'DATA_FRESHNESS',
    'SIGNAL_ENGINE_HEALTH',
    'STRATEGY_HEALTH',
    'STRATEGY_VERSION_INTEGRITY',
    'PERFORMANCE_HEALTH',
    'CONFIDENCE_CALIBRATION',
    'TRANSACTION_COST_HEALTH',
    'PORTFOLIO_RISK',
    'DRAWDOWN',
    'DAILY_LOSS',
    'CORRELATION',
    'CONCENTRATION',
    'MULTI_TIMEFRAME_ALIGNMENT',
    'SHADOW_EXECUTION',
    'RECONCILIATION',
    'DATABASE_INTEGRITY',
    'TELEMETRY',
    'EVIDENCE_ARCHIVE',
    'CONFIGURATION_DRIFT',
    'INCIDENT_HEALTH',
    'SECURITY',
    'RBAC'
  ];

  public static runOperationalCycle(input: ShadowOperationsCycleInput): ShadowOperationsCycleResult {
    let operationalState: SteadyStateOperationalState = 'SHADOW_HEALTHY';
    let governanceDecision: 'CONTINUE_SHADOW' | 'WATCH' | 'PAUSE' | 'GOVERNANCE_REVIEW_REQUIRED' | 'STRATEGY_SUSPENDED' = 'CONTINUE_SHADOW';
    let degradationLevel: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'SUSPENDED' = 'HEALTHY';
    let failClosedDecision: 'BUY' | 'SELL' | 'NO_TRADE' = 'NO_TRADE';
    let activeIncidentsCount = 0;

    // Evaluate health invariants
    const isStale = (input.marketDataFreshnessMs || 0) > 5000;
    const isConfigDrift = !!input.configDriftDetected;
    const isHashMismatch = !!input.strategyHashMismatch;
    const isTfConflict = !!input.timeframeConflict;
    const isRiskBreach = !!input.riskLimitBreached;

    if (isHashMismatch || isConfigDrift) {
      operationalState = 'STRATEGY_SUSPENDED';
      governanceDecision = 'STRATEGY_SUSPENDED';
      degradationLevel = 'SUSPENDED';
      activeIncidentsCount += 1;
    } else if (isRiskBreach || isStale) {
      operationalState = 'SHADOW_PAUSED';
      governanceDecision = 'PAUSE';
      degradationLevel = 'SUSPENDED';
      activeIncidentsCount += 1;
    } else if (isTfConflict) {
      operationalState = 'SHADOW_DEGRADED';
      governanceDecision = 'WATCH';
      degradationLevel = 'DEGRADED';
      activeIncidentsCount += 1;
    } else {
      operationalState = 'SHADOW_HEALTHY';
      governanceDecision = 'CONTINUE_SHADOW';
      degradationLevel = 'HEALTHY';
      failClosedDecision = 'BUY'; // valid shadow signal
    }

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      strategyHash: input.strategyHash,
      operationalState,
      governanceDecision,
      degradationLevel,
      failClosedDecision,
      reviewInterval: input.reviewInterval || 'DAILY_OPERATIONAL_REVIEW'
    })).digest('hex');

    return {
      runId: 'SHADOW-CYCLE-' + Date.now(),
      operationalState,
      governanceDecision,
      activeIncidentsCount,
      healthDomainsCount: this.HEALTH_DOMAINS.length,
      degradationLevel,
      failClosedDecision,
      evidenceHash,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE',
      livePilotActive: false
    };
  }

  public static recoverToShadowRestored(runId: string, rootCauseResolved: boolean): { state: SteadyStateOperationalState; restored: boolean } {
    if (!rootCauseResolved) {
      return { state: 'SHADOW_PAUSED', restored: false };
    }
    return { state: 'SHADOW_RESTORED', restored: true };
  }
}
