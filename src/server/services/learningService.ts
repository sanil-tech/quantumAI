import { TradingRepository } from '@iati/database';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { aiDecisionEngine } from '../../../apps/decision-agent/src/services/aiDecisionEngine';
import { PostMortemReview } from '../../types';

function sanitizeUserNotes(notes?: string): string {
  if (!notes || typeof notes !== 'string') return '';
  const trimmed = notes.trim().substring(0, 300);
  return trimmed.replace(/(system\s*prompt|ignore\s*previous|override\s*instructions|ignore\s*instructions)/gi, '[FILTERED]');
}

export class LearningService {
  private static instance: LearningService;
  private repo: TradingRepository;

  constructor(repo?: TradingRepository) {
    this.repo = repo || new TradingRepository();
    this.subscribeToEvents();
  }

  public static getInstance(repo?: TradingRepository): LearningService {
    if (!LearningService.instance) {
      LearningService.instance = new LearningService(repo);
    }
    return LearningService.instance;
  }

  private subscribeToEvents(): void {
    globalEventBus.subscribe(EventTypes.TradeClosed, async (event) => {
      try {
        await this.processClosedTrade(event.payload);
      } catch (err: any) {
        console.error(`[LEARNING_SERVICE] Error auto-processing closed trade event: ${err.message}`);
      }
    });
  }

  /**
   * Load persisted learning records from PostgreSQL on startup.
   * Database = Source of Truth; Memory = Cache Only.
   */
  async loadPersistedLearning(): Promise<PostMortemReview[]> {
    try {
      const persisted = await this.repo.getPostMortemReviews(100);
      if (Array.isArray(persisted) && persisted.length > 0) {
        aiDecisionEngine.setPostMortemReviews(persisted);
        return persisted;
      }
      return aiDecisionEngine.getPostMortemReviews();
    } catch (err: any) {
      console.warn(`[LEARNING_SERVICE] Could not load persisted learning on startup: ${err.message}`);
      return aiDecisionEngine.getPostMortemReviews();
    }
  }

  /**
   * Process a closed trade into a persistent, idempotent PostMortemReview.
   */
  async processClosedTrade(payload: Partial<TradeClosedPayload>, userNotes?: string): Promise<PostMortemReview> {
    const tradeId = payload.tradeId || payload.positionId;
    if (!tradeId) {
      throw new Error("INVALID_LEARNING_REQUEST: Missing tradeId or positionId");
    }

    const learningVersion = payload.learningVersion || '1.0';

    // 1. Idempotency Check: Check if learning record already exists in DB for (tradeId, learningVersion)
    const existing = await this.repo.getPostMortemByTradeAndVersion(tradeId, learningVersion);
    if (existing) {
      // Return existing learning record without re-triggering AI generation
      return existing;
    }

    // 2. Retrieve canonical trade record from PostgreSQL
    const pos = await this.repo.getPositionById(tradeId);
    if (!pos) {
      throw new Error(`NONEXISTENT_TRADE: Trade ${tradeId} not found in database`);
    }

    if (pos.status !== 'CLOSED') {
      throw new Error(`OPEN_TRADE_LEARNING_REJECTED: Cannot create post-mortem for open trade ${tradeId}`);
    }

    // 3. Extract canonical database execution details
    const symbol = pos.symbol;
    const direction = pos.direction as 'BUY' | 'SELL';
    const entryPrice = Number(pos.entryPrice);
    const exitPrice = Number(pos.closePrice || payload.exitPrice || pos.currentPrice || pos.entryPrice);
    const stopLoss = Number(pos.stopLoss || 0);
    const takeProfit = Number(pos.takeProfit || 0);
    const pnlDollars = Number(pos.realizedProfit);
    const pnlPips = Number(pos.pnlPips || payload.pnlPips || 0);
    const isWin = pnlDollars >= 0;
    const outcome = isWin ? 'WIN' : 'LOSS';
    const cleanNotes = sanitizeUserNotes(userNotes || payload.userNotes);

    // 4. Generate Post-Mortem via AI Decision Engine using canonical DB data
    const reviewData = await aiDecisionEngine.createPostMortemFromCanonicalData({
      tradeId: pos.positionId,
      positionId: pos.positionId,
      symbol,
      direction,
      entryPrice,
      exitPrice,
      stopLoss,
      takeProfit,
      pnlDollars,
      pnlPips,
      outcome,
      cleanNotes
    });

    const recordId = `pm-${pos.positionId}-${learningVersion}`;

    const newReview: PostMortemReview = {
      id: recordId,
      tradeId: pos.positionId,
      positionId: pos.positionId,
      learningVersion,
      timestamp: Date.now(),
      pair: symbol as any,
      direction,
      entryPrice,
      exitPrice,
      stopLoss,
      takeProfit,
      pnlDollars,
      pnlPips,
      outcome,
      rootCauseMs: reviewData.rootCauseMs,
      rootCauseEn: reviewData.rootCauseEn,
      lessonLearnedMs: reviewData.lessonLearnedMs,
      lessonLearnedEn: reviewData.lessonLearnedEn,
      adaptiveRuleMs: reviewData.adaptiveRuleMs,
      adaptiveRuleEn: reviewData.adaptiveRuleEn,
      ratingScore: reviewData.ratingScore,
      proposalId: pos.proposalId || payload.proposalId,
      approvalId: pos.approvalId || payload.approvalId,
      strategyId: pos.strategyId || payload.strategyId || 'SMC_QUANT_V1',
      strategyVersion: pos.strategyVersion || payload.strategyVersion || '1.0'
    };

    // 5. Persist resulting learning record into PostgreSQL
    const savedRecord = await this.repo.savePostMortemReview({
      id: recordId,
      tradeId: pos.positionId,
      learningVersion,
      review: newReview
    });

    // 6. Audit Trail Event
    await this.repo.saveTradeEvent({
      id: `evt_learn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      tradeId: pos.positionId,
      setupId: pos.setupId,
      eventType: 'TRADE_LEARNING_CREATED',
      actor: 'LEARNING_SERVICE',
      details: {
        tradeId: pos.positionId,
        learningRecordId: recordId,
        learningVersion,
        strategyId: pos.strategyId || 'SMC_QUANT_V1',
        strategyVersion: pos.strategyVersion || '1.0',
        timestamp: new Date().toISOString()
      }
    });

    // 7. Update in-memory cache
    aiDecisionEngine.addPostMortemReview(savedRecord);

    return savedRecord;
  }
}

export const learningService = LearningService.getInstance();
