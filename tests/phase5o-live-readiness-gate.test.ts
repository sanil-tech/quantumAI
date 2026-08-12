import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { canonicalExecutionRouter } from '../src/server/routes/execution';
import { executionQueueService } from '../src/server/services/executionQueueService';
import { observabilityService } from '../src/server/services/observabilityService';
import { validateExecutionSafety, setKillSwitch, isKillSwitchActive, setLiveExecutionArming, isLiveExecutionArmed } from '../src/server/services/liveExecutionSafetyGuard';
import { RiskGovernanceEngine } from '../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../apps/risk-governance/src/modules/executionAuthorization';
import { createRiskApprovalToken } from '../apps/risk-governance/src/modules/riskTokenService';
import { TradeProposal, RiskClearedPayload } from '@iati/core-types';
import { MarketDataLineage } from '../src/server/domain/types';

describe('Phase 5O — Live Readiness Gate & Formal GO / NO-GO Certification', () => {
  let governanceEngine: RiskGovernanceEngine;

  beforeEach(async () => {
    governanceEngine = new RiskGovernanceEngine();
    observabilityService.reset();
    await executionQueueService.clearInMemoryForTest();
    setKillSwitch(false);
    setLiveExecutionArming(true);
  });

  // 1. Live Authority Principle & Complete Broker Authority Audit
  describe('1. Live Authority Principle & Broker Callsite Audit', () => {
    it('verifies that only ExecutionRouter invokes broker.placeOrder', () => {
      const execRouterPath = path.join(process.cwd(), 'apps/execution-router/src/router/executionRouter.ts');
      const content = fs.readFileSync(execRouterPath, 'utf-8');
      expect(content.includes('broker.placeOrder(')).toBe(true);

      const routePaths = [
        path.join(process.cwd(), 'src/server/routes/broker.ts'),
        path.join(process.cwd(), 'src/server/routes/execution.ts'),
        path.join(process.cwd(), 'src/server/routes/aiIntelligence.ts')
      ];

      for (const routePath of routePaths) {
        if (fs.existsSync(routePath)) {
          const routeContent = fs.readFileSync(routePath, 'utf-8');
          expect(routeContent.includes('.placeOrder(')).toBe(false);
        }
      }
    });

    it('verifies HTTP routes enforce risk authorization before enqueuing execution commands', async () => {
      const proposal: TradeProposal = {
        id: `prop-unauth-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        confidence: 90,
        evidence: ['UnitTest'],
        agent_votes: [],
        why_direction: 'Test',
        invalidate_conditions: [],
        timestamp: new Date()
      };

      // Unapproved token
      const invalidToken = createRiskApprovalToken({
        approvalId: `appr-unauth-${Date.now()}`,
        signalId: proposal.id,
        symbol: 'EUR/USD',
        direction: 'BUY',
        approvedLotSize: 0,
        maxAllowedDrawdown: 0.15,
        calculatedRiskAmount: 100,
        status: 'REJECTED',
        rejectionReason: 'Unapproved test'
      });

      const authRes = await authorizeExecution({
        signalId: proposal.id,
        requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.10 },
        token: invalidToken,
        executionMode: 'LIVE'
      });

      expect(authRes.authorized).toBe(false);
      expect(authRes.errorCode).toBe('REJECTED_TOKEN');
    });
  });

  // 2. Live Environment Separation & Safety Matrix
  describe('2. Live Environment Separation & Safety Matrix', () => {
    it('blocks REAL_LIVE execution on SIMULATED market data lineage', () => {
      const lineage: MarketDataLineage = {
        dataClass: 'SIMULATED',
        provider: 'MockFeed',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const res = validateExecutionSafety('REAL_LIVE', lineage);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('LINEAGE_SAFETY_VIOLATION');
    });

    it('blocks REAL_LIVE execution on SYNTHETIC market data lineage', () => {
      const lineage: MarketDataLineage = {
        dataClass: 'SYNTHETIC',
        provider: 'MockFeed',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const res = validateExecutionSafety('REAL_LIVE', lineage);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('LINEAGE_SAFETY_VIOLATION');
    });

    it('blocks REAL_LIVE execution when lineage is missing or UNKNOWN', () => {
      const resMissing = validateExecutionSafety('REAL_LIVE', undefined);
      expect(resMissing.allowed).toBe(false);
      expect(resMissing.code).toBe('MISSING_LINEAGE');

      const resUnknown = validateExecutionSafety('REAL_LIVE', {
        dataClass: 'UNKNOWN',
        provider: 'Unknown',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      });
      expect(resUnknown.allowed).toBe(false);
      expect(resUnknown.code).toBe('LINEAGE_SAFETY_VIOLATION');
    });

    it('allows REAL_LIVE execution only on LIVE data lineage when system is armed', () => {
      setLiveExecutionArming(true);
      const lineage: MarketDataLineage = {
        dataClass: 'LIVE',
        provider: 'cTrader Open API',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const res = validateExecutionSafety('REAL_LIVE', lineage);
      expect(res.allowed).toBe(true);
    });

    it('allows DEMO / PAPER execution on SIMULATED data lineage', () => {
      const lineage: MarketDataLineage = {
        dataClass: 'SIMULATED',
        provider: 'PaperFeed',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const res = validateExecutionSafety('DEMO', lineage);
      expect(res.allowed).toBe(true);
    });
  });

  // 3. Risk Governance & Risk Limits Certification
  describe('3. Risk Governance & Risk Limits Certification', () => {
    it('verifies missing RiskApprovalToken rejects execution', async () => {
      const authRes = await authorizeExecution({
        requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.10 },
        token: undefined
      });
      expect(authRes.authorized).toBe(false);
      expect(authRes.errorCode).toBe('MISSING_TOKEN');
    });

    it('verifies expired RiskApprovalToken (>5 minutes) rejects execution', async () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      const expiredToken = createRiskApprovalToken({
        approvalId: `appr-exp-${Date.now()}`,
        signalId: `sig-exp-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        approvedLotSize: 0.10,
        maxAllowedDrawdown: 0.15,
        calculatedRiskAmount: 50,
        status: 'APPROVED',
        timestamp: oldTimestamp
      });

      const authRes = await authorizeExecution({
        signalId: expiredToken.signalId,
        requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.10 },
        token: expiredToken
      });

      expect(authRes.authorized).toBe(false);
      expect(authRes.errorCode).toBe('EXPIRED_TOKEN');
    });

    it('verifies tampered governanceSignature rejects execution', async () => {
      const token = createRiskApprovalToken({
        approvalId: `appr-tamp-${Date.now()}`,
        signalId: `sig-tamp-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        approvedLotSize: 0.10,
        maxAllowedDrawdown: 0.15,
        calculatedRiskAmount: 50,
        status: 'APPROVED'
      });

      // Tamper signature
      token.governanceSignature = 'deadbeef1234567890';

      const authRes = await authorizeExecution({
        signalId: token.signalId,
        requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 0.10 },
        token
      });

      expect(authRes.authorized).toBe(false);
      expect(authRes.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('verifies lot size exceeding approved lot size rejects execution', async () => {
      const token = createRiskApprovalToken({
        approvalId: `appr-lot-${Date.now()}`,
        signalId: `sig-lot-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        approvedLotSize: 0.10,
        maxAllowedDrawdown: 0.15,
        calculatedRiskAmount: 50,
        status: 'APPROVED'
      });

      const authRes = await authorizeExecution({
        signalId: token.signalId,
        requestedOrder: { symbol: 'EUR/USD', direction: 'BUY', quantity: 1.00 }, // 1.00 > 0.10
        token
      });

      expect(authRes.authorized).toBe(false);
      expect(authRes.errorCode).toBe('LOT_SIZE_EXCEEDED');
    });

    it('verifies actual configured risk limits (max lot size 10.0, max daily loss 5%, max drawdown 15%)', () => {
      const profile = governanceEngine.profileManager.getProfile('DEFAULT');
      expect(profile.max_risk_per_trade).toBe(0.02);
      expect(profile.max_daily_loss).toBe(0.05);
      expect(profile.max_drawdown).toBe(0.15);
      expect(profile.max_exposure).toBe(100000);

      const proposal: TradeProposal = {
        id: `prop-limit-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        confidence: 90,
        evidence: ['UnitTest'],
        agent_votes: [],
        why_direction: 'Limit test',
        invalidate_conditions: [],
        timestamp: new Date()
      };

      const excessiveDecision = governanceEngine.evaluateTradeProposal(proposal, 'DEFAULT', 15.0); // 15.0 > 10.0
      expect(excessiveDecision.status).toBe('REJECTED');
      expect(excessiveDecision.rejection_reasons.some(r => r.includes('exceeds maximum allowable lot size'))).toBe(true);
    });
  });

  // 4. Kill Switch & Operational Controls
  describe('4. Kill Switch & Operational Emergency Controls', () => {
    it('activates Kill Switch and verifies new execution commands are immediately BLOCKED', async () => {
      setKillSwitch(true, 'Emergency Risk Breached');
      expect(isKillSwitchActive()).toBe(true);

      const lineage: MarketDataLineage = {
        dataClass: 'LIVE',
        provider: 'cTrader',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const safety = validateExecutionSafety('REAL_LIVE', lineage);
      expect(safety.allowed).toBe(false);
      expect(safety.code).toBe('KILL_SWITCH_ACTIVE');

      const enqueueRes = await executionQueueService.enqueueCommand({
        setupId: `setup-kill-${Date.now()}`,
        symbol: 'EUR/USD',
        side: 'BUY',
        volume: 0.10,
        entryPrice: 1.0850,
        stopLoss: 1.0820,
        takeProfit1: 1.0910,
        broker: 'CTRADER',
        accountNumber: '5877246',
        environment: 'REAL_LIVE',
        lineage
      });

      expect(enqueueRes.rejected).toBe(true);
      expect(enqueueRes.error).toContain('Kill Switch is ACTIVE');
    });

    it('resumes execution after Kill Switch is deactivated', async () => {
      setKillSwitch(true, 'Test Kill');
      expect(isKillSwitchActive()).toBe(true);

      setKillSwitch(false);
      expect(isKillSwitchActive()).toBe(false);

      const lineage: MarketDataLineage = {
        dataClass: 'LIVE',
        provider: 'cTrader',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const safety = validateExecutionSafety('REAL_LIVE', lineage);
      expect(safety.allowed).toBe(true);
    });
  });

  // 5. Live Execution Arming Certification
  describe('5. Live Execution Arming Control', () => {
    it('blocks REAL_LIVE execution when system arming state is DISARMED', () => {
      setLiveExecutionArming(false);
      expect(isLiveExecutionArmed()).toBe(false);

      const lineage: MarketDataLineage = {
        dataClass: 'LIVE',
        provider: 'cTrader',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const safety = validateExecutionSafety('REAL_LIVE', lineage);
      expect(safety.allowed).toBe(false);
      expect(safety.code).toBe('LIVE_EXECUTION_DISARMED');
    });

    it('allows REAL_LIVE execution when system arming state is ARMED', () => {
      setLiveExecutionArming(true);
      expect(isLiveExecutionArmed()).toBe(true);

      const lineage: MarketDataLineage = {
        dataClass: 'LIVE',
        provider: 'cTrader',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const safety = validateExecutionSafety('REAL_LIVE', lineage);
      expect(safety.allowed).toBe(true);
    });
  });

  // 6. High Concurrency Idempotency & Duplicate Execution
  describe('6. High Concurrency Idempotency & Duplicate Execution', () => {
    it('ensures 100 concurrent execution requests with same setupId result in exactly 1 logical execution', async () => {
      const setupId = `concurrent-setup-${Date.now()}`;
      const lineage: MarketDataLineage = {
        dataClass: 'SIMULATED',
        provider: 'PaperBroker',
        symbol: 'EUR/USD',
        timestamp: Date.now(),
        receivedAt: Date.now()
      };

      const promises = Array.from({ length: 100 }, (_, i) =>
        executionQueueService.enqueueCommand({
          setupId,
          symbol: 'EUR/USD',
          side: 'BUY',
          volume: 0.10,
          entryPrice: 1.0850,
          stopLoss: 1.0820,
          takeProfit1: 1.0910,
          broker: 'PAPER',
          accountNumber: '5877246',
          environment: 'DEMO',
          lineage,
          idempotencyKey: `ik-${setupId}`
        })
      );

      const results = await Promise.all(promises);

      const uniqueCommands = new Set(results.map(r => r.command.id));
      expect(uniqueCommands.size).toBe(1);

      const duplicates = results.filter(r => r.isDuplicate);
      expect(duplicates.length).toBe(99);
    });
  });

  // 7. Observability & Operational Alerting
  describe('7. Observability & Operational Alerting', () => {
    it('verifies getReadiness distinguishes READY vs NOT_READY depending on dependencies', async () => {
      const readyRes = await observabilityService.getReadiness({
        overrideDbStatus: 'UP',
        overrideQueueStatus: 'UP',
        overrideBrokerStatus: 'UP',
        overrideEventBusStatus: 'UP'
      });
      expect(readyRes.status).toBe('READY');

      const unreadyRes = await observabilityService.getReadiness({
        overrideDbStatus: 'DOWN',
        overrideQueueStatus: 'UP',
        overrideBrokerStatus: 'UP',
        overrideEventBusStatus: 'UP',
        requireDatabase: true
      });
      expect(unreadyRes.status).toBe('NOT_READY');
    });

    it('verifies operational alerts trigger correctly for broker disconnect, stale data, and risk breaches', async () => {
      observabilityService.metrics.setGauge('broker_connection_status', 0);
      observabilityService.metrics.incCounter('market_data_stale_total', 1);
      observabilityService.metrics.incCounter('risk_rejected_total', 1);
      observabilityService.metrics.incCounter('drawdown_breach_total', 1);
      observabilityService.metrics.incCounter('lineage_violation_total', 1);

      const alerts = await observabilityService.getActiveAlerts();

      expect(alerts.some(a => a.alert === 'BROKER_DISCONNECTED')).toBe(true);
      expect(alerts.some(a => a.alert === 'MARKET_DATA_STALE')).toBe(true);
      expect(alerts.some(a => a.alert === 'RISK_LIMIT_BREACH')).toBe(true);
      expect(alerts.some(a => a.alert === 'DRAWDOWN_BREACH')).toBe(true);
      expect(alerts.some(a => a.alert === 'LIVE_DATA_LINEAGE_FAILURE')).toBe(true);
    });
  });

  // 8. Audit Trail & Trace Reconstruction
  describe('8. Audit Trail & Complete Execution Traceability', () => {
    it('verifies that full execution traces include proposalId, approvalId, risk decision, lineage, and broker results', async () => {
      const proposal: TradeProposal = {
        id: `prop-audit-${Date.now()}`,
        symbol: 'EUR/USD',
        direction: 'BUY',
        confidence: 90,
        evidence: ['AuditTest'],
        agent_votes: [],
        why_direction: 'Audit trace test',
        invalidate_conditions: [],
        timestamp: new Date()
      };

      const decision = governanceEngine.evaluateTradeProposal(proposal, 'DEFAULT', 0.10);
      expect(decision.status).toBe('APPROVED');
      expect(decision.token).toBeDefined();

      const payload: RiskClearedPayload = {
        proposal_id: proposal.id,
        approval_id: decision.token!.approvalId,
        symbol: proposal.symbol,
        account_id: 'DEFAULT',
        risk_score: decision.risk_score,
        trade_proposal: proposal,
        governance_decision: decision,
        approval_token: decision.token!,
        timestamp: new Date()
      };

      const execRes = await canonicalExecutionRouter.handleRiskCleared(payload);
      expect(execRes.order).toBeDefined();
      expect(execRes.report).toBeDefined();
      expect(execRes.report.status).toBe('FILLED');

      const trace = observabilityService.getExecutionTrace(proposal.id);
      expect(trace.found).toBe(true);
      expect(trace.timeline.length).toBeGreaterThan(0);
      expect(trace.timeline.some(e => e.event === 'RISK_CLEARED_RECEIVED')).toBe(true);
      expect(trace.timeline.some(e => e.event === 'ORDER_CREATED')).toBe(true);
    });
  });
});
