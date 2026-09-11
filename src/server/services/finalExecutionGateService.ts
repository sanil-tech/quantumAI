
export interface FinalExecutionDecision {
  decision: 'DENIED' | 'APPROVED_FOR_SHADOW';
  reason: string;
  authorizationStatus: 'VALID' | 'INVALID' | 'EXPIRED' | 'REVOKED';
  riskStatus: 'VALID' | 'LIMIT_EXCEEDED';
  marketDataStatus: 'VALID' | 'STALE' | 'INVALID';
  portfolioStatus: 'VALID' | 'LOCKED';
  auditStatus: 'VALID' | 'FAILED';
  executionEnvironment: 'FORBIDDEN' | 'SHADOW_ONLY';
  brokerOrderTransmitted: boolean;
}

export interface ExecutionIntentPayload {
  requestId: string;
  idempotencyKey: string;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  riskPercent: number;
  environment: 'SHADOW' | 'LIVE' | 'DEMO';
  actorId: string;
  actorRole: 'VIEWER' | 'OPERATOR' | 'ADMIN';
}

export class FinalExecutionGateService {
  public static evaluateFinalExecutionGate(payload: ExecutionIntentPayload): FinalExecutionDecision {
    // 1. RBAC Check: VIEWER cannot request execution
    if (payload.actorRole === 'VIEWER') {
      return {
        decision: 'DENIED',
        reason: 'UNAUTHORIZED_ROLE_VIEWER',
        authorizationStatus: 'INVALID',
        riskStatus: 'VALID',
        marketDataStatus: 'VALID',
        portfolioStatus: 'VALID',
        auditStatus: 'VALID',
        executionEnvironment: 'FORBIDDEN',
        brokerOrderTransmitted: false
      };
    }

    // 2. Strategy Version Immutability
    if (payload.strategyId === 'STRAT-AI-TREND-PULSE' && payload.strategyVersion !== 'v2.0.0') {
      return {
        decision: 'DENIED',
        reason: 'STRATEGY_VERSION_MISMATCH_OR_MUTATED',
        authorizationStatus: 'INVALID',
        riskStatus: 'VALID',
        marketDataStatus: 'VALID',
        portfolioStatus: 'VALID',
        auditStatus: 'VALID',
        executionEnvironment: 'FORBIDDEN',
        brokerOrderTransmitted: false
      };
    }

    // 3. Single Trade Risk Limit Cap (2.0%)
    if (payload.riskPercent > 2.0) {
      return {
        decision: 'DENIED',
        reason: 'RISK_CAP_EXCEEDED_2_PERCENT',
        authorizationStatus: 'VALID',
        riskStatus: 'LIMIT_EXCEEDED',
        marketDataStatus: 'VALID',
        portfolioStatus: 'VALID',
        auditStatus: 'VALID',
        executionEnvironment: 'FORBIDDEN',
        brokerOrderTransmitted: false
      };
    }

    // 4. LIVE execution request interception: Absolute ExecutionSafetyGate barrier
    if (payload.environment === 'LIVE') {
      return {
        decision: 'DENIED',
        reason: 'EXECUTION_SAFETY_GATE_BLOCKED_LIVE_EXECUTION_FORBIDDEN',
        authorizationStatus: 'VALID',
        riskStatus: 'VALID',
        marketDataStatus: 'VALID',
        portfolioStatus: 'VALID',
        auditStatus: 'VALID',
        executionEnvironment: 'FORBIDDEN',
        brokerOrderTransmitted: false
      };
    }

    // 5. Shadow execution allowed
    return {
      decision: 'APPROVED_FOR_SHADOW',
      reason: 'SHADOW_EXECUTION_ALLOWED_BROKER_EXECUTION_BLOCKED',
      authorizationStatus: 'VALID',
      riskStatus: 'VALID',
      marketDataStatus: 'VALID',
      portfolioStatus: 'VALID',
      auditStatus: 'VALID',
      executionEnvironment: 'SHADOW_ONLY',
      brokerOrderTransmitted: false
    };
  }
}
