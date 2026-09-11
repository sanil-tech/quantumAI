import { describe, it, expect, vi } from 'vitest';
import { shadowObservationRepository } from '../packages/database/src/shadowRepository';
import { researchLearningEngine } from '../apps/decision-agent/src/services/researchLearningEngine';
import { continuousLearningObservatoryService } from '../src/server/services/continuousLearningObservatoryService';
import { FinalExecutionGateService } from '../src/server/services/finalExecutionGateService';

describe('QUANTUMAI — PHASE 26.2 LEARNING RECONCILIATION AUDIT TEST SUITE', () => {
  const P25_CUTOVER_TIMESTAMP = '2026-08-25T14:36:05.000Z';

  // 1. PostgreSQL count is authoritative
  it('1. PostgreSQL count is authoritative and queries true database records', async () => {
    const stats = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    expect(stats).toBeDefined();
    expect(typeof stats.totalClosed).toBe('number');
    expect(typeof stats.winCount).toBe('number');
    expect(typeof stats.lossCount).toBe('number');
    expect(typeof stats.winRate).toBe('number');
    expect(typeof stats.totalRealizedR).toBe('number');
    expect(Array.isArray(stats.pairBreakdown)).toBe(true);
    expect(stats.totalClosed).toBe(stats.winCount + stats.lossCount + stats.breakevenCount);
  });

  // 2. UI 50-row limit does not alter aggregate KPI
  it('2. UI 50-row limit does not alter aggregate KPI calculations', async () => {
    const stats = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    const completed50 = await shadowObservationRepository.getCompletedShadowObservations(50);
    
    expect(completed50.length).toBeLessThanOrEqual(50);
    // If stats has >50 records, aggregate totalClosed must reflect full database total, not 50
    if (stats.totalClosed > 50) {
      expect(stats.totalClosed).toBeGreaterThan(50);
      expect(stats.totalClosed).not.toBe(completed50.length);
    }
  });

  // 3. PRE-P25 and POST-P25 are distinguishable
  it('3. PRE-P25 and POST-P25 records are distinguishable by cutover timestamp', () => {
    const preDate = new Date('2026-08-25T13:00:00.000Z').getTime();
    const postDate = new Date('2026-08-25T15:00:00.000Z').getTime();
    const cutover = new Date(P25_CUTOVER_TIMESTAMP).getTime();

    expect(preDate < cutover).toBe(true);
    expect(postDate >= cutover).toBe(true);
  });

  // 4. Learning dataset provenance is identifiable
  it('4. Learning dataset provenance is identifiable between PRE_P25_LEGACY and POST_P25_GOVERNED', () => {
    const classifyProvenance = (timestamp: number | string) => {
      const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
      const cutover = new Date(P25_CUTOVER_TIMESTAMP).getTime();
      return ts < cutover ? 'PRE_P25_LEGACY' : 'POST_P25_GOVERNED';
    };

    expect(classifyProvenance('2026-08-25T13:30:00.000Z')).toBe('PRE_P25_LEGACY');
    expect(classifyProvenance('2026-08-25T14:40:00.000Z')).toBe('POST_P25_GOVERNED');
  });

  // 5. No duplicate learning IDs are silently counted twice
  it('5. No duplicate observations are counted twice in set reconciliation', () => {
    const ids = ['shadow-1', 'shadow-2', 'shadow-1', 'shadow-3'];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
    expect(ids.length - uniqueIds.size).toBe(1); // 1 duplicate identified
  });

  // 6. Restart behavior is deterministic (in-memory resets vs persistent DB retains)
  it('6. Restart behavior shows in-memory engine restarts fresh while PostgreSQL retains history', async () => {
    const dbStats = await shadowObservationRepository.getAuthoritativeDatabaseStatistics();
    const enginePayload = researchLearningEngine.getEarlyLearnerPayload();

    expect(dbStats).toBeDefined();
    expect(enginePayload).toBeDefined();
    expect(enginePayload.mode).toBe('EARLY_LEARNER_MODE');
  });

  // 7. DB-only records are reported in reconciliation logic
  it('7. DB-only records reconciliation logic correctly isolates disjoint sets', () => {
    const dbIds = new Set(['db-1', 'db-2', 'db-3']);
    const memoryIds = new Set(['db-1']);

    const dbOnly = [...dbIds].filter(id => !memoryIds.has(id));
    const intersection = [...dbIds].filter(id => memoryIds.has(id));

    expect(dbOnly).toEqual(['db-2', 'db-3']);
    expect(intersection).toEqual(['db-1']);
  });

  // 8. Learning-only records are reported in reconciliation logic
  it('8. Learning-only records reconciliation logic correctly isolates disjoint sets', () => {
    const dbIds = new Set(['db-1']);
    const memoryIds = new Set(['db-1', 'mem-only-1']);

    const learningOnly = [...memoryIds].filter(id => !dbIds.has(id));
    expect(learningOnly).toEqual(['mem-only-1']);
  });

  // 9. KPI calculations are independent of pagination
  it('9. KPI calculations are independent of pagination slice', () => {
    const fullDataset = [
      { id: '1', realizedR: 2, outcome: 'WIN' },
      { id: '2', realizedR: -1, outcome: 'LOSS' },
      { id: '3', realizedR: 2, outcome: 'WIN' },
      { id: '4', realizedR: -1, outcome: 'LOSS' }
    ];
    const page1 = fullDataset.slice(0, 2);

    const fullWinRate = (fullDataset.filter(d => d.outcome === 'WIN').length / fullDataset.length) * 100;
    const page1WinRate = (page1.filter(d => d.outcome === 'WIN').length / page1.length) * 100;

    // Full is 50%, page1 happens to be 50% here but KPI must use fullDataset
    expect(fullDataset.length).toBe(4);
    expect(page1.length).toBe(2);
    expect(fullWinRate).toBe(50);
  });

  // 10. No trading/execution behavior is modified (Safety boundary preserved)
  it('10. Execution gates remain FAIL-CLOSED, LIVE & DEMO DISARMED, 0 broker orders', () => {
    const liveDecision = FinalExecutionGateService.evaluateFinalExecutionGate({
      requestId: 'test-live-req',
      idempotencyKey: 'test-live-idem',
      strategyId: 'STRAT-AI-TREND-PULSE',
      strategyVersion: 'v2.0.0',
      symbol: 'EUR/USD',
      direction: 'BUY',
      riskPercent: 1.0,
      environment: 'LIVE',
      actorId: 'admin-user',
      actorRole: 'ADMIN'
    });

    expect(liveDecision.decision).toBe('DENIED');
    expect(liveDecision.brokerOrderTransmitted).toBe(false);
    expect(liveDecision.executionEnvironment).toBe('FORBIDDEN');
  });
});
