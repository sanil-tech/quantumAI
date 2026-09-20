import { describe, it, expect, beforeEach } from 'vitest';
import {
  RawBrokerPositionRecord,
  RawBrokerDealRecord,
  ApplicationExecutionEvidence,
  reconstructHistoricalEvidence,
  filterHistoricalPopulation,
  mapHistoricalToObservationRecords
} from '../packages/core/src/historicalEvidenceReconstruction';
import {
  HistoricalEvidenceReconstructionService
} from '../src/server/services/historical/historicalEvidenceReconstructionService';
import {
  TradeObservationService,
  InMemoryTradeObservationRepository
} from '../src/server/services/observation/tradeObservationService';

describe('Phase 2C.10 — Historical Evidence Reconstruction Suite', () => {
  let rawPositions: RawBrokerPositionRecord[];
  let rawDeals: RawBrokerDealRecord[];
  let evidenceMap: Map<string, ApplicationExecutionEvidence>;
  let reconService: HistoricalEvidenceReconstructionService;
  let obsService: TradeObservationService;
  let obsRepo: InMemoryTradeObservationRepository;

  beforeEach(() => {
    obsRepo = new InMemoryTradeObservationRepository();
    obsService = new TradeObservationService(obsRepo);
    reconService = new HistoricalEvidenceReconstructionService(obsService);

    rawPositions = [
      {
        positionId: 101,
        symbol: 'EURUSD',
        tradeSide: 'BUY',
        volumeLots: 0.02,
        openTimestamp: '2026-09-10T10:00:00Z',
        closeTimestamp: '2026-09-10T12:00:00Z',
        grossPnL: 15.0,
        commission: -0.40,
        swap: 0,
        netPnL: 14.60
      },
      {
        positionId: 102,
        symbol: 'GBPJPY',
        tradeSide: 'SELL',
        volumeLots: 0.01,
        openTimestamp: '2026-09-11T08:00:00Z',
        closeTimestamp: '2026-09-11T10:00:00Z',
        grossPnL: -6.0,
        commission: -0.20,
        swap: 0,
        netPnL: -6.20,
        comment: 'QuantumAI SMC Scalp' // Heuristic indicator
      },
      {
        positionId: 103,
        symbol: 'AUDUSD',
        tradeSide: 'BUY',
        volumeLots: 0.05,
        openTimestamp: '2026-09-12T14:00:00Z',
        closeTimestamp: '2026-09-12T16:00:00Z',
        grossPnL: 25.0,
        commission: -1.0,
        swap: 0,
        netPnL: 24.0,
        comment: 'Manual cTrader Web Trade'
      }
    ];

    rawDeals = [
      {
        dealId: 501,
        positionId: 101,
        symbol: 'EURUSD',
        tradeSide: 'BUY',
        volumeLots: 0.02,
        executionTimestamp: '2026-09-10T10:00:00Z',
        grossProfit: 0,
        dealType: 'ENTRY'
      },
      {
        dealId: 502,
        positionId: 101,
        symbol: 'EURUSD',
        tradeSide: 'SELL',
        volumeLots: 0.02,
        executionTimestamp: '2026-09-10T12:00:00Z',
        grossProfit: 15.0,
        commission: -0.40,
        dealType: 'CLOSE'
      },
      {
        dealId: 503,
        positionId: 102,
        symbol: 'GBPJPY',
        tradeSide: 'SELL',
        volumeLots: 0.01,
        executionTimestamp: '2026-09-11T08:00:00Z',
        grossProfit: 0,
        dealType: 'ENTRY'
      },
      {
        dealId: 504,
        positionId: 102,
        symbol: 'GBPJPY',
        tradeSide: 'BUY',
        volumeLots: 0.01,
        executionTimestamp: '2026-09-11T10:00:00Z',
        grossProfit: -6.0,
        commission: -0.20,
        dealType: 'CLOSE'
      },
      {
        dealId: 505,
        positionId: 103,
        symbol: 'AUDUSD',
        tradeSide: 'BUY',
        volumeLots: 0.05,
        executionTimestamp: '2026-09-12T14:00:00Z',
        grossProfit: 25.0,
        commission: -1.0,
        dealType: 'CLOSE'
      }
    ];

    evidenceMap = new Map();
    // Position 101 has Authoritative QuantumAI Execution linkage
    evidenceMap.set('101', {
      executionSequenceId: 'exec-seq-101',
      proposalId: 'prop-eurusd-101',
      signalId: 'sig-eurusd-101',
      strategy: 'SMC_ORDER_BLOCK',
      method: 'METHOD_1',
      timeframe: 'M15',
      confidence: 0.88,
      authoritativeProof: true,
      macroContext: {
        event: 'US_CPI',
        macroRisk: 'LOW',
        publicationTimestamp: '2026-09-10T08:30:00Z'
      }
    });

    // Position 103 is explicitly verified manual external
    evidenceMap.set('103', {
      clientType: 'MANUAL_EXTERNAL',
      authoritativeProof: false
    });
  });

  // Test 1: Broker position and deals imported and linked correctly
  it('Test 1: Reconstructs broker positions with deal linkage and accurate financials', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });

    expect(summary.totalBrokerPositions).toBe(3);
    expect(summary.totalBrokerDeals).toBe(5);
    expect(summary.closedPositionsCount).toBe(3);

    const pos101 = summary.records.find(r => r.brokerPositionId === '101');
    expect(pos101).toBeDefined();
    expect(pos101?.brokerDealIds).toEqual(['501', '502']);
    expect(pos101?.brokerPnL.grossPnL).toBe(15.0);
    expect(pos101?.brokerPnL.commission).toBe(-0.40);
    expect(pos101?.brokerPnL.netPnL).toBe(14.60);
  });

  // Test 2: Verified QuantumAI attribution requires authoritative proof
  it('Test 2: Authoritative proof assigns VERIFIED_QUANTUMAI with full linkage', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });
    const pos101 = summary.records.find(r => r.brokerPositionId === '101');

    expect(pos101?.attributionStatus).toBe('VERIFIED_QUANTUMAI');
    expect(pos101?.linkageVerification).toBe('VERIFIED');
    expect(pos101?.proposalId).toBe('prop-eurusd-101');
    expect(pos101?.strategy).toBe('SMC_ORDER_BLOCK');
  });

  // Test 3: Heuristic evidence does NOT promote UNKNOWN_ORIGIN to verified
  it('Test 3: Heuristic comment/label marks QUANTUMAI_PROBABLE but keeps UNKNOWN_ORIGIN', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });
    const pos102 = summary.records.find(r => r.brokerPositionId === '102');

    expect(pos102?.attributionStatus).toBe('UNKNOWN_ORIGIN');
    expect(pos102?.heuristicAttribution).toBe('QUANTUMAI_PROBABLE');
    expect(pos102?.linkageVerification).toBe('UNKNOWN');
  });

  // Test 4: Manual external trades are verified as VERIFIED_MANUAL_EXTERNAL
  it('Test 4: Explicit manual client records are assigned VERIFIED_MANUAL_EXTERNAL', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });
    const pos103 = summary.records.find(r => r.brokerPositionId === '103');

    expect(pos103?.attributionStatus).toBe('VERIFIED_MANUAL_EXTERNAL');
  });

  // Test 5: Broker P/L remains authoritative
  it('Test 5: Financial calculations preserve exact broker gross, commission, swap, and net P/L', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });

    expect(summary.financialTotals.totalGrossPnL).toBe(34.0);
    expect(summary.financialTotals.totalCommission).toBe(-1.60);
    expect(summary.financialTotals.totalNetPnL).toBe(32.40);
  });

  // Test 6: Currency exposure decomposition uses canonical normalizer
  it('Test 6: Decomposes currency legs at open using canonical normalizer', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });
    const pos102 = summary.records.find(r => r.brokerPositionId === '102');

    expect(pos102?.currencyExposureAtOpen).toBeDefined();
    expect(pos102?.currencyExposureAtOpen?.netUnitsByCurrency['GBP']).toBe(-0.01);
    expect(pos102?.currencyExposureAtOpen?.netUnitsByCurrency['JPY']).toBe(0.01);
  });

  // Test 7: Missing MFE/MAE defaults to UNKNOWN
  it('Test 7: Intratrade excursions default to UNKNOWN when tick history is unavailable', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });
    const pos101 = summary.records.find(r => r.brokerPositionId === '101');

    expect(pos101?.mfePips).toBe('UNKNOWN');
    expect(pos101?.maePips).toBe('UNKNOWN');
    expect(pos101?.intratradeHistoryAvailable).toBe(false);
  });

  // Test 8: Population filtering isolates populations cleanly
  it('Test 8: Population selectors partition dataset without cross-contamination', () => {
    const summary = reconstructHistoricalEvidence({ rawPositions, rawDeals, evidenceMap });

    const qOnly = filterHistoricalPopulation(summary.records, 'VERIFIED_QUANTUMAI');
    expect(qOnly.length).toBe(1);
    expect(qOnly[0].brokerPositionId).toBe('101');

    const manualOnly = filterHistoricalPopulation(summary.records, 'VERIFIED_MANUAL_EXTERNAL');
    expect(manualOnly.length).toBe(1);
    expect(manualOnly[0].brokerPositionId).toBe('103');

    const unknownOnly = filterHistoricalPopulation(summary.records, 'UNKNOWN_ORIGIN');
    expect(unknownOnly.length).toBe(1);
    expect(unknownOnly[0].brokerPositionId).toBe('102');

    const all = filterHistoricalPopulation(summary.records, 'ALL_REAL_BROKER');
    expect(all.length).toBe(3);
  });

  // Test 9: Population analytics produces isolated performance reports
  it('Test 9: Service computes isolated outcome analytics per population', () => {
    reconService.reconstructDataset({ rawPositions, rawDeals, evidenceMap });

    const qAnalytics = reconService.analyzePopulationOutcomes('VERIFIED_QUANTUMAI');
    expect(qAnalytics.totalObservationsAnalyzed).toBe(1);
    expect(qAnalytics.overallMetrics.winRate).toBe(1.0);
    expect(qAnalytics.overallMetrics.netPnL).toBe(14.60);

    const allAnalytics = reconService.analyzePopulationOutcomes('ALL_REAL_BROKER');
    expect(allAnalytics.totalObservationsAnalyzed).toBe(3);
    expect(allAnalytics.overallMetrics.tradeCount).toBe(3);
  });

  // Test 10: Idempotent ingestion into observation repository
  it('Test 10: Ingestion into observation repository is idempotent', async () => {
    reconService.reconstructDataset({ rawPositions, rawDeals, evidenceMap });

    const firstIngest = await reconService.ingestIntoObservationRepository('ALL_REAL_BROKER');
    expect(firstIngest).toBe(3);

    const secondIngest = await reconService.ingestIntoObservationRepository('ALL_REAL_BROKER');
    expect(secondIngest).toBe(3);

    const stored = await obsRepo.getObservations();
    expect(stored.length).toBe(3);
  });

  // Test 11: Static assertion: Zero broker write capabilities on service
  it('Test 11: Static assertion: HistoricalEvidenceReconstructionService exposes zero broker writes', () => {
    expect((reconService as any).placeOrder).toBeUndefined();
    expect((reconService as any).cancelOrder).toBeUndefined();
    expect((reconService as any).modifyPosition).toBeUndefined();
  });
});
