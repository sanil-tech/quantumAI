/**
 * Phase 1.3 — Second Opinion Evidence Analytics Service
 * QuantumAI IATI OS
 * 
 * OBJECTIVE:
 * - Measure whether the independent second opinion contains useful information
 *   relative to the existing QuantumAI decision process.
 * - Purely descriptive observational analytics: NO ranking, NO causality claims,
 *   NO performance assertions, NO execution authority.
 * - Strict dataset lineage segmentation: LIVE default; synthetic/backtest/shadow
 *   data never contaminate LIVE outcome statistics.
 * - Small-sample size protection: samples < 10 have percentage fields masked as null / INSUFFICIENT_SAMPLE.
 */

import {
  SecondOpinionObservation,
  ObservationDataMode,
  secondOpinionObservationService
} from './secondOpinionObservationService';
import {
  SecondOpinionAgreement,
  SecondOpinionReview,
  SecondOpinionBias
} from './secondOpinionService';

export interface AnalyticsFilters {
  symbol?: string;
  timeframe?: string;
  dataLineage?: ObservationDataMode; // default 'LIVE'
  agreement?: SecondOpinionAgreement;
  review?: SecondOpinionReview;
  economicRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  from?: string;
  to?: string;
}

export interface DescriptiveOutcomeMetrics {
  sampleSize: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number | null; // null if sampleSize < 10
  lossRate: number | null; // null if sampleSize < 10
  totalPnl: number;
  averagePnl: number;
  totalPips: number;
  averagePips: number;
  sampleStatus: 'VALID' | 'INSUFFICIENT_SAMPLE';
}

export type CorrelationQuality = 'STRONG' | 'PARTIAL' | 'UNMATCHED' | 'UNKNOWN';

export interface ConfidenceBucketSummary {
  bucket: '0-59' | '60-69' | '70-79' | '80-89' | '90-100';
  observationCount: number;
  outcomes: DescriptiveOutcomeMetrics;
}

export interface ConfidenceAnalyticsReport {
  dataset: {
    dataLineage: ObservationDataMode;
    from: string | null;
    to: string | null;
  };
  quantumAiConfidenceBuckets: ConfidenceBucketSummary[];
  openAiConfidenceBuckets: ConfidenceBucketSummary[];
}

export interface DisagreementDirectionalBreakdown {
  quantumAiDirection: 'BUY' | 'SELL' | 'NEUTRAL';
  openAiBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  count: number;
  outcomes: DescriptiveOutcomeMetrics;
}

export interface DisagreementAnalyticsReport {
  dataset: {
    dataLineage: ObservationDataMode;
    from: string | null;
    to: string | null;
  };
  summary: DescriptiveOutcomeMetrics;
  directionalBreakdowns: DisagreementDirectionalBreakdown[];
}

export interface EconomicRiskAnalyticsReport {
  dataset: {
    dataLineage: ObservationDataMode;
    from: string | null;
    to: string | null;
  };
  categories: {
    LOW: DescriptiveOutcomeMetrics;
    MEDIUM: DescriptiveOutcomeMetrics;
    HIGH: DescriptiveOutcomeMetrics;
    UNKNOWN: DescriptiveOutcomeMetrics;
  };
}

export interface SecondOpinionAnalyticsReport {
  dataset: {
    dataLineage: ObservationDataMode;
    from: string | null;
    to: string | null;
    symbolFilter?: string;
    timeframeFilter?: string;
  };
  observations: {
    total: number;
    available: number;
    unavailable: number;
  };
  agreement: {
    AGREE: DescriptiveOutcomeMetrics;
    PARTIAL: DescriptiveOutcomeMetrics;
    DISAGREE: DescriptiveOutcomeMetrics;
  };
  review: {
    PASS: DescriptiveOutcomeMetrics;
    REVIEW: DescriptiveOutcomeMetrics;
    REJECT: DescriptiveOutcomeMetrics;
    UNAVAILABLE: DescriptiveOutcomeMetrics;
  };
  economicRisk: {
    LOW: DescriptiveOutcomeMetrics;
    MEDIUM: DescriptiveOutcomeMetrics;
    HIGH: DescriptiveOutcomeMetrics;
    UNKNOWN: DescriptiveOutcomeMetrics;
  };
  quantumAiDirection: {
    BUY: DescriptiveOutcomeMetrics;
    SELL: DescriptiveOutcomeMetrics;
    NEUTRAL: DescriptiveOutcomeMetrics;
  };
  openAiBias: {
    BULLISH: DescriptiveOutcomeMetrics;
    BEARISH: DescriptiveOutcomeMetrics;
    NEUTRAL: DescriptiveOutcomeMetrics;
  };
  correlationQuality: {
    STRONG: number;
    PARTIAL: number;
    UNMATCHED: number;
    UNKNOWN: number;
  };
  outcomes: {
    totalClosedTrades: number;
    winCount: number;
    lossCount: number;
    breakevenCount: number;
    openCount: number;
    unmatchedCount: number;
    totalPnl: number;
    averagePnl: number;
    totalPips: number;
    averagePips: number;
  };
}

export class SecondOpinionAnalyticsService {
  private static instance: SecondOpinionAnalyticsService;

  public static getInstance(): SecondOpinionAnalyticsService {
    if (!SecondOpinionAnalyticsService.instance) {
      SecondOpinionAnalyticsService.instance = new SecondOpinionAnalyticsService();
    }
    return SecondOpinionAnalyticsService.instance;
  }

  /**
   * Helper: Filter raw observations according to filters.
   * Default dataLineage is 'LIVE' if unspecified.
   */
  public getFilteredObservations(filters: AnalyticsFilters = {}): SecondOpinionObservation[] {
    const targetLineage: ObservationDataMode = filters.dataLineage
      ? secondOpinionObservationService.normalizeDataMode(filters.dataLineage)
      : 'LIVE';

    const allObs = secondOpinionObservationService.queryObservations({ limit: 100000 }).observations;

    return allObs.filter((obs) => {
      // 1. Data lineage match (Strict isolation)
      if (obs.dataMode !== targetLineage) return false;

      // 2. Symbol filter
      if (filters.symbol) {
        const reqSym = filters.symbol.replace(/[\/\-_]/g, '').toUpperCase();
        const obsSym = (obs.symbol || '').replace(/[\/\-_]/g, '').toUpperCase();
        if (obsSym !== reqSym) return false;
      }

      // 3. Timeframe filter
      if (filters.timeframe && obs.timeframe !== filters.timeframe) {
        return false;
      }

      // 4. Agreement filter
      if (filters.agreement && obs.agreement !== filters.agreement) {
        return false;
      }

      // 5. Review filter
      if (filters.review && obs.openAiReview !== filters.review) {
        return false;
      }

      // 6. Economic risk filter
      if (filters.economicRisk && obs.economicRisk !== filters.economicRisk) {
        return false;
      }

      // 7. Date range filter (from/to)
      const obsTimestamp = new Date(obs.secondOpinionAt || obs.createdAt).getTime();
      if (filters.from && obsTimestamp < new Date(filters.from).getTime()) {
        return false;
      }
      if (filters.to && obsTimestamp > new Date(filters.to).getTime()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculates descriptive outcome metrics for a given subset of observations.
   * Applies sample size protection (sampleSize < 10 -> percentage fields = null).
   */
  public calculateDescriptiveMetrics(observations: SecondOpinionObservation[]): DescriptiveOutcomeMetrics {
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let totalPnl = 0;
    let totalPips = 0;
    let closedTradesCount = 0;

    for (const obs of observations) {
      if (
        obs.outcomeStatus === 'CLOSED_WIN' ||
        obs.outcomeStatus === 'CLOSED_LOSS' ||
        obs.outcomeStatus === 'CLOSED_BREAKEVEN'
      ) {
        closedTradesCount++;
        if (obs.outcomeStatus === 'CLOSED_WIN') winCount++;
        else if (obs.outcomeStatus === 'CLOSED_LOSS') lossCount++;
        else if (obs.outcomeStatus === 'CLOSED_BREAKEVEN') breakevenCount++;

        if (typeof obs.outcomePnl === 'number') {
          totalPnl += obs.outcomePnl;
        }
        if (typeof obs.outcomePips === 'number') {
          totalPips += obs.outcomePips;
        }
      }
    }

    const sampleSize = closedTradesCount;
    const isSufficientSample = sampleSize >= 10;

    const averagePnl = sampleSize > 0 ? Number((totalPnl / sampleSize).toFixed(2)) : 0;
    const averagePips = sampleSize > 0 ? Number((totalPips / sampleSize).toFixed(1)) : 0;

    const winRate = isSufficientSample && sampleSize > 0
      ? Number(((winCount / sampleSize) * 100).toFixed(1))
      : null;

    const lossRate = isSufficientSample && sampleSize > 0
      ? Number(((lossCount / sampleSize) * 100).toFixed(1))
      : null;

    return {
      sampleSize,
      tradeCount: sampleSize,
      winCount,
      lossCount,
      breakevenCount,
      winRate,
      lossRate,
      totalPnl: Number(totalPnl.toFixed(2)),
      averagePnl,
      totalPips: Number(totalPips.toFixed(1)),
      averagePips,
      sampleStatus: isSufficientSample ? 'VALID' : 'INSUFFICIENT_SAMPLE'
    };
  }

  /**
   * Classifies correlation quality based on identifier provenance.
   */
  public getCorrelationQuality(obs: SecondOpinionObservation): CorrelationQuality {
    if (obs.outcomeStatus === 'UNMATCHED') return 'UNMATCHED';
    if (obs.brokerOrderId || obs.brokerPositionId) return 'STRONG';
    if (obs.signalId && obs.outcomeRecordedAt) return 'PARTIAL';
    return 'UNKNOWN';
  }

  /**
   * Main: Generate Full Descriptive Analytics Report
   */
  public getAnalyticsReport(filters: AnalyticsFilters = {}): SecondOpinionAnalyticsReport {
    const list = this.getFilteredObservations(filters);
    const targetLineage: ObservationDataMode = filters.dataLineage
      ? secondOpinionObservationService.normalizeDataMode(filters.dataLineage)
      : 'LIVE';

    let openAiAvailable = 0;
    let openAiUnavailable = 0;

    let strongCorr = 0;
    let partialCorr = 0;
    let unmatchedCorr = 0;
    let unknownCorr = 0;

    let openOutcomeCount = 0;
    let unmatchedOutcomeCount = 0;

    for (const obs of list) {
      if (obs.openAiReview === 'UNAVAILABLE') {
        openAiUnavailable++;
      } else {
        openAiAvailable++;
      }

      if (obs.outcomeStatus === 'OPEN') {
        openOutcomeCount++;
      } else if (obs.outcomeStatus === 'UNMATCHED') {
        unmatchedOutcomeCount++;
      }

      const quality = this.getCorrelationQuality(obs);
      if (quality === 'STRONG') strongCorr++;
      else if (quality === 'PARTIAL') partialCorr++;
      else if (quality === 'UNMATCHED') unmatchedCorr++;
      else unknownCorr++;
    }

    // Grouping by Agreement
    const agreeObs = list.filter((o) => o.agreement === 'AGREE');
    const partialObs = list.filter((o) => o.agreement === 'PARTIAL');
    const disagreeObs = list.filter((o) => o.agreement === 'DISAGREE');

    // Grouping by Review
    const passObs = list.filter((o) => o.openAiReview === 'PASS');
    const reviewObs = list.filter((o) => o.openAiReview === 'REVIEW');
    const rejectObs = list.filter((o) => o.openAiReview === 'REJECT');
    const unavailObs = list.filter((o) => o.openAiReview === 'UNAVAILABLE');

    // Grouping by Economic Risk
    const lowEconObs = list.filter((o) => o.economicRisk === 'LOW');
    const medEconObs = list.filter((o) => o.economicRisk === 'MEDIUM');
    const highEconObs = list.filter((o) => o.economicRisk === 'HIGH');
    const unkEconObs = list.filter((o) => o.economicRisk === 'UNKNOWN');

    // Grouping by QuantumAI Direction
    const buyObs = list.filter((o) => o.quantumAiDirection === 'BUY');
    const sellObs = list.filter((o) => o.quantumAiDirection === 'SELL');
    const neutralDirObs = list.filter((o) => o.quantumAiDirection === 'NEUTRAL');

    // Grouping by OpenAI Independent Bias
    const bullishObs = list.filter((o) => o.openAiBias === 'BULLISH');
    const bearishObs = list.filter((o) => o.openAiBias === 'BEARISH');
    const neutralBiasObs = list.filter((o) => o.openAiBias === 'NEUTRAL');

    // Overall outcome metrics
    const overallOutcomes = this.calculateDescriptiveMetrics(list);

    return {
      dataset: {
        dataLineage: targetLineage,
        from: filters.from || null,
        to: filters.to || null,
        symbolFilter: filters.symbol,
        timeframeFilter: filters.timeframe
      },
      observations: {
        total: list.length,
        available: openAiAvailable,
        unavailable: openAiUnavailable
      },
      agreement: {
        AGREE: this.calculateDescriptiveMetrics(agreeObs),
        PARTIAL: this.calculateDescriptiveMetrics(partialObs),
        DISAGREE: this.calculateDescriptiveMetrics(disagreeObs)
      },
      review: {
        PASS: this.calculateDescriptiveMetrics(passObs),
        REVIEW: this.calculateDescriptiveMetrics(reviewObs),
        REJECT: this.calculateDescriptiveMetrics(rejectObs),
        UNAVAILABLE: this.calculateDescriptiveMetrics(unavailObs)
      },
      economicRisk: {
        LOW: this.calculateDescriptiveMetrics(lowEconObs),
        MEDIUM: this.calculateDescriptiveMetrics(medEconObs),
        HIGH: this.calculateDescriptiveMetrics(highEconObs),
        UNKNOWN: this.calculateDescriptiveMetrics(unkEconObs)
      },
      quantumAiDirection: {
        BUY: this.calculateDescriptiveMetrics(buyObs),
        SELL: this.calculateDescriptiveMetrics(sellObs),
        NEUTRAL: this.calculateDescriptiveMetrics(neutralDirObs)
      },
      openAiBias: {
        BULLISH: this.calculateDescriptiveMetrics(bullishObs),
        BEARISH: this.calculateDescriptiveMetrics(bearishObs),
        NEUTRAL: this.calculateDescriptiveMetrics(neutralBiasObs)
      },
      correlationQuality: {
        STRONG: strongCorr,
        PARTIAL: partialCorr,
        UNMATCHED: unmatchedCorr,
        UNKNOWN: unknownCorr
      },
      outcomes: {
        totalClosedTrades: overallOutcomes.tradeCount,
        winCount: overallOutcomes.winCount,
        lossCount: overallOutcomes.lossCount,
        breakevenCount: overallOutcomes.breakevenCount,
        openCount: openOutcomeCount,
        unmatchedCount: unmatchedOutcomeCount,
        totalPnl: overallOutcomes.totalPnl,
        averagePnl: overallOutcomes.averagePnl,
        totalPips: overallOutcomes.totalPips,
        averagePips: overallOutcomes.averagePips
      }
    };
  }

  /**
   * Dedicated Disagreement Analytics Endpoint Calculation
   */
  public getDisagreementAnalytics(filters: AnalyticsFilters = {}): DisagreementAnalyticsReport {
    const list = this.getFilteredObservations(filters);
    const targetLineage: ObservationDataMode = filters.dataLineage
      ? secondOpinionObservationService.normalizeDataMode(filters.dataLineage)
      : 'LIVE';

    const disagreeList = list.filter((o) => o.agreement === 'DISAGREE');
    const summary = this.calculateDescriptiveMetrics(disagreeList);

    // Directional pairings
    const pairs: Array<{ dir: 'BUY' | 'SELL' | 'NEUTRAL'; bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }> = [
      { dir: 'BUY', bias: 'BEARISH' },
      { dir: 'BUY', bias: 'NEUTRAL' },
      { dir: 'SELL', bias: 'BULLISH' },
      { dir: 'SELL', bias: 'NEUTRAL' },
      { dir: 'NEUTRAL', bias: 'BULLISH' },
      { dir: 'NEUTRAL', bias: 'BEARISH' }
    ];

    const directionalBreakdowns: DisagreementDirectionalBreakdown[] = pairs.map(({ dir, bias }) => {
      const matching = disagreeList.filter(
        (o) => o.quantumAiDirection === dir && o.openAiBias === bias
      );
      return {
        quantumAiDirection: dir,
        openAiBias: bias,
        count: matching.length,
        outcomes: this.calculateDescriptiveMetrics(matching)
      };
    });

    return {
      dataset: {
        dataLineage: targetLineage,
        from: filters.from || null,
        to: filters.to || null
      },
      summary,
      directionalBreakdowns
    };
  }

  /**
   * Dedicated Economic Risk Analytics Endpoint Calculation
   */
  public getEconomicRiskAnalytics(filters: AnalyticsFilters = {}): EconomicRiskAnalyticsReport {
    const list = this.getFilteredObservations(filters);
    const targetLineage: ObservationDataMode = filters.dataLineage
      ? secondOpinionObservationService.normalizeDataMode(filters.dataLineage)
      : 'LIVE';

    const lowObs = list.filter((o) => o.economicRisk === 'LOW');
    const medObs = list.filter((o) => o.economicRisk === 'MEDIUM');
    const highObs = list.filter((o) => o.economicRisk === 'HIGH');
    const unkObs = list.filter((o) => o.economicRisk === 'UNKNOWN');

    return {
      dataset: {
        dataLineage: targetLineage,
        from: filters.from || null,
        to: filters.to || null
      },
      categories: {
        LOW: this.calculateDescriptiveMetrics(lowObs),
        MEDIUM: this.calculateDescriptiveMetrics(medObs),
        HIGH: this.calculateDescriptiveMetrics(highObs),
        UNKNOWN: this.calculateDescriptiveMetrics(unkObs)
      }
    };
  }

  /**
   * Dedicated Confidence Bucket Analytics Endpoint Calculation
   */
  public getConfidenceAnalytics(filters: AnalyticsFilters = {}): ConfidenceAnalyticsReport {
    const list = this.getFilteredObservations(filters);
    const targetLineage: ObservationDataMode = filters.dataLineage
      ? secondOpinionObservationService.normalizeDataMode(filters.dataLineage)
      : 'LIVE';

    const bucketRanges: Array<{
      bucket: '0-59' | '60-69' | '70-79' | '80-89' | '90-100';
      min: number;
      max: number;
    }> = [
      { bucket: '0-59', min: 0, max: 59 },
      { bucket: '60-69', min: 60, max: 69 },
      { bucket: '70-79', min: 70, max: 79 },
      { bucket: '80-89', min: 80, max: 89 },
      { bucket: '90-100', min: 90, max: 100 }
    ];

    const quantumAiConfidenceBuckets: ConfidenceBucketSummary[] = bucketRanges.map(({ bucket, min, max }) => {
      const inBucket = list.filter((o) => {
        const conf = o.quantumAiConfidence || 0;
        return conf >= min && conf <= max;
      });
      return {
        bucket,
        observationCount: inBucket.length,
        outcomes: this.calculateDescriptiveMetrics(inBucket)
      };
    });

    const openAiConfidenceBuckets: ConfidenceBucketSummary[] = bucketRanges.map(({ bucket, min, max }) => {
      const inBucket = list.filter((o) => {
        const conf = o.openAiConfidence || 0;
        return conf >= min && conf <= max;
      });
      return {
        bucket,
        observationCount: inBucket.length,
        outcomes: this.calculateDescriptiveMetrics(inBucket)
      };
    });

    return {
      dataset: {
        dataLineage: targetLineage,
        from: filters.from || null,
        to: filters.to || null
      },
      quantumAiConfidenceBuckets,
      openAiConfidenceBuckets
    };
  }
}

export const secondOpinionAnalyticsService = SecondOpinionAnalyticsService.getInstance();
