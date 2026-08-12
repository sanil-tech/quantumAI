import { AutonomyLevel, TradeProposal } from '@iati/core-types';
import { AutonomyCheck } from '../types';

export class AutonomyControl {
  private currentLevel: AutonomyLevel = 3; // Default to Level 3 (AI Approval within limits)

  setAutonomyLevel(level: AutonomyLevel): void {
    if (level >= 0 && level <= 5) {
      this.currentLevel = level;
    }
  }

  getAutonomyLevel(): AutonomyLevel {
    return this.currentLevel;
  }

  evaluateAutonomy(proposal: TradeProposal, riskScore: number): AutonomyCheck {
    switch (this.currentLevel) {
      case 0:
        return {
          level: 0,
          canAutoApprove: false,
          requiresManualApproval: true,
          reason: 'Level 0 (Manual Approval Only): All trades require explicit human confirmation.'
        };
      case 1:
        return {
          level: 1,
          canAutoApprove: false,
          requiresManualApproval: false,
          reason: 'Level 1 (AI Analysis Only): Execution is disabled. Analytical proposals stored for review.'
        };
      case 2:
        return {
          level: 2,
          canAutoApprove: false,
          requiresManualApproval: true,
          reason: 'Level 2 (AI Proposal): Human sign-off required prior to risk clearance.'
        };
      case 3:
        // AI Approval within limits (Auto approve if confidence > 0.70 and riskScore < 0.50)
        if (proposal.confidence >= 0.70 && riskScore <= 0.50) {
          return {
            level: 3,
            canAutoApprove: true,
            requiresManualApproval: false,
            reason: 'Level 3 (AI Approval within limits): Parameters met for automated clearance.'
          };
        } else {
          return {
            level: 3,
            canAutoApprove: false,
            requiresManualApproval: true,
            reason: 'Level 3: Trade parameters exceed automated threshold; manual review required.'
          };
        }
      case 4:
        // Controlled Automation
        if (riskScore <= 0.70) {
          return {
            level: 4,
            canAutoApprove: true,
            requiresManualApproval: false,
            reason: 'Level 4 (Controlled Automation): Automatically cleared within risk parameters.'
          };
        } else {
          return {
            level: 4,
            canAutoApprove: false,
            requiresManualApproval: true,
            reason: 'Level 4: High risk score requires human verification.'
          };
        }
      case 5:
        // Full Automation with Governance
        return {
          level: 5,
          canAutoApprove: true,
          requiresManualApproval: false,
          reason: 'Level 5 (Full Automation): Cleared under continuous automated governance.'
        };
      default:
        return {
          level: this.currentLevel,
          canAutoApprove: false,
          requiresManualApproval: true,
          reason: 'Unknown autonomy level. Defaulting to manual approval.'
        };
    }
  }
}
