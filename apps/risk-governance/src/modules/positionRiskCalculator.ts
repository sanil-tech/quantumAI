import { TradeProposal, RiskProfile } from '@iati/core-types';
import { PositionRisk } from '../types';

export class PositionRiskCalculator {
  calculatePositionRisk(
    proposal: TradeProposal,
    profile: RiskProfile,
    accountEquity: number = 100000
  ): PositionRisk {
    // Standard position sizing estimate (e.g. 1% to 3% of account equity)
    const positionExposure = Math.min(accountEquity * profile.max_risk_per_trade * 2, profile.max_exposure);
    const potentialLoss = positionExposure * profile.max_risk_per_trade;
    const expectedRisk = potentialLoss / accountEquity;

    const normalizedConf = proposal.confidence > 1 ? proposal.confidence / 100 : Math.max(0, Math.min(1, proposal.confidence));
    // Estimate reward/risk ratio based on confidence and proposal evidence
    const rewardRiskRatio = normalizedConf > 0.8 ? 2.5 : normalizedConf > 0.6 ? 1.8 : 1.2;
    const portfolioImpact = positionExposure / profile.max_exposure;

    // Calculate composite normalized RiskScore [0.0 - 1.0]
    // Higher score = higher risk
    const riskFactor = expectedRisk / profile.max_risk_per_trade;
    const exposureFactor = portfolioImpact;
    const confidenceFactor = 1 - normalizedConf; // Low confidence increases risk score

    const rawScore = (riskFactor * 0.4) + (exposureFactor * 0.3) + (confidenceFactor * 0.3);
    const riskScore = Math.min(Math.max(Number(rawScore.toFixed(2)), 0.0), 1.0);

    return {
      expectedRisk: Number(expectedRisk.toFixed(4)),
      positionExposure: Number(positionExposure.toFixed(2)),
      potentialLoss: Number(potentialLoss.toFixed(2)),
      rewardRiskRatio: Number(rewardRiskRatio.toFixed(2)),
      portfolioImpact: Number(portfolioImpact.toFixed(4)),
      riskScore
    };
  }
}
