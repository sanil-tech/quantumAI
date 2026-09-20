import { describe, it, expect } from 'vitest';
import { buildDealGraph, DealRecord, PositionNode } from '../scratch/phase2c5a12-audit';
import fs from 'fs';
import path from 'path';

describe('Phase 2C.5A.1.2 — Deal Graph + Origin/P&L Consistency Audit', () => {
  // Load the authoritative deal graph result generated from cTrader OpenAPI
  const resultPath = path.resolve(process.cwd(), 'scratch/deal-graph-audit-result.json');
  let auditData: any;

  if (fs.existsSync(resultPath)) {
    auditData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  }

  it('1. Deal Count Invariant & Volume Conservation', () => {
    expect(auditData).toBeDefined();
    expect(auditData.openPositionsCount).toBe(5);
    expect(auditData.volumeViolations).toBe(0);

    // Structure invariant
    const structures = auditData.structureCounts;
    expect(structures.OPEN_ONLY.count).toBe(5);
    expect(structures.OPEN_ONLY.deals).toBe(5);
    expect(structures.OPEN_ONLY.remainingVol).toBeCloseTo(0.08, 4);
  });

  it('2. P&L Sum Invariant & Discrepancy Attribution', () => {
    // Total gross PnL across all classifications must equal the sum
    const pnl = auditData.pnlByOrigin;
    const computedTotal = pnl.QUANTUMAI_CONFIRMED + pnl.QUANTUMAI_PROBABLE + pnl.MANUAL_OR_EXTERNAL + pnl.UNKNOWN;
    expect(Math.abs(computedTotal - pnl.TOTAL_BROKER)).toBeLessThan(0.05);

    // Discrepancy analysis explains Version A vs Version B
    const disc = auditData.discrepancyAnalysis;
    expect(disc.goldCryptoCount).toBeGreaterThan(0);
    expect(disc.largeLotFxCount).toBeGreaterThan(0);
  });

  it('3. Reproducibility & Determinism', () => {
    // Assert that two independent parsing runs produce bit-for-bit identical deal graphs
    const sampleRawDeals = [
      {
        dealId: 330764286,
        positionId: 285026529,
        orderId: 315656469,
        symbolId: 1,
        tradeSide: 1,
        volume: 100000,
        executionPrice: 1.16694,
        executionTimestamp: 1787728820722,
        comment: ''
      },
      {
        dealId: 330783329,
        positionId: 285026529,
        orderId: 315658918,
        symbolId: 1,
        tradeSide: 2,
        volume: 100000,
        executionPrice: 1.1671,
        executionTimestamp: 1787730091486,
        closePositionDetail: {
          grossProfit: 16,
          moneyDigits: 2
        },
        comment: ''
      }
    ];

    const symMap = new Map<number, string>([[1, 'EURUSD']]);
    const liveOpenSet = new Set<number>();

    const run1 = buildDealGraph(symMap, liveOpenSet, sampleRawDeals);
    const run2 = buildDealGraph(symMap, liveOpenSet, sampleRawDeals);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it('4. JPY Cross Overlap Analysis', () => {
    const jpy = auditData.jpyAnalysis;
    expect(jpy.totalJpyPositions).toBeGreaterThan(0);
    expect(jpy.eurJpyCount).toBeGreaterThan(0);
    expect(jpy.gbpJpyCount).toBeGreaterThan(0);
    expect(jpy.overlapWindowsCount).toBeGreaterThan(0);
  });

  it('5. Live Open Positions Structure', () => {
    const live = auditData.liveOpenPositions;
    expect(live.length).toBe(5);
    for (const pos of live) {
      expect(pos.positionId).toBeDefined();
      expect(pos.symbol).toBeDefined();
      expect(pos.volumeLots).toBeGreaterThan(0);
      expect(pos.baseCurrency).toBeDefined();
      expect(pos.quoteCurrency).toBeDefined();
    }
  });
});
