
export type ChangeControlState =
  | 'CHANGE_PROPOSED'
  | 'IMPACT_ANALYSIS_COMPLETED'
  | 'DUAL_APPROVAL_REQUIRED'
  | 'CHANGE_AUTHORIZED'
  | 'CANARY_SHADOW_APPLIED'
  | 'CHANGE_COMMITTED'
  | 'CHANGE_ROLLED_BACK';

export interface ChangeProposal {
  changeId: string;
  subsystem: 'STRATEGY' | 'PORTFOLIO_RISK' | 'MARKET_DATA' | 'EXECUTION_GATE';
  currentVersion: string;
  proposedVersion: string;
  versionHash: string;
  justification: string;
  state: ChangeControlState;
  reviewerA?: string;
  reviewerB?: string;
  canaryPassed: boolean;
}

export class ChangeControlGovernanceService {
  private static proposals: Map<string, ChangeProposal> = new Map();

  public static proposeChange(
    changeId: string,
    subsystem: 'STRATEGY' | 'PORTFOLIO_RISK' | 'MARKET_DATA' | 'EXECUTION_GATE',
    currentVersion: string,
    proposedVersion: string,
    versionHash: string,
    justification: string
  ): ChangeProposal {
    const proposal: ChangeProposal = {
      changeId,
      subsystem,
      currentVersion,
      proposedVersion,
      versionHash,
      justification,
      state: 'IMPACT_ANALYSIS_COMPLETED',
      canaryPassed: false
    };
    this.proposals.set(changeId, proposal);
    return proposal;
  }

  public static approveChange(
    changeId: string,
    actorId: string,
    reviewerType: 'A' | 'B'
  ): { success: boolean; state: ChangeControlState; message?: string } {
    const proposal = this.proposals.get(changeId);
    if (!proposal) {
      return { success: false, state: 'CHANGE_PROPOSED', message: 'CHANGE_PROPOSAL_NOT_FOUND' };
    }

    if (reviewerType === 'A') {
      proposal.reviewerA = actorId;
      proposal.state = 'DUAL_APPROVAL_REQUIRED';
      return { success: true, state: proposal.state };
    } else {
      if (proposal.reviewerA === actorId) {
        return { success: false, state: proposal.state, message: 'DUAL_CONTROL_VIOLATION: Reviewer B cannot be Reviewer A' };
      }
      proposal.reviewerB = actorId;
      proposal.state = 'CHANGE_AUTHORIZED';
      return { success: true, state: proposal.state };
    }
  }

  public static applyCanaryShadow(changeId: string, canarySuccess: boolean): { success: boolean; state: ChangeControlState } {
    const proposal = this.proposals.get(changeId);
    if (!proposal || proposal.state !== 'CHANGE_AUTHORIZED') {
      return { success: false, state: proposal ? proposal.state : 'CHANGE_PROPOSED' };
    }

    if (canarySuccess) {
      proposal.canaryPassed = true;
      proposal.state = 'CHANGE_COMMITTED';
      return { success: true, state: 'CHANGE_COMMITTED' };
    } else {
      proposal.canaryPassed = false;
      proposal.state = 'CHANGE_ROLLED_BACK';
      return { success: false, state: 'CHANGE_ROLLED_BACK' };
    }
  }
}
