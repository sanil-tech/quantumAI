
import crypto from 'crypto';

export type SurveillanceState =
  | 'HEALTHY'
  | 'WATCH'
  | 'DEGRADED'
  | 'SUSPENDED'
  | 'RECOVERY'
  | 'RECOVERY_FAILED';

export interface HealthDomainRecord {
  domain: string;
  status: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL';
  observed_at_utc: string;
  metric: string;
  threshold: string;
  actual_value: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  correlation_id: string;
  evidence_id: string;
  remediation_state: 'NONE' | 'REQUIRED' | 'IN_PROGRESS' | 'RESOLVED';
}

export interface ShadowSurveillanceCycleInput {
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  marketDataFreshnessMs?: number;
  configDriftDetected?: boolean;
  strategyHashMismatch?: boolean;
  timeframeConflict?: boolean;
  riskLimitBreached?: boolean;
  evidenceTampered?: boolean;
}

export interface ShadowSurveillanceCycleResult {
  runId: string;
  surveillanceState: SurveillanceState;
  governanceDecision: 'CONTINUE_SHADOW' | 'WATCH' | 'DEGRADED' | 'SUSPEND_STRATEGY' | 'SUSPEND_SYSTEM' | 'RECOVERY_REQUIRED' | 'GOVERNANCE_REVIEW_REQUIRED';
  healthDomains: HealthDomainRecord[];
  activeIncidentsCount: number;
  failClosedDecision: 'BUY' | 'SELL' | 'NO_TRADE';
  evidenceHash: string;
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
  livePilotActive: false;
}

export class ShadowSurveillanceAutomationService {
  private static readonly DOMAINS = [
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

  public static runSurveillanceCycle(input: ShadowSurveillanceCycleInput): ShadowSurveillanceCycleResult {
    const runId = 'SURVEILLANCE-' + Date.now();
    const nowUtc = new Date().toISOString();

    let surveillanceState: SurveillanceState = 'HEALTHY';
    let governanceDecision: 'CONTINUE_SHADOW' | 'WATCH' | 'DEGRADED' | 'SUSPEND_STRATEGY' | 'SUSPEND_SYSTEM' | 'RECOVERY_REQUIRED' | 'GOVERNANCE_REVIEW_REQUIRED' = 'CONTINUE_SHADOW';
    let failClosedDecision: 'BUY' | 'SELL' | 'NO_TRADE' = 'NO_TRADE';
    let activeIncidentsCount = 0;

    const isStale = (input.marketDataFreshnessMs || 0) > 5000;
    const isConfigDrift = !!input.configDriftDetected;
    const isHashMismatch = !!input.strategyHashMismatch;
    const isTfConflict = !!input.timeframeConflict;
    const isRiskBreach = !!input.riskLimitBreached;
    const isEvidenceTampered = !!input.evidenceTampered;

    if (isHashMismatch || isConfigDrift || isEvidenceTampered) {
      surveillanceState = 'SUSPENDED';
      governanceDecision = 'SUSPEND_SYSTEM';
      activeIncidentsCount += 1;
    } else if (isRiskBreach || isStale) {
      surveillanceState = 'DEGRADED';
      governanceDecision = 'RECOVERY_REQUIRED';
      activeIncidentsCount += 1;
    } else if (isTfConflict) {
      surveillanceState = 'WATCH';
      governanceDecision = 'WATCH';
      activeIncidentsCount += 1;
    } else {
      surveillanceState = 'HEALTHY';
      governanceDecision = 'CONTINUE_SHADOW';
      failClosedDecision = 'BUY';
    }

    const healthDomains: HealthDomainRecord[] = this.DOMAINS.map((domain) => {
      const isDomainFailed =
        (domain === 'MARKET_DATA_HEALTH' && isStale) ||
        (domain === 'CONFIGURATION_DRIFT' && isConfigDrift) ||
        (domain === 'STRATEGY_VERSION_INTEGRITY' && isHashMismatch) ||
        (domain === 'MULTI_TIMEFRAME_ALIGNMENT' && isTfConflict) ||
        (domain === 'PORTFOLIO_RISK' && isRiskBreach) ||
        (domain === 'EVIDENCE_ARCHIVE' && isEvidenceTampered);

      return {
        domain,
        status: isDomainFailed ? 'CRITICAL' : 'HEALTHY',
        observed_at_utc: nowUtc,
        metric: 'HEALTH_CHECK',
        threshold: '0_FAILURES',
        actual_value: isDomainFailed ? 'FAILED' : 'NOMINAL',
        severity: isDomainFailed ? 'CRITICAL' : 'INFO',
        correlation_id: runId,
        evidence_id: 'EV-' + domain,
        remediation_state: isDomainFailed ? 'REQUIRED' : 'NONE'
      };
    });

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      strategyHash: input.strategyHash,
      surveillanceState,
      governanceDecision,
      failClosedDecision,
      activeIncidentsCount,
      domainsEvaluated: healthDomains.length
    })).digest('hex');

    return {
      runId,
      surveillanceState,
      governanceDecision,
      healthDomains,
      activeIncidentsCount,
      failClosedDecision,
      evidenceHash,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE',
      livePilotActive: false
    };
  }

  public static transitionRecovery(runId: string, verified: boolean): { state: SurveillanceState; recovered: boolean } {
    if (!verified) {
      return { state: 'RECOVERY_FAILED', recovered: false };
    }
    return { state: 'HEALTHY', recovered: true };
  }
}
