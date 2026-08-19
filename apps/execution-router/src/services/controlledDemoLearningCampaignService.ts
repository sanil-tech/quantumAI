import {
  CurrencyPair,
  TradingSession,
  ObservationType,
  ResearchEvidenceTier,
  AiTradeOpportunity
} from '../../../../src/types';
import { controlledDemoExecutionService, DemoExecutionRecord } from './controlledDemoExecutionService';
import { controlledDemoSmokeTestHarness } from './controlledDemoSmokeTestHarness';
import { researchLearningEngine } from '../../../decision-agent/src/services/researchLearningEngine';
import { learningJournalService } from '../../../../src/server/services/learningJournalService';
import { ctraderReadOnlyReconciliationService } from '../../../../src/server/services/ctraderReadOnlyReconciliationService';
import { aiDecisionEngine, PostMortemReview } from '../../../decision-agent/src/services/aiDecisionEngine';
import { validateExecutionEnvironmentSafety } from '../adapters/executionSafetyGate';

export type CampaignStatus = 'STOPPED' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

export interface CampaignStateSnapshot {
  status: CampaignStatus;
  targetTrades: number;
  completedTrades: number;
  remainingTrades: number;
  currentTradeId: string | null;
  currentBrokerPositionId: string | null;
  isDemoArmed: boolean;
  liveExecutionGate: 'FORBIDDEN';
  authoritativeBrokerPositions: number;
  authoritativeBrokerOrders: number;
  lastSafetyBlockReason: string | null;
  lastEventTimestamp: number;
}

export class ControlledDemoLearningCampaignService {
  private static instance: ControlledDemoLearningCampaignService;

  private status: CampaignStatus = 'STOPPED';
  private targetTrades: number = 30;
  private completedTrades: number = 5; // Initial verified baseline from Phase 7G & 7H
  private currentTradeId: string | null = null;
  private currentBrokerPositionId: string | null = null;
  private lastSafetyBlockReason: string | null = null;
  private lastEventTimestamp: number = Date.now();

  public static getInstance(): ControlledDemoLearningCampaignService {
    if (!ControlledDemoLearningCampaignService.instance) {
      ControlledDemoLearningCampaignService.instance = new ControlledDemoLearningCampaignService();
    }
    return ControlledDemoLearningCampaignService.instance;
  }

  public resetCampaign(baselineCompleted: number = 0): void {
    this.status = 'STOPPED';
    this.completedTrades = baselineCompleted;
    this.currentTradeId = null;
    this.currentBrokerPositionId = null;
    this.lastSafetyBlockReason = null;
    this.lastEventTimestamp = Date.now();
    controlledDemoExecutionService.disarmDemoExecution();
  }

  public setCompletedTrades(count: number): void {
    this.completedTrades = Math.max(0, count);
  }

  /**
   * Starts the continuous DEMO learning campaign after strict pre-flight reconciliation.
   */
  public startCampaign(): { success: boolean; error?: string; status: CampaignStatus } {
    // debug

    // 1. Invariant Safety Check: LIVE execution is permanently forbidden
    const liveSafety = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-broker-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });

    if (liveSafety.allowed) {
      this.status = 'STOPPED';
      this.lastSafetyBlockReason = 'CRITICAL: LIVE execution gate must remain FORBIDDEN';
      return { success: false, error: this.lastSafetyBlockReason, status: this.status };
    }

    // 2. Authoritative Broker State Reconciliation
    const recon = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    if (recon.authoritativeBrokerPositionCount !== 0 || recon.authoritativeBrokerOrderCount !== 0) {
      this.status = 'STOPPED';
      this.lastSafetyBlockReason = `PRE_CHECK_FAILED: Authoritative open positions (${recon.authoritativeBrokerPositionCount}) or orders (${recon.authoritativeBrokerOrderCount}) must be zero before starting campaign`;
      learningJournalService.recordEvent({
        eventType: 'SAFETY_BLOCK',
        setupFingerprint: 'GLOBAL_CAMPAIGN_SAFETY',
        symbol: 'EUR/USD',
        direction: 'BUY',
        session: 'LONDON',
        observationType: 'REAL_DEMO_EXECUTION',
        sampleCount: this.completedTrades,
        evidenceTier: researchLearningEngine.resolveEvidenceTier(this.completedTrades).tier,
        previousLearningWeight: 0,
        newLearningWeight: 0,
        reason: this.lastSafetyBlockReason,
        affectedFutureSetupFingerprint: 'ALL_SETUPS'
      });
      return { success: false, error: this.lastSafetyBlockReason, status: this.status };
    }

    this.status = 'RUNNING';
    this.lastSafetyBlockReason = null;
    this.lastEventTimestamp = Date.now();

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_STARTED',
      setupFingerprint: 'GLOBAL_CAMPAIGN_CONTROL',
      symbol: 'EUR/USD',
      direction: 'BUY',
      session: 'LONDON',
      observationType: 'REAL_DEMO_EXECUTION',
      sampleCount: this.completedTrades,
      evidenceTier: researchLearningEngine.resolveEvidenceTier(this.completedTrades).tier,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      reason: `Operator started DEMO learning campaign (Target: ${this.targetTrades} trades, Current N: ${this.completedTrades})`,
      affectedFutureSetupFingerprint: 'ALL_SETUPS'
    });

    return { success: true, status: this.status };
  }

  /**
   * Pauses the campaign. Prevents new orders from being submitted while allowing in-flight positions to settle.
   */
  public pauseCampaign(reason: string = 'Operator requested pause'): { success: boolean; status: CampaignStatus } {
    this.status = 'PAUSED';
    this.lastSafetyBlockReason = reason;
    this.lastEventTimestamp = Date.now();

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_PAUSED',
      setupFingerprint: 'GLOBAL_CAMPAIGN_CONTROL',
      symbol: 'EUR/USD',
      direction: 'BUY',
      session: 'LONDON',
      observationType: 'REAL_DEMO_EXECUTION',
      sampleCount: this.completedTrades,
      evidenceTier: researchLearningEngine.resolveEvidenceTier(this.completedTrades).tier,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      reason: `Campaign paused: ${reason}`,
      affectedFutureSetupFingerprint: 'ALL_SETUPS'
    });

    return { success: true, status: this.status };
  }

  /**
   * Resumes the paused campaign after safety reconciliation.
   */
  public resumeCampaign(): { success: boolean; error?: string; status: CampaignStatus } {
    if (this.completedTrades >= this.targetTrades) {
      this.status = 'COMPLETED';
      return { success: false, error: 'Campaign target of 30 closed trades has already been reached', status: this.status };
    }

    const recon = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    if (this.currentTradeId === null && (recon.authoritativeBrokerPositionCount !== 0 || recon.authoritativeBrokerOrderCount !== 0)) {
      this.status = 'PAUSED';
      this.lastSafetyBlockReason = `RESUME_RECONCILIATION_FAILED: Broker has ${recon.authoritativeBrokerPositionCount} positions and ${recon.authoritativeBrokerOrderCount} orders`;
      return { success: false, error: this.lastSafetyBlockReason, status: this.status };
    }

    this.status = 'RUNNING';
    this.lastSafetyBlockReason = null;
    this.lastEventTimestamp = Date.now();

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_RESUMED',
      setupFingerprint: 'GLOBAL_CAMPAIGN_CONTROL',
      symbol: 'EUR/USD',
      direction: 'BUY',
      session: 'LONDON',
      observationType: 'REAL_DEMO_EXECUTION',
      sampleCount: this.completedTrades,
      evidenceTier: researchLearningEngine.resolveEvidenceTier(this.completedTrades).tier,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      reason: 'Operator resumed campaign after reconciliation',
      affectedFutureSetupFingerprint: 'ALL_SETUPS'
    });

    return { success: true, status: this.status };
  }

  /**
   * Stops the campaign immediately and disarms DEMO execution.
   */
  public stopCampaign(reason: string = 'Operator requested stop'): { success: boolean; status: CampaignStatus } {
    this.status = 'STOPPED';
    this.lastSafetyBlockReason = reason;
    this.lastEventTimestamp = Date.now();
    controlledDemoExecutionService.disarmDemoExecution();

    learningJournalService.recordEvent({
      eventType: 'CAMPAIGN_STOPPED',
      setupFingerprint: 'GLOBAL_CAMPAIGN_CONTROL',
      symbol: 'EUR/USD',
      direction: 'BUY',
      session: 'LONDON',
      observationType: 'REAL_DEMO_EXECUTION',
      sampleCount: this.completedTrades,
      evidenceTier: researchLearningEngine.resolveEvidenceTier(this.completedTrades).tier,
      previousLearningWeight: 0,
      newLearningWeight: 0,
      reason: `Campaign stopped: ${reason}`,
      affectedFutureSetupFingerprint: 'ALL_SETUPS'
    });

    return { success: true, status: this.status };
  }

  /**
   * Evaluates and processes a candidate setup through the controlled DEMO campaign pipeline.
   */
  public processCandidateSetup(params: {
    opportunity: AiTradeOpportunity;
    session: TradingSession;
    idempotencyKey: string;
    brokerAck?: { brokerOrderId: string; brokerPositionId: string; executedPrice: number };
    observationType?: ObservationType;
  }): { success: boolean; actionTaken: string; error?: string; executionRecord?: DemoExecutionRecord } {
    const opp = params.opportunity;
    const obsType = params.observationType || 'REAL_DEMO_EXECUTION';
    const fingerprint = researchLearningEngine.generateFingerprint(opp.pair, opp.action === 'SELL' ? 'SELL' : 'BUY', opp.setupType || 'DEFAULT');
    const setupStats = researchLearningEngine.getSetupStats(fingerprint);
    const setupN = setupStats?.totalObservations || 0;
    const tierInfo = researchLearningEngine.resolveEvidenceTier(setupN);

    // 1. Handle Non-Trade Signals / Rejected Opportunities as Counterfactuals
    if (opp.action === 'NO_SETUP' || opp.action === 'WAIT_FOR_CONFIRMATION' || opp.action === 'VETO' || opp.status === 'VETOED') {
      const rejectionReason = opp.action === 'VETO' 
        ? 'Filtered by Adaptive Learning VETO' 
        : opp.action === 'WAIT_FOR_CONFIRMATION' 
          ? 'Awaiting Structural Confirmation' 
          : 'NO_SETUP: Indecisive market structure';

      const cf = researchLearningEngine.recordCounterfactual(opp, rejectionReason, params.session);
      
      learningJournalService.recordEvent({
        eventType: 'COUNTERFACTUAL_RECORDED',
        observationId: cf.id,
        setupFingerprint: fingerprint,
        symbol: opp.pair,
        direction: opp.action === 'SELL' ? 'SELL' : 'BUY',
        session: params.session,
        observationType: 'COUNTERFACTUAL_OBSERVATION',
        sampleCount: setupN,
        evidenceTier: tierInfo.tier,
        previousLearningWeight: tierInfo.weight,
        newLearningWeight: tierInfo.weight,
        reason: rejectionReason,
        affectedFutureSetupFingerprint: fingerprint
      });

      return { success: true, actionTaken: 'COUNTERFACTUAL_RECORDED' };
    }

    // 2. Campaign Status Gate: Must be in RUNNING state
    if (this.status !== 'RUNNING') {
      return { success: false, actionTaken: 'REJECTED_CAMPAIGN_NOT_RUNNING', error: `Campaign is ${this.status}` };
    }

    // 3. Concurrency Gate: Exactly 1 position allowed
    if (this.currentTradeId !== null || controlledDemoExecutionService.getOpenPositions().length > 0) {
      return { success: false, actionTaken: 'REJECTED_CONCURRENCY', error: 'Max concurrent DEMO positions (1) already active' };
    }

    // 4. Target Milestone Gate: Do not exceed target 30 trades
    if (this.completedTrades >= this.targetTrades) {
      this.status = 'COMPLETED';
      return { success: false, actionTaken: 'CAMPAIGN_COMPLETED', error: 'Campaign target of 30 trades reached' };
    }

    // 5. Pre-Flight Safety Checks
    const preFlight = controlledDemoSmokeTestHarness.evaluatePreFlight(opp, 0.01, params.idempotencyKey);
    if (!preFlight.passed) { 
      this.pauseCampaign(`Pre-flight failed: ${preFlight.failedChecks.join(', ')}`);
      learningJournalService.recordEvent({
        eventType: 'SAFETY_BLOCK',
        setupFingerprint: fingerprint,
        symbol: opp.pair,
        direction: opp.action === 'SELL' ? 'SELL' : 'BUY',
        session: params.session,
        observationType: obsType,
        sampleCount: setupN,
        evidenceTier: tierInfo.tier,
        previousLearningWeight: tierInfo.weight,
        newLearningWeight: tierInfo.weight,
        reason: `Pre-flight safety gate rejection: ${preFlight.failedChecks.join(', ')}`,
        affectedFutureSetupFingerprint: fingerprint
      });
      return { success: false, actionTaken: 'PRE_FLIGHT_SAFETY_BLOCK', error: preFlight.failedChecks.join(', ') };
    }

    // 6. Arm DEMO execution explicitly for single trade
    controlledDemoExecutionService.armDemoExecution();

    // 7. Transmit controlled DEMO order
    const plannedEntry = opp.entryZone?.min || opp.entryZone?.max || 1.0850;
    const orderRes = controlledDemoExecutionService.executeControlledDemoOrder(
      opp,
      0.01,
      plannedEntry,
      params.brokerAck
    );

    if (!orderRes.success || !orderRes.record) { 
      controlledDemoExecutionService.disarmDemoExecution();
      this.pauseCampaign(`Order submission failed: ${orderRes.reason}`);
      return { success: false, actionTaken: 'ORDER_SUBMISSION_FAILED', error: orderRes.reason };
    }

    this.currentTradeId = orderRes.record.id;
    this.currentBrokerPositionId = orderRes.record.brokerPositionId || null;

    learningJournalService.recordEvent({
      eventType: 'OBSERVATION_RECORDED',
      tradeId: orderRes.record.id,
      brokerOrderId: orderRes.record.brokerOrderId,
      brokerPositionId: orderRes.record.brokerPositionId,
      setupFingerprint: fingerprint,
      symbol: opp.pair,
      direction: opp.action === 'SELL' ? 'SELL' : 'BUY',
      session: params.session,
      observationType: obsType,
      sampleCount: setupN,
      evidenceTier: tierInfo.tier,
      previousLearningWeight: tierInfo.weight,
      newLearningWeight: tierInfo.weight,
      reason: `Controlled DEMO position opened (Order: ${orderRes.record.brokerOrderId}, Pos: ${orderRes.record.brokerPositionId})`,
      affectedFutureSetupFingerprint: fingerprint
    });

    return { success: true, actionTaken: 'DEMO_ORDER_TRANSMITTED', executionRecord: orderRes.record };
  }

  /**
   * Deterministically closes a controlled DEMO position, records Post-Mortem, updates learning, and disarms execution.
   */
  public async handleAuthoritativeTradeClose(params: {
    recordId: string;
    exitPrice: number;
    closeReason: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'MANUAL_CLOSE' | 'INVALIDATION' | 'TIMEOUT';
    pnlDollars: number;
    pnlPips: number;
    outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
    session: TradingSession;
    notes?: string;
    observationType?: ObservationType;
  }): Promise<{ success: boolean; postMortem?: PostMortemReview; updatedSetupStats?: any }> {
    const obsType = params.observationType || 'REAL_DEMO_EXECUTION';
    const closedRecord = controlledDemoExecutionService.closeDemoPosition(
      params.recordId,
      params.exitPrice,
      params.closeReason
    );

    if (!closedRecord) {
      return { success: false };
    }
    const opp = closedRecord.signalSnapshot || ({} as any);
    const fingerprint = researchLearningEngine.generateFingerprint(
      closedRecord.symbol,
      closedRecord.direction,
      opp.setupType || 'DEFAULT'
    );

    const prevSetupStats = researchLearningEngine.getSetupStats(fingerprint);
    const prevWeight = prevSetupStats?.learningWeight || 0;
    const prevSlMultiplier = prevSetupStats?.recommendedSlMultiplier || 1.0;

    // 1. Create Post-Mortem Review
    const postMortem = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: closedRecord.id,
      positionId: closedRecord.brokerPositionId || 'pos-unknown',
      symbol: closedRecord.symbol,
      direction: closedRecord.direction,
      entryPrice: closedRecord.acknowledgedEntryPrice || closedRecord.requestedEntryPrice,
      exitPrice: params.exitPrice,
      stopLoss: closedRecord.stopLoss,
      takeProfit: closedRecord.takeProfit1,
      pnlDollars: params.pnlDollars,
      pnlPips: params.pnlPips,
      outcome: params.outcome,
      cleanNotes: params.notes || 'Closed in Phase 7I Controlled DEMO Campaign'
    });

    // 2. Ingest into Multi-Dimensional Research Engine
    const updatedSetupStats = researchLearningEngine.ingestCompletedObservation({
      symbol: closedRecord.symbol,
      direction: closedRecord.direction,
      setupType: opp.setupType || 'DEFAULT',
      session: params.session,
      outcome: params.outcome,
      closeReason: params.closeReason,
      realizedR: closedRecord.realizedR || 0,
      mfePips: closedRecord.mfePips,
      maePips: closedRecord.maePips,
      observationType: obsType,
      postMortem: postMortem as any,
      tradeRecord: closedRecord
    });

    // 3. Increment Campaign-Level Real DEMO N (Only for REAL_DEMO_EXECUTION)
    if (obsType === 'REAL_DEMO_EXECUTION') {
      this.completedTrades++;
    }

    this.currentTradeId = null;
    this.currentBrokerPositionId = null;
    this.lastEventTimestamp = Date.now();

    // 4. Guaranteed Disarm Execution
    controlledDemoExecutionService.disarmDemoExecution();

    // 5. Journal Logging
    learningJournalService.recordEvent({
      eventType: 'TRADE_CLOSED',
      tradeId: closedRecord.id,
      brokerOrderId: closedRecord.brokerOrderId,
      brokerPositionId: closedRecord.brokerPositionId,
      setupFingerprint: fingerprint,
      symbol: closedRecord.symbol,
      direction: closedRecord.direction,
      session: params.session,
      observationType: obsType,
      outcome: params.outcome,
      realizedR: closedRecord.realizedR,
      mfePips: closedRecord.mfePips,
      maePips: closedRecord.maePips,
      sampleCount: updatedSetupStats.totalObservations,
      evidenceTier: updatedSetupStats.evidenceTier,
      previousLearningWeight: prevWeight,
      newLearningWeight: updatedSetupStats.learningWeight,
      previousParameter: `SL Multiplier: ${prevSlMultiplier.toFixed(2)}x`,
      proposedParameter: `SL Multiplier: ${updatedSetupStats.recommendedSlMultiplier.toFixed(2)}x`,
      appliedParameter: `SL Multiplier: ${updatedSetupStats.recommendedSlMultiplier.toFixed(2)}x`,
      boundedAdjustment: updatedSetupStats.recommendedSlMultiplier > 1.0 ? `+${((updatedSetupStats.recommendedSlMultiplier - 1.0) * 100).toFixed(1)}% buffer` : 'Baseline',
      reason: postMortem?.rootCauseEn || 'Controlled execution outcome recorded',
      affectedFutureSetupFingerprint: fingerprint
    });

    // 6. Check Campaign Completion
    if (this.completedTrades >= this.targetTrades) {
      this.status = 'COMPLETED';
      learningJournalService.recordEvent({
        eventType: 'CAMPAIGN_COMPLETED',
        setupFingerprint: 'GLOBAL_CAMPAIGN_CONTROL',
        symbol: closedRecord.symbol,
        direction: closedRecord.direction,
        session: params.session,
        observationType: obsType,
        sampleCount: updatedSetupStats.totalObservations,
        evidenceTier: updatedSetupStats.evidenceTier,
        previousLearningWeight: prevWeight,
        newLearningWeight: updatedSetupStats.learningWeight,
        reason: `Campaign reached target milestone: ${this.completedTrades}/${this.targetTrades} closed trades`,
        affectedFutureSetupFingerprint: 'ALL_SETUPS'
      });
    }

    return { success: true, postMortem: postMortem as any, updatedSetupStats };
  }

  public getStatus(): CampaignStateSnapshot {
    const recon = ctraderReadOnlyReconciliationService.generateReadOnlyReconciliation('5881460');
    return {
      status: this.status,
      targetTrades: this.targetTrades,
      completedTrades: this.completedTrades,
      remainingTrades: Math.max(0, this.targetTrades - this.completedTrades),
      currentTradeId: this.currentTradeId,
      currentBrokerPositionId: this.currentBrokerPositionId,
      isDemoArmed: controlledDemoExecutionService.isDemoArmed(),
      liveExecutionGate: 'FORBIDDEN',
      authoritativeBrokerPositions: recon.authoritativeBrokerPositionCount,
      authoritativeBrokerOrders: recon.authoritativeBrokerOrderCount,
      lastSafetyBlockReason: this.lastSafetyBlockReason,
      lastEventTimestamp: this.lastEventTimestamp
    };
  }
}

export const controlledDemoLearningCampaignService = ControlledDemoLearningCampaignService.getInstance();
