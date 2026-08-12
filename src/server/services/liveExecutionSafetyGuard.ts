import { ExecutionCommand, ExecutionEnvironment, MarketDataLineage } from '../domain/types';

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  code?: 'LINEAGE_SAFETY_VIOLATION' | 'MISSING_LINEAGE' | 'INVALID_ENVIRONMENT' | 'KILL_SWITCH_ACTIVE' | 'LIVE_EXECUTION_DISARMED';
}

let killSwitchState = false;
let killSwitchReason = '';
let liveExecutionArmedState = process.env.ENABLE_LIVE_EXECUTION_ARMED !== 'false';

export function setKillSwitch(active: boolean, reason: string = 'Manual Operator Kill Switch'): void {
  killSwitchState = active;
  killSwitchReason = reason;
}

export function isKillSwitchActive(): boolean {
  return killSwitchState;
}

export function getKillSwitchReason(): string {
  return killSwitchReason;
}

export function setLiveExecutionArming(armed: boolean): void {
  liveExecutionArmedState = armed;
}

export function isLiveExecutionArmed(): boolean {
  return liveExecutionArmedState;
}

/**
 * Server-Side Live Execution Safety Guard
 * Guarantees that simulated, historical, delayed, paper, or unknown data lineages CANNOT trigger live broker executions.
 */
export function validateExecutionSafety(
  environment: ExecutionEnvironment,
  lineage?: MarketDataLineage
): SafetyCheckResult {
  // 0. Kill Switch check
  if (killSwitchState) {
    return {
      allowed: false,
      code: 'KILL_SWITCH_ACTIVE',
      reason: `Live execution safety guard rejected command: Kill Switch is ACTIVE (${killSwitchReason || 'Manual Operator Kill Switch'}).`
    };
  }

  // 1. Fail Closed: If lineage is missing or null, reject execution
  if (!lineage || !lineage.dataClass) {
    return {
      allowed: false,
      code: 'MISSING_LINEAGE',
      reason: 'Live execution safety guard rejected command: Missing market data lineage metadata.'
    };
  }

  // 2. Fail Closed: If lineage is UNKNOWN
  if (lineage.dataClass === 'UNKNOWN') {
    return {
      allowed: false,
      code: 'LINEAGE_SAFETY_VIOLATION',
      reason: 'Live execution safety guard rejected command: Market data lineage is UNKNOWN.'
    };
  }

  // 3. Strict check for REAL_LIVE environments: lineage must be LIVE
  if (environment === 'REAL_LIVE') {
    if (lineage.dataClass !== 'LIVE') {
      return {
        allowed: false,
        code: 'LINEAGE_SAFETY_VIOLATION',
        reason: `Live execution safety guard rejected REAL_LIVE execution! Cannot execute real money trades on non-LIVE data lineage (Data Class: '${lineage.dataClass}').`
      };
    }

    // 4. Arming check for REAL_LIVE environment
    if (!liveExecutionArmedState) {
      return {
        allowed: false,
        code: 'LIVE_EXECUTION_DISARMED',
        reason: 'Live execution safety guard rejected REAL_LIVE execution: System LIVE execution arming state is DISARMED.'
      };
    }
  }

  // Rejections for synthetic or simulated data on live environments
  if ((lineage.dataClass === 'SIMULATED' || lineage.dataClass === 'SYNTHETIC') && environment === 'REAL_LIVE') {
    return {
      allowed: false,
      code: 'LINEAGE_SAFETY_VIOLATION',
      reason: `Live execution safety guard rejected command: ${lineage.dataClass} data lineage is strictly forbidden for REAL_LIVE execution.`
    };
  }

  return { allowed: true };
}
