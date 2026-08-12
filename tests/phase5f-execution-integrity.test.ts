import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { RiskGovernanceEngine } from '../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { createRiskApprovalToken, verifyGovernanceSignature } from '../apps/risk-governance/src/modules/riskTokenService';
import { ExecutionRouter } from '../apps/execution-router/src/router/executionRouter';
import { riskRouter } from '../src/server/routes/risk';
import { brokerRouter } from '../src/server/routes/broker';
import { executionRouter, canonicalExecutionRouter } from '../src/server/routes/execution';
import { executionQueueService } from '../src/server/services/executionQueueService';
import { brokerSyncService } from '../src/server/services/brokerSyncService';
import { TradeProposal, RiskClearedPayload, RiskApprovalToken } from '@iati/core-types';
import { MarketDataLineage, ExecutionCommandStatus } from '../src/server/domain/types';

describe('Phase 5F — Execution Lifecycle & Integrity Hardening', () => {
  let app: express.Application;
  let engine: RiskGovernanceEngine;

  beforeEach(async () => {
    engine = new RiskGovernanceEngine();

    app = express();
    app.use(express.json());
    app.use('/api', riskRouter);
    app.use('/api', brokerRouter);
    app.use('/api', executionRouter);

    await executionQueueService.clearPendingCommands('5877246');
    await executionQueueService.clearPendingCommands('11075236');
  });

  // 1. Authoritative State Machine — Valid Happy Path Transitions
  it('1. Authoritative State Machine — Valid Happy Path Transitions', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-valid-path',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_valid_${Date.now()}`
    });

    expect(enq.command.status).toBe('PENDING');

    const claimed = await executionQueueService.claimCommand(enq.command.id);
    expect(claimed?.status).toBe('CLAIMED');

    const sent = await executionQueueService.updateStatus(enq.command.id, 'SENT');
    expect(sent?.status).toBe('SENT');

    const acked = await executionQueueService.updateStatus(enq.command.id, 'ACKNOWLEDGED', { brokerOrderId: 'ord_101' });
    expect(acked?.status).toBe('ACKNOWLEDGED');
    expect(acked?.brokerOrderId).toBe('ord_101');

    const executed = await executionQueueService.updateStatus(enq.command.id, 'EXECUTED', { executedAt: Date.now() });
    expect(executed?.status).toBe('EXECUTED');
  });

  // 2. Illegal State Transition Prevention — PENDING to EXECUTED
  it('2. Illegal State Transition Prevention — PENDING to EXECUTED', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-illegal-p-to-e',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_illegal_pe_${Date.now()}`
    });

    await expect(executionQueueService.updateStatus(enq.command.id, 'EXECUTED')).rejects.toThrow();
  });

  // 3. Illegal State Transition Prevention — FAILED to EXECUTED
  it('3. Illegal State Transition Prevention — FAILED to EXECUTED', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-illegal-f-to-e',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_illegal_fe_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'FAILED', { error: 'Simulated network drop' });

    await expect(executionQueueService.updateStatus(enq.command.id, 'EXECUTED')).rejects.toThrow();
  });

  // 4. Illegal State Transition Prevention — CANCELLED to EXECUTED
  it('4. Illegal State Transition Prevention — CANCELLED to EXECUTED', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-illegal-c-to-e',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_illegal_ce_${Date.now()}`
    });

    await executionQueueService.updateStatus(enq.command.id, 'CANCELLED');
    await expect(executionQueueService.updateStatus(enq.command.id, 'EXECUTED')).rejects.toThrow();
  });

  // 5. Terminal State Immutability — EXECUTED to PENDING / CLAIMED
  it('5. Terminal State Immutability — EXECUTED to PENDING / CLAIMED', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-term-immutable',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_term_imm_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'SENT');
    await executionQueueService.updateStatus(enq.command.id, 'EXECUTED', { executedAt: Date.now() });

    await expect(executionQueueService.updateStatus(enq.command.id, 'PENDING')).rejects.toThrow();
    await expect(executionQueueService.updateStatus(enq.command.id, 'CLAIMED')).rejects.toThrow();
  });

  // 6. Idempotent Duplicate Command Enqueue
  it('6. Idempotent Duplicate Command Enqueue', async () => {
    const key = `ik_dup_enq_${Date.now()}`;
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };

    const res1 = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-dup-1',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: key
    });

    const res2 = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-dup-1',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: key
    });

    expect(res1.command.id).toBe(res2.command.id);
    expect(res2.isDuplicate).toBe(true);
  });

  // 7. Concurrent Duplicate Enqueue Handling
  it('7. Concurrent Duplicate Enqueue Handling', async () => {
    const key = `ik_conc_enq_${Date.now()}`;
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };

    const calls = Array(10).fill(null).map(() =>
      executionQueueService.enqueueCommand({
        setupId: 'setup-5f-conc-1',
        symbol: 'EUR/USD',
        side: 'BUY',
        volume: 0.1,
        entryPrice: 1.085,
        stopLoss: 1.08,
        takeProfit1: 1.09,
        broker: 'CTRADER',
        accountNumber: '5877246',
        environment: 'DEMO',
        lineage,
        idempotencyKey: key
      })
    );

    const results = await Promise.all(calls);
    const uniqueIds = new Set(results.map(r => r.command.id));
    expect(uniqueIds.size).toBe(1);
  });

  // 8. Reconciliation Before Retry — Found on Broker
  it('8. Reconciliation Before Retry — Found on Broker', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-rec-retry-found',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_rrf_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'FAILED', { error: 'Network timeout during submission' });

    // Reconcile with mock broker checker that finds order on broker
    const retryResult = await executionQueueService.reconcileAndRetryCommand(enq.command.id, async () => {
      return { foundOnBroker: true, brokerOrderId: 'bk_found_881', isFilled: true };
    });

    expect(retryResult.action).toBe('RECONCILED');
    expect(retryResult.command?.status).toBe('EXECUTED');
    expect(retryResult.command?.brokerOrderId).toBe('bk_found_881');
  });

  // 9. Reconciliation Before Retry — Not Found on Broker resets FAILED to PENDING
  it('9. Reconciliation Before Retry — Not Found on Broker resets FAILED to PENDING', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-rec-retry-notfound',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_rrnf_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'FAILED', { error: 'Connection lost' });

    const retryResult = await executionQueueService.reconcileAndRetryCommand(enq.command.id, async () => {
      return { foundOnBroker: false };
    });

    expect(retryResult.action).toBe('RESET_TO_PENDING');
    expect(retryResult.command?.status).toBe('PENDING');
  });

  // 10. Reconciliation Before Retry — Terminal Commands Return NO_OP
  it('10. Reconciliation Before Retry — Terminal Commands Return NO_OP', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-rec-retry-term',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_rrt_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'SENT');
    await executionQueueService.updateStatus(enq.command.id, 'EXECUTED', { executedAt: Date.now() });

    const retryResult = await executionQueueService.reconcileAndRetryCommand(enq.command.id, async () => {
      return { foundOnBroker: false };
    });

    expect(retryResult.action).toBe('NO_OP');
    expect(retryResult.command?.status).toBe('EXECUTED');
  });

  // 11. Broker ACK vs Execution Distinction
  it('11. Broker ACK vs Execution Distinction', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-ack-vs-exec',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_ack_vs_exec_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'SENT');

    // Webhook ACK
    const ackRes = await brokerSyncService.processWebhookEvent({
      broker: 'CTRADER',
      eventType: 'ORDER_ACCEPTED_ACK',
      orderId: enq.command.id,
      payload: { timestamp: Date.now(), ticket: 'tk_ack_900' }
    });

    expect(ackRes.processed).toBe(true);
    expect(ackRes.updatedCommand?.status).toBe('ACKNOWLEDGED');
    expect(ackRes.updatedCommand?.status).not.toBe('EXECUTED');

    // Webhook FILL
    const fillRes = await brokerSyncService.processWebhookEvent({
      broker: 'CTRADER',
      eventType: 'ORDER_FILLED_EXECUTE',
      orderId: enq.command.id,
      payload: { timestamp: Date.now() + 100, ticket: 'tk_ack_900' }
    });

    expect(fillRes.processed).toBe(true);
    expect(fillRes.updatedCommand?.status).toBe('EXECUTED');
  });

  // 12. Duplicate Broker Webhooks handled safely
  it('12. Duplicate Broker Webhooks handled safely', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-dup-wh',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_dup_wh_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'SENT');

    const customEventId = `custom_evt_5f_dup_${Date.now()}`;

    const wh1 = await brokerSyncService.processWebhookEvent({
      broker: 'CTRADER',
      eventType: 'ORDER_FILLED_EXECUTE',
      orderId: enq.command.id,
      payload: { timestamp: Date.now() },
      customEventId
    });

    const wh2 = await brokerSyncService.processWebhookEvent({
      broker: 'CTRADER',
      eventType: 'ORDER_FILLED_EXECUTE',
      orderId: enq.command.id,
      payload: { timestamp: Date.now() },
      customEventId
    });

    expect(wh1.processed).toBe(true);
    expect(wh1.duplicate).toBe(false);
    expect(wh2.duplicate).toBe(true);
  });

  // 13. Process Restart & Pending Command Survival
  it('13. Process Restart & Pending Command Survival', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-restart-survive',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_restart_${Date.now()}`
    });

    await executionQueueService.claimCommand(enq.command.id);
    await executionQueueService.updateStatus(enq.command.id, 'SENT');

    const pendingCmds = await executionQueueService.getPendingCommands('5877246');
    const matched = pendingCmds.find(c => c.id === enq.command.id);

    expect(matched).toBeDefined();
    expect(matched?.status).toBe('SENT');
  });

  // 14. Reconciliation Boundary — Position Adoption Without Command Creation
  it('14. Reconciliation Boundary — Position Adoption Without Command Creation', async () => {
    const initialPendingCount = (await executionQueueService.getPendingCommands('5877246')).length;

    const res = await request(app)
      .post('/api/broker/reconcile-positions')
      .send({
        accountNumber: '5877246',
        positions: [
          { ticket: 554411, symbol: 'GBP/USD', side: 'BUY', volume: 0.2, openPrice: 1.2650 }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const finalPendingCount = (await executionQueueService.getPendingCommands('5877246')).length;
    expect(finalPendingCount).toBe(initialPendingCount);
  });

  // 15. Reconciliation Boundary — Does Not Submit Broker Orders
  it('15. Reconciliation Boundary — Does Not Submit Broker Orders', async () => {
    const spyEnqueue = vi.spyOn(executionQueueService, 'enqueueCommand');

    const res = await request(app)
      .post('/api/broker/reconcile-positions')
      .send({
        accountNumber: '11075236',
        positions: [
          { ticket: 778899, symbol: 'USD/CHF', side: 'SELL', volume: 0.15, openPrice: 0.8850 }
        ]
      });

    expect(res.status).toBe(200);
    expect(spyEnqueue).not.toHaveBeenCalled();
    spyEnqueue.mockRestore();
  });

  // 16. Execution Router Zero-Bypass — Missing RiskApprovalToken Throws
  it('16. Execution Router Zero-Bypass — Missing RiskApprovalToken Throws', async () => {
    const proposal: TradeProposal = {
      id: `prop-5f-no-token-${Date.now()}`,
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Valid setup'],
      agent_votes: [],
      why_direction: 'Technical',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'DEFAULT',
      approval_id: `app-no-tok-${proposal.id}`,
      risk_score: 10,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: `app-no-tok-${proposal.id}`,
        status: 'APPROVED',
        risk_score: 10,
        decision_authority: 'RISK_GOVERNANCE_ENGINE',
        checks: ['PASSED'],
        timestamp: new Date()
      },
      timestamp: new Date()
    };

    await expect(canonicalExecutionRouter.handleRiskCleared(payload)).rejects.toThrow(/Missing RiskApprovalToken/);
  });

  // 17. Execution Router Zero-Bypass — Forged Governance Signature Throws
  it('17. Execution Router Zero-Bypass — Forged Governance Signature Throws', async () => {
    const proposal: TradeProposal = {
      id: `prop-5f-forged-${Date.now()}`,
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Valid setup'],
      agent_votes: [],
      why_direction: 'Technical',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const invalidToken: RiskApprovalToken = {
      approvalId: `app-forged-${proposal.id}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.02,
      calculatedRiskAmount: 100,
      riskCheckTimestamp: Date.now(),
      status: 'APPROVED',
      governanceSignature: 'forged_fake_signature_123'
    };

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'DEFAULT',
      approval_id: invalidToken.approvalId,
      risk_score: 10,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: invalidToken.approvalId,
        status: 'APPROVED',
        risk_score: 10,
        decision_authority: 'RISK_GOVERNANCE_ENGINE',
        checks: ['PASSED'],
        timestamp: new Date()
      },
      approval_token: invalidToken,
      timestamp: new Date()
    };

    await expect(canonicalExecutionRouter.handleRiskCleared(payload)).rejects.toThrow(/Invalid governanceSignature/);
  });

  // 18. Execution Router Zero-Bypass — Expired Token Throws
  it('18. Execution Router Zero-Bypass — Expired Token Throws', async () => {
    const proposal: TradeProposal = {
      id: `prop-5f-exp-${Date.now()}`,
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Valid setup'],
      agent_votes: [],
      why_direction: 'Technical',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const expiredToken = createRiskApprovalToken({
      approvalId: `app-exp-${proposal.id}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.02,
      calculatedRiskAmount: 100,
      status: 'APPROVED',
      timestamp: Date.now() - (6 * 60 * 1000) // 6 minutes ago
    });

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'DEFAULT',
      approval_id: expiredToken.approvalId,
      risk_score: 10,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: expiredToken.approvalId,
        status: 'APPROVED',
        risk_score: 10,
        decision_authority: 'RISK_GOVERNANCE_ENGINE',
        checks: ['PASSED'],
        timestamp: new Date()
      },
      approval_token: expiredToken,
      timestamp: new Date()
    };

    await expect(canonicalExecutionRouter.handleRiskCleared(payload)).rejects.toThrow(/Expired RiskApprovalToken/);
  });

  // 19. Execution Router Zero-Bypass — Mismatched Direction Throws
  it('19. Execution Router Zero-Bypass — Mismatched Direction Throws', async () => {
    const proposal: TradeProposal = {
      id: `prop-5f-mismatch-dir-${Date.now()}`,
      symbol: 'EUR/USD',
      direction: 'SELL', // Mismatched with token BUY
      confidence: 85,
      evidence: ['Valid setup'],
      agent_votes: [],
      why_direction: 'Technical',
      invalidate_conditions: [],
      timestamp: new Date()
    };

    const token = createRiskApprovalToken({
      approvalId: `app-mmdir-${proposal.id}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: 'BUY',
      approvedLotSize: 0.1,
      maxAllowedDrawdown: 0.02,
      calculatedRiskAmount: 100,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'DEFAULT',
      approval_id: token.approvalId,
      risk_score: 10,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: token.approvalId,
        status: 'APPROVED',
        risk_score: 10,
        decision_authority: 'RISK_GOVERNANCE_ENGINE',
        checks: ['PASSED'],
        timestamp: new Date()
      },
      approval_token: token,
      timestamp: new Date()
    };

    await expect(canonicalExecutionRouter.handleRiskCleared(payload)).rejects.toThrow(/does not match trade proposal direction/);
  });

  // 20. Execution Router Zero-Bypass — Lot Size Exceeding Approved Cap Throws
  it('20. Execution Router Zero-Bypass — Lot Size Exceeding Approved Cap Throws', async () => {
    const proposal: TradeProposal = {
      id: `prop-5f-excess-lot-${Date.now()}`,
      symbol: 'EUR/USD',
      direction: 'BUY',
      confidence: 85,
      evidence: ['Valid setup'],
      agent_votes: [],
      why_direction: 'Technical',
      invalidate_conditions: [],
      timestamp: new Date(),
      lotSize: 1.5 // Exceeds token approved 0.5
    } as any;

    const token = createRiskApprovalToken({
      approvalId: `app-exlot-${proposal.id}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize: 0.5,
      maxAllowedDrawdown: 0.02,
      calculatedRiskAmount: 100,
      status: 'APPROVED'
    });

    const payload: RiskClearedPayload = {
      proposal_id: proposal.id,
      symbol: proposal.symbol,
      account_id: 'DEFAULT',
      approval_id: token.approvalId,
      risk_score: 10,
      trade_proposal: proposal,
      governance_decision: {
        approval_id: token.approvalId,
        status: 'APPROVED',
        risk_score: 10,
        decision_authority: 'RISK_GOVERNANCE_ENGINE',
        checks: ['PASSED'],
        timestamp: new Date()
      },
      approval_token: token,
      timestamp: new Date()
    };

    await expect(canonicalExecutionRouter.handleRiskCleared(payload)).rejects.toThrow(/exceeds approved lot size/);
  });

  // 21. Live Execution Safety Guard — Rejects SIMULATED data in LIVE execution
  it('21. Live Execution Safety Guard — Rejects SIMULATED data in LIVE execution', async () => {
    const lineage: MarketDataLineage = {
      dataClass: 'SIMULATED',
      provider: 'MOCK_FEED',
      symbol: 'EUR/USD',
      timestamp: Date.now(),
      receivedAt: Date.now()
    };

    const res = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-sim-live-guard',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '11075236',
      environment: 'REAL_LIVE',
      lineage
    });

    expect(res.rejected).toBe(true);
    expect(res.command.status).toBe('FAILED');
    expect(res.error).toContain('SIMULATED');
  });

  // 22. Direct Broker Submission Audit — Only ExecutionRouter executes placeOrder
  it('22. Direct Broker Submission Audit — Only ExecutionRouter executes placeOrder', async () => {
    const execRouterContent = fs.readFileSync(path.join(process.cwd(), 'apps/execution-router/src/router/executionRouter.ts'), 'utf-8');
    expect(execRouterContent.includes('broker.placeOrder(order)')).toBe(true);

    const brokerRouteContent = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/broker.ts'), 'utf-8');
    expect(brokerRouteContent.includes('.placeOrder(')).toBe(false);

    const execRouteContent = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/execution.ts'), 'utf-8');
    expect(execRouteContent.includes('.placeOrder(')).toBe(false);
  });

  // 23. Direct Position Mutation Audit — HTTP handlers do not mutate shared openTrades directly
  it('23. Direct Position Mutation Audit — HTTP handlers do not mutate shared openTrades directly', async () => {
    const brokerRouteContent = fs.readFileSync(path.join(process.cwd(), 'src/server/routes/broker.ts'), 'utf-8');
    expect(brokerRouteContent.includes('sharedAutoTraderState.openTrades.push(')).toBe(false);
  });

  // 24. TradingView Webhook Pipeline — Zero Bypass Flow Verified
  it('24. TradingView Webhook Pipeline — Zero Bypass Flow Verified', async () => {
    const res = await request(app)
      .post('/api/broker/tradingview-webhook')
      .send({
        action: 'OPEN',
        direction: 'BUY',
        symbol: 'GBPUSD',
        price: 1.2650,
        accountNumber: '11075236',
        isReal: true,
        dataMode: 'LIVE'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.decision.status).toBe('APPROVED');
    expect(res.body.command).toBeDefined();
    expect(res.body.command.environment).toBe('REAL_LIVE');
  });

  // 25. Out-of-Order Webhook Advancement — PENDING to FILL auto-advances through intermediate states
  it('25. Out-of-Order Webhook Advancement — PENDING to FILL auto-advances through intermediate states', async () => {
    const lineage: MarketDataLineage = { dataClass: 'LIVE', provider: 'OANDA', symbol: 'EUR/USD', timestamp: Date.now(), receivedAt: Date.now() };
    const enq = await executionQueueService.enqueueCommand({
      setupId: 'setup-5f-ooo-fill',
      symbol: 'EUR/USD',
      side: 'BUY',
      volume: 0.1,
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      broker: 'CTRADER',
      accountNumber: '5877246',
      environment: 'DEMO',
      lineage,
      idempotencyKey: `ik_5f_ooo_fill_${Date.now()}`
    });

    expect(enq.command.status).toBe('PENDING');

    const fillRes = await brokerSyncService.processWebhookEvent({
      broker: 'CTRADER',
      eventType: 'ORDER_FILLED_EXECUTE',
      orderId: enq.command.id,
      payload: { timestamp: Date.now(), ticket: 'tk_ooo_100' }
    });

    expect(fillRes.processed).toBe(true);
    expect(fillRes.updatedCommand?.status).toBe('EXECUTED');
  });
});
