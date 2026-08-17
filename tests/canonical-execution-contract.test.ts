import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { PaperBrokerAdapter } from '../apps/execution-router/src/adapters/paperBrokerAdapter';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { TradeProposal, RiskClearedPayload, RiskApprovalToken } from '@iati/core-types';

describe('Phase 1 — Canonical Execution Contract Hardening & Verification Suite', () => {
  let router: ExecutionRouter;
  let paperAdapter: PaperBrokerAdapter;

  beforeEach(() => {
    router = new ExecutionRouter();
    paperAdapter = router.getBroker() as PaperBrokerAdapter;
  });

  function createTestProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
    return {
      id: `prop-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Technical Confluence', 'SMC FVG Fill'],
      agent_votes: [],
      why_direction: 'Bullish market structure alignment',
      invalidate_conditions: ['Break below support'],
      timestamp: new Date(),
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      riskPercent: 1.0,
      strategyId: 'SMC_ALPHA',
      strategyVersion: '2.1',
      ...overrides
    };
  }

  function createTestPayload(proposal: TradeProposal, tokenOverrides: Partial<any> = {}): RiskClearedPayload {
    const approvalId = `gov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const token: RiskApprovalToken = createRiskApprovalToken({
      approvalId,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.25,
      maxAllowedDrawdown: 5.0,
      calculatedRiskAmount: 250.0,
      status: 'APPROVED',
      strategyId: proposal.strategyId,
      strategyVersion: proposal.strategyVersion,
      stopLoss: proposal.stopLoss,
      takeProfit: proposal.takeProfit,
      riskPercent: proposal.riskPercent,
      ...tokenOverrides
    });

    return {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'ACC_CANONICAL_01',
      approval_id: approvalId,
      risk_score: 15,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: approvalId,
        status: 'APPROVED',
        risk_score: 15,
        checks: ['Exposure OK', 'Drawdown OK', 'Confidence OK'],
        timestamp: new Date(),
        decision_authority: 'RiskGovernanceEngine',
        token
      },
      approval_token: token,
      timestamp: new Date()
    };
  }

  // A. Valid approved order executes
  it('A. valid approved order executes successfully through router', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal);

    const result = await router.handleRiskCleared(payload);

    expect(result).toBeDefined();
    expect(result.order).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.order.status).toBe('FILLED');
    expect(result.report.status).toBe('FILLED');
    expect(result.order.proposal_id).toBe(proposal.id);
    expect(result.order.approval_id).toBe(payload.approval_id);
  });

  // B. Missing approval rejected
  it('B. missing approval token is strictly rejected', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal);
    payload.approval_token = undefined;
    if (payload.governance_decision) {
      payload.governance_decision.token = undefined;
    }

    await expect(router.handleRiskCleared(payload)).rejects.toThrow(
      'Execution Router Violation: Missing RiskApprovalToken'
    );
  });

  // C. Expired approval rejected
  it('C. expired approval token (>5 mins) is rejected', async () => {
    const proposal = createTestProposal();
    const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
    const payload = createTestPayload(proposal, { timestamp: oldTimestamp });

    await expect(router.handleRiskCleared(payload)).rejects.toThrow(
      'Execution Router Violation: Expired RiskApprovalToken'
    );
  });

  // D. Invalid governance signature rejected
  it('D. invalid governance signature is rejected', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal);
    payload.approval_token!.governanceSignature = 'INVALID_TAMPERED_SIGNATURE_12345';

    await expect(router.handleRiskCleared(payload)).rejects.toThrow(
      'Execution Router Violation: Invalid governanceSignature'
    );
  });

  // E. Wrong symbol rejected
  it('E. wrong symbol mismatch between token and request is rejected', async () => {
    const proposal = createTestProposal({ symbol: 'GBPUSD' });
    const payload = createTestPayload(proposal);
    // Tamper payload symbol to EURUSD while token is GBPUSD
    payload.symbol = 'EURUSD';

    await expect(router.handleRiskCleared(payload)).rejects.toThrow(
      "Token symbol 'GBPUSD' does not match payload symbol 'EURUSD'"
    );
  });

  // F. Wrong direction rejected
  it('F. wrong direction mismatch between token and proposal is rejected', async () => {
    const proposal = createTestProposal({ direction: 'SELL' });
    // Create token with direction BUY so the token's governanceSignature is valid for BUY
    const payload = createTestPayload(proposal, { direction: 'BUY' });

    await expect(router.handleRiskCleared(payload)).rejects.toThrow(
      "Token direction 'BUY' does not match trade proposal direction 'SELL'"
    );
  });

  // G. Duplicate command rejected/idempotently handled
  it('G. duplicate command execution is handled idempotently without re-execution', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal);

    const firstExecution = await router.handleRiskCleared(payload);
    expect(firstExecution.order.status).toBe('FILLED');

    // Execute exact same payload second time
    const secondExecution = await router.handleRiskCleared(payload);
    expect(secondExecution.order.order_id).toBe(firstExecution.order.order_id);
    expect(secondExecution.report.order_id).toBe(firstExecution.order.order_id);
    expect(secondExecution.report.report_id).toContain('rep-dup-');
  });

  // H. Quantity comes from approved risk token
  it('H. quantity comes directly from approved risk token approvedLotSize', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal, { approvedLotSize: 0.75 });

    const result = await router.handleRiskCleared(payload);

    expect(result.order.quantity).toBe(0.75);
  });

  // I. Stop loss preserved
  it('I. stop loss is explicitly preserved in order and execution', async () => {
    const proposal = createTestProposal({ stopLoss: 1.0750 });
    const payload = createTestPayload(proposal, { stopLoss: 1.0750 });

    const result = await router.handleRiskCleared(payload);

    expect(result.order.stop_loss).toBe(1.0750);
  });

  // J. Take profit preserved
  it('J. take profit is explicitly preserved in order and execution', async () => {
    const proposal = createTestProposal({ takeProfit: 1.0990 });
    const payload = createTestPayload(proposal, { takeProfit: 1.0990 });

    const result = await router.handleRiskCleared(payload);

    expect(result.order.take_profit).toBe(1.0990);
  });

  // K. Paper Broker still executes correctly
  it('K. Paper Broker executes order correctly and tracks positions', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal);

    const result = await router.handleRiskCleared(payload);

    expect(result.report.filled_price).toBeGreaterThan(0);
    const position = await paperAdapter.getPosition(proposal.symbol);
    expect(position).toBeDefined();
    expect(position?.symbol).toBe(proposal.symbol);
    expect(position?.direction).toBe(proposal.direction);
  });

  // L. Execution report contains broker/execution information
  it('L. execution report contains broker ID and execution metadata', async () => {
    const proposal = createTestProposal();
    const payload = createTestPayload(proposal);

    const result = await router.handleRiskCleared(payload);

    expect(result.report.broker_id || result.order.broker_id).toBe('paper-broker-01');
    expect(result.report.report_id).toBeDefined();
    expect(result.report.slippage).toBeDefined();
    expect(result.report.filled_price).toBeGreaterThan(0);
  });
});
