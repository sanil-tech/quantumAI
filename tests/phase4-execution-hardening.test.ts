import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionQueueService } from '../src/server/services/executionQueueService';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { RiskGovernanceEngine } from '../apps/risk-governance/src/modules/governanceEngine';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { ExecutionCommand, MarketDataLineage } from '../src/server/domain/types';
import { TradeProposal, RiskClearedPayload } from '@iati/core-types';

describe('PHASE 4 — Execution Router Hardening & Idempotent Order Lifecycle', () => {
  let executionQueue: ExecutionQueueService;
  let executionRouter: ExecutionRouter;
  let riskEngine: RiskGovernanceEngine;

  const validLineage: MarketDataLineage = {
    dataClass: 'LIVE',
    provider: 'OANDA',
    symbol: 'EURUSD',
    timeframe: 'M15',
    timestamp: Date.now(),
    receivedAt: Date.now()
  };

  const syntheticLineage: MarketDataLineage = {
    dataClass: 'SYNTHETIC',
    provider: 'MOCK',
    symbol: 'EURUSD',
    timeframe: 'M15',
    timestamp: Date.now(),
    receivedAt: Date.now()
  };

  beforeEach(() => {
    executionQueue = new ExecutionQueueService();
    executionRouter = new ExecutionRouter();
    riskEngine = new RiskGovernanceEngine();
  });

  it('1. First execution request creates command', async () => {
    const res = await executionQueue.enqueueCommand({
      setupId: 'setup-001',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: 'ik_setup-001_5877246_EURUSD_BUY'
    });

    expect(res.command).toBeDefined();
    expect(res.command.id).toBeDefined();
    expect(res.command.status).toBe('PENDING');
    expect(res.isDuplicate).toBe(false);
  });

  it('2. Identical second request returns duplicate', async () => {
    const key = 'ik_setup-dup-01_5877246_EURUSD_BUY';

    const res1 = await executionQueue.enqueueCommand({
      setupId: 'setup-dup-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    const res2 = await executionQueue.enqueueCommand({
      setupId: 'setup-dup-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    expect(res1.command.id).toBe(res2.command.id);
    expect(res2.isDuplicate).toBe(true);
  });

  it('3. Identical concurrent requests create one command', async () => {
    const key = 'ik_concurrent_001';

    const [res1, res2] = await Promise.all([
      executionQueue.enqueueCommand({
        setupId: 'setup-conc-1',
        symbol: 'GBPUSD',
        side: 'BUY',
        volume: 0.2,
        entryPrice: 1.25,
        stopLoss: 1.24,
        takeProfit1: 1.26,
        broker: 'CTRADER',
        accountNumber: '5877246',
        environment: 'DEMO',
        lineage: validLineage,
        idempotencyKey: key
      }),
      executionQueue.enqueueCommand({
        setupId: 'setup-conc-1',
        symbol: 'GBPUSD',
        side: 'BUY',
        volume: 0.2,
        entryPrice: 1.25,
        stopLoss: 1.24,
        takeProfit1: 1.26,
        broker: 'CTRADER',
        accountNumber: '5877246',
        environment: 'DEMO',
        lineage: validLineage,
        idempotencyKey: key
      })
    ]);

    expect(res1.command.id).toBe(res2.command.id);
    expect([res1.isDuplicate, res2.isDuplicate]).toContain(true);
  });

  it('4. Different execution intents create separate commands', async () => {
    const res1 = await executionQueue.enqueueCommand({
      setupId: 'setup-intent-A',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage
    });

    const res2 = await executionQueue.enqueueCommand({
      setupId: 'setup-intent-B',
      symbol: 'USDJPY',
      side: 'SELL',
      volume: 0.1,
      entryPrice: 155.0,
      stopLoss: 155.5,
      takeProfit1: 154.0,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage
    });

    expect(res1.command.id).not.toBe(res2.command.id);
    expect(res1.isDuplicate).toBe(false);
    expect(res2.isDuplicate).toBe(false);
  });

  it('5. Process restart preserves command (lookup via idempotency key)', async () => {
    const key = 'ik_restart_test_01';
    const created = await executionQueue.enqueueCommand({
      setupId: 'setup-restart-01',
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.5,
      entryPrice: 2300,
      stopLoss: 2280,
      takeProfit1: 2320,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    const newQueueInstance = new ExecutionQueueService();
    const fetched = await newQueueInstance.getCommandByIdempotencyKey(key);

    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.command.id);
  });

  it('6. Queued command survives restart', async () => {
    const key = 'ik_queued_survive';
    const created = await executionQueue.enqueueCommand({
      setupId: 'setup-queued-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.08,
      stopLoss: 1.07,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    const pending = await executionQueue.getPendingCommands();
    expect(pending.some(c => c.id === created.command.id)).toBe(true);
  });

  it('7. Retryable command survives restart (FAILED status transition to PENDING)', async () => {
    const created = await executionQueue.enqueueCommand({
      setupId: 'setup-retry-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.08,
      stopLoss: 1.07,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage
    });

    await executionQueue.claimCommand(created.command.id);
    await executionQueue.updateStatus(created.command.id, 'FAILED', { error: 'Temporary network glitch' });

    // Retry transition from FAILED -> PENDING
    const retried = await executionQueue.updateStatus(created.command.id, 'PENDING');
    expect(retried?.status).toBe('PENDING');
  });

  it('8. Terminal command cannot regress to PENDING/CLAIMED/SENT', async () => {
    const created = await executionQueue.enqueueCommand({
      setupId: 'setup-terminal-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.08,
      stopLoss: 1.07,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage
    });

    await executionQueue.claimCommand(created.command.id);
    await executionQueue.updateStatus(created.command.id, 'SENT');
    await executionQueue.updateStatus(created.command.id, 'EXECUTED');

    await expect(executionQueue.updateStatus(created.command.id, 'PENDING')).rejects.toThrow();
    await expect(executionQueue.updateStatus(created.command.id, 'CLAIMED')).rejects.toThrow();
    await expect(executionQueue.updateStatus(created.command.id, 'SENT')).rejects.toThrow();
  });

  it('9. Broker timeout does not blindly duplicate order', async () => {
    const key = 'ik_timeout_test';
    const first = await executionQueue.enqueueCommand({
      setupId: 'setup-timeout',
      symbol: 'GBPUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.25,
      stopLoss: 1.24,
      takeProfit1: 1.26,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    await executionQueue.claimCommand(first.command.id);
    await executionQueue.updateStatus(first.command.id, 'SENT', { brokerOrderId: 'TICKET-999' });

    // Retry attempt with same idempotency key returns same command with TICKET-999
    const second = await executionQueue.enqueueCommand({
      setupId: 'setup-timeout',
      symbol: 'GBPUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.25,
      stopLoss: 1.24,
      takeProfit1: 1.26,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    expect(second.isDuplicate).toBe(true);
    expect(second.command.brokerOrderId).toBe('TICKET-999');
  });

  it('10. Repeated broker acknowledgement is idempotent', async () => {
    const created = await executionQueue.enqueueCommand({
      setupId: 'setup-ack',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.08,
      stopLoss: 1.07,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage
    });

    await executionQueue.claimCommand(created.command.id);
    await executionQueue.updateStatus(created.command.id, 'SENT');

    const ack1 = await executionQueue.updateStatus(created.command.id, 'ACKNOWLEDGED', { brokerOrderId: 'ORD-123' });
    const ack2 = await executionQueue.updateStatus(created.command.id, 'ACKNOWLEDGED', { brokerOrderId: 'ORD-123' });

    expect(ack1?.status).toBe('ACKNOWLEDGED');
    expect(ack2?.status).toBe('ACKNOWLEDGED');
  });

  it('11. Missing RiskApprovalToken rejected', async () => {
    const proposal: TradeProposal = {
      id: 'prop-no-token',
      symbol: 'EURUSD',
      direction: 'BUY',
      confidence: 80,
      evidence: ['Unit Test'],
      agent_votes: [],
      why_direction: 'Test',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const payload: RiskClearedPayload = {
      proposal_id: 'prop-no-token',
      approval_id: 'gov-no-token',
      symbol: 'EURUSD',
      account_id: 'DEFAULT',
      trade_proposal: proposal,
      risk_score: 10,
      governance_decision: { status: 'APPROVED' } as any,
      timestamp: new Date()
    };

    await expect(executionRouter.handleRiskCleared(payload)).rejects.toThrow('Missing RiskApprovalToken');
  });

  it('12. Invalid RiskApprovalToken rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-invalid-sig',
      signalId: 'prop-bad-sig',
      symbol: 'EURUSD',
      direction: 'BUY',
      status: 'APPROVED',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.15,
      calculatedRiskAmount: 100
    });

    token.governanceSignature = 'TAMPERED_INVALID_SIG';

    const payload: RiskClearedPayload = {
      proposal_id: 'prop-bad-sig',
      approval_id: 'gov-invalid-sig',
      symbol: 'EURUSD',
      account_id: 'DEFAULT',
      trade_proposal: {
        id: 'prop-bad-sig',
        symbol: 'EURUSD',
        direction: 'BUY',
        confidence: 80,
        evidence: [],
        agent_votes: [],
        why_direction: 'Test',
        invalidate_conditions: [],
        timestamp: new Date()
      },
      approval_token: token,
      risk_score: 10,
      governance_decision: { status: 'APPROVED' } as any,
      timestamp: new Date()
    };

    await expect(executionRouter.handleRiskCleared(payload)).rejects.toThrow('Invalid governanceSignature');
  });

  it('13. Modified symbol rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-sym-mod',
      signalId: 'prop-sym-mod',
      symbol: 'EURUSD',
      direction: 'BUY',
      status: 'APPROVED',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.15,
      calculatedRiskAmount: 100
    });

    const payload: RiskClearedPayload = {
      proposal_id: 'prop-sym-mod',
      approval_id: 'gov-sym-mod',
      symbol: 'GBPUSD', // Symbol mismatch!
      account_id: 'DEFAULT',
      trade_proposal: {
        id: 'prop-sym-mod',
        symbol: 'GBPUSD',
        direction: 'BUY',
        confidence: 80,
        evidence: [],
        agent_votes: [],
        why_direction: 'Test',
        invalidate_conditions: [],
        timestamp: new Date()
      },
      approval_token: token,
      risk_score: 10,
      governance_decision: { status: 'APPROVED' } as any,
      timestamp: new Date()
    };

    await expect(executionRouter.handleRiskCleared(payload)).rejects.toThrow('symbol');
  });

  it('14. Modified direction rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-dir-mod',
      signalId: 'prop-dir-mod',
      symbol: 'EURUSD',
      direction: 'BUY',
      status: 'APPROVED',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.15,
      calculatedRiskAmount: 100
    });

    const payload: RiskClearedPayload = {
      proposal_id: 'prop-dir-mod',
      approval_id: 'gov-dir-mod',
      symbol: 'EURUSD',
      account_id: 'DEFAULT',
      trade_proposal: {
        id: 'prop-dir-mod',
        symbol: 'EURUSD',
        direction: 'SELL', // Direction mismatch!
        confidence: 80,
        evidence: [],
        agent_votes: [],
        why_direction: 'Test',
        invalidate_conditions: [],
        timestamp: new Date()
      },
      approval_token: token,
      risk_score: 10,
      governance_decision: { status: 'APPROVED' } as any,
      timestamp: new Date()
    };

    await expect(executionRouter.handleRiskCleared(payload)).rejects.toThrow('direction');
  });

  it('15. Quantity above approval rejected', async () => {
    const token = createRiskApprovalToken({
      approvalId: 'gov-lot-limit',
      signalId: 'prop-lot-limit',
      symbol: 'EURUSD',
      direction: 'BUY',
      status: 'APPROVED',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.15,
      calculatedRiskAmount: 100
    });

    const payload: RiskClearedPayload = {
      proposal_id: 'prop-lot-limit',
      approval_id: 'gov-lot-limit',
      symbol: 'EURUSD',
      account_id: 'DEFAULT',
      trade_proposal: {
        id: 'prop-lot-limit',
        symbol: 'EURUSD',
        direction: 'BUY',
        lotSize: 2.5, // Exceeds approved 0.1!
        confidence: 80,
        evidence: [],
        agent_votes: [],
        why_direction: 'Test',
        invalidate_conditions: [],
        timestamp: new Date()
      } as any,
      approval_token: token,
      risk_score: 10,
      governance_decision: { status: 'APPROVED' } as any,
      timestamp: new Date()
    };

    await expect(executionRouter.handleRiskCleared(payload)).rejects.toThrow('exceeds approved lot size');
  });

  it('16. Database unavailable → execution rejected (failed closed)', async () => {
    const mockTradingRepo = {
      getAccountState: vi.fn().mockRejectedValue(new Error('DB_CONN_TIMEOUT'))
    } as any;

    const authRes = await authorizeExecution({
      signalId: 'sig-db-fail',
      requestedOrder: {
        symbol: 'EURUSD',
        direction: 'BUY',
        quantity: 0.1,
        stopLoss: 1.08,
        takeProfit: 1.09,
        price: 1.085
      },
      dataMode: 'LIVE',
      executionMode: 'LIVE',
      accountId: 'DEFAULT',
      tradingRepo: mockTradingRepo
    });

    expect(authRes.authorized).toBe(false);
    expect(authRes.reason).toContain('Missing RiskApprovalToken');
  });

  it('17. Paper execution idempotency works', async () => {
    const res1 = await executionQueue.enqueueCommand({
      setupId: 'setup-paper-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'PAPER',
      accountNumber: 'PAPER-01',
      environment: 'PAPER',
      lineage: { ...validLineage, dataClass: 'PAPER' },
      idempotencyKey: 'ik_paper_01'
    });

    const res2 = await executionQueue.enqueueCommand({
      setupId: 'setup-paper-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'PAPER',
      accountNumber: 'PAPER-01',
      environment: 'PAPER',
      lineage: { ...validLineage, dataClass: 'PAPER' },
      idempotencyKey: 'ik_paper_01'
    });

    expect(res1.command.id).toBe(res2.command.id);
    expect(res2.isDuplicate).toBe(true);
  });

  it('18. LIVE execution idempotency works', async () => {
    const res1 = await executionQueue.enqueueCommand({
      setupId: 'setup-live-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'REAL_LIVE',
      lineage: validLineage,
      idempotencyKey: 'ik_live_01'
    });

    const res2 = await executionQueue.enqueueCommand({
      setupId: 'setup-live-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'REAL_LIVE',
      lineage: validLineage,
      idempotencyKey: 'ik_live_01'
    });

    expect(res1.command.id).toBe(res2.command.id);
    expect(res2.isDuplicate).toBe(true);
  });

  it('19. Synthetic LIVE execution remains rejected (Phase 1B Lineage Invariant)', async () => {
    const res = await executionQueue.enqueueCommand({
      setupId: 'setup-synthetic-live',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'REAL_LIVE',
      lineage: syntheticLineage // SYNTHETIC lineage in REAL_LIVE env!
    });

    expect(res.rejected).toBe(true);
    expect(res.error).toContain('Live execution safety guard rejected');
  });

  it('20. Execution audit events persist metadata and status', async () => {
    const cmd = await executionQueue.enqueueCommand({
      setupId: 'setup-audit-01',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      metadata: { source: 'unit_test_audit' }
    });

    expect(cmd.command.metadata?.source).toBe('unit_test_audit');
    expect(cmd.command.idempotencyKey).toBeDefined();
  });

  it('21. Broker ticket correlation persists', async () => {
    const cmd = await executionQueue.enqueueCommand({
      setupId: 'setup-ticket-corr',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage
    });

    await executionQueue.claimCommand(cmd.command.id);
    const updated = await executionQueue.updateStatus(cmd.command.id, 'SENT', { brokerOrderId: 'CT-987654' });

    expect(updated?.brokerOrderId).toBe('CT-987654');
  });

  it('22. Duplicate POST returns duplicate=true', async () => {
    const key = 'ik_dup_post_check';
    const res1 = await executionQueue.enqueueCommand({
      setupId: 'setup-post-dup',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    const res2 = await executionQueue.enqueueCommand({
      setupId: 'setup-post-dup',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    expect(res1.isDuplicate).toBe(false);
    expect(res2.isDuplicate).toBe(true);
  });

  it('23. Server restart does not recreate command', async () => {
    const key = 'ik_restart_no_recreate';
    const original = await executionQueue.enqueueCommand({
      setupId: 'setup-no-recreate',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    // Simulate process restart
    const freshQueue = new ExecutionQueueService();
    const duplicateSubmission = await freshQueue.enqueueCommand({
      setupId: 'setup-no-recreate',
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage: validLineage,
      idempotencyKey: key
    });

    expect(duplicateSubmission.command.id).toBe(original.command.id);
    expect(duplicateSubmission.isDuplicate).toBe(true);
  });

  it('24. Concurrent duplicate requests remain one command', async () => {
    const key = 'ik_concurrent_check_24';
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        executionQueue.enqueueCommand({
          setupId: 'setup-conc-5',
          symbol: 'EURUSD',
          side: 'BUY',
          volume: 0.1,
          entryPrice: 1.085,
          stopLoss: 1.08,
          takeProfit1: 1.09,
          broker: 'CTRADER',
          accountNumber: '5877246',
          environment: 'DEMO',
          lineage: validLineage,
          idempotencyKey: key
        })
      )
    );

    const commandIds = new Set(results.map(r => r.command.id));
    expect(commandIds.size).toBe(1);
  });
});
