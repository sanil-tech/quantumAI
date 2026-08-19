import {
  CurrencyPair,
  TradingSession,
  ObservationType,
  ResearchEvidenceTier,
  AiTradeOpportunity
} from '../../../../src/types';
import { PostMortemReview } from './aiDecisionEngine';

export interface SetupLearningStats {
  setupFingerprint: string;
  symbol: CurrencyPair;
  direction: 'BUY' | 'SELL';
  setupType: string;
  totalObservations: number;
  realDemoCount: number;
  shadowCount: number;
  counterfactualCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number; // 0 to 100%
  tp1ExitCount: number;
  tp2ExitCount: number;
  slExitCount: number;
  avgRealizedR: number;
  avgMfePips: number;
  avgMaePips: number;
  sessionDistribution: Record<TradingSession, number>;
  evidenceTier: ResearchEvidenceTier;
  learningWeight: number; // 0.0 to 0.20
  recommendedSlMultiplier: number; // 1.0 = baseline, up to 1.20 max bounded
  activeAdaptiveRule?: string;
}

export interface SessionLearningStats {
  session: TradingSession;
  totalObservations: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgR: number;
}

export interface CounterfactualRecord {
  id: string;
  signalId: string;
  symbol: CurrencyPair;
  direction: 'BUY' | 'SELL';
  setupFingerprint: string;
  session: TradingSession;
  actionProposal: string;
  rejectionReason: string;
  entryPrice: number;
  hypotheticalStopLoss: number;
  hypotheticalTakeProfit1: number;
  hypotheticalTakeProfit2?: number;
  evaluatedAt: number;
  resolvedAt?: number;
  hypotheticalOutcome?: 'WOULD_HAVE_WON_TP1' | 'WOULD_HAVE_WON_TP2' | 'WOULD_HAVE_HIT_SL' | 'WOULD_HAVE_BEEN_BREAKEVEN' | 'IN_PROGRESS';
  hypotheticalR?: number;
  observationType: 'COUNTERFACTUAL_OBSERVATION';
}

export interface LearningAdaptationRecord {
  id: string;
  timestamp: number;
  affectedFingerprint: string;
  sampleSize: number;
  evidenceTier: ResearchEvidenceTier;
  learningWeight: number;
  whatWasObserved: string;
  previousParameter: string;
  proposedParameter: string;
  boundedChange: string;
  reason: string;
  isActive: boolean;
}

export interface CampaignSummaryMetrics {
  totalDemoExecutions: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;
  totalRealizedR: number;
  avgRealizedR: number;
  avgMfePips: number;
  avgMaePips: number;
  avgExecutionLatencyMs: number;
  counterfactualCount: number;
  shadowObservationCount: number;
  currentCampaignEvidenceTier: ResearchEvidenceTier;
  currentCampaignWeight: number;
}

export interface EarlyLearnerPayload {
  mode: 'EARLY_LEARNER_MODE';
  safetyState: {
    liveExecution: 'FORBIDDEN';
    liveAccount: 'FORBIDDEN';
    automatedLiveExecution: false;
    demoExecutionArmed: boolean;
    maxConcurrentDemoPositions: 1;
    demoMaxVolumeLot: 0.01;
    authoritativeBrokerPositions: number;
  };
  campaignMetrics: CampaignSummaryMetrics;
  setupLevelLearning: SetupLearningStats[];
  sessionLevelLearning: SessionLearningStats[];
  learningAdaptations: LearningAdaptationRecord[];
  counterfactualObservations: CounterfactualRecord[];
  latestTrades: any[];
}

export class ResearchLearningEngine {
  private static instance: ResearchLearningEngine;
  private setupStats: Map<string, SetupLearningStats> = new Map();
  private sessionStats: Map<TradingSession, { total: number; wins: number; losses: number; totalR: number }> = new Map();
  private counterfactualRecords: Map<string, CounterfactualRecord> = new Map();
  private learningAdaptations: LearningAdaptationRecord[] = [];
  private executionLatencies: number[] = [45, 52, 48, 50, 47]; // Historical baseline in ms
  private completedTradeRecords: any[] = [];

  public static getInstance(): ResearchLearningEngine {
    if (!ResearchLearningEngine.instance) {
      ResearchLearningEngine.instance = new ResearchLearningEngine();
    }
    return ResearchLearningEngine.instance;
  }

  public clearAll(): void {
    this.setupStats.clear();
    this.sessionStats.clear();
    this.counterfactualRecords.clear();
    this.learningAdaptations = [];
    this.executionLatencies = [45, 52, 48, 50, 47];
    this.completedTradeRecords = [];
  }

  /**
   * Generates a canonical setup fingerprint (e.g. "EUR/USD_BUY_ORDER_BLOCK_RETEST").
   */
  public generateFingerprint(pair: CurrencyPair, direction: 'BUY' | 'SELL', setupType: string = 'DEFAULT'): string {
    return `${pair}_${direction}_${setupType.toUpperCase()}`;
  }

  /**
   * Resolves the strict sample size evidence tier and bounded weight.
   */
  public resolveEvidenceTier(count: number): { tier: ResearchEvidenceTier; weight: number } {
    if (count >= 100) {
      return { tier: 'ROBUST_OBSERVATION', weight: 0.20 };
    }
    if (count >= 30) {
      return { tier: 'MODERATE_EVIDENCE', weight: 0.15 };
    }
    if (count >= 10) {
      return { tier: 'DEVELOPING', weight: 0.10 };
    }
    if (count >= 5) {
      return { tier: 'EARLY_OBSERVATION', weight: 0.05 };
    }
    return { tier: 'NO_EVIDENCE', weight: 0.0 };
  }

  /**
   * Records execution latency for campaign telemetry.
   */
  public recordExecutionLatency(latencyMs: number): void {
    if (latencyMs > 0) {
      this.executionLatencies.push(latencyMs);
    }
  }

  /**
   * Ingests a completed observation (DEMO or SHADOW) and updates setup-level isolated stats.
   */
  public ingestCompletedObservation(data: {
    symbol: CurrencyPair;
    direction: 'BUY' | 'SELL';
    setupType?: string;
    session: TradingSession;
    outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
    closeReason: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'MANUAL_CLOSE' | 'INVALIDATION' | 'TIMEOUT';
    realizedR: number;
    mfePips: number;
    maePips: number;
    observationType: ObservationType;
    postMortem?: PostMortemReview;
    tradeRecord?: any;
  }): SetupLearningStats {
    if (data.observationType === 'TEST_FIXTURE') {
      return undefined as any;
    }
    const fingerprint = this.generateFingerprint(data.symbol, data.direction, data.setupType || 'DEFAULT');
    let stats = this.setupStats.get(fingerprint);

    if (!stats) {
      stats = {
        setupFingerprint: fingerprint,
        symbol: data.symbol,
        direction: data.direction,
        setupType: (data.setupType || 'DEFAULT').toUpperCase(),
        totalObservations: 0,
        realDemoCount: 0,
        shadowCount: 0,
        counterfactualCount: 0,
        winCount: 0,
        lossCount: 0,
        breakevenCount: 0,
        winRate: 0,
        tp1ExitCount: 0,
        tp2ExitCount: 0,
        slExitCount: 0,
        avgRealizedR: 0,
        avgMfePips: 0,
        avgMaePips: 0,
        sessionDistribution: {
          LONDON: 0,
          NEW_YORK: 0,
          ASIAN: 0,
          OVERLAP_LONDON_NY: 0
        },
        evidenceTier: 'NO_EVIDENCE',
        learningWeight: 0.0,
        recommendedSlMultiplier: 1.0
      };
      this.setupStats.set(fingerprint, stats);
    }

    const prevSlMultiplier = stats.recommendedSlMultiplier;

    // Increment counts
    stats.totalObservations++;
    if (data.observationType === 'REAL_DEMO_EXECUTION') stats.realDemoCount++;
    if (data.observationType === 'SHADOW_OBSERVATION') stats.shadowCount++;

    if (data.outcome === 'WIN') stats.winCount++;
    else if (data.outcome === 'LOSS') stats.lossCount++;
    else stats.breakevenCount++;

    stats.winRate = parseFloat(((stats.winCount / stats.totalObservations) * 100).toFixed(1));

    if (data.closeReason === 'TAKE_PROFIT_1') stats.tp1ExitCount++;
    if (data.closeReason === 'TAKE_PROFIT_2') stats.tp2ExitCount++;
    if (data.closeReason === 'STOP_LOSS') stats.slExitCount++;

    if (!stats.sessionDistribution[data.session]) {
      stats.sessionDistribution[data.session] = 0;
    }
    stats.sessionDistribution[data.session]++;

    // Update averages
    const prevTotal = stats.totalObservations - 1;
    stats.avgRealizedR = parseFloat(((stats.avgRealizedR * prevTotal + data.realizedR) / stats.totalObservations).toFixed(2));
    stats.avgMfePips = parseFloat(((stats.avgMfePips * prevTotal + data.mfePips) / stats.totalObservations).toFixed(1));
    stats.avgMaePips = parseFloat(((stats.avgMaePips * prevTotal + data.maePips) / stats.totalObservations).toFixed(1));

    // Update evidence tier & bounded learning weight strictly from setup-level N
    const tierInfo = this.resolveEvidenceTier(stats.totalObservations);
    stats.evidenceTier = tierInfo.tier;
    stats.learningWeight = tierInfo.weight;

    // Bounded SL multiplier based strictly on loss rate and sample tier (max 1.20)
    if (stats.lossCount > stats.winCount && tierInfo.weight > 0) {
      stats.recommendedSlMultiplier = parseFloat((1.0 + (tierInfo.weight * (stats.lossCount / stats.totalObservations))).toFixed(2));
      stats.recommendedSlMultiplier = Math.min(stats.recommendedSlMultiplier, 1.20);
    } else {
      stats.recommendedSlMultiplier = 1.0;
    }

    if (data.postMortem?.adaptiveRuleEn) {
      stats.activeAdaptiveRule = data.postMortem.adaptiveRuleEn;
    }

    // Ingest into session stats
    let sStat = this.sessionStats.get(data.session);
    if (!sStat) {
      sStat = { total: 0, wins: 0, losses: 0, totalR: 0 };
      this.sessionStats.set(data.session, sStat);
    }
    sStat.total++;
    if (data.outcome === 'WIN') sStat.wins++;
    else if (data.outcome === 'LOSS') sStat.losses++;
    sStat.totalR += data.realizedR;

    // Record Learning Adaptation Audit Trail
    if (tierInfo.weight > 0 || stats.recommendedSlMultiplier !== prevSlMultiplier || data.postMortem?.adaptiveRuleEn) {
      this.learningAdaptations.push({
        id: `adapt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        affectedFingerprint: fingerprint,
        sampleSize: stats.totalObservations,
        evidenceTier: stats.evidenceTier,
        learningWeight: stats.learningWeight,
        whatWasObserved: `${stats.winCount}W / ${stats.lossCount}L observed across ${stats.totalObservations} trials (Avg R: ${stats.avgRealizedR}R, Avg MAE: ${stats.avgMaePips}p)`,
        previousParameter: `SL Multiplier: ${prevSlMultiplier.toFixed(2)}x`,
        proposedParameter: `SL Multiplier: ${stats.recommendedSlMultiplier.toFixed(2)}x`,
        boundedChange: stats.recommendedSlMultiplier > 1.0 ? `+${((stats.recommendedSlMultiplier - 1.0) * 100).toFixed(1)}% bounded buffer` : 'No adjustment (Baseline)',
        reason: data.postMortem?.adaptiveRuleEn || (stats.lossCount > stats.winCount ? 'Defensive stop loss buffer applied due to elevated adverse excursion' : 'Sufficient positive sample verification'),
        isActive: true
      });
    }

    if (data.tradeRecord) {
      this.completedTradeRecords.unshift(data.tradeRecord);
      if (this.completedTradeRecords.length > 50) this.completedTradeRecords.pop();
    }

    return stats;
  }

  /**
   * Records a counterfactual observation for a candidate setup that was not executed (e.g. NO_SETUP, WAIT, VETO).
   */
  public recordCounterfactual(
    opportunity: AiTradeOpportunity,
    rejectionReason: string,
    session: TradingSession = 'LONDON'
  ): CounterfactualRecord {
    const entryMin = opportunity.entryZone?.min || 1.0850;
    const sl = opportunity.stopLoss || (opportunity.action === 'BUY' ? entryMin - 0.0030 : entryMin + 0.0030);
    const tp1 = opportunity.takeProfit1 || (opportunity.action === 'BUY' ? entryMin + 0.0060 : entryMin - 0.0060);

    const record: CounterfactualRecord = {
      id: `cf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      signalId: opportunity.id,
      symbol: opportunity.pair,
      direction: opportunity.action === 'SELL' ? 'SELL' : 'BUY',
      setupFingerprint: this.generateFingerprint(opportunity.pair, opportunity.action === 'SELL' ? 'SELL' : 'BUY', opportunity.setupType || 'COUNTERFACTUAL'),
      session,
      actionProposal: opportunity.action,
      rejectionReason,
      entryPrice: entryMin,
      hypotheticalStopLoss: sl,
      hypotheticalTakeProfit1: tp1,
      hypotheticalTakeProfit2: opportunity.takeProfit2 ?? undefined,
      evaluatedAt: Date.now(),
      hypotheticalOutcome: 'IN_PROGRESS',
      observationType: 'COUNTERFACTUAL_OBSERVATION'
    };

    this.counterfactualRecords.set(record.id, record);
    return record;
  }

  /**
   * Resolves a counterfactual record with simulated market ticks.
   */
  public resolveCounterfactualOutcome(
    recordId: string,
    highPrice: number,
    lowPrice: number
  ): CounterfactualRecord | undefined {
    const rec = this.counterfactualRecords.get(recordId);
    if (!rec || rec.hypotheticalOutcome !== 'IN_PROGRESS') return rec;

    rec.resolvedAt = Date.now();

    if (rec.direction === 'BUY') {
      if (lowPrice <= rec.hypotheticalStopLoss) {
        rec.hypotheticalOutcome = 'WOULD_HAVE_HIT_SL';
        rec.hypotheticalR = -1.0;
      } else if (rec.hypotheticalTakeProfit2 && highPrice >= rec.hypotheticalTakeProfit2) {
        rec.hypotheticalOutcome = 'WOULD_HAVE_WON_TP2';
        rec.hypotheticalR = 2.5;
      } else if (highPrice >= rec.hypotheticalTakeProfit1) {
        rec.hypotheticalOutcome = 'WOULD_HAVE_WON_TP1';
        rec.hypotheticalR = 1.5;
      }
    } else {
      if (highPrice >= rec.hypotheticalStopLoss) {
        rec.hypotheticalOutcome = 'WOULD_HAVE_HIT_SL';
        rec.hypotheticalR = -1.0;
      } else if (rec.hypotheticalTakeProfit2 && lowPrice <= rec.hypotheticalTakeProfit2) {
        rec.hypotheticalOutcome = 'WOULD_HAVE_WON_TP2';
        rec.hypotheticalR = 2.5;
      } else if (lowPrice <= rec.hypotheticalTakeProfit1) {
        rec.hypotheticalOutcome = 'WOULD_HAVE_WON_TP1';
        rec.hypotheticalR = 1.5;
      }
    }

    return rec;
  }

  public getCampaignSummaryMetrics(): CampaignSummaryMetrics {
    const setups = this.getAllSetupStats();
    let totalDemoExecutions = 0;
    let closedTrades = 0;
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;
    let sumRealizedR = 0;
    let sumMfePips = 0;
    let sumMaePips = 0;
    let shadowCount = 0;

    for (const s of setups) {
      totalDemoExecutions += s.realDemoCount;
      closedTrades += s.totalObservations;
      winCount += s.winCount;
      lossCount += s.lossCount;
      breakevenCount += s.breakevenCount;
      sumRealizedR += (s.avgRealizedR * s.totalObservations);
      sumMfePips += (s.avgMfePips * s.totalObservations);
      sumMaePips += (s.avgMaePips * s.totalObservations);
      shadowCount += s.shadowCount;
    }

    const winRate = closedTrades > 0 ? parseFloat(((winCount / closedTrades) * 100).toFixed(1)) : 0;
    const avgRealizedR = closedTrades > 0 ? parseFloat((sumRealizedR / closedTrades).toFixed(2)) : 0;
    const avgMfePips = closedTrades > 0 ? parseFloat((sumMfePips / closedTrades).toFixed(1)) : 0;
    const avgMaePips = closedTrades > 0 ? parseFloat((sumMaePips / closedTrades).toFixed(1)) : 0;

    const avgLatency = this.executionLatencies.length > 0
      ? Math.round(this.executionLatencies.reduce((a, b) => a + b, 0) / this.executionLatencies.length)
      : 50;

    const tierInfo = this.resolveEvidenceTier(closedTrades);

    return {
      totalDemoExecutions,
      closedTrades,
      winCount,
      lossCount,
      breakevenCount,
      winRate,
      totalRealizedR: parseFloat(sumRealizedR.toFixed(2)),
      avgRealizedR,
      avgMfePips,
      avgMaePips,
      avgExecutionLatencyMs: avgLatency,
      counterfactualCount: this.counterfactualRecords.size,
      shadowObservationCount: shadowCount,
      currentCampaignEvidenceTier: tierInfo.tier,
      currentCampaignWeight: tierInfo.weight
    };
  }

  public getEarlyLearnerPayload(): EarlyLearnerPayload {
    return {
      mode: 'EARLY_LEARNER_MODE',
      safetyState: {
        liveExecution: 'FORBIDDEN',
        liveAccount: 'FORBIDDEN',
        automatedLiveExecution: false,
        demoExecutionArmed: false,
        maxConcurrentDemoPositions: 1,
        demoMaxVolumeLot: 0.01,
        authoritativeBrokerPositions: 0
      },
      campaignMetrics: this.getCampaignSummaryMetrics(),
      setupLevelLearning: this.getAllSetupStats(),
      sessionLevelLearning: this.getSessionStats(),
      learningAdaptations: this.getLearningAdaptations(),
      counterfactualObservations: this.getCounterfactualRecords(),
      latestTrades: this.completedTradeRecords
    };
  }

  public getSetupStats(fingerprint: string): SetupLearningStats | undefined {
    return this.setupStats.get(fingerprint);
  }

  public getAllSetupStats(): SetupLearningStats[] {
    return Array.from(this.setupStats.values());
  }

  public getSessionStats(): SessionLearningStats[] {
    return Array.from(this.sessionStats.entries()).map(([session, stat]) => ({
      session,
      totalObservations: stat.total,
      winCount: stat.wins,
      lossCount: stat.losses,
      winRate: stat.total > 0 ? parseFloat(((stat.wins / stat.total) * 100).toFixed(1)) : 0,
      avgR: stat.total > 0 ? parseFloat((stat.totalR / stat.total).toFixed(2)) : 0
    }));
  }

  public getCounterfactualRecords(): CounterfactualRecord[] {
    return Array.from(this.counterfactualRecords.values());
  }

  public getLearningAdaptations(): LearningAdaptationRecord[] {
    return [...this.learningAdaptations];
  }
}

export const researchLearningEngine = ResearchLearningEngine.getInstance();
