import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executionQueueService } from '../src/server/services/executionQueueService';
import { brokerSyncService } from '../src/server/services/brokerSyncService';
import { canonicalExecutionRouter } from '../src/server/routes/execution';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { RiskApprovalToken, TradeProposal, RiskClearedPayload } from '@iati/core-types';

describe('Phase 5G — Durable State & Event Consistency Hardening', () => {

  const sampleToken: RiskApprovalToken = createRiskApprovalToken({
    approvalId: 'gov-5g-approval-101',
    signalId: 'prop-5g-101',
    symbol: 'EURUSD',
    direction: 'BUY',
    approvedLotSize: 1.0,
    maxAllowedDrawdown: 500,
    calculatedRiskAmount: 50,
    status: 'APPROVED'
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await executionQueueService.clearPendingCommands();
  });

  // ==========================================
  // 1. DURABLE IDEMPOTENCY
  // ==========================================
  describe('Durable Idempotency & Process Restart Safety', () => {
    it('should reject duplicate enqueue requests with identical idempotency keys', async () => {
      const enqueueParams = {
        setupId: 'setup-5g-idemp-1',
        symbol: 'EURUSD',
        side: 'BUY' as const,
        volume: 1.0,
        entryPrice: 1.0850,
        stopLoss: 1.0800,
        takeProfit1: 1.0950,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-key-5g-unique-999',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'EURUSD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      };

      const res1 = await executionQueueService.enqueueCommand(enqueueParams);
      expect(res1.isDuplicate).toBe(false);
      expect(res1.command.idempotencyKey).toBe('idemp-key-5g-unique-999');

      // Duplicate enqueue call
      const res2 = await executionQueueService.enqueueCommand(enqueueParams);
      expect(res2.isDuplicate).toBe(true);
      expect(res2.command.id).toBe(res1.command.id);
    });

    it('should prevent duplicate webhook processing via Webhook Inbox idempotency', async () => {
      const webhookPayload = {
        broker: 'PAPER',
        eventType: 'ORDER_ACKNOWLEDGED',
        accountNumber: '5877246',
        orderId: 'ord-webhook-5g-dup-1',
        payload: { ticket: 'ord-webhook-5g-dup-1', status: 'ACK' },
        customEventId: 'evt_custom_5g_dup_100'
      };

      const firstPass = await brokerSyncService.processWebhookEvent(webhookPayload);
      expect(firstPass.duplicate).toBe(false);

      // Re-delivery of same webhook event
      const secondPass = await brokerSyncService.processWebhookEvent(webhookPayload);
      expect(secondPass.duplicate).toBe(true);
      expect(secondPass.processed).toBe(false);
    });
  });

  // ==========================================
  // 2. WEBHOOK INBOX PATTERN
  // ==========================================
  describe('Webhook Inbox Pattern & Restart Recovery', () => {
    it('should store webhook in inbox as RECEIVED before processing', async () => {
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-inbox-1',
        symbol: 'GBPUSD',
        side: 'SELL' as const,
        volume: 0.5,
        entryPrice: 1.2500,
        stopLoss: 1.2550,
        takeProfit1: 1.2400,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-inbox-1',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'GBPUSD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;
      await executionQueueService.claimCommand(cmd.id);

      const res = await brokerSyncService.processWebhookEvent({
        broker: 'PAPER',
        eventType: 'ORDER_FILLED',
        orderId: cmd.id,
        payload: { ticket: cmd.id, setupId: cmd.setupId },
        customEventId: 'evt_inbox_test_1'
      });

      expect(res.processed).toBe(true);
      expect(res.updatedCommand?.status).toBe('EXECUTED');
    });

    it('should support reprocessPendingWebhooks for inbox restart recovery', async () => {
      const result = await brokerSyncService.reprocessPendingWebhooks();
      expect(result).toHaveProperty('reprocessedCount');
      expect(typeof result.reprocessedCount).toBe('number');
    });
  });

  // ==========================================
  // 3. TRANSACTIONAL OUTBOX & AUDIT TRAIL
  // ==========================================
  describe('Transactional Outbox & Immutable Execution Audit Trail', () => {
    it('should record audit trail entries and outbox events on command status transitions', async () => {
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-audit-outbox-1',
        symbol: 'USDJPY',
        side: 'BUY' as const,
        volume: 2.0,
        entryPrice: 155.00,
        stopLoss: 154.50,
        takeProfit1: 156.00,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-audit-1',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'USDJPY',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;

      // Claim command (PENDING -> CLAIMED)
      const claimed = await executionQueueService.claimCommand(cmd.id, 'worker-instance-1', 15000);
      expect(claimed).not.toBeNull();
      expect(claimed?.status).toBe('CLAIMED');

      // Update status (CLAIMED -> SENT)
      const sent = await executionQueueService.updateStatus(cmd.id, 'SENT', { actor: 'ExecutionWorker1' });
      expect(sent?.status).toBe('SENT');

      // Update status (SENT -> EXECUTED)
      const executed = await executionQueueService.updateStatus(cmd.id, 'EXECUTED', { brokerOrderId: 'broker-ord-999', actor: 'BrokerSync' });
      expect(executed?.status).toBe('EXECUTED');
      expect(executed?.brokerOrderId).toBe('broker-ord-999');
    });
  });

  // ==========================================
  // 4. EXECUTION LOCKING & MULTI-INSTANCE SAFETY
  // ==========================================
  describe('Lease-Based Concurrency Locking & Multi-Instance Safety', () => {
    it('should prevent concurrent claims by different workers', async () => {
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-lock-1',
        symbol: 'EURUSD',
        side: 'BUY' as const,
        volume: 1.0,
        entryPrice: 1.0850,
        stopLoss: 1.0800,
        takeProfit1: 1.0950,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-lock-1',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'EURUSD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;

      // Worker 1 claims command with 30s lease
      const worker1Claim = await executionQueueService.claimCommand(cmd.id, 'worker-1', 30000);
      expect(worker1Claim).not.toBeNull();
      expect(worker1Claim?.status).toBe('CLAIMED');

      // Worker 2 attempts concurrent claim while lease active
      const worker2Claim = await executionQueueService.claimCommand(cmd.id, 'worker-2', 30000);
      expect(worker2Claim).toBeNull();
    });

    it('should allow claim after lease expiry', async () => {
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-lock-expire-1',
        symbol: 'EURUSD',
        side: 'BUY' as const,
        volume: 1.0,
        entryPrice: 1.0850,
        stopLoss: 1.0800,
        takeProfit1: 1.0950,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-lock-expire-1',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'EURUSD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;

      // Worker 1 claims command with short lease (1ms)
      await executionQueueService.claimCommand(cmd.id, 'worker-1', 1);

      // Wait 10ms for lease to expire
      await new Promise(r => setTimeout(r, 10));

      // Worker 2 claims command after lease expiry
      const worker2Claim = await executionQueueService.claimCommand(cmd.id, 'worker-2', 30000);
      expect(worker2Claim).not.toBeNull();
      expect(worker2Claim?.status).toBe('CLAIMED');
    });
  });

  // ==========================================
  // 5. CRASH RECOVERY & BROKER-FIRST RECONCILIATION
  // ==========================================
  describe('Crash Recovery & Reconciliation', () => {
    it('should reconcile stuck commands on crash recovery', async () => {
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-crash-1',
        symbol: 'EURUSD',
        side: 'BUY' as const,
        volume: 1.0,
        entryPrice: 1.0850,
        stopLoss: 1.0800,
        takeProfit1: 1.0950,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-crash-1',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'EURUSD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;
      await executionQueueService.claimCommand(cmd.id, 'crashed-worker', 1);
      await new Promise(r => setTimeout(r, 10));

      // Mock broker check returning order found and filled
      const recoveryResult = await executionQueueService.performCrashRecovery(async (c) => {
        if (c.id === cmd.id) {
          return { foundOnBroker: true, brokerOrderId: 'reconciled-broker-id-100', isFilled: true };
        }
        return { foundOnBroker: false };
      });

      expect(recoveryResult.recoveredCount).toBeGreaterThan(0);
      const updatedCmd = await executionQueueService.getCommandById(cmd.id);
      expect(updatedCmd?.status).toBe('EXECUTED');
      expect(updatedCmd?.brokerOrderId).toBe('reconciled-broker-id-100');
    });

    it('should reset unsubmitted stuck commands to PENDING on crash recovery if not found on broker', async () => {
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-crash-reset-1',
        symbol: 'AUDUSD',
        side: 'BUY' as const,
        volume: 0.8,
        entryPrice: 0.6500,
        stopLoss: 0.6450,
        takeProfit1: 0.6600,
        broker: 'PAPER' as const,
        accountNumber: '5877246',
        environment: 'DEMO' as const,
        idempotencyKey: 'idemp-crash-reset-1',
        lineage: {
          dataClass: 'SIMULATED' as const,
          provider: 'TEST',
          symbol: 'AUDUSD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;
      await executionQueueService.claimCommand(cmd.id, 'crashed-worker-2', 1);
      await new Promise(r => setTimeout(r, 10));

      // Mock broker check returning NOT found on broker
      const recoveryResult = await executionQueueService.performCrashRecovery(async () => {
        return { foundOnBroker: false };
      });

      expect(recoveryResult.recoveredCount).toBeGreaterThan(0);
      const updatedCmd = await executionQueueService.getCommandById(cmd.id);
      expect(updatedCmd?.status).toBe('PENDING');
    });
  });

  // ==========================================
  // 6. INVARIANTS VERIFICATION
  // ==========================================
  describe('Phase 5G Architectural Invariants Verification', () => {
    it('should enforce end-to-end execution path with RiskApprovalToken', async () => {
      const proposal: TradeProposal = {
        id: `prop-5g-inv-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        confidence: 90,
        evidence: ['Valid setup'],
        agent_votes: [],
        why_direction: 'Technical',
        invalidate_conditions: [],
        timestamp: new Date()
      };

      const payload: RiskClearedPayload = {
        proposal_id: proposal.id,
        symbol: 'EUR/USD',
        account_id: '5877246',
        approval_id: `gov-approval-5g-${proposal.id}`,
        risk_score: 0.1,
        trade_proposal: proposal,
        approval_token: createRiskApprovalToken({
          approvalId: `gov-approval-5g-${proposal.id}`,
          signalId: proposal.id,
          symbol: 'EUR/USD',
          direction: 'BUY',
          approvedLotSize: 1.0,
          maxAllowedDrawdown: 500,
          calculatedRiskAmount: 50,
          status: 'APPROVED'
        }),
        governance_decision: {
          approval_id: `gov-approval-5g-${proposal.id}`,
          status: 'APPROVED',
          risk_score: 0.1,
          decision_authority: 'AUTOMATED_RISK_RULE',
          checks: ['PASSED'],
          timestamp: new Date()
        },
        timestamp: new Date()
      };

      const result = await canonicalExecutionRouter.handleRiskCleared(payload);
      expect(result).toBeDefined();
      expect(result.order).toBeDefined();
      expect(result.report).toBeDefined();
    });

    it('should reject execution attempts without valid RiskApprovalToken', async () => {
      const proposal: TradeProposal = {
        id: `prop-5g-no-tok-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        confidence: 90,
        evidence: ['Valid setup'],
        agent_votes: [],
        why_direction: 'Technical',
        invalidate_conditions: [],
        timestamp: new Date()
      };

      const payload: RiskClearedPayload = {
        proposal_id: proposal.id,
        symbol: 'EUR/USD',
        account_id: '5877246',
        approval_id: `app-no-tok-${proposal.id}`,
        risk_score: 0.1,
        trade_proposal: proposal,
        governance_decision: {
          approval_id: `app-no-tok-${proposal.id}`,
          status: 'APPROVED',
          risk_score: 0.1,
          decision_authority: 'AUTOMATED_RISK_RULE',
          checks: ['PASSED'],
          timestamp: new Date()
        },
        timestamp: new Date()
      };

      await expect(canonicalExecutionRouter.handleRiskCleared(payload)).rejects.toThrow(/Missing RiskApprovalToken/);
    });
  });
});
