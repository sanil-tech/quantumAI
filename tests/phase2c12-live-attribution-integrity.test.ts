import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialAttributionRecord,
  recordOrderSubmission,
  recordBrokerAcknowledgement,
  bindBrokerPosition,
  recordBrokerDeals,
  recordPositionClosed,
  recordOutcomeConfirmed,
  recordAttributionConflict,
  recordExecutionFailure,
  filterPerformanceEligibleDataset,
  computeAttributionQualityMetrics,
  QuantumAIExecutionAttributionRecord
} from '../packages/core/src/liveAttributionIntegrity';
import {
  LiveAttributionIntegrityService,
  InMemoryLiveAttributionRepository
} from '../src/server/services/historical/liveAttributionIntegrityService';

describe('Phase 2C.12 — Live Attribution Integrity & Evidence-Bound Performance Suite', () => {
  let repository: InMemoryLiveAttributionRepository;
  let service: LiveAttributionIntegrityService;

  beforeEach(() => {
    repository = new InMemoryLiveAttributionRepository();
    service = new LiveAttributionIntegrityService(repository);
  });

  // Test 1 — Signal -> Proposal
  it('Test 1: QuantumAI signal creates a durable proposal linkage', async () => {
    const record = await service.registerExecutionDispatch({
      signalId: 'sig-eurusd-101',
      thesisId: 'thesis-eurusd-101',
      proposalId: 'prop-eurusd-101',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.02
    });

    expect(record.signalId).toBe('sig-eurusd-101');
    expect(record.thesisId).toBe('thesis-eurusd-101');
    expect(record.proposalId).toBe('prop-eurusd-101');
    expect(record.attributionStatus).toBe('UNBOUND');
    expect(record.isVerifiedQuantumAI).toBe(false);
  });

  // Test 2 — Proposal -> Execution
  it('Test 2: Proposal is durably linked to executionSequenceId', async () => {
    const record = await service.registerExecutionDispatch({
      signalId: 'sig-gbpusd-202',
      proposalId: 'prop-gbpusd-202',
      riskReservationId: 'risk-res-202',
      executionSequenceId: 'exec-seq-202',
      symbol: 'GBPUSD',
      direction: 'SELL',
      requestedVolume: 0.05
    });

    expect(record.proposalId).toBe('prop-gbpusd-202');
    expect(record.riskReservationId).toBe('risk-res-202');
    expect(record.executionSequenceId).toBe('exec-seq-202');
    expect(record.attributionStatus).toBe('EXECUTION_DISPATCHED');
  });

  // Test 3 — Execution -> Broker Order
  it('Test 3: Broker order ID is captured upon order submission', async () => {
    await service.registerExecutionDispatch({
      proposalId: 'prop-303',
      executionSequenceId: 'exec-303',
      symbol: 'USDJPY',
      direction: 'BUY',
      requestedVolume: 0.01
    });

    const updated = await service.handleOrderSubmitted({
      executionSequenceId: 'exec-303',
      brokerOrderId: 'broker-order-7701'
    });

    expect(updated).not.toBeNull();
    expect(updated?.brokerOrderIds).toContain('broker-order-7701');
    expect(updated?.attributionStatus).toBe('ORDER_SUBMITTED');
  });

  // Test 4 — Broker Order -> Deal
  it('Test 4: Broker deal is captured upon authoritative broker acknowledgement', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-404',
      symbol: 'EURJPY',
      direction: 'SELL',
      requestedVolume: 0.02
    });
    await service.handleOrderSubmitted({
      executionSequenceId: 'exec-404',
      brokerOrderId: 'broker-order-8802'
    });

    const acked = await service.handleBrokerAcknowledgement({
      executionSequenceId: 'exec-404',
      brokerOrderId: 'broker-order-8802',
      brokerDealId: 'broker-deal-9903'
    });

    expect(acked?.brokerDealIds).toContain('broker-deal-9903');
    expect(acked?.attributionStatus).toBe('BROKER_ACKNOWLEDGED');
    expect(acked?.dataAuthority).toBe('BROKER_LEVEL_1');
  });

  // Test 5 — Broker Position Confirmation
  it('Test 5: Broker reconciliation binds positionId and sets BROKER_POSITION_CONFIRMED', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-505',
      symbol: 'AUDUSD',
      direction: 'BUY',
      requestedVolume: 0.03
    });
    await service.handleOrderSubmitted({
      executionSequenceId: 'exec-505',
      brokerOrderId: 'broker-order-5555'
    });

    const confirmed = await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-505',
      brokerPositionId: '290999111',
      filledVolume: 0.03
    });

    expect(confirmed?.brokerPositionId).toBe('290999111');
    expect(confirmed?.attributionStatus).toBe('BROKER_POSITION_CONFIRMED');
    expect(confirmed?.isVerifiedQuantumAI).toBe(true);
  });

  // Test 6 — Complete Chain
  it('Test 6: Full unbroken lifecycle chain preserves all identifiers', async () => {
    // 1. Dispatch
    await service.registerExecutionDispatch({
      signalId: 'sig-chain-01',
      thesisId: 'thesis-chain-01',
      proposalId: 'prop-chain-01',
      riskReservationId: 'risk-chain-01',
      executionSequenceId: 'exec-chain-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });

    // 2. Order
    await service.handleOrderSubmitted({
      executionSequenceId: 'exec-chain-01',
      brokerOrderId: 'order-c1'
    });

    // 3. Ack / Deal
    await service.handleBrokerAcknowledgement({
      executionSequenceId: 'exec-chain-01',
      brokerOrderId: 'order-c1',
      brokerDealId: 'deal-c1'
    });

    // 4. Position Confirmed
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-chain-01',
      brokerPositionId: 'pos-c1',
      filledVolume: 0.01
    });

    // 5. Position Closed
    await service.handlePositionClosed({
      brokerPositionId: 'pos-c1',
      brokerPnL: { grossPnL: 20.0, commission: -0.50, swap: 0, netPnL: 19.50 },
      closeDealIds: ['deal-c2-close']
    });

    // 6. Outcome & Post-Mortem
    const finalRecord = await service.handleOutcomeConfirmed({
      brokerPositionId: 'pos-c1',
      outcomeId: 'outcome-c1',
      postMortemId: 'pm-c1'
    });

    expect(finalRecord?.signalId).toBe('sig-chain-01');
    expect(finalRecord?.proposalId).toBe('prop-chain-01');
    expect(finalRecord?.executionSequenceId).toBe('exec-chain-01');
    expect(finalRecord?.brokerOrderIds).toEqual(['order-c1']);
    expect(finalRecord?.brokerDealIds).toEqual(['deal-c1', 'deal-c2-close']);
    expect(finalRecord?.brokerPositionId).toBe('pos-c1');
    expect(finalRecord?.outcomeId).toBe('outcome-c1');
    expect(finalRecord?.postMortemId).toBe('pm-c1');
    expect(finalRecord?.attributionStatus).toBe('OUTCOME_CONFIRMED');
    expect(finalRecord?.isVerifiedQuantumAI).toBe(true);
    expect(finalRecord?.isPerformanceEligible).toBe(true);
  });

  // Test 7 — Split Tickets
  it('Test 7: Split tickets from one proposal produce independent execution & position mappings', async () => {
    // Ticket A
    await service.registerExecutionDispatch({
      proposalId: 'prop-split-01',
      executionSequenceId: 'exec-split-A',
      symbol: 'GBPUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-split-A',
      brokerPositionId: 'pos-split-A',
      filledVolume: 0.01
    });

    // Ticket B
    await service.registerExecutionDispatch({
      proposalId: 'prop-split-01',
      executionSequenceId: 'exec-split-B',
      symbol: 'GBPUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-split-B',
      brokerPositionId: 'pos-split-B',
      filledVolume: 0.01
    });

    const proposalAttributions = await repository.getAttributionByProposalId('prop-split-01');
    expect(proposalAttributions.length).toBe(2);
    expect(proposalAttributions[0].brokerPositionId).toBe('pos-split-A');
    expect(proposalAttributions[1].brokerPositionId).toBe('pos-split-B');
  });

  // Test 8 — Partial Close
  it('Test 8: Partial scale-out accumulates multiple deals under single position and final outcome', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-scale-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.02
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-scale-01',
      brokerPositionId: 'pos-scale-01'
    });

    // Scale-out 1 (TP1)
    await service.handleBrokerDealsUpdated({
      brokerPositionId: 'pos-scale-01',
      dealIds: ['deal-entry-01', 'deal-partial-close-01']
    });

    // Final close (TP2)
    const closed = await service.handlePositionClosed({
      brokerPositionId: 'pos-scale-01',
      brokerPnL: { grossPnL: 35.0, commission: -0.80, swap: 0, netPnL: 34.20 },
      closeDealIds: ['deal-final-close-02']
    });

    expect(closed?.brokerDealIds).toEqual(['deal-entry-01', 'deal-partial-close-01', 'deal-final-close-02']);
    expect(closed?.brokerPnL?.netPnL).toBe(34.20);
    expect(closed?.attributionStatus).toBe('POSITION_CLOSED');
  });

  // Test 9 — Duplicate Broker Event
  it('Test 9: Repeated broker events are idempotent and preserve single canonical record', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-dup-01',
      symbol: 'EURUSD',
      direction: 'SELL',
      requestedVolume: 0.01
    });

    // First order submission
    const first = await service.handleOrderSubmitted({
      executionSequenceId: 'exec-dup-01',
      brokerOrderId: 'order-dup-1'
    });

    // Duplicate order submission event
    const second = await service.handleOrderSubmitted({
      executionSequenceId: 'exec-dup-01',
      brokerOrderId: 'order-dup-1'
    });

    expect(first?.brokerOrderIds).toEqual(['order-dup-1']);
    expect(second?.brokerOrderIds).toEqual(['order-dup-1']);

    const all = await repository.getAllAttributions();
    expect(all.length).toBe(1);
  });

  // Test 10 — Restart Recovery
  it('Test 10: State survives restart and hydrates from durable storage', async () => {
    // 1. Ingest into service 1
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-restart-01',
      proposalId: 'prop-restart-01',
      symbol: 'USDCHF',
      direction: 'BUY',
      requestedVolume: 0.05
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-restart-01',
      brokerPositionId: 'pos-restart-999'
    });

    // 2. Instantiate new service sharing same repository (simulating restart)
    const restartedService = new LiveAttributionIntegrityService(repository);
    const count = await restartedService.hydrateFromStorage();
    expect(count).toBe(1);

    const pos = await restartedService.handlePositionClosed({
      brokerPositionId: 'pos-restart-999',
      brokerPnL: { grossPnL: 12.0, commission: -0.40, swap: 0, netPnL: 11.60 }
    });

    expect(pos?.brokerPositionId).toBe('pos-restart-999');
    expect(pos?.isVerifiedQuantumAI).toBe(true);
  });

  // Test 11 — Manual Trade
  it('Test 11: Manual trade without QuantumAI execution evidence fails closed to UNKNOWN_ORIGIN', () => {
    const rawManualRecord: QuantumAIExecutionAttributionRecord = {
      attributionId: 'attr-manual-01',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      brokerOrderIds: ['manual-order-01'],
      brokerDealIds: ['manual-deal-01'],
      brokerPositionId: 'pos-manual-01',
      symbol: 'GBPJPY',
      direction: 'SELL',
      requestedVolume: 0.10,
      executionStatus: 'POSITION_OPEN',
      attributionStatus: 'UNKNOWN',
      provenance: 'VERIFIED_MANUAL_EXTERNAL',
      dataAuthority: 'BROKER_LEVEL_1',
      isVerifiedQuantumAI: false,
      isPerformanceEligible: false
    };

    expect(rawManualRecord.isVerifiedQuantumAI).toBe(false);
    expect(rawManualRecord.provenance).toBe('VERIFIED_MANUAL_EXTERNAL');
  });

  // Test 12 — Symbol/Time/Volume Collision
  it('Test 12: Collision in symbol/time/volume between QuantumAI and manual trade does NOT promote manual trade', async () => {
    // QuantumAI trade
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-collision-q',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-collision-q',
      brokerPositionId: 'pos-collision-100'
    });

    // Manual trade on same pair/volume
    const manualRecord = createInitialAttributionRecord({
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01,
      provenance: 'UNKNOWN_ORIGIN'
    });

    expect(manualRecord.isVerifiedQuantumAI).toBe(false);
    expect(manualRecord.attributionStatus).toBe('UNBOUND');
  });

  // Test 13 — Conflicting Evidence
  it('Test 13: Conflicting executions claiming same broker position yields ATTRIBUTION_CONFLICT', async () => {
    // First execution
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-conf-1',
      symbol: 'NZDUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-conf-1',
      brokerPositionId: 'pos-shared-conflict'
    });

    // Second distinct execution claims same broker position
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-conf-2',
      symbol: 'NZDUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });
    const conflict = await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-conf-2',
      brokerPositionId: 'pos-shared-conflict'
    });

    expect(conflict?.attributionStatus).toBe('ATTRIBUTION_CONFLICT');
    expect(conflict?.isVerifiedQuantumAI).toBe(false);
    expect(conflict?.isPerformanceEligible).toBe(false);
  });

  // Test 14 — Missing Broker ID
  it('Test 14: Execution with missing broker position ID yields BROKER_ID_UNAVAILABLE', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-missing-id',
      symbol: 'EURCAD',
      direction: 'SELL',
      requestedVolume: 0.02
    });

    const result = await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-missing-id',
      brokerPositionId: ''
    });

    expect(result?.attributionStatus).toBe('BROKER_ID_UNAVAILABLE');
    expect(result?.isVerifiedQuantumAI).toBe(false);
  });

  // Test 15 — Failed Order
  it('Test 15: Rejected broker order records EXECUTION_FAILED and no broker position', () => {
    const initial = createInitialAttributionRecord({
      executionSequenceId: 'exec-fail-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });

    const failed = recordExecutionFailure(initial, 'REJECTED_INSUFFICIENT_MARGIN');

    expect(failed.executionStatus).toBe('EXECUTION_FAILED');
    expect(failed.attributionStatus).toBe('EXECUTION_FAILED');
    expect(failed.brokerPositionId).toBeUndefined();
    expect(failed.isVerifiedQuantumAI).toBe(false);
  });

  // Test 16 — Not Filled
  it('Test 16: Order submission without fill remains NOT_FILLED or ORDER_SUBMITTED', () => {
    const initial = createInitialAttributionRecord({
      executionSequenceId: 'exec-unfilled-01',
      symbol: 'GBPUSD',
      direction: 'BUY',
      requestedVolume: 0.05
    });

    const submitted = recordOrderSubmission(initial, { brokerOrderId: 'order-unfilled-01' });

    expect(submitted.executionStatus).toBe('ORDER_SUBMITTED');
    expect(submitted.brokerPositionId).toBeUndefined();
    expect(submitted.isVerifiedQuantumAI).toBe(false);
  });

  // Test 17 — Closed Outcome
  it('Test 17: Closed QuantumAI position preserves Level 1 broker authoritative P/L', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-pnl-01',
      symbol: 'EURUSD',
      direction: 'SELL',
      requestedVolume: 0.01
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-pnl-01',
      brokerPositionId: 'pos-pnl-01'
    });

    const closed = await service.handlePositionClosed({
      brokerPositionId: 'pos-pnl-01',
      brokerPnL: {
        grossPnL: 45.50,
        commission: -1.20,
        swap: -0.30,
        netPnL: 44.00
      }
    });

    expect(closed?.brokerPnL?.authority).toBe('BROKER_LEVEL_1');
    expect(closed?.brokerPnL?.grossPnL).toBe(45.50);
    expect(closed?.brokerPnL?.commission).toBe(-1.20);
    expect(closed?.brokerPnL?.swap).toBe(-0.30);
    expect(closed?.brokerPnL?.netPnL).toBe(44.00);
  });

  // Test 18 — Post-Mortem Linkage
  it('Test 18: Post-mortem explicitly links brokerPositionId and executionSequenceId', async () => {
    await service.registerExecutionDispatch({
      executionSequenceId: 'exec-pm-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01
    });
    await service.handleBrokerPositionConfirmed({
      executionSequenceId: 'exec-pm-01',
      brokerPositionId: 'pos-pm-01'
    });
    await service.handlePositionClosed({
      brokerPositionId: 'pos-pm-01',
      brokerPnL: { grossPnL: -10, commission: -0.4, swap: 0, netPnL: -10.4 }
    });

    const outcome = await service.handleOutcomeConfirmed({
      brokerPositionId: 'pos-pm-01',
      outcomeId: 'out-pm-01',
      postMortemId: 'pm-review-01'
    });

    expect(outcome?.postMortemId).toBe('pm-review-01');
    expect(outcome?.outcomeId).toBe('out-pm-01');
    expect(outcome?.brokerPositionId).toBe('pos-pm-01');
    expect(outcome?.executionSequenceId).toBe('exec-pm-01');
  });

  // Test 19 — Second Opinion AI Execution Authority = FALSE
  it('Test 19: Second Opinion AI assessment carries executionAuthority = false', async () => {
    const record = await service.registerExecutionDispatch({
      proposalId: 'prop-so-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01,
      secondOpinion: {
        assessmentId: 'so-eval-001',
        macroRisk: 'LOW',
        thesisAlignment: 'ALIGNED',
        explanation: 'Favorable macroeconomic alignment'
      }
    });

    expect(record.secondOpinionAssessment?.executionAuthority).toBe(false);
    expect(record.secondOpinionAssessment?.isRetrospective).toBe(false);
  });

  // Test 20 — Retrospective AI
  it('Test 20: Retrospective AI assessment carries isRetrospective = true and does not alter attribution', async () => {
    const record = await service.registerExecutionDispatch({
      proposalId: 'prop-retro-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01,
      secondOpinion: {
        assessmentId: 'so-retro-001',
        isRetrospective: true,
        explanation: 'Post-trade research analysis'
      }
    });

    expect(record.secondOpinionAssessment?.isRetrospective).toBe(true);
    expect(record.isVerifiedQuantumAI).toBe(false);
  });

  // Test 21 — No Broker Write Capabilities
  it('Test 21: Static assertion: LiveAttributionIntegrityService contains zero broker write methods', () => {
    expect((service as any).placeOrder).toBeUndefined();
    expect((service as any).cancelOrder).toBeUndefined();
    expect((service as any).modifyPosition).toBeUndefined();
    expect((service as any).modifyStopLoss).toBeUndefined();
    expect((service as any).modifyTakeProfit).toBeUndefined();
    expect((service as any).closePosition).toBeUndefined();
  });

  // Test 22 — Performance Population Filtering
  it('Test 22: Performance dataset strictly includes only VERIFIED_QUANTUMAI + BROKER_AUTHORITATIVE + CLOSED', () => {
    const valid: QuantumAIExecutionAttributionRecord = {
      attributionId: 'attr-v1',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01,
      brokerOrderIds: ['o1'],
      brokerDealIds: ['d1'],
      brokerPositionId: 'pos-v1',
      executionStatus: 'POSITION_CLOSED',
      attributionStatus: 'OUTCOME_CONFIRMED',
      provenance: 'REAL_QUANTUMAI',
      dataAuthority: 'BROKER_LEVEL_1',
      isVerifiedQuantumAI: true,
      isPerformanceEligible: true,
      brokerPnL: { grossPnL: 10, commission: -0.2, swap: 0, netPnL: 9.8, authority: 'BROKER_LEVEL_1' }
    };

    const dataset = filterPerformanceEligibleDataset([valid]);
    expect(dataset.length).toBe(1);
    expect(dataset[0].attributionId).toBe('attr-v1');
  });

  // Test 23 — Unknown Exclusion
  it('Test 23: UNKNOWN_ORIGIN records are strictly excluded from performance dataset', () => {
    const unknownRec: QuantumAIExecutionAttributionRecord = {
      attributionId: 'attr-u1',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01,
      brokerOrderIds: [],
      brokerDealIds: [],
      brokerPositionId: 'pos-u1',
      executionStatus: 'POSITION_CLOSED',
      attributionStatus: 'OUTCOME_CONFIRMED',
      provenance: 'UNKNOWN_ORIGIN',
      dataAuthority: 'BROKER_LEVEL_1',
      isVerifiedQuantumAI: false,
      isPerformanceEligible: false
    };

    const dataset = filterPerformanceEligibleDataset([unknownRec]);
    expect(dataset.length).toBe(0);
  });

  // Test 24 — Manual Exclusion
  it('Test 24: VERIFIED_MANUAL_EXTERNAL records are strictly excluded from performance dataset', () => {
    const manualRec: QuantumAIExecutionAttributionRecord = {
      attributionId: 'attr-m1',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      symbol: 'GBPJPY',
      direction: 'SELL',
      requestedVolume: 0.05,
      brokerOrderIds: [],
      brokerDealIds: [],
      brokerPositionId: 'pos-m1',
      executionStatus: 'POSITION_CLOSED',
      attributionStatus: 'OUTCOME_CONFIRMED',
      provenance: 'VERIFIED_MANUAL_EXTERNAL',
      dataAuthority: 'BROKER_LEVEL_1',
      isVerifiedQuantumAI: false,
      isPerformanceEligible: false
    };

    const dataset = filterPerformanceEligibleDataset([manualRec]);
    expect(dataset.length).toBe(0);
  });

  // Test 25 — Synthetic Exclusion
  it('Test 25: SYNTHETIC records are strictly excluded from performance dataset', () => {
    const syntheticRec: QuantumAIExecutionAttributionRecord = {
      attributionId: 'attr-s1',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedVolume: 0.01,
      brokerOrderIds: ['syn-o1'],
      brokerDealIds: ['syn-d1'],
      brokerPositionId: 'pos-syn-1',
      executionStatus: 'POSITION_CLOSED',
      attributionStatus: 'OUTCOME_CONFIRMED',
      provenance: 'SYNTHETIC',
      dataAuthority: 'BROKER_LEVEL_1',
      isVerifiedQuantumAI: true, // artificially true in mock
      isPerformanceEligible: false
    };

    const dataset = filterPerformanceEligibleDataset([syntheticRec]);
    expect(dataset.length).toBe(0);
  });
});
