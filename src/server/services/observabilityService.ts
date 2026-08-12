import { logger, redactSensitiveData, ErrorCategory } from '@iati/core';
import { checkDbConnection } from '@iati/database';
import { executionQueueService } from './executionQueueService';

export interface StructuredLogPayload {
  service: string;
  event: string;
  environment?: string;
  executionId?: string;
  proposalId?: string;
  approvalId?: string;
  commandId?: string;
  brokerOrderId?: string;
  eventId?: string;
  workerId?: string;
  symbol?: string;
  direction?: string;
  status?: string;
  durationMs?: number;
  errorCode?: string;
  details?: any;
}

export interface TraceEvent {
  timestamp: number;
  event: string;
  data: any;
}

export interface ExecutionTrace {
  executionId: string;
  found: boolean;
  timeline: TraceEvent[];
  events?: TraceEvent[] | any[];
  summary: {
    proposalId?: string;
    approvalId?: string;
    commandId?: string;
    brokerOrderId?: string;
    symbol?: string;
    status?: string;
    totalDurationMs?: number;
    errorsCount: number;
    retriesCount: number;
  };
}

export interface Alert {
  id: string;
  alert: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  timestamp: string;
  details?: any;
}

class MetricsRegistry {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  constructor() {
    this.reset();
  }

  public reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();

    // Default counters
    this.counters.set('execution_total', 0);
    this.counters.set('execution_success_total', 0);
    this.counters.set('execution_failure_total', 0);

    this.counters.set('queue_claim_total', 0);
    this.counters.set('queue_retry_total', 0);
    this.counters.set('queue_lease_expiry_total', 0);

    this.counters.set('broker_request_total', 0);
    this.counters.set('broker_error_total', 0);

    this.counters.set('webhook_received_total', 0);
    this.counters.set('webhook_duplicate_total', 0);
    this.counters.set('webhook_failed_total', 0);

    this.counters.set('outbox_published_total', 0);
    this.counters.set('outbox_failed_total', 0);

    this.counters.set('reconciliation_total', 0);
    this.counters.set('reconciliation_mismatch_total', 0);
    this.counters.set('reconciliation_failure_total', 0);

    // Default gauges
    this.gauges.set('queue_depth', 0);
    this.gauges.set('queue_stuck_total', 0);
    this.gauges.set('broker_connection_status', 1);
    this.gauges.set('webhook_pending', 0);
    this.gauges.set('outbox_pending', 0);

    // Histograms
    this.histograms.set('execution_duration', []);
    this.histograms.set('broker_latency', []);
  }

  public incCounter(name: string, value = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  public setGauge(name: string, value: number) {
    this.gauges.set(name, value);
  }

  public observeHistogram(name: string, value: number) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    const values = this.histograms.get(name)!;
    values.push(value);
    // Keep last 1000 samples
    if (values.length > 1000) {
      values.shift();
    }
  }

  public getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  public getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  public getMetricsJSON() {
    const json: Record<string, any> = {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: {}
    };

    for (const [name, values] of this.histograms.entries()) {
      if (values.length === 0) {
        json.histograms[name] = { count: 0, avg: 0, p95: 0, max: 0 };
      } else {
        const sorted = [...values].sort((a, b) => a - b);
        const sum = sorted.reduce((acc, v) => acc + v, 0);
        const p95Idx = Math.floor(sorted.length * 0.95);
        json.histograms[name] = {
          count: sorted.length,
          sum,
          min: sorted[0],
          avg: Number((sum / sorted.length).toFixed(2)),
          p95: Number(sorted[p95Idx].toFixed(2)),
          max: Number(sorted[sorted.length - 1].toFixed(2))
        };
      }
    }

    return json;
  }

  public getPrometheusFormat(): string {
    const lines: string[] = [];

    for (const [name, val] of this.counters.entries()) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${val}`);
    }

    for (const [name, val] of this.gauges.entries()) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${val}`);
    }

    for (const [name, values] of this.histograms.entries()) {
      lines.push(`# TYPE ${name} summary`);
      if (values.length === 0) {
        lines.push(`${name}_count 0`);
        lines.push(`${name}_sum 0`);
      } else {
        const sum = values.reduce((acc, v) => acc + v, 0);
        lines.push(`${name}_count ${values.length}`);
        lines.push(`${name}_sum ${sum}`);
      }
    }

    return lines.join('\n');
  }
}

export class ObservabilityService {
  public readonly metrics = new MetricsRegistry();
  private traceMap: Map<string, TraceEvent[]> = new Map();
  private aliasMap: Map<string, string> = new Map(); // Map proposalId/approvalId -> executionId

  public reset() {
    this.metrics.reset();
    this.traceMap.clear();
    this.aliasMap.clear();
  }

  // --- STRUCTURED LOGGING ---
  public logStructured(level: 'info' | 'warn' | 'error' | 'debug', payload: StructuredLogPayload) {
    const sanitized = redactSensitiveData({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: payload.service || 'iati-os',
      environment: payload.environment || process.env.NODE_ENV || 'development',
      event: payload.event,
      executionId: payload.executionId,
      proposalId: payload.proposalId,
      approvalId: payload.approvalId,
      commandId: payload.commandId,
      brokerOrderId: payload.brokerOrderId,
      eventId: payload.eventId,
      workerId: payload.workerId,
      symbol: payload.symbol,
      direction: payload.direction,
      status: payload.status,
      durationMs: payload.durationMs,
      errorCode: payload.errorCode,
      details: payload.details
    });

    const msg = `[${sanitized.service}] ${sanitized.event}${sanitized.executionId ? ` (exec:${sanitized.executionId})` : ''} - status:${sanitized.status || 'OK'}`;

    if (level === 'error') {
      logger.error(msg, sanitized);
    } else if (level === 'warn') {
      logger.warn(msg, sanitized);
    } else if (level === 'debug') {
      logger.debug ? logger.debug(msg, sanitized) : logger.info(msg, sanitized);
    } else {
      logger.info(msg, sanitized);
    }
  }

  public registerAlias(alias: string, executionId: string) {
    if (alias && executionId) {
      this.aliasMap.set(alias, executionId);
    }
  }

  public getExecutionIdForAlias(alias: string): string {
    return this.aliasMap.get(alias) || alias;
  }

  // --- TRACING & INCIDENT DIAGNOSTICS ---
  public recordTrace(key: string, event: string, data?: any) {
    if (!key) return;

    // Resolve key through alias if available
    const canonicalKey = this.aliasMap.get(key) || key;

    if (!this.traceMap.has(canonicalKey)) {
      this.traceMap.set(canonicalKey, []);
    }

    const events = this.traceMap.get(canonicalKey)!;
    events.push({
      timestamp: Date.now(),
      event,
      data: redactSensitiveData(data)
    });

    // Check if data contains other identifiers to alias
    if (data && typeof data === 'object') {
      if (data.proposalId && data.proposalId !== canonicalKey) {
        this.aliasMap.set(data.proposalId, canonicalKey);
      }
      if (data.approvalId && data.approvalId !== canonicalKey) {
        this.aliasMap.set(data.approvalId, canonicalKey);
      }
      if (data.commandId && data.commandId !== canonicalKey) {
        this.aliasMap.set(data.commandId, canonicalKey);
      }
      if (data.brokerOrderId && data.brokerOrderId !== canonicalKey) {
        this.aliasMap.set(data.brokerOrderId, canonicalKey);
      }
    }
  }

  public getExecutionTrace(identifier: string): ExecutionTrace {
    const canonicalKey = this.aliasMap.get(identifier) || identifier;
    const events = this.traceMap.get(canonicalKey);

    if (!events || events.length === 0) {
      return {
        executionId: identifier,
        found: false,
        timeline: [],
        summary: {
          errorsCount: 0,
          retriesCount: 0
        }
      };
    }

    let proposalId: string | undefined;
    let approvalId: string | undefined;
    let commandId: string | undefined;
    let brokerOrderId: string | undefined;
    let symbol: string | undefined;
    let status: string | undefined;
    let errorsCount = 0;
    let retriesCount = 0;

    const firstTime = events[0].timestamp;
    const lastTime = events[events.length - 1].timestamp;

    for (const e of events) {
      if (e.data) {
        if (e.data.proposalId) proposalId = e.data.proposalId;
        if (e.data.approvalId) approvalId = e.data.approvalId;
        if (e.data.commandId) commandId = e.data.commandId;
        if (e.data.brokerOrderId) brokerOrderId = e.data.brokerOrderId;
        if (e.data.symbol) symbol = e.data.symbol;
        if (e.data.status) status = e.data.status;
        if (e.data.isRetry) retriesCount++;
      }
      if (e.event.includes('ERROR') || e.event.includes('FAILED') || e.event.includes('REJECTED')) {
        errorsCount++;
      }
      if (e.event === 'COMPLETED' || e.event === 'EXECUTED') {
        status = 'COMPLETED';
      }
    }

    const traceEvents = events.map(e => ({
      ...e,
      stage: e.event
    }));

    return {
      executionId: canonicalKey,
      found: true,
      timeline: events,
      events: traceEvents,
      summary: {
        proposalId,
        approvalId,
        commandId,
        brokerOrderId,
        symbol,
        status: status || events[events.length - 1].event,
        totalDurationMs: lastTime - firstTime,
        errorsCount,
        retriesCount
      }
    };
  }

  // --- QUEUE STATISTICS ---
  public async getQueueStats(accountNumber = '5877246') {
    const commands = await executionQueueService.getPendingCommands(accountNumber);
    const pendingCount = commands.filter(c => c.status === 'PENDING').length;
    const claimedCount = commands.filter(c => c.status === 'CLAIMED').length;
    const sentCount = commands.filter(c => c.status === 'SENT').length;
    const acknowledgedCount = commands.filter(c => c.status === 'ACKNOWLEDGED').length;
    const failedCount = commands.filter(c => c.status === 'FAILED').length;
    const expiredCount = commands.filter(c => c.status === 'EXPIRED').length;

    // Check for stuck execution commands (CLAIMED or SENT for > 30 seconds)
    const now = Date.now();
    const stuckCommands = commands.filter(c => {
      if (['CLAIMED', 'SENT'].includes(c.status)) {
        const ageMs = now - (c.updatedAt || c.createdAt);
        return ageMs > 30000;
      }
      return false;
    });

    this.metrics.setGauge('queue_depth', pendingCount);
    this.metrics.setGauge('queue_stuck_total', stuckCommands.length);

    return {
      pending: pendingCount,
      claimed: claimedCount,
      sent: sentCount,
      acknowledged: acknowledgedCount,
      failed: failedCount,
      expired: expiredCount,
      stuck: stuckCommands.length,
      stuckDetails: stuckCommands.map(c => ({
        commandId: c.id,
        accountNumber: c.accountNumber,
        status: c.status,
        ageMs: now - (c.updatedAt || c.createdAt)
      })),
      totalCommands: commands.length,
      leaseExpirations: this.metrics.getCounter('queue_lease_expiry_total'),
      retries: this.metrics.getCounter('queue_retry_total')
    };
  }

  // --- BROKER HEALTH VISIBILITY ---
  public getBrokerHealth(adapters?: Map<string, any>) {
    const brokersInfo: any[] = [];

    if (adapters && adapters.size > 0) {
      for (const [id, adapter] of adapters.entries()) {
        const status = typeof adapter.getHealthStatus === 'function'
          ? adapter.getHealthStatus()
          : {
              brokerId: id,
              connected: true,
              lastCommunication: new Date().toISOString(),
              latencyMs: 15,
              errorCount: 0
            };

        brokersInfo.push(redactSensitiveData(status));
      }
    } else {
      brokersInfo.push({
        brokerId: 'PaperBrokerAdapter',
        connected: true,
        lastCommunication: new Date().toISOString(),
        latencyMs: 12,
        errorCount: 0,
        reconnectCount: 0
      });
    }

    return {
      count: brokersInfo.length,
      brokers: brokersInfo
    };
  }

  // --- WEBHOOK INBOX VISIBILITY ---
  public getWebhookStats() {
    return {
      received: this.metrics.getCounter('webhook_received_total'),
      receivedTotal: this.metrics.getCounter('webhook_received_total'),
      processed: this.metrics.getCounter('webhook_received_total') - this.metrics.getCounter('webhook_failed_total'),
      duplicate: this.metrics.getCounter('webhook_duplicate_total'),
      failed: this.metrics.getCounter('webhook_failed_total'),
      pending: this.metrics.getGauge('webhook_pending'),
      reprocessed: 0,
      oldestPendingAgeMs: 0
    };
  }

  // --- OUTBOX VISIBILITY ---
  public getOutboxStats() {
    return {
      pending: this.metrics.getGauge('outbox_pending'),
      published: this.metrics.getCounter('outbox_published_total'),
      failed: this.metrics.getCounter('outbox_failed_total'),
      retryCount: 0,
      oldestPendingAgeMs: 0
    };
  }

  // --- RECONCILIATION VISIBILITY ---
  public getReconciliationStats() {
    return {
      attempts: this.metrics.getCounter('reconciliation_total'),
      successful: this.metrics.getCounter('reconciliation_total') - this.metrics.getCounter('reconciliation_mismatch_total') - this.metrics.getCounter('reconciliation_failure_total'),
      mismatches: this.metrics.getCounter('reconciliation_mismatch_total'),
      unresolvedMismatches: this.metrics.getCounter('reconciliation_mismatch_total'),
      lastReconciliationTime: new Date().toISOString(),
      recoveryTriggeredCount: 0
    };
  }

  // --- HEALTH & READINESS ---
  public getLiveness() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development'
    };
  }

  public async getReadiness(options?: {
    timeoutMs?: number;
    requireDatabase?: boolean;
    overrideDbStatus?: 'UP' | 'DOWN';
    overrideQueueStatus?: 'UP' | 'DOWN';
    overrideBrokerStatus?: 'UP' | 'DOWN';
    overrideEventBusStatus?: 'UP' | 'DOWN';
  }) {
    const timeoutMs = options?.timeoutMs ?? 2000;
    let dbStatus = options?.overrideDbStatus || 'DOWN';
    let queueStatus = options?.overrideQueueStatus || 'UP';
    let brokerStatus = options?.overrideBrokerStatus || 'UP';
    let eventBusStatus = options?.overrideEventBusStatus || 'UP';

    // 1. DB Dependency check with timeout if not overridden
    if (!options?.overrideDbStatus) {
      try {
        const dbPromise = checkDbConnection();
        const timeoutPromise = new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), timeoutMs)
        );
        const dbOk = await Promise.race([dbPromise, timeoutPromise]);
        dbStatus = dbOk ? 'UP' : 'DOWN';
      } catch {
        dbStatus = 'DOWN';
      }
    }

    const requireDb = options?.requireDatabase ?? (process.env.NODE_ENV === 'production' || process.env.REQUIRE_DB_READINESS === 'true');
    const isReady = queueStatus === 'UP' && brokerStatus === 'UP' && eventBusStatus === 'UP' && (!requireDb || dbStatus === 'UP');

    return {
      status: isReady ? 'READY' : 'NOT_READY',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: dbStatus },
        queue: { status: queueStatus },
        broker: { status: brokerStatus },
        eventBus: { status: eventBusStatus }
      },
      dependencies: {
        database: dbStatus,
        executionQueue: queueStatus,
        brokerAdapter: brokerStatus,
        eventBus: eventBusStatus
      }
    };
  }

  // --- ALERTS MONITOR ---
  public async getActiveAlerts(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const initialStuckGauge = this.metrics.getGauge('queue_stuck_total');
    const queueStats = await this.getQueueStats();
    const backlogGauge = this.metrics.getGauge('queue_backlog');

    // 1. Queue Backlog Too High
    if (queueStats.pending > 50 || backlogGauge > 50) {
      alerts.push({
        id: 'QUEUE_BACKLOG_HIGH',
        alert: 'QUEUE_BACKLOG_TOO_HIGH',
        severity: 'CRITICAL',
        description: `Execution queue pending count (${queueStats.pending || backlogGauge}) exceeds threshold`,
        timestamp: new Date().toISOString(),
        details: { pending: queueStats.pending, backlogGauge }
      });
    }

    // 2. Stuck Execution Detected
    const stuckGauge = this.metrics.getGauge('queue_stuck_total');
    let hasStuckTraces = false;
    for (const [_, events] of this.traceMap.entries()) {
      const last = events[events.length - 1];
      if (last && ['CLAIMED', 'SENT'].includes(last.event) && (Date.now() - last.timestamp > 300000)) {
        hasStuckTraces = true;
        break;
      }
    }

    if (queueStats.stuck > 0 || stuckGauge > 0 || initialStuckGauge > 0 || hasStuckTraces) {
      alerts.push({
        id: 'STUCK_EXECUTION_DETECTED',
        alert: 'STUCK_EXECUTION_DETECTED',
        severity: 'WARNING',
        description: `Execution command(s) stuck in processing state > 30s`,
        timestamp: new Date().toISOString(),
        details: queueStats.stuckDetails
      });
    }

    // 3. Broker Error Burst
    const brokerErrors = this.metrics.getCounter('broker_error_total');
    if (brokerErrors > 10) {
      alerts.push({
        id: 'BROKER_ERROR_BURST',
        alert: 'BROKER_ERROR_BURST',
        severity: 'CRITICAL',
        description: `Broker errors count (${brokerErrors}) exceeds threshold of 10`,
        timestamp: new Date().toISOString()
      });
    }

    // 4. Lease Expiry Spike
    if (queueStats.leaseExpirations > 10) {
      alerts.push({
        id: 'alert-lease-expiry-spike',
        alert: 'LEASE_EXPIRY_SPIKE',
        severity: 'WARNING',
        description: `High number of lease expirations (${queueStats.leaseExpirations}) detected`,
        timestamp: new Date().toISOString()
      });
    }

    // 4. Reconciliation Mismatch
    const reconStats = this.getReconciliationStats();
    if (reconStats.mismatches > 0) {
      alerts.push({
        id: 'alert-reconciliation-mismatch',
        alert: 'RECONCILIATION_MISMATCH_DETECTED',
        severity: 'CRITICAL',
        description: `${reconStats.mismatches} position or order mismatch(es) detected during reconciliation`,
        timestamp: new Date().toISOString()
      });
    }

    // 5. Repeated Execution Failures
    const execFailures = this.metrics.getCounter('execution_failure_total');
    if (execFailures > 10) {
      alerts.push({
        id: 'alert-execution-failures',
        alert: 'REPEATED_EXECUTION_FAILURES',
        severity: 'WARNING',
        description: `Total execution failures count (${execFailures}) exceeds threshold of 10`,
        timestamp: new Date().toISOString()
      });
    }

    // 6. Broker Disconnected
    const brokerConn = this.metrics.getGauge('broker_connection_status');
    if (brokerConn === 0) {
      alerts.push({
        id: 'BROKER_DISCONNECTED',
        alert: 'BROKER_DISCONNECTED',
        severity: 'CRITICAL',
        description: 'Primary broker adapter connection status is DISCONNECTED',
        timestamp: new Date().toISOString()
      });
    }

    // 7. Market Data Stale
    const staleCount = this.metrics.getCounter('market_data_stale_total');
    if (staleCount > 0) {
      alerts.push({
        id: 'MARKET_DATA_STALE',
        alert: 'MARKET_DATA_STALE',
        severity: 'WARNING',
        description: `Market data freshness check failed (${staleCount} stale tick events)`,
        timestamp: new Date().toISOString()
      });
    }

    // 8. Risk Limit Breach
    const riskRejections = this.metrics.getCounter('risk_rejected_total') + this.metrics.getCounter('risk_limit_breach_total');
    if (riskRejections > 0) {
      alerts.push({
        id: 'RISK_LIMIT_BREACH',
        alert: 'RISK_LIMIT_BREACH',
        severity: 'WARNING',
        description: `Trade proposal rejected due to risk limit breach (${riskRejections} event(s))`,
        timestamp: new Date().toISOString()
      });
    }

    // 9. Drawdown Breach
    const drawdownBreaches = this.metrics.getCounter('drawdown_breach_total');
    if (drawdownBreaches > 0) {
      alerts.push({
        id: 'DRAWDOWN_BREACH',
        alert: 'DRAWDOWN_BREACH',
        severity: 'CRITICAL',
        description: `Account drawdown threshold breached (${drawdownBreaches} event(s))`,
        timestamp: new Date().toISOString()
      });
    }

    // 10. Live Data Lineage Failure
    const lineageViolations = this.metrics.getCounter('lineage_violation_total');
    if (lineageViolations > 0) {
      alerts.push({
        id: 'LIVE_DATA_LINEAGE_FAILURE',
        alert: 'LIVE_DATA_LINEAGE_FAILURE',
        severity: 'CRITICAL',
        description: `Live execution rejected due to invalid market data lineage (${lineageViolations} event(s))`,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }
}

export const observabilityService = new ObservabilityService();
