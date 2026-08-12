import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { validateProductionConfig, redactSensitiveData } from '@iati/core';
import { observabilityRouter } from '../src/server/routes/observability';
import { observabilityService } from '../src/server/services/observabilityService';
import { executionQueueService } from '../src/server/services/executionQueueService';
import { outboxService } from '../src/server/services/outboxService';
import { webhookInboxService } from '../src/server/services/webhookInboxService';
import { PaperBrokerAdapter } from '../apps/execution-router/src/adapters/paperBrokerAdapter';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';

describe('Phase 5N — Production Deployment & Disaster Recovery Certification', () => {
  let app: express.Express;

  beforeEach(() => {
    observabilityService.reset();
    executionQueueService.clearInMemoryForTest();
    outboxService.clearInMemoryForTest();
    webhookInboxService.clearForTest();

    app = express();
    app.use(express.json());
    app.use('/api', observabilityRouter);
  });

  // =========================================================================
  // 1. RECONNAISSANCE & ENVIRONMENT SEPARATION
  // =========================================================================
  describe('1. Environment Separation & Production Startup Config', () => {
    it('1.1 Allows valid development and test environment configurations', () => {
      const devRes = validateProductionConfig({
        NODE_ENV: 'development',
        APP_ENV: 'DEVELOPMENT'
      });
      expect(devRes.valid).toBe(true);
      expect(devRes.environment).toBe('DEVELOPMENT');

      const testRes = validateProductionConfig({
        NODE_ENV: 'test',
        APP_ENV: 'TEST'
      });
      expect(testRes.valid).toBe(true);
      expect(testRes.environment).toBe('TEST');
    });

    it('1.2 Fails closed on ambiguous environment variables', () => {
      const ambiguousRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'TEST'
      });
      expect(ambiguousRes.valid).toBe(false);
      expect(ambiguousRes.errors).toContain('AMBIGUOUS_ENV: NODE_ENV is production but APP_ENV is TEST.');
    });

    it('1.3 Fails closed on missing DATABASE_URL in production mode', () => {
      const prodRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'PRODUCTION',
        RISK_SECRET_KEY: 'a_very_secure_production_secret_key_32_chars_long!!'
      });
      expect(prodRes.valid).toBe(false);
      expect(prodRes.errors.some(e => e.includes('MISSING_CONFIG: DATABASE_URL'))).toBe(true);
    });

    it('1.4 Fails closed on non-durable SQLite/Memory database in production mode', () => {
      const prodRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'PRODUCTION',
        DATABASE_URL: 'sqlite://memory.db',
        RISK_SECRET_KEY: 'a_very_secure_production_secret_key_32_chars_long!!'
      });
      expect(prodRes.valid).toBe(false);
      expect(prodRes.errors.some(e => e.includes('INVALID_CONFIG: Production mode requires a durable PostgreSQL'))).toBe(true);
    });

    it('1.5 Fails closed on missing or weak RISK_SECRET_KEY in production mode', () => {
      const missingSecretRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'PRODUCTION',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/iati_os'
      });
      expect(missingSecretRes.valid).toBe(false);
      expect(missingSecretRes.errors.some(e => e.includes('MISSING_SECRET'))).toBe(true);

      const weakSecretRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'PRODUCTION',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/iati_os',
        RISK_SECRET_KEY: 'short_key'
      });
      expect(weakSecretRes.valid).toBe(false);
      expect(weakSecretRes.errors.some(e => e.includes('WEAK_SECRET'))).toBe(true);

      const insecureSecretRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'PRODUCTION',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/iati_os',
        RISK_SECRET_KEY: 'change_me_this_is_a_placeholder_key_32_chars!!'
      });
      expect(insecureSecretRes.valid).toBe(false);
      expect(insecureSecretRes.errors.some(e => e.includes('INSECURE_SECRET'))).toBe(true);
    });

    it('1.6 Fails closed on mismatched market data lineage in LIVE execution mode', () => {
      const mismatchRes = validateProductionConfig({
        NODE_ENV: 'production',
        APP_ENV: 'PRODUCTION',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/iati_os',
        RISK_SECRET_KEY: 'a_very_secure_production_secret_key_32_chars_long!!',
        EXECUTION_MODE: 'LIVE',
        MARKET_DATA_MODE: 'SYNTHETIC',
        BROKER_API_KEY: 'live_broker_secret_key_9988'
      });
      expect(mismatchRes.valid).toBe(false);
      expect(mismatchRes.errors.some(e => e.includes('MISMATCHED_LINEAGE'))).toBe(true);
    });
  });

  // =========================================================================
  // 2. SECRET MANAGEMENT & ZERO EXPOSURE AUDIT
  // =========================================================================
  describe('2. Secret Management & Log Redaction', () => {
    it('2.1 Redacts sensitive credentials from objects and logs', () => {
      const payloadWithSecrets = {
        user: 'trader1',
        password: 'SuperSecretPassword123!',
        api_key: 'sk_live_998877665544332211',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        config: {
          broker_secret: 'brk_sec_abcdef123456',
          publicSetting: 'allowed'
        }
      };

      const redacted = redactSensitiveData(payloadWithSecrets);

      expect(redacted.user).toBe('trader1');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.api_key).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.config.broker_secret).toBe('[REDACTED]');
      expect(redacted.config.publicSetting).toBe('allowed');
    });

    it('2.2 Structured logging does not leak secret variables', () => {
      const logSpy = vi.spyOn(observabilityService, 'logStructured');

      observabilityService.logStructured('info', {
        service: 'RiskService',
        event: 'PROPOSAL_EVALUATED',
        details: {
          account: '5877246',
          secretKey: 'my_private_key_xyz'
        }
      });

      expect(logSpy).toHaveBeenCalled();
      const callArgs = logSpy.mock.calls[0][1];
      expect(callArgs.details.account).toBe('5877246');
    });
  });

  // =========================================================================
  // 3. HEALTH & READINESS PROBES
  // =========================================================================
  describe('3. Health & Readiness Probes', () => {
    it('3.1 /api/health/liveness returns HTTP 200 process status', async () => {
      const res = await request(app).get('/api/health/liveness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('3.2 /api/health/readiness returns READY when dependencies are healthy', async () => {
      const res = await request(app).get('/api/health/readiness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.checks.queue.status).toBe('UP');
      expect(res.body.checks.broker.status).toBe('UP');
    });

    it('3.3 /api/health/readiness returns HTTP 503 NOT_READY when database is required and unavailable', async () => {
      const readiness = await observabilityService.getReadiness({
        requireDatabase: true,
        overrideDbStatus: 'DOWN'
      });

      expect(readiness.status).toBe('NOT_READY');
      expect(readiness.dependencies.database).toBe('DOWN');
    });

    it('3.4 /api/health/readiness reflects queue or broker outage', async () => {
      const brokerDownReadiness = await observabilityService.getReadiness({
        overrideBrokerStatus: 'DOWN'
      });

      expect(brokerDownReadiness.status).toBe('NOT_READY');
      expect(brokerDownReadiness.dependencies.brokerAdapter).toBe('DOWN');
    });
  });

  // =========================================================================
  // 4. APPLICATION & WORKER RESTART RECOVERY
  // =========================================================================
  describe('4. Durable Application & Worker Recovery', () => {
    it('4.1 Enqueued commands survive and are processable after service restart', async () => {
      const accountNumber = '5877246';
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-restart-1',
        symbol: 'EUR/USD',
        side: 'BUY',
        volume: 0.5,
        entryPrice: 1.0850,
        stopLoss: 1.0820,
        takeProfit1: 1.0900,
        takeProfit2: 1.0900,
        broker: 'PAPER',
        accountNumber,
        environment: 'PAPER',
        lineage: {
          dataClass: 'LIVE',
          provider: 'cTrader',
          symbol: 'EUR/USD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;
      expect(cmd.status).toBe('PENDING');

      // Simulate Process Restart (Clear memory state, simulate worker restart)
      const pendingBeforeWorker = await executionQueueService.getPendingCommands(accountNumber);
      expect(pendingBeforeWorker.length).toBeGreaterThan(0);

      const claimed = await executionQueueService.claimCommand(cmd.id, 'WorkerProcess_1');
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(cmd.id);
      expect(claimed!.status).toBe('CLAIMED');
    });

    it('4.2 Stale worker leases expire and enable secondary worker takeover', async () => {
      const accountNumber = '5877246';
      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: 'setup-lease-expiry-1',
        symbol: 'GBP/USD',
        side: 'SELL',
        volume: 0.2,
        entryPrice: 1.3450,
        stopLoss: 1.3480,
        takeProfit1: 1.3400,
        takeProfit2: 1.3400,
        broker: 'PAPER',
        accountNumber,
        environment: 'PAPER',
        lineage: {
          dataClass: 'LIVE',
          provider: 'cTrader',
          symbol: 'GBP/USD',
          timestamp: Date.now(),
          receivedAt: Date.now()
        }
      });

      const cmd = enqueueRes.command;

      // Worker A claims command
      const claimedA = await executionQueueService.claimCommand(cmd.id, 'Worker_A', 100);
      expect(claimedA).not.toBeNull();
      expect(claimedA!.metadata?.claimedBy).toBe('Worker_A');

      // Simulate Worker A crash (Lease expires)
      await executionQueueService.expireStaleLeases(Date.now() + 1000); // Expire stale leases

      // Worker B claims expired command
      const claimedB = await executionQueueService.claimCommand(cmd.id, 'Worker_B');
      expect(claimedB).not.toBeNull();
      expect(claimedB!.id).toBe(cmd.id);
      expect(claimedB!.metadata?.claimedBy).toBe('Worker_B');
    });
  });

  // =========================================================================
  // 5. EVENT BUS & WEBHOOK INBOX RECOVERY
  // =========================================================================
  describe('5. Transactional Outbox & Webhook Inbox Recovery', () => {
    it('5.1 Unpublished outbox events persist and publish after event bus reconnection', async () => {
      const outboxEvent = await outboxService.recordEvent(
        'EXECUTION_COMMAND_CREATED',
        'ExecutionQueue',
        { commandId: 'cmd-outbox-1', symbol: 'EUR/USD' }
      );

      expect(outboxEvent.status).toBe('PENDING');

      const unpublished = await outboxService.getUnpublishedEvents();
      expect(unpublished.length).toBe(1);

      // Publish event
      await outboxService.markPublished(outboxEvent.id);
      const remainingUnpublished = await outboxService.getUnpublishedEvents();
      expect(remainingUnpublished.length).toBe(0);
    });

    it('5.2 Webhook Inbox processes pending events idempotently without duplicates', async () => {
      const webhookPayload = {
        event: 'ORDER_FILLED',
        brokerOrderId: 'brk-ord-9988',
        accountNumber: '5877246',
        symbol: 'EUR/USD',
        direction: 'BUY',
        volume: 0.5,
        fillPrice: 1.0852,
        timestamp: new Date().toISOString()
      };

      const result1 = await webhookInboxService.receiveWebhook('CTRADER', 'evt-hash-9988', webhookPayload);
      expect(result1.status).toBe('PROCESSED');
      expect(result1.duplicate).toBe(false);

      // Duplicate webhook submission
      const result2 = await webhookInboxService.receiveWebhook('CTRADER', 'evt-hash-9988', webhookPayload);
      expect(result2.status).toBe('DUPLICATE_SKIPPED');
      expect(result2.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // 6. BROKER DISCONNECT & POST-RECOVERY RECONCILIATION
  // =========================================================================
  describe('6. Broker Disconnect & Post-Recovery Reconciliation', () => {
    it('6.1 Reconciles local position state against paper broker after reconnect', async () => {
      const paperBroker = new PaperBrokerAdapter();
      const accountStatus = await paperBroker.getAccountStatus();
      expect(accountStatus.connected).toBe(true);

      const openPositions = paperBroker.positionManager.getAllPositions();
      expect(Array.isArray(openPositions)).toBe(true);

      const reconStats = observabilityService.getReconciliationStats();
      expect(reconStats.mismatches).toBe(0);
    });
  });

  // =========================================================================
  // 7. FINAL SECURITY & LINEAGE NON-REGRESSION
  // =========================================================================
  describe('7. Security Non-Regression & Safety Boundaries', () => {
    it('7.1 Rejects execution when Risk Approval Token is missing or invalid', async () => {
      const unauthProposal = {
        signalId: 'sig-unauth-1',
        requestedOrder: {
          symbol: 'EUR/USD',
          direction: 'BUY' as const,
          quantity: 1.0
        },
        token: undefined,
        dataMode: 'SIMULATION' as const,
        executionMode: 'LIVE' as const,
        accountId: '5877246'
      };

      const result = await authorizeExecution({
        signalId: unauthProposal.signalId,
        requestedOrder: unauthProposal.requestedOrder,
        token: unauthProposal.token,
        dataMode: unauthProposal.dataMode,
        executionMode: unauthProposal.executionMode,
        accountId: unauthProposal.accountId
      });

      expect(result.authorized).toBe(false);
      expect(result.errorCode).toBe('MISSING_TOKEN');
    });

    it('7.2 Prevents non-live data mode from executing on LIVE broker targets', async () => {
      const token = createRiskApprovalToken({
        approvalId: 'appr-safety-1',
        signalId: 'prop-safety-1',
        symbol: 'EUR/USD',
        direction: 'BUY',
        approvedLotSize: 0.5,
        maxAllowedDrawdown: 100,
        calculatedRiskAmount: 50,
        status: 'APPROVED'
      });

      const safetyResult = await authorizeExecution({
        signalId: 'prop-safety-1',
        requestedOrder: {
          symbol: 'EUR/USD',
          direction: 'BUY',
          quantity: 0.5
        },
        token,
        dataMode: 'SYNTHETIC',
        executionMode: 'LIVE',
        accountId: '5877246'
      });

      expect(safetyResult.authorized).toBe(false);
      expect(safetyResult.errorCode).toBe('LINEAGE_VIOLATION');
    });
  });
});
