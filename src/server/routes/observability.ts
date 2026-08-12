import { Router, Request, Response } from 'express';
import { observabilityService } from '../services/observabilityService';
import { canonicalExecutionRouter } from './execution';

export const observabilityRouter = Router();

/**
 * GET /api/health or /api/health/liveness
 * Liveness probe: returns 200 as long as the process is alive
 */
observabilityRouter.get(['/health', '/health/liveness'], (req: Request, res: Response) => {
  res.json(observabilityService.getLiveness());
});

/**
 * GET /api/health/readiness
 * Readiness probe: verifies critical dependencies without hanging requests
 */
observabilityRouter.get('/health/readiness', async (req: Request, res: Response) => {
  const readiness = await observabilityService.getReadiness();
  const statusCode = readiness.status === 'READY' ? 200 : 503;
  res.status(statusCode).json(readiness);
});

/**
 * GET /api/observability/metrics
 * Prometheus or JSON metrics endpoint
 */
observabilityRouter.get('/observability/metrics', (req: Request, res: Response) => {
  const format = req.query.format as string;
  if (format === 'prometheus' || req.headers.accept?.includes('text/plain')) {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(observabilityService.metrics.getPrometheusFormat());
  } else {
    res.json(observabilityService.metrics.getMetricsJSON());
  }
});

/**
 * GET /api/observability/queue
 * Operational statistics for execution queue
 */
observabilityRouter.get('/observability/queue', async (req: Request, res: Response) => {
  const accountNumber = (req.query.accountNumber as string) || '5877246';
  const stats = await observabilityService.getQueueStats(accountNumber);
  res.json(stats);
});

/**
 * GET /api/observability/broker
 * Safe health information for registered broker adapters
 */
observabilityRouter.get('/observability/broker', (req: Request, res: Response) => {
  const brokerHealth = observabilityService.getBrokerHealth(canonicalExecutionRouter.brokerAdapters);
  res.json(brokerHealth);
});

/**
 * GET /api/observability/webhook
 * Operational statistics for webhook inbox
 */
observabilityRouter.get('/observability/webhook', (req: Request, res: Response) => {
  res.json(observabilityService.getWebhookStats());
});

/**
 * GET /api/observability/outbox
 * Operational statistics for transactional outbox
 */
observabilityRouter.get('/observability/outbox', (req: Request, res: Response) => {
  res.json(observabilityService.getOutboxStats());
});

/**
 * GET /api/observability/reconciliation
 * Operational statistics for state and position reconciliation
 */
observabilityRouter.get('/observability/reconciliation', (req: Request, res: Response) => {
  res.json(observabilityService.getReconciliationStats());
});

/**
 * GET /api/observability/alerts
 * Active operational alert conditions
 */
observabilityRouter.get('/observability/alerts', async (req: Request, res: Response) => {
  const alerts = await observabilityService.getActiveAlerts();
  res.json({ count: alerts.length, alerts });
});

/**
 * GET /api/observability/trace/:id or /api/observability/trace?id=...
 * Reconstruct end-to-end incident diagnostic for an execution
 */
observabilityRouter.get(['/observability/trace/:id', '/observability/trace'], (req: Request, res: Response) => {
  const executionId = (req.params.id || (req.query.id as string) || (req.query.executionId as string)) as string;
  if (!executionId) {
    res.status(400).json({ error: 'Execution ID, Proposal ID, or Approval ID required' });
    return;
  }
  const trace = observabilityService.getExecutionTrace(executionId);
  res.json(trace);
});
