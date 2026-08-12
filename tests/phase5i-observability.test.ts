import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { observabilityService } from '../src/server/services/observabilityService';
import { redactSensitiveData } from '../packages/core/src/redact';
import { ErrorCategory, ExecutionCategorizedError } from '../packages/core/src/errors';
import { observabilityRouter } from '../src/server/routes/observability';

describe('Phase 5I — Production Observability & Operations Hardening', () => {
  beforeEach(() => {
    observabilityService.reset();
  });

  describe('1. Correlation ID & End-to-End Tracing', () => {
    it('should map proposalId and approvalId aliases to canonical executionId', () => {
      const canonicalExecId = 'exec-5i-1001';
      const proposalId = 'prop-5i-2002';
      const approvalId = 'gov-5i-3003';

      observabilityService.registerAlias(proposalId, canonicalExecId);
      observabilityService.registerAlias(approvalId, canonicalExecId);

      expect(observabilityService.getExecutionIdForAlias(proposalId)).toBe(canonicalExecId);
      expect(observabilityService.getExecutionIdForAlias(approvalId)).toBe(canonicalExecId);
      expect(observabilityService.getExecutionIdForAlias(canonicalExecId)).toBe(canonicalExecId);
    });

    it('should record execution timeline events and retrieve full trace', () => {
      const execId = 'exec-trace-999';
      observabilityService.recordTrace(execId, 'PROPOSAL_RECEIVED', { symbol: 'EUR/USD' });
      observabilityService.recordTrace(execId, 'RISK_CLEARED', { approvedLotSize: 0.1 });
      observabilityService.recordTrace(execId, 'ORDER_SUBMITTED', { brokerId: 'paper-broker-01' });
      observabilityService.recordTrace(execId, 'ORDER_FILLED', { filledPrice: 1.0850 });

      const trace = observabilityService.getExecutionTrace(execId);
      expect(trace.executionId).toBe(execId);
      expect(trace.events.length).toBe(4);
      expect(trace.events.map(e => e.stage)).toEqual([
        'PROPOSAL_RECEIVED',
        'RISK_CLEARED',
        'ORDER_SUBMITTED',
        'ORDER_FILLED'
      ]);
    });
  });

  describe('2. Sensitive Data Redaction & Zero-Leakage Guarantee', () => {
    it('should sanitize sensitive tokens and keys in log payloads', () => {
      const rawData = {
        executionId: 'exec-sec-01',
        approval_token: 'secret-gov-token-1234567890',
        governanceSignature: 'sig-abc-def-ghi-jkl',
        apiKey: 'broker-secret-key-999',
        password: 'super-secret-password',
        symbol: 'GBP/USD',
        lotSize: 0.2
      };

      const redacted = redactSensitiveData(rawData);

      expect(redacted.approval_token).toBe('[REDACTED]');
      expect(redacted.governanceSignature).toBe('[REDACTED]');
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.symbol).toBe('GBP/USD');
      expect(redacted.lotSize).toBe(0.2);
    });

    it('should not throw on null, undefined, or primitive values during redaction', () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
      expect(redactSensitiveData('simple-string')).toBe('simple-string');
      expect(redactSensitiveData(12345)).toBe(12345);
    });
  });

  describe('3. Metrics Registry (Counters, Gauges, Histograms)', () => {
    it('should track and retrieve counters and gauges accurately', () => {
      observabilityService.metrics.incCounter('execution_total', 1);
      observabilityService.metrics.incCounter('execution_total', 2);
      observabilityService.metrics.incCounter('execution_success_total', 3);

      observabilityService.metrics.setGauge('queue_backlog', 5);

      const json = observabilityService.metrics.getMetricsJSON();
      expect(json.counters.execution_total).toBe(3);
      expect(json.counters.execution_success_total).toBe(3);
      expect(json.gauges.queue_backlog).toBe(5);
    });

    it('should calculate histogram statistics (count, sum, avg, min, max, p95)', () => {
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach(val => {
        observabilityService.metrics.observeHistogram('execution_duration', val);
      });

      const json = observabilityService.metrics.getMetricsJSON();
      const hist = json.histograms.execution_duration;

      expect(hist.count).toBe(10);
      expect(hist.sum).toBe(550);
      expect(hist.min).toBe(10);
      expect(hist.max).toBe(100);
      expect(hist.avg).toBe(55);
      expect(hist.p95).toBe(100);
    });

    it('should generate valid Prometheus format metrics string', () => {
      observabilityService.metrics.incCounter('execution_total', 5);
      observabilityService.metrics.setGauge('active_connections', 2);

      const promText = observabilityService.metrics.getPrometheusFormat();
      expect(promText).toContain('# TYPE execution_total counter');
      expect(promText).toContain('execution_total 5');
      expect(promText).toContain('# TYPE active_connections gauge');
      expect(promText).toContain('active_connections 2');
    });
  });

  describe('4. Error Taxonomy & Categorization', () => {
    it('should instantiate ExecutionCategorizedError with category and retryability attributes', () => {
      const err = new ExecutionCategorizedError(
        ErrorCategory.BROKER_UNAVAILABLE,
        'Broker connection timeout',
        503,
        'exec-123',
        { brokerId: 'paper-broker-01' }
      );

      expect(err.category).toBe(ErrorCategory.BROKER_UNAVAILABLE);
      expect(err.statusCode).toBe(503);
      expect(err.executionId).toBe('exec-123');
      expect(err.details).toEqual({ brokerId: 'paper-broker-01' });
      expect(err.message).toBe('Broker connection timeout');
    });
  });

  describe('5. Liveness and Readiness Health Probes', () => {
    it('should return LIVENESS as UP unconditionally', () => {
      const liveness = observabilityService.getLiveness();
      expect(liveness.status).toBe('UP');
      expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should evaluate READINESS based on dependency checks', async () => {
      const readiness = await observabilityService.getReadiness();
      expect(readiness.status).toBe('READY');
      expect(['UP', 'DOWN']).toContain(readiness.checks.database.status);
      expect(readiness.checks.eventBus.status).toBe('UP');
      expect(readiness.checks.queue.status).toBe('UP');
      expect(readiness.checks.broker.status).toBe('UP');
    });
  });

  describe('6. Operational Alerting & Threshold Detection', () => {
    it('should raise ALERT on queue backlog exceeding threshold', async () => {
      observabilityService.metrics.setGauge('queue_backlog', 150); // Threshold is 100

      const alerts = await observabilityService.getActiveAlerts();
      expect(alerts.some(a => a.id === 'QUEUE_BACKLOG_HIGH')).toBe(true);
    });

    it('should raise ALERT on broker error burst', async () => {
      observabilityService.metrics.incCounter('broker_error_total', 12); // Threshold is 10

      const alerts = await observabilityService.getActiveAlerts();
      expect(alerts.some(a => a.id === 'BROKER_ERROR_BURST')).toBe(true);
    });

    it('should raise ALERT on stuck execution commands', async () => {
      observabilityService.metrics.setGauge('queue_stuck_total', 2);

      const alerts = await observabilityService.getActiveAlerts();
      expect(alerts.some(a => a.id === 'STUCK_EXECUTION_DETECTED')).toBe(true);
    });
  });

  describe('7. Observability API Routes Integration', () => {
    const app = express();
    app.use(express.json());
    app.use('/api', observabilityRouter);

    it('GET /api/health should return 200 with status UP', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
    });

    it('GET /api/health/readiness should return 200 with READY status', async () => {
      const res = await request(app).get('/api/health/readiness');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.checks).toBeDefined();
    });

    it('GET /api/observability/metrics should return JSON metrics by default', async () => {
      const res = await request(app).get('/api/observability/metrics');
      expect(res.status).toBe(200);
      expect(res.body.counters).toBeDefined();
      expect(res.body.gauges).toBeDefined();
      expect(res.body.histograms).toBeDefined();
    });

    it('GET /api/observability/metrics?format=prometheus should return plain text Prometheus metrics', async () => {
      const res = await request(app).get('/api/observability/metrics?format=prometheus');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/plain');
      expect(res.text).toContain('# TYPE');
    });

    it('GET /api/observability/queue should return queue operational stats', async () => {
      const res = await request(app).get('/api/observability/queue');
      expect(res.status).toBe(200);
      expect(res.body.pending).toBeDefined();
      expect(res.body.claimed).toBeDefined();
    });

    it('GET /api/observability/broker should return registered broker health stats', async () => {
      const res = await request(app).get('/api/observability/broker');
      expect(res.status).toBe(200);
      expect(res.body.brokers).toBeDefined();
      expect(Array.isArray(res.body.brokers)).toBe(true);
    });

    it('GET /api/observability/webhook should return webhook stats', async () => {
      const res = await request(app).get('/api/observability/webhook');
      expect(res.status).toBe(200);
      expect(res.body.receivedTotal).toBeDefined();
    });

    it('GET /api/observability/outbox should return outbox stats', async () => {
      const res = await request(app).get('/api/observability/outbox');
      expect(res.status).toBe(200);
      expect(res.body.published).toBeDefined();
    });

    it('GET /api/observability/reconciliation should return reconciliation stats', async () => {
      const res = await request(app).get('/api/observability/reconciliation');
      expect(res.status).toBe(200);
      expect(res.body.attempts).toBeDefined();
    });

    it('GET /api/observability/alerts should return active alerts count and list', async () => {
      const res = await request(app).get('/api/observability/alerts');
      expect(res.status).toBe(200);
      expect(res.body.count).toBeDefined();
      expect(Array.isArray(res.body.alerts)).toBe(true);
    });

    it('GET /api/observability/trace/:id should return incident diagnostic trace', async () => {
      observabilityService.recordTrace('exec-test-77', 'ENQUEUED', { step: 1 });
      const res = await request(app).get('/api/observability/trace/exec-test-77');
      expect(res.status).toBe(200);
      expect(res.body.executionId).toBe('exec-test-77');
      expect(res.body.timeline).toBeDefined();
      expect(res.body.timeline.length).toBe(1);
    });
  });
});
