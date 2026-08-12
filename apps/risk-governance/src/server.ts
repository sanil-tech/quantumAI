import express, { Request, Response } from 'express';
import cors from 'cors';
import { logger, config, errorHandler } from '@iati/core';
import { globalEventBus, EventTypes, IEvent } from '@iati/event-bus';
import { TradeProposedPayload, RiskClearedPayload, TradeRejectedPayload } from '@iati/core-types';
import { RiskGovernanceEngine } from './modules/governanceEngine';

const app = express();
const PORT = Number(config.PORT) || 3004;

app.use(cors());
app.use(express.json());

export const governanceEngine = new RiskGovernanceEngine();

export class RiskGovernanceService {
  async processTradeProposal(payload: TradeProposedPayload): Promise<void> {
    const proposal = payload.trade_proposal;
    const accountId = 'DEFAULT';

    logger.info(`[RISK-GOVERNANCE] Evaluating TradeProposed for ${proposal.symbol} (${proposal.id})`);

    const decision = governanceEngine.evaluateTradeProposal(proposal, accountId);

    if (decision.status === 'APPROVED') {
      const clearedPayload: RiskClearedPayload = {
        proposal_id: proposal.id,
        symbol: proposal.symbol,
        account_id: accountId,
        approval_id: decision.approval_id,
        risk_score: decision.risk_score,
        trade_proposal: proposal,
        governance_decision: decision,
        timestamp: new Date()
      };

      await globalEventBus.publish({
        id: `evt-cleared-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: EventTypes.RiskCleared,
        timestamp: new Date(),
        payload: clearedPayload
      });

      logger.info(`[RISK-GOVERNANCE] Risk Cleared for proposal ${proposal.id} (${proposal.symbol})`);
    } else if (decision.status === 'REJECTED') {
      const rejectedPayload: TradeRejectedPayload = {
        proposal_id: proposal.id,
        symbol: proposal.symbol,
        account_id: accountId,
        rejection_id: decision.approval_id,
        risk_score: decision.risk_score,
        rejection_reasons: decision.rejection_reasons || [],
        trade_proposal: proposal,
        timestamp: new Date()
      };

      await globalEventBus.publish({
        id: `evt-rejected-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: EventTypes.TradeRejected,
        timestamp: new Date(),
        payload: rejectedPayload
      });

      logger.info(`[RISK-GOVERNANCE] Trade Rejected for proposal ${proposal.id} (${proposal.symbol})`);
    } else {
      logger.info(`[RISK-GOVERNANCE] Trade ${proposal.id} marked as MANUAL_REQUIRED. Awaiting human sign-off.`);
    }
  }
}

export const riskGovernanceService = new RiskGovernanceService();

// Subscribe to TradeProposed Event
globalEventBus.subscribe(EventTypes.TradeProposed, async (event: IEvent<TradeProposedPayload>) => {
  try {
    await riskGovernanceService.processTradeProposal(event.payload);
  } catch (err) {
    logger.error(`[RISK-GOVERNANCE] Error processing trade proposal:`, err);
  }
});

// REST Endpoints
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'risk-governance', timestamp: new Date().toISOString() });
});

app.get('/api/risk/profile/:account', (req: Request, res: Response) => {
  const account = req.params.account as string;
  const profile = governanceEngine.profileManager.getProfile(account);
  res.json({ account, profile });
});

app.get('/api/risk/status', (req: Request, res: Response) => {
  const profile = governanceEngine.profileManager.getProfile('DEFAULT');
  const drawdown = governanceEngine.drawdownProtection.evaluateDrawdown(profile);
  const autonomy = governanceEngine.autonomyControl.getAutonomyLevel();
  res.json({
    status: 'ACTIVE',
    autonomy_level: autonomy,
    drawdown_status: drawdown,
    total_audits: governanceEngine.auditLogger.getAuditLogs().length
  });
});

app.get('/api/risk/exposure', (req: Request, res: Response) => {
  const totalExposure = governanceEngine.exposureEngine.getTotalPortfolioExposure();
  const profile = governanceEngine.profileManager.getProfile('DEFAULT');
  res.json({
    total_portfolio_exposure: totalExposure,
    max_allowed_exposure: profile.max_exposure,
    utilization_percentage: Number(((totalExposure / profile.max_exposure) * 100).toFixed(2))
  });
});

app.post('/api/risk/approve', async (req: Request, res: Response) => {
  const { proposal_id, authority } = req.body;
  if (!proposal_id) {
    res.status(400).json({ error: 'proposal_id is required' });
    return;
  }

  const auditRecord = governanceEngine.auditLogger.getAuditLogsByProposal(proposal_id);
  if (!auditRecord) {
    res.status(404).json({ error: `Proposal audit record not found for id: ${proposal_id}` });
    return;
  }

  const proposal = auditRecord.proposal;
  const clearedPayload: RiskClearedPayload = {
    proposal_id: proposal.id,
    symbol: proposal.symbol,
    account_id: auditRecord.account_id,
    approval_id: `manual-${Date.now()}`,
    risk_score: auditRecord.risk_score,
    trade_proposal: proposal,
    governance_decision: {
      approval_id: `manual-${Date.now()}`,
      status: 'APPROVED',
      risk_score: auditRecord.risk_score,
      checks: [...auditRecord.rules_evaluated, 'Manual Override Sign-Off'],
      timestamp: new Date(),
      decision_authority: authority || 'HumanRiskOfficer'
    },
    timestamp: new Date()
  };

  await globalEventBus.publish({
    id: `evt-cleared-${Date.now()}`,
    type: EventTypes.RiskCleared,
    timestamp: new Date(),
    payload: clearedPayload
  });

  res.json({ message: 'Trade proposal manually approved and RiskCleared event published.', clearedPayload });
});

app.get('/api/risk/audits', (req: Request, res: Response) => {
  res.json({ count: governanceEngine.auditLogger.getAuditLogs().length, audits: governanceEngine.auditLogger.getAuditLogs() });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🛡️ Risk Governance Engine running on port ${PORT}`);
  });
}

export { app };
