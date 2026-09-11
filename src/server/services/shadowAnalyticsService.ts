import {
  ShadowPerformanceRecord,
  CohortMetrics,
  ShadowSelectivityMetrics,
  LearningEffectivenessComparison,
  EvidenceClassification,
  EvidenceSource,
  TradingSession
} from '../../types';

export class ShadowAnalyticsService {
  private static instance: ShadowAnalyticsService;
  private records: ShadowPerformanceRecord[] = [];

  public static getInstance(): ShadowAnalyticsService {
    if (!ShadowAnalyticsService.instance) {
      ShadowAnalyticsService.instance = new ShadowAnalyticsService();
    }
    return ShadowAnalyticsService.instance;
  }

  public recordShadowTrade(record: ShadowPerformanceRecord): void {
    // Prevent duplicate entries
    const existingIdx = this.records.findIndex(r => r.id === record.id);
    if (existingIdx >= 0) {
      this.records[existingIdx] = record;
    } else {
      this.records.push(record);
    }
  }

  public clearRecords(): void {
    this.records = [];
  }

  public getRecords(filterSource?: EvidenceSource): ShadowPerformanceRecord[] {
    if (filterSource) {
      return this.records.filter(r => (r.evidenceSource || 'REAL_MARKET') === filterSource);
    }
    return [...this.records];
  }

  public getRealMarketRecords(): ShadowPerformanceRecord[] {
    return this.getRecords('REAL_MARKET');
  }

  public getTestFixtureRecords(): ShadowPerformanceRecord[] {
    return this.getRecords('TEST_FIXTURE');
  }

  public static classifyEvidenceTier(sampleSize: number): EvidenceClassification {
    if (sampleSize < 5) return 'INSUFFICIENT_SAMPLE';
    if (sampleSize <= 14) return 'EARLY_SIGNAL';
    if (sampleSize <= 29) return 'PRELIMINARY';
    if (sampleSize <= 99) return 'MEANINGFUL_SAMPLE';
    return 'STRONGER_EVIDENCE';
  }

  public static calculateRMultiple(
    entryPrice: number,
    exitPrice: number,
    stopLoss: number,
    direction: 'BUY' | 'SELL'
  ): number {
    const risk = Math.abs(entryPrice - stopLoss);
    if (risk === 0) return 0;
    const gain = direction === 'BUY' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
    return Number((gain / risk).toFixed(2));
  }

  public static calculateMfeMae(
    entryPrice: number,
    highestPrice: number,
    lowestPrice: number,
    direction: 'BUY' | 'SELL',
    pipFactor: number = 10000
  ): { mfePips: number; maePips: number } {
    let mfe = 0;
    let mae = 0;

    if (direction === 'BUY') {
      mfe = Math.max(0, highestPrice - entryPrice) * pipFactor;
      mae = Math.max(0, entryPrice - lowestPrice) * pipFactor;
    } else {
      mfe = Math.max(0, entryPrice - lowestPrice) * pipFactor;
      mae = Math.max(0, highestPrice - entryPrice) * pipFactor;
    }

    return {
      mfePips: Number(mfe.toFixed(1)),
      maePips: Number(mae.toFixed(1))
    };
  }

  public calculateCohortMetrics(
    records: ShadowPerformanceRecord[],
    cohortName: 'BASELINE' | 'LEARNING_AFFECTED' | 'TOTAL' = 'TOTAL'
  ): CohortMetrics {
    const n = records.length;
    if (n === 0) {
      return {
        cohortName,
        sampleSize: 0,
        evidenceTier: 'INSUFFICIENT_SAMPLE',
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        observedWinRate: 0,
        averageR: 0,
        medianR: 0,
        expectancy: 0,
        cumulativeR: 0,
        maxDrawdownR: 0,
        maxConsecutiveLosses: 0,
        averageMfePips: 0,
        averageMaePips: 0
      };
    }

    const wins = records.filter(r => r.outcome === 'WIN');
    const losses = records.filter(r => r.outcome === 'LOSS');
    const breakevens = records.filter(r => r.outcome === 'BREAKEVEN');
    const observedWinRate = Number((wins.length / n).toFixed(2));

    const rValues = records.map(r => r.realizedR || 0).sort((a, b) => a - b);
    const cumulativeR = Number(rValues.reduce((sum, r) => sum + r, 0).toFixed(2));
    const averageR = Number((cumulativeR / n).toFixed(2));

    const mid = Math.floor(n / 2);
    const medianR = n % 2 !== 0 ? rValues[mid] : Number(((rValues[mid - 1] + rValues[mid]) / 2).toFixed(2));

    const avgWinR = wins.length > 0 ? (wins.reduce((sum, r) => sum + (r.realizedR || 0), 0) / wins.length) : 0;
    const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((sum, r) => sum + (r.realizedR || 0), 0) / losses.length) : 0;
    const expectancy = Number(((observedWinRate * avgWinR) - ((1 - observedWinRate) * avgLossR)).toFixed(2));

    // Calculate Max Drawdown in R
    let peakR = 0;
    let runningR = 0;
    let maxDrawdownR = 0;

    // Calculate Max Consecutive Losses
    let currentLossStreak = 0;
    let maxConsecutiveLosses = 0;

    for (const r of records) {
      runningR += (r.realizedR || 0);
      if (runningR > peakR) peakR = runningR;
      const dd = peakR - runningR;
      if (dd > maxDrawdownR) maxDrawdownR = dd;

      if (r.outcome === 'LOSS') {
        currentLossStreak++;
        if (currentLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentLossStreak;
      } else {
        currentLossStreak = 0;
      }
    }

    const averageMfePips = Number((records.reduce((sum, r) => sum + (r.mfePips || 0), 0) / n).toFixed(1));
    const averageMaePips = Number((records.reduce((sum, r) => sum + (r.maePips || 0), 0) / n).toFixed(1));

    return {
      cohortName,
      sampleSize: n,
      evidenceTier: ShadowAnalyticsService.classifyEvidenceTier(n),
      winCount: wins.length,
      lossCount: losses.length,
      breakevenCount: breakevens.length,
      observedWinRate,
      averageR,
      medianR,
      expectancy,
      cumulativeR,
      maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
      maxConsecutiveLosses,
      averageMfePips,
      averageMaePips
    };
  }

  public compareCohorts(filterSource?: EvidenceSource): LearningEffectivenessComparison {
    const targetRecords = this.getRecords(filterSource);

    const baselineRecords = targetRecords.filter(r => (r.learningAdjustment === 0 || r.learningAdjustment === undefined) && !r.vetoed);
    const learningRecords = targetRecords.filter(r => (r.learningAdjustment !== 0 && r.learningAdjustment !== undefined) || r.vetoed);

    const baselineCohort = this.calculateCohortMetrics(baselineRecords, 'BASELINE');
    const learningAffectedCohort = this.calculateCohortMetrics(learningRecords, 'LEARNING_AFFECTED');

    const sampleSizeDelta = learningAffectedCohort.sampleSize - baselineCohort.sampleSize;
    const observedWinRateDelta = Number((learningAffectedCohort.observedWinRate - baselineCohort.observedWinRate).toFixed(2));
    const observedExpectancyDelta = Number((learningAffectedCohort.expectancy - baselineCohort.expectancy).toFixed(2));
    const observedAvgRDelta = Number((learningAffectedCohort.averageR - baselineCohort.averageR).toFixed(2));

    let statisticalSignificanceAssessment = 'INSUFFICIENT_SAMPLE: More real observations required for valid comparison';
    if (baselineCohort.sampleSize >= 30 && learningAffectedCohort.sampleSize >= 30) {
      statisticalSignificanceAssessment = 'STATISTICALLY_MEANINGFUL_SAMPLE: Valid cohort comparison available';
    } else if (baselineCohort.sampleSize >= 15 && learningAffectedCohort.sampleSize >= 15) {
      statisticalSignificanceAssessment = 'PRELIMINARY_EVIDENCE: Emerging difference observed, statistical variance remains high';
    }

    return {
      baselineCohort,
      learningAffectedCohort,
      observedWinRateDelta,
      observedExpectancyDelta,
      observedAvgRDelta,
      sampleSizeDelta,
      statisticalSignificanceAssessment
    };
  }
}

export const shadowAnalyticsService = ShadowAnalyticsService.getInstance();
