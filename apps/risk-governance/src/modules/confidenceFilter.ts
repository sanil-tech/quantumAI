import { TradeProposal } from '@iati/core-types';
import { ConfidenceEvaluation } from '../types';

export class ConfidenceFilter {
  evaluateProposal(proposal: TradeProposal, minConfidenceThreshold: number = 0.65): ConfidenceEvaluation {
    const confidenceScore = proposal.confidence > 1 ? proposal.confidence / 100 : proposal.confidence;

    // Calculate agent agreement ratio
    const totalVotes = proposal.agent_votes ? proposal.agent_votes.length : 0;
    let agentAgreementRatio = 1.0;
    if (totalVotes > 0) {
      const agreeingVotes = proposal.agent_votes.filter(v => v.direction === proposal.direction).length;
      agentAgreementRatio = agreeingVotes / totalVotes;
    }

    // Check if neutral or low confidence
    if (proposal.direction === 'NEUTRAL') {
      return {
        passed: false,
        confidenceScore,
        agentAgreementRatio,
        regimeSuitable: true,
        reason: 'Proposal direction is NEUTRAL.'
      };
    }

    if (confidenceScore < minConfidenceThreshold) {
      return {
        passed: false,
        confidenceScore,
        agentAgreementRatio,
        regimeSuitable: true,
        reason: `Proposal confidence (${(confidenceScore * 100).toFixed(1)}%) below minimum required threshold (${(minConfidenceThreshold * 100).toFixed(1)}%).`
      };
    }

    if (totalVotes > 0 && agentAgreementRatio < 0.5) {
      return {
        passed: false,
        confidenceScore,
        agentAgreementRatio,
        regimeSuitable: true,
        reason: `Agent agreement ratio (${(agentAgreementRatio * 100).toFixed(1)}%) is insufficient.`
      };
    }

    return {
      passed: true,
      confidenceScore,
      agentAgreementRatio,
      regimeSuitable: true,
      reason: 'Confidence filter criteria met.'
    };
  }
}
