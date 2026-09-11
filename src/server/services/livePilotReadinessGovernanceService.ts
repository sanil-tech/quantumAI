
import crypto from 'crypto';

export type PilotState = 
  | 'SHADOW_CERTIFIED'
  | 'LIVE_PILOT_ELIGIBLE'
  | 'GOVERNANCE_REVIEW'
  | 'AWAITING_DUAL_APPROVAL'
  | 'LIVE_PILOT_AUTHORIZED'
  | 'LIVE_PILOT_SIMULATION'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'SHADOW_ONLY'
  | 'REJECTED';

export interface PilotEligibilityInput {
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  qualificationStatus: string;
  oosEvidencePresent: boolean;
  criticalFindingsCount: number;
  highFindingsCount: number;
  riskHealthy: boolean;
  marketDataHealthy: boolean;
  executionSafetyGateBlocked: boolean;
}

export interface DualApprovalInput {
  pilotId: string;
  reviewerA: { id: string; role: 'ADMIN' | 'VIEWER' | 'OPERATOR' };
  reviewerB?: { id: string; role: 'ADMIN' | 'VIEWER' | 'OPERATOR' };
  issuedAtUtc: number;
  expiresAtUtc: number;
  isRevoked?: boolean;
}

export interface PilotSimulationResult {
  pilotId: string;
  strategyId: string;
  currentState: PilotState;
  livePilotEligible: boolean;
  livePilotAuthorized: boolean;
  livePilotActive: false;
  dualControlStatus: 'PASS' | 'FAIL_SAME_ACTOR' | 'UNAUTHORIZED_ROLE' | 'PENDING';
  expirationStatus: 'VALID' | 'EXPIRED';
  brokerExecutionPaths: 0;
  brokerOrdersTransmitted: 0;
  livePositions: 0;
  secretExposure: 'NONE';
  evidenceHash: string;
}

export class LivePilotReadinessGovernanceService {
  public static evaluateEligibility(input: PilotEligibilityInput): boolean {
    if (
      input.qualificationStatus === 'STRATEGY_QUALIFIED' &&
      input.oosEvidencePresent &&
      input.criticalFindingsCount === 0 &&
      input.highFindingsCount === 0 &&
      input.riskHealthy &&
      input.marketDataHealthy &&
      input.executionSafetyGateBlocked
    ) {
      return true;
    }
    return false;
  }

  public static runPilotLifecycle(
    eligibilityInput: PilotEligibilityInput,
    approvalInput: DualApprovalInput,
    currentTimeUtc: number
  ): PilotSimulationResult {
    const isEligible = this.evaluateEligibility(eligibilityInput);
    if (!isEligible) {
      return {
        pilotId: approvalInput.pilotId,
        strategyId: eligibilityInput.strategyId,
        currentState: 'REJECTED',
        livePilotEligible: false,
        livePilotAuthorized: false,
        livePilotActive: false,
        dualControlStatus: 'PENDING',
        expirationStatus: 'EXPIRED',
        brokerExecutionPaths: 0,
        brokerOrdersTransmitted: 0,
        livePositions: 0,
        secretExposure: 'NONE',
        evidenceHash: 'none'
      };
    }

    let dualControlStatus: 'PASS' | 'FAIL_SAME_ACTOR' | 'UNAUTHORIZED_ROLE' | 'PENDING' = 'PENDING';
    if (approvalInput.reviewerA.role !== 'ADMIN') {
      dualControlStatus = 'UNAUTHORIZED_ROLE';
    } else if (approvalInput.reviewerB) {
      if (approvalInput.reviewerB.role !== 'ADMIN') {
        dualControlStatus = 'UNAUTHORIZED_ROLE';
      } else if (approvalInput.reviewerA.id === approvalInput.reviewerB.id) {
        dualControlStatus = 'FAIL_SAME_ACTOR';
      } else {
        dualControlStatus = 'PASS';
      }
    }

    let currentState: PilotState = 'LIVE_PILOT_ELIGIBLE';
    let livePilotAuthorized = false;

    if (approvalInput.isRevoked) {
      currentState = 'REVOKED';
    } else if (dualControlStatus === 'PASS') {
      if (currentTimeUtc >= approvalInput.expiresAtUtc) {
        currentState = 'EXPIRED';
      } else {
        currentState = 'LIVE_PILOT_SIMULATION';
        livePilotAuthorized = true;
      }
    } else if (dualControlStatus === 'FAIL_SAME_ACTOR' || dualControlStatus === 'UNAUTHORIZED_ROLE') {
      currentState = 'REJECTED';
    } else {
      currentState = 'AWAITING_DUAL_APPROVAL';
    }

    const expirationStatus = currentTimeUtc < approvalInput.expiresAtUtc ? 'VALID' : 'EXPIRED';

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      pilotId: approvalInput.pilotId,
      strategyId: eligibilityInput.strategyId,
      currentState,
      dualControlStatus,
      expirationStatus,
      isRevoked: !!approvalInput.isRevoked
    })).digest('hex');

    return {
      pilotId: approvalInput.pilotId,
      strategyId: eligibilityInput.strategyId,
      currentState,
      livePilotEligible: isEligible,
      livePilotAuthorized,
      livePilotActive: false,
      dualControlStatus,
      expirationStatus,
      brokerExecutionPaths: 0,
      brokerOrdersTransmitted: 0,
      livePositions: 0,
      secretExposure: 'NONE',
      evidenceHash
    };
  }
}
