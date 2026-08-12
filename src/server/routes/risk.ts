import { Router, Request, Response } from 'express';
import { RiskGovernanceEngine } from '../../../apps/risk-governance/src/modules/governanceEngine';
import { TradeProposal } from '@iati/core-types';
import { setKillSwitch, isKillSwitchActive, getKillSwitchReason, setLiveExecutionArming, isLiveExecutionArmed } from '../services/liveExecutionSafetyGuard';

export const riskRouter = Router();
const governanceEngine = new RiskGovernanceEngine();

/**
 * GET /api/risk/kill-switch
 */
riskRouter.get('/risk/kill-switch', (req: Request, res: Response) => {
  res.json({
    active: isKillSwitchActive(),
    reason: getKillSwitchReason()
  });
});

/**
 * POST /api/risk/kill-switch
 */
riskRouter.post('/risk/kill-switch', (req: Request, res: Response) => {
  const { active, reason } = req.body;
  setKillSwitch(!!active, reason || 'Operator UI Toggle');
  res.json({
    active: isKillSwitchActive(),
    reason: getKillSwitchReason()
  });
});

/**
 * GET /api/risk/arming
 */
riskRouter.get('/risk/arming', (req: Request, res: Response) => {
  res.json({
    armed: isLiveExecutionArmed()
  });
});

/**
 * POST /api/risk/arming
 */
riskRouter.post('/risk/arming', (req: Request, res: Response) => {
  const { armed } = req.body;
  setLiveExecutionArming(!!armed);
  res.json({
    armed: isLiveExecutionArmed()
  });
});

/**
 * POST /api/risk/evaluate
 * Canonical HTTP boundary for Risk Governance evaluation.
 * Evaluates a trade proposal and returns a GovernanceDecision containing a signed RiskApprovalToken.
 * DOES NOT execute trades.
 */
riskRouter.post('/risk/evaluate', async (req: Request, res: Response) => {
  try {
    const { proposal, accountId, requestedLotSize, lotSize } = req.body;

    let tradeProposal: TradeProposal;

    if (proposal && typeof proposal === 'object') {
      tradeProposal = {
        id: proposal.id || `prop-${Date.now()}`,
        symbol: proposal.symbol || 'EUR/USD',
        direction: proposal.direction || 'BUY',
        confidence: Number(proposal.confidence ?? 80),
        evidence: Array.isArray(proposal.evidence) ? proposal.evidence : [],
        agent_votes: Array.isArray(proposal.agent_votes) ? proposal.agent_votes : [],
        why_direction: proposal.why_direction || 'Signal evaluation',
        invalidate_conditions: Array.isArray(proposal.invalidate_conditions) ? proposal.invalidate_conditions : [],
        timestamp: proposal.timestamp ? new Date(proposal.timestamp) : new Date()
      };
    } else {
      const { symbol, direction, confidence, evidence, why_direction } = req.body;
      if (!symbol || !direction) {
        res.status(400).json({ error: "Trade proposal requires 'symbol' and 'direction'." });
        return;
      }
      tradeProposal = {
        id: `prop-${Date.now()}`,
        symbol,
        direction,
        confidence: Number(confidence ?? 80),
        evidence: Array.isArray(evidence) ? evidence : [],
        agent_votes: [],
        why_direction: why_direction || 'HTTP evaluation',
        invalidate_conditions: [],
        timestamp: new Date()
      };
    }

    const targetAccount = accountId || 'DEFAULT';
    const targetLotSize = Number(requestedLotSize || lotSize || 0.1);

    const decision = governanceEngine.evaluateTradeProposal(tradeProposal, targetAccount, targetLotSize);

    res.json({
      success: true,
      decision,
      status: decision.status,
      token: decision.token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Risk evaluation failed' });
  }
});
