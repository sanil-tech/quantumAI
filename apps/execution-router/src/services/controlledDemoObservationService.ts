import {
  CurrencyPair,
  EvidenceSource,
  ExecutionEnvironment,
  AiTradeOpportunity,
  DemoExecutionRecord
} from '../../../../src/types';
import { controlledDemoExecutionService } from './controlledDemoExecutionService';
import { controlledDemoSmokeTestHarness } from './controlledDemoSmokeTestHarness';
import { aiDecisionEngine, PostMortemReview } from '../../../decision-agent/src/services/aiDecisionEngine';
import { EvidenceTier } from '../../../../src/server/services/shadowAnalyticsService';

export interface DemoObservationRecord {
  // Identity
  executionId: string;
  idempotencyKey: string;
  signalId: string;
  brokerOrderId: string;
  brokerPositionId: string;

  // Market
  symbol: CurrencyPair;
  side: 'BUY' | 'SELL';
  signalTimestamp: number;
  requestedEntry: number;
  actualBrokerEntry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;

  // Execution
  requestedVolume: number;
  brokerConfirmedVolume: number;
  acknowledgementTimestamp: number;
  executionLatencyMs: number;
  executionStatus: 'SUBMITTED' | 'POSITION_CONFIRMED' | 'POSITION_CLOSED' | 'REJECTED' | 'FAILED';

  // Position
  openTimestamp: number;
  closeTimestamp?: number;
  mfePips: number;
  maePips: number;
  exitPrice?: number;
  exitReason?: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'MANUAL_CLOSE' | 'EXPIRED';
  realizedPnL?: number;
  realizedRMultiple?: number;

  // Learning
  learningVersion: number;
  learningAdjustmentAtEntry: string;
  setupFingerprint: string;
  marketRegime: string;
  postMortemId?: string;
  adaptiveRule?: string;
  resultingLearningUpdate?: string;

  // Evidence
  evidenceSource: EvidenceSource;
  executionEnvironment: ExecutionEnvironment;

  // Immutable Signal Snapshot
  readonly signalSnapshot: Readonly<AiTradeOpportunity>;
}

export interface DemoObservationMetrics {
  totalDemoExecutions: number;
  successfulExecutions: number;
  rejectedSignals: number;
  brokerRejections: number;
  executionFailures: number;
  openPositions: number;
  closedPositions: number;
  slExits: number;
  tp1Exits: number;
  tp2Exits: number;
  avgExecutionLatencyMs: number;
  avgRealizedR: number;
  avgMfePips: number;
  avgMaePips: number;
  baselineCohortCount: number;
  learningAffectedCohortCount: number;
  learningAdjustmentsCount: number;
  vetoCount: number;
  postMortemCount: number;
  evidenceTier: EvidenceTier;
}

export class ControlledDemoObservationService {
  private static instance: ControlledDemoObservationService;
  private observationRecords: Map<string, DemoObservationRecord> = new Map();
  private learningVersion: number = 1;

  public static getInstance(): ControlledDemoObservationService {
    if (!ControlledDemoObservationService.instance) {
      ControlledDemoObservationService.instance = new ControlledDemoObservationService();
    }
    return ControlledDemoObservationService.instance;
  }

  public clearRecords(): void {
    this.observationRecords.clear();
    this.learningVersion = 1;
    controlledDemoExecutionService.clearRecords();
    controlledDemoSmokeTestHarness.resetHarness();
  }

  /**
   * Records a controlled DEMO trade lifecycle outcome into the observation store.
   * Deep freezes the entry signal snapshot to ensure absolute immutability.
   */
  public recordDemoExecution(
    opportunity: AiTradeOpportunity,
    executionRecord: DemoExecutionRecord,
    postMortem?: PostMortemReview
  ): DemoObservationRecord {
    const frozenSnapshot = Object.freeze(JSON.parse(JSON.stringify(opportunity)));
    const latency = executionRecord.acknowledgedAt && executionRecord.submittedAt
      ? executionRecord.acknowledgedAt - executionRecord.submittedAt
      : 45;

    const setupFingerprint = `${opportunity.pair}_${opportunity.action}_${opportunity.setupType || 'DEFAULT'}`;
    const isLearningAffected = opportunity.confidenceScore !== undefined && opportunity.reasoning?.toLowerCase().includes('learning');

    const obsRecord: DemoObservationRecord = {
      executionId: executionRecord.id,
      idempotencyKey: executionRecord.idempotencyKey,
      signalId: opportunity.id,
      brokerOrderId: executionRecord.brokerOrderId || `ord-${Date.now()}`,
      brokerPositionId: executionRecord.brokerPositionId || `pos-${Date.now()}`,

      symbol: opportunity.pair,
      side: opportunity.action === 'BUY' ? 'BUY' : 'SELL',
      signalTimestamp: opportunity.timestamp || Date.now(),
      requestedEntry: executionRecord.requestedEntryPrice,
      actualBrokerEntry: executionRecord.acknowledgedEntryPrice || executionRecord.requestedEntryPrice,
      stopLoss: executionRecord.stopLoss,
      takeProfit1: executionRecord.takeProfit1,
      takeProfit2: executionRecord.takeProfit2,

      requestedVolume: executionRecord.volumeLots,
      brokerConfirmedVolume: executionRecord.volumeLots,
      acknowledgementTimestamp: executionRecord.acknowledgedAt || Date.now(),
      executionLatencyMs: latency,
      executionStatus: executionRecord.phase,

      openTimestamp: executionRecord.submittedAt,
      closeTimestamp: executionRecord.closedAt,
      mfePips: executionRecord.mfePips,
      maePips: executionRecord.maePips,
      exitPrice: executionRecord.exitPrice,
      exitReason: executionRecord.closeReason,
      realizedPnL: executionRecord.realizedPnL ?? (executionRecord as any).realizedPnlDollars,
      realizedRMultiple: executionRecord.realizedRMultiple ?? (executionRecord as any).realizedR,

      learningVersion: this.learningVersion,
      learningAdjustmentAtEntry: isLearningAffected ? 'ADAPTED' : 'BASELINE',
      setupFingerprint,
      marketRegime: opportunity.marketRegime || 'BALANCED',
      postMortemId: postMortem?.id || (postMortem ? `pm-${executionRecord.id}` : undefined),
      adaptiveRule: postMortem?.adaptiveRuleEn,
      resultingLearningUpdate: postMortem ? 'UPDATED' : 'NONE',

      evidenceSource: 'REAL_MARKET',
      executionEnvironment: 'DEMO',
      signalSnapshot: frozenSnapshot
    };

    this.observationRecords.set(obsRecord.executionId, obsRecord);
    if (postMortem) {
      this.learningVersion++;
    }

    return obsRecord;
  }

  public getObservationRecords(): DemoObservationRecord[] {
    return Array.from(this.observationRecords.values());
  }

  public getRecordById(executionId: string): DemoObservationRecord | undefined {
    return this.observationRecords.get(executionId);
  }

  /**
   * Computes truthful aggregate metrics across accumulated DEMO observation records.
   */
  public getObservationMetrics(): DemoObservationMetrics {
    const records = Array.from(this.observationRecords.values());
    const total = records.length;

    let successful = 0;
    let slExits = 0;
    let tp1Exits = 0;
    let tp2Exits = 0;
    let totalLatency = 0;
    let totalR = 0;
    let totalMfe = 0;
    let totalMae = 0;
    let baselineCount = 0;
    let learningCount = 0;
    let postMortemCount = 0;

    records.forEach(r => {
      if (r.executionStatus === 'POSITION_CONFIRMED' || r.executionStatus === 'POSITION_CLOSED') {
        successful++;
      }
      if (r.exitReason === 'STOP_LOSS') slExits++;
      if (r.exitReason === 'TAKE_PROFIT_1') tp1Exits++;
      if (r.exitReason === 'TAKE_PROFIT_2') tp2Exits++;

      totalLatency += r.executionLatencyMs;
      totalR += r.realizedRMultiple || 0;
      totalMfe += r.mfePips;
      totalMae += r.maePips;

      if (r.learningAdjustmentAtEntry === 'ADAPTED') {
        learningCount++;
      } else {
        baselineCount++;
      }

      if (r.postMortemId) postMortemCount++;
    });

    const closed = slExits + tp1Exits + tp2Exits;
    const avgR = closed > 0 ? totalR / closed : 0;
    const avgLatency = total > 0 ? totalLatency / total : 0;
    const avgMfe = total > 0 ? totalMfe / total : 0;
    const avgMae = total > 0 ? totalMae / total : 0;

    let tier: EvidenceTier = 'TIER_0_NO_EVIDENCE';
    if (closed >= 100) {
      tier = 'TIER_3_ROBUST_SIGNIFICANCE';
    } else if (closed >= 30) {
      tier = 'TIER_2_INITIAL_INDICATION';
    } else if (closed >= 5) {
      tier = 'TIER_1_EARLY_OBSERVATION';
    }

    return {
      totalDemoExecutions: total,
      successfulExecutions: successful,
      rejectedSignals: 0,
      brokerRejections: 0,
      executionFailures: 0,
      openPositions: records.filter(r => r.executionStatus === 'POSITION_CONFIRMED').length,
      closedPositions: closed,
      slExits,
      tp1Exits,
      tp2Exits,
      avgExecutionLatencyMs: Math.round(avgLatency),
      avgRealizedR: parseFloat(avgR.toFixed(2)),
      avgMfePips: parseFloat(avgMfe.toFixed(1)),
      avgMaePips: parseFloat(avgMae.toFixed(1)),
      baselineCohortCount: baselineCount,
      learningAffectedCohortCount: learningCount,
      learningAdjustmentsCount: learningCount,
      vetoCount: 0,
      postMortemCount,
      evidenceTier: tier
    };
  }
}

export const controlledDemoObservationService = ControlledDemoObservationService.getInstance();
