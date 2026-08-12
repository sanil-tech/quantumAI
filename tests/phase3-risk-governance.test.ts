import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RiskGovernanceEngine } from '../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { createRiskApprovalToken, verifyGovernanceSignature } from '../apps/risk-governance/src/modules/riskTokenService';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { TradeProposal, RiskClearedPayload } from '@iati/core-types';

describe('Phase 3 — Centralized Risk Governance Enforcement', () => {
  let engine: RiskGovernanceEngine;
  let router: ExecutionRouter;

  beforeEach(() => {
    engine = new RiskGovernanceEngine();
    router = new ExecutionRouter();
  });

  // 1. Valid Signal -> APPROVED token
  it('1. Valid signal should yield RiskApprovalToken with status APPROVED', () => {
    const proposal: TradeProposal = {
      id: 'prop-valid-101',
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['SMC Order Block', 'FVG Confluence'],
      agent_votes: [],
      why_direction: 'Bullish market structure break',
      invalidate_conditions: ['Price breaks below 1.0800'],
      timestamp: new Date()
    };

    const decision = engine.evaluateTradeProposal(proposal, 'DEFAULT', 0.1);
    expect(decision.status).toBe('APPROVED');
    expect(decision.token).toBeDefined();
    expect(decision.token?.status).toBe('APPROVED');
    expect(decision.token?.approvalId).toBe(decision.approval_id);
    expect(decision.token?.approvedLotSize).toBe(0.1);
    expect(verifyGovernanceSignature(decision.token!)).toBe(true);
  });

  // 2. Excessive Drawdown -> REJECTED
  it('2. Excessive drawdown should cause RiskGovernanceEngine to REJECT trade', () => {
    engine.drawdownProtection.setAccountMetrics(0.25, 0.15, 0.20); // Exceeds drawdown and daily loss limits
    const proposal: TradeProposal = {
      id: 'prop-dd-102',
      symbol: 'GBP/USD',
      direction: 'BUY',
      confidence: 80,
      evidence: ['Trend Continuation'],
      agent_votes: [],
      why_direction: 'Bullish trend',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const decision = engine.evaluateTradeProposal(proposal, 'DEFAULT', 0.1);
    expect(decision.status).toBe('REJECTED');
    expect(decision.token?.status).toBe('REJECTED');
    expect(decision.rejection_reasons?.some(r => r.includes('Drawdown Protection Triggered'))).toBe(true);
  });

  // 3. Excessive Exposure -> REJECTED
  it('3. Excessive exposure should cause RiskGovernanceEngine to REJECT trade', () => {
    const proposal: TradeProposal = {
      id: 'prop-exp-103',
      symbol: 'USD/JPY',
      direction: 'BUY',
      confidence: 80,
      evidence: ['Breakout'],
      agent_votes: [],
      why_direction: 'JPY weakness',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    vi.spyOn(engine.exposureEngine, 'evaluateExposure').mockReturnValue({
      symbolExposure: 50,
      currencyExposure: 50,
      assetExposure: 50,
      portfolioExposure: 80,
      hasConcentrationRisk: true,
      hasCorrelationRisk: true,
      isOverexposed: true
    });

    const decision = engine.evaluateTradeProposal(proposal, 'DEFAULT', 0.1);
    expect(decision.status).toBe('REJECTED');
    expect(decision.token?.status).toBe('REJECTED');
    expect(decision.rejection_reasons?.some(r => r.includes('Exposure limit breached'))).toBe(true);
  });

  // 4. Excessive Lot Size -> REJECTED
  it('4. Requesting lot size > 10.0 should be REJECTED', () => {
    const proposal: TradeProposal = {
      id: 'prop-lot-104',
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Strong Signal'],
      agent_votes: [],
      why_direction: 'Bullish',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const decision = engine.evaluateTradeProposal(proposal, 'DEFAULT', 25.0);
    expect(decision.status).toBe('REJECTED');
    expect(decision.token?.status).toBe('REJECTED');
    expect(decision.rejection_reasons?.some(r => r.includes('exceeds maximum allowable lot size'))).toBe(true);
  });

  // 5. Confidence below threshold -> REJECTED
  it('5. Trade proposal with low confidence (<60%) should be REJECTED', () => {
    const proposal: TradeProposal = {
      id: 'prop-conf-105',
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 45,
      evidence: ['Weak Signal'],
      agent_votes: [],
      why_direction: 'Unclear',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const decision = engine.evaluateTradeProposal(proposal, 'DEFAULT', 0.1);
    expect(decision.status).toBe('REJECTED');
    expect(decision.token?.status).toBe('REJECTED');
    expect(decision.rejection_reasons?.some(r => r.includes('Confidence Filter Failure'))).toBe(true);
  });

  // 6. Trade Frequency Violation -> REJECTED
  it('6. Rapid duplicate trade should trigger Frequency Control and be REJECTED', () => {
    const proposal: TradeProposal = {
      id: 'prop-freq-106',
      symbol: 'XAU/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Gold Spike'],
      agent_votes: [],
      why_direction: 'Gold Rally',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const d1 = engine.evaluateTradeProposal(proposal, 'DEFAULT', 0.1);
    expect(d1.status).toBe('APPROVED');

    const proposal2: TradeProposal = { ...proposal, id: 'prop-freq-107' };
    const d2 = engine.evaluateTradeProposal(proposal2, 'DEFAULT', 0.1);
    expect(d2.status).toBe('REJECTED');
    expect(d2.rejection_reasons?.some(r => r.includes('Frequency Control Failure'))).toBe(true);
  });

  // 7. Missing RiskApprovalToken -> Execution Rejected
  it('7. Execution request without RiskApprovalToken should be rejected by authorizeExecution', async () => {
    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 }
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('MISSING_TOKEN');
    expect(res.reason).toContain('Missing RiskApprovalToken');
  });

  // 8. Rejected Token -> Execution Rejected
  it('8. Execution request with REJECTED token should be rejected by authorizeExecution', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-rej-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'REJECTED',
      rejectionReason: 'Drawdown breached'
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('REJECTED_TOKEN');
  });

  // 9. Expired Token -> Execution Rejected
  it('9. Token older than 5 minutes should be rejected by authorizeExecution', async () => {
    const sixMinutesAgo = Date.now() - (6 * 60 * 1000);
    const token = createRiskApprovalToken({
      approvalId: 'gov-exp-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED',
      timestamp: sixMinutesAgo
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('EXPIRED_TOKEN');
  });

  // 10. Token/Signal Mismatch -> Execution Rejected
  it('10. Token with mismatched signalId should be rejected by authorizeExecution', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-sig-001',
      signalId: 'sig-AAA',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const res = await authorizeExecution({
      signalId: 'sig-BBB',
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('SIGNAL_MISMATCH');
  });

  // 11. Symbol Mismatch -> Execution Rejected
  it('11. Token for EUR/USD should reject execution for GBP/USD', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-sym-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'GBP/USD', direction: 'BUY', quantity: 0.1 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('SYMBOL_MISMATCH');
  });

  // 12. Direction Mismatch -> Execution Rejected
  it('12. Token for BUY should reject execution for SELL', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-dir-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'SELL', quantity: 0.1 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('DIRECTION_MISMATCH');
  });

  // 13. Lot Size Exceeds Approval -> Execution Rejected
  it('13. Requested lot size exceeding approved lot size should be rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-lot-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.5 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('LOT_SIZE_EXCEEDED');
  });

  // 14. Database Persistence Failure -> Execution Rejected (RISK_PERSISTENCE_FAILED)
  it('14. Database write failure during risk persistence should fail closed with RISK_PERSISTENCE_FAILED', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-db-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const mockFailingRepo = {
      isDbConnected: () => true,
      saveTradingLog: vi.fn().mockRejectedValue(new Error('PostgreSQL Connection Failure'))
    };

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token,
      tradingRepo: mockFailingRepo
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('RISK_PERSISTENCE_FAILED');
    expect(res.reason).toContain('RISK_PERSISTENCE_FAILED');
  });

  // 15. Synthetic Market Data -> LIVE Execution Rejected
  it('15. LIVE execution with SYNTHETIC market data lineage should be rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-lin-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token,
      dataMode: 'SYNTHETIC',
      executionMode: 'LIVE'
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('LINEAGE_VIOLATION');
  });

  // 16. Simulation Market Data -> LIVE Execution Rejected
  it('16. LIVE execution with SIMULATION market data lineage should be rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-lin-002',
      signalId: 'sig-002',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token,
      dataMode: 'SIMULATION',
      executionMode: 'LIVE'
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('LINEAGE_VIOLATION');
  });

  // 17. Paper Execution still requires governance
  it('17. Paper execution without valid token should still be rejected by ExecutionRouter', async () => {
    const payloadWithoutToken: RiskClearedPayload = {
      proposal_id: 'prop-paper-001',
      symbol: 'EUR/USD',
      account_id: 'DEFAULT',
      approval_id: 'gov-001',
      risk_score: 25,
      trade_proposal: {
        id: 'prop-paper-001',
        symbol: 'EUR/USD',
        direction: 'BUY',
        confidence: 80,
        evidence: [],
        agent_votes: [],
        why_direction: '',
        invalidate_conditions: [],
        timestamp: new Date()
      },
      governance_decision: {
        approval_id: 'gov-001',
        status: 'APPROVED',
        risk_score: 25,
        checks: ['OK'],
        timestamp: new Date(),
        decision_authority: 'Test'
      },
      timestamp: new Date()
    };

    await expect(router.handleRiskCleared(payloadWithoutToken)).rejects.toThrow(
      'Execution Router Violation: Missing RiskApprovalToken'
    );
  });

  // 18. LIVE Execution still requires governance
  it('18. LIVE execution route in ExecutionRouter enforces RiskApprovalToken validation', async () => {
    const proposal: TradeProposal = {
      id: 'prop-live-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 90,
      evidence: ['Live Signal'],
      agent_votes: [],
      why_direction: 'Live Breakout',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const decision = engine.evaluateTradeProposal(proposal, 'DEFAULT', 0.1);
    expect(decision.token).toBeDefined();

    const validPayload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'DEFAULT',
      approval_id: decision.approval_id,
      risk_score: decision.risk_score,
      trade_proposal: proposal,
      governance_decision: decision,
      approval_token: decision.token,
      timestamp: new Date()
    };

    const result = await router.handleRiskCleared(validPayload);
    expect(result.order.status).toBe('FILLED');
    expect(result.order.approval_id).toBe(decision.approval_id);
  });

  // 19. Risk Approval Persisted Successfully
  it('19. Risk approval should be persisted to database when repository is connected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-pers-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    const mockRepo = {
      isDbConnected: () => true,
      saveTradingLog: vi.fn().mockResolvedValue(undefined)
    };

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token,
      tradingRepo: mockRepo
    });

    expect(res.authorized).toBe(true);
    expect(mockRepo.saveTradingLog).toHaveBeenCalledTimes(1);
    expect(mockRepo.saveTradingLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'risk-audit-gov-pers-001',
        type: 'INFO'
      })
    );
  });

  // 20. Tampered Governance Signature -> Execution Rejected
  it('20. Tampered governance signature should be rejected by authorizeExecution', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-tamp-001',
      signalId: 'sig-001',
      symbol: 'EUR/USD',
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 10,
      calculatedRiskAmount: 50,
      status: 'APPROVED'
    });

    token.governanceSignature = 'tampered_invalid_signature_hex_123456';

    const res = await authorizeExecution({
      requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.1 },
      token
    });

    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe('INVALID_SIGNATURE');
  });
});
