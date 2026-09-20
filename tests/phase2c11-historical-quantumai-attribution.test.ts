import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateAttributionEvidence,
  runForensicAttributionRecovery,
  RawForensicCandidate,
  HistoricalAttributionEvidence
} from '../packages/core/src/historicalQuantumAIAttribution';
import {
  HistoricalQuantumAIAttributionService
} from '../src/server/services/historical/historicalQuantumAIAttributionService';

describe('Phase 2C.11 — Historical QuantumAI Attribution Recovery Suite', () => {
  let service: HistoricalQuantumAIAttributionService;

  beforeEach(() => {
    service = new HistoricalQuantumAIAttributionService();
  });

  // Test 1: Explicit broker position ID linked to QuantumAI execution -> VERIFIED_QUANTUMAI
  it('Test 1: Explicit broker position ID linked to QuantumAI execution yields VERIFIED_QUANTUMAI', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '289642167',
      symbol: 'EURUSD',
      direction: 'SELL',
      volume: 0.01,
      openTime: '2026-09-10T10:00:00Z',
      dealIds: ['9001', '9002'],
      candidateExecution: {
        executionSequenceId: 'exec-seq-eurusd-001',
        brokerPositionId: '289642167',
        authoritativeBrokerLink: true,
        sourceFile: 'data/execution_logs.json'
      },
      candidateProposal: {
        proposalId: 'prop-eurusd-001',
        signalId: 'sig-eurusd-001',
        strategy: 'SMC_ORDER_BLOCK'
      }
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('VERIFIED_QUANTUMAI');
    expect(evidence.evidenceStrength).toBe('DIRECT');
    expect(evidence.explicitBrokerLink).toBe(true);
    expect(evidence.executionSequenceId).toBe('exec-seq-eurusd-001');
    expect(evidence.proposalId).toBe('prop-eurusd-001');
    expect(evidence.reason).toContain('AUTHORITATIVE_EXECUTION_LINK');
  });

  // Test 2: Execution sequence linked to broker order -> position -> VERIFIED_QUANTUMAI
  it('Test 2: Execution sequence linked to broker order -> position yields VERIFIED_QUANTUMAI', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '290221010',
      symbol: 'GBPUSD',
      direction: 'BUY',
      volume: 0.02,
      openTime: '2026-09-11T08:00:00Z',
      orderIds: ['order-broker-7788'],
      dealIds: ['deal-broker-9911'],
      candidateExecution: {
        executionSequenceId: 'exec-seq-gbpusd-002',
        brokerOrderId: 'order-broker-7788',
        authoritativeBrokerLink: true
      }
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('VERIFIED_QUANTUMAI');
    expect(evidence.evidenceStrength).toBe('DIRECT');
    expect(evidence.explicitBrokerLink).toBe(true);
    expect(evidence.brokerOrderIds).toContain('order-broker-7788');
  });

  // Test 3: Symbol/time/volume match only -> UNKNOWN_ORIGIN
  it('Test 3: Heuristic symbol/time/volume match only remains UNKNOWN_ORIGIN', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '289771514',
      symbol: 'EURUSD',
      direction: 'BUY',
      volume: 0.01,
      openTime: '2026-09-12T14:01:08Z',
      comment: 'EURUSD BUY 0.01 at 14:01'
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('UNKNOWN_ORIGIN');
    expect(evidence.evidenceStrength).toBe('WEAK_SUPPORTING');
    expect(evidence.explicitBrokerLink).toBe(false);
    expect(evidence.reason).toContain('HEURISTIC_CORRELATION_ONLY');
  });

  // Test 4: Signal exists but no execution evidence -> UNKNOWN_ORIGIN
  it('Test 4: Signal/proposal intent without execution evidence remains UNKNOWN_ORIGIN', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '289686652',
      symbol: 'USDJPY',
      direction: 'SELL',
      volume: 0.05,
      openTime: '2026-09-13T09:30:00Z',
      candidateProposal: {
        proposalId: 'prop-usdjpy-999',
        signalId: 'sig-usdjpy-999',
        strategy: 'BREAKOUT'
      }
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('UNKNOWN_ORIGIN');
    expect(evidence.evidenceStrength).toBe('WEAK_SUPPORTING');
    expect(evidence.explicitBrokerLink).toBe(false);
    expect(evidence.reason).toContain('INTENT_WITHOUT_EXECUTION_PROOF');
  });

  // Test 5: Post-mortem explicitly linked to broker position -> VERIFIED_QUANTUMAI
  it('Test 5: Post-mortem explicitly linked to broker position yields VERIFIED_QUANTUMAI when lifecycle proven', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '290156459',
      symbol: 'AUDUSD',
      direction: 'BUY',
      volume: 0.03,
      openTime: '2026-09-14T11:00:00Z',
      candidatePostMortem: {
        postMortemId: 'pm-review-audusd-290156459',
        brokerPositionId: '290156459',
        isLifecycleProven: true,
        sourceFile: 'data/learning_journal.json'
      }
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('VERIFIED_QUANTUMAI');
    expect(evidence.evidenceStrength).toBe('STRONG_SUPPORTING');
    expect(evidence.explicitBrokerLink).toBe(true);
    expect(evidence.postMortemId).toBe('pm-review-audusd-290156459');
  });

  // Test 6: Manual external position with no QuantumAI lifecycle evidence -> VERIFIED_MANUAL_EXTERNAL
  it('Test 6: Confirmed manual external trade is assigned VERIFIED_MANUAL_EXTERNAL', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '289999999',
      symbol: 'EURGBP',
      direction: 'BUY',
      volume: 0.10,
      openTime: '2026-09-15T15:00:00Z',
      candidateManualEvidence: {
        clientType: 'CTRADER_WEB',
        isConfirmedManual: true,
        sourceFile: 'audits/manual_trade_logs.json'
      }
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('VERIFIED_MANUAL_EXTERNAL');
    expect(evidence.evidenceStrength).toBe('DIRECT');
    expect(evidence.explicitBrokerLink).toBe(true);
    expect(evidence.reason).toContain('VERIFIED_MANUAL_EXTERNAL');
  });

  // Test 7: Retrospective AI analysis is RESEARCH_ONLY and never original QuantumAI attribution
  it('Test 7: Retrospective AI analysis is classified as RESEARCH_ONLY and cannot grant attribution', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '288888888',
      symbol: 'NZDUSD',
      direction: 'SELL',
      volume: 0.02,
      openTime: '2026-09-16T12:00:00Z',
      candidateRetrospectiveAi: {
        opinionId: 'second-opinion-ai-retrospective-001',
        analysisTimestamp: '2026-09-19T10:00:00Z',
        isRetrospective: true,
        notes: 'Post-hoc AI analysis: Good SMC setup'
      }
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('UNKNOWN_ORIGIN');
    expect(evidence.isRetrospectiveAiAnalysis).toBe(true);
    expect(evidence.reason).toContain('RESEARCH_ONLY');
    expect(evidence.explicitBrokerLink).toBe(false);
  });

  // Test 8: Duplicate forensic execution is fully idempotent
  it('Test 8: Forensic recovery runs are strictly deterministic and idempotent', () => {
    const candidates: RawForensicCandidate[] = [
      {
        brokerPositionId: '101',
        symbol: 'EURUSD',
        direction: 'BUY',
        volume: 0.01,
        openTime: '2026-09-10T10:00:00Z',
        candidateExecution: {
          executionSequenceId: 'exec-101',
          brokerPositionId: '101',
          authoritativeBrokerLink: true
        }
      },
      {
        brokerPositionId: '102',
        symbol: 'GBPUSD',
        direction: 'SELL',
        volume: 0.02,
        openTime: '2026-09-10T11:00:00Z',
        originBefore: 'UNKNOWN_ORIGIN'
      }
    ];

    const run1 = service.runForensicRecovery({ candidates });
    const run2 = service.runForensicRecovery({ candidates });

    expect(run1).toEqual(run2);
    expect(run1.verifiedQuantumAIPositionsAfter).toBe(1);
    expect(run1.unknownOriginPositionsAfter).toBe(1);
    expect(run1.brokerPositionLinkage).toBe('2/2');
  });

  // Test 9: Missing broker identifier -> UNKNOWN_ORIGIN
  it('Test 9: Missing broker position ID fails closed to UNKNOWN_ORIGIN', () => {
    const candidate: RawForensicCandidate = {
      symbol: 'EURUSD',
      direction: 'BUY',
      volume: 0.01,
      openTime: '2026-09-10T10:00:00Z'
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('UNKNOWN_ORIGIN');
    expect(evidence.evidenceStrength).toBe('NONE');
    expect(evidence.reason).toContain('MISSING_BROKER_POSITION_ID');
  });

  // Test 10: Conflicting evidence flags DESIGN_REVIEW_REQUIRED and remains UNKNOWN_ORIGIN
  it('Test 10: Conflicting evidence flags DESIGN_REVIEW_REQUIRED and remains UNKNOWN_ORIGIN', () => {
    const candidate: RawForensicCandidate = {
      brokerPositionId: '105',
      symbol: 'EURUSD',
      direction: 'BUY',
      volume: 0.01,
      openTime: '2026-09-10T10:00:00Z',
      candidateConflictFlag: true,
      conflictReason: 'Claimed QuantumAI execution conflicts with manual cTrader Web session log.'
    };

    const evidence = evaluateAttributionEvidence(candidate);

    expect(evidence.attribution).toBe('UNKNOWN_ORIGIN');
    expect(evidence.hasConflict).toBe(true);
    expect(evidence.designReviewRequired).toBe(true);
    expect(evidence.reason).toContain('CONFLICTING_EVIDENCE');

    const summary = service.runForensicRecovery({ candidates: [candidate] });
    expect(summary.phaseStatus).toBe('DESIGN_REVIEW_REQUIRED');
  });

  // Test 11: Static assertion: Zero broker write capabilities on service
  it('Test 11: Static assertion: HistoricalQuantumAIAttributionService exposes zero broker writes', () => {
    expect((service as any).placeOrder).toBeUndefined();
    expect((service as any).cancelOrder).toBeUndefined();
    expect((service as any).modifyPosition).toBeUndefined();
    expect((service as any).modifyStopLoss).toBeUndefined();
    expect((service as any).modifyTakeProfit).toBeUndefined();
    expect((service as any).closePosition).toBeUndefined();
  });
});
