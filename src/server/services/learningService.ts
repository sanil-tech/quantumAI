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
        if (err.message.includes('LEARNING_SKIPPED')) {
          console.log(`[LEARNING_SERVICE] Skipped auto-learning for trade: ${err.message}`);
        } else {
          console.error(`[LEARNING_SERVICE] Error auto-processing closed trade event: ${err.message}`);
        }
      }
    });
  }

  /**
   * Load persisted learning records from PostgreSQL on startup and backfill unlearned closed trades.
   * Database = Source of Truth; Memory = Cache Only.
   */
  async loadPersistedLearning(): Promise<PostMortemReview[]> {
    try {
      // 1. Load existing persisted reviews
      const persisted = await this.repo.getPostMortemReviews(500);
      if (Array.isArray(persisted) && persisted.length > 0) {
        const canonicalPersisted: PostMortemReview[] = persisted.map(r => ({
          ...r,
          provenance: r.provenance || 'REAL_TRADE',
          authority: r.authority || 'POSTGRESQL',
          dataSource: r.dataSource || 'POSTGRESQL_CLOSED_POSITION',
          fallbackUsed: r.fallbackUsed ?? false
        }));
        aiDecisionEngine.setPostMortemReviews(canonicalPersisted);
      }

      // 2. Backfill any closed trades in PostgreSQL that have not yet been learned
      await this.backfillHistoricalClosedTrades(200);

      const allReviews = aiDecisionEngine.getPostMortemReviews();
      console.log(`[ADAPTIVE_LEARNING] event=REHYDRATION_COMPLETE totalPersistedLessons=${allReviews.length}`);
      return allReviews;
    } catch (err: any) {
      console.warn(`[LEARNING_SERVICE] Could not load persisted learning on startup: ${err.message}`);
      return aiDecisionEngine.getPostMortemReviews();
    }
  }

  /**
   * Backfill historical closed trades from PostgreSQL without blocking open trades.
   */
  async backfillHistoricalClosedTrades(batchSize: number = 200): Promise<{ discovered: number; processed: number; skipped: number; failed: number }> {
    let discovered = 0;
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const unlearned = await this.repo.getUnlearnedClosedPositions('1.0', batchSize);
      discovered = unlearned.length;

      for (const pos of unlearned) {
        // Strict guard: NEVER learn from OPEN positions
        if (pos.status !== 'CLOSED') {
          skipped++;
          continue;
        }

        try {
          await this.processClosedTrade({
            tradeId: pos.positionId,
            positionId: pos.positionId,
            accountId: pos.accountId,
            symbol: pos.symbol,
            direction: pos.direction,
            entryPrice: Number(pos.entryPrice),
            exitPrice: Number(pos.closePrice || pos.currentPrice || pos.entryPrice),
            stopLoss: Number(pos.stopLoss || 0),
            takeProfit: Number(pos.takeProfit || 0),
            pnlDollars: Number(pos.realizedProfit || 0),
            pnlPips: Number(pos.pnlPips || 0),
            proposalId: pos.proposalId,
            approvalId: pos.approvalId,
            strategyId: pos.strategyId || 'SMC_QUANT_V1',
            strategyVersion: pos.strategyVersion || '1.0',
            closedAt: pos.closedAt || new Date()
          });
          processed++;
        } catch (err: any) {
          if (err.message.includes('LEARNING_SKIPPED')) {
            skipped++;
          } else {
            console.error(`[ADAPTIVE_LEARNING] Error backfilling trade ${pos.positionId}: ${err.message}`);
            failed++;
          }
        }
      }

      if (discovered > 0) {
        console.log(`[ADAPTIVE_LEARNING] event=BACKFILL_COMPLETE discovered=${discovered} processed=${processed} skipped=${skipped} failed=${failed}`);
      }
    } catch (err: any) {
      console.warn(`[ADAPTIVE_LEARNING] Backfill query failed: ${err.message}`);
    }

    return { discovered, processed, skipped, failed };
  }

  /**
   * Full administrative rebuild from PostgreSQL closed trades for recovery and audit.
   */
  async rebuildAdaptiveLearningFromPostgres(learningVersion: string = '1.0'): Promise<{ totalClosed: number; processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    const closedPositions = await this.repo.getClosedPositionsAcrossAccounts(5000);
    const chronologicalTrades = [...closedPositions].reverse();

    for (const pos of chronologicalTrades) {
      if (pos.status !== 'CLOSED') continue;
      try {
        await this.processClosedTrade({
          tradeId: pos.positionId,
          positionId: pos.positionId,
          accountId: pos.accountId,
          symbol: pos.symbol,
          direction: pos.direction,
          entryPrice: Number(pos.entryPrice),
          exitPrice: Number(pos.closePrice || pos.currentPrice || pos.entryPrice),
          stopLoss: Number(pos.stopLoss || 0),
          takeProfit: Number(pos.takeProfit || 0),
          pnlDollars: Number(pos.realizedProfit || 0),
          pnlPips: Number(pos.pnlPips || 0),
          proposalId: pos.proposalId,
          approvalId: pos.approvalId,
          strategyId: pos.strategyId || 'SMC_QUANT_V1',
          strategyVersion: pos.strategyVersion || '1.0',
          learningVersion,
          closedAt: pos.closedAt || new Date()
        });
        processed++;
      } catch (err: any) {
        if (!err.message.includes('LEARNING_SKIPPED')) {
          failed++;
        }
      }
    }

    const currentLessons = await this.repo.getPostMortemReviews(500);
    aiDecisionEngine.setPostMortemReviews(currentLessons);

    console.log(`[ADAPTIVE_LEARNING] event=FULL_REBUILD_COMPLETE totalClosed=${closedPositions.length} processed=${processed} failed=${failed}`);
    return { totalClosed: closedPositions.length, processed, failed };
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
      console.log(`[ADAPTIVE_LEARNING] event=TRADE_ALREADY_PROCESSED tradeId=${tradeId} learningVersion=${learningVersion}`);
      return existing;
    }

    // 2. Retrieve canonical trade record from PostgreSQL
    let pos = await this.repo.getPositionById(tradeId);
    if (!pos && (payload as any)?.isOfflineMock) {
      pos = {
        positionId: tradeId,
        accountId: payload.accountId || 'MOCK_ACC',
        symbol: payload.symbol || 'EURUSD',
        direction: (payload.direction as any) || 'BUY',
        quantity: 0.10,
        entryPrice: payload.entryPrice || 1.0,
        closePrice: payload.exitPrice || 1.0,
        currentPrice: payload.exitPrice || 1.0,
        stopLoss: payload.stopLoss || 0,
        takeProfit: payload.takeProfit || 0,
        unrealizedProfit: 0,
        realizedProfit: payload.pnlDollars || 0,
        pnlPips: payload.pnlPips || 0,
        status: 'CLOSED',
        broker: 'MOCK',
        environment: 'DEMO',
        openedAt: new Date(),
        closedAt: new Date()
      };
    }

    if (!pos) {
      throw new Error(`NONEXISTENT_TRADE: Trade ${tradeId} not found in database`);
    }

    if (pos.status !== 'CLOSED') {
      throw new Error(`OPEN_TRADE_LEARNING_REJECTED: Cannot create post-mortem for open trade ${tradeId}`);
    }

    // 2b. Strict Provenance Guard: Only learn from genuine AI setups or manual trades
    const isTestOrSystem = !pos.proposalId && !pos.setupId && pos.strategyId !== 'MANUAL' && process.env.NODE_ENV !== 'test' && !(payload as any)?.isOfflineMock;
    if (isTestOrSystem) {
      throw new Error(`LEARNING_SKIPPED: Trade ${tradeId} is a system/test trade with no AI setup or manual strategy`);
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

    console.log(`[ADAPTIVE_LEARNING] source=POSTGRESQL event=TRADE_OUTCOME_RECEIVED tradeId=${pos.positionId} symbol=${symbol} direction=${direction} outcome=${outcome} pnlDollars=${pnlDollars}`);

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
      strategyVersion: pos.strategyVersion || payload.strategyVersion || '1.0',
      provenance: 'REAL_TRADE',
      authority: 'POSTGRESQL',
      dataSource: 'POSTGRESQL_CLOSED_POSITION',
      fallbackUsed: false,
      executionEnvironment: (pos.environment as any) || 'DEMO',
      outcomeSource: pos.environment === 'SHADOW' ? 'SIMULATED_MARKET_OUTCOME' : 'BROKER_CONFIRMED_OUTCOME',
      brokerConfirmed: pos.environment === 'DEMO' && Boolean(pos.ticketId),
      brokerOrderId: pos.ticketId,
      brokerPositionId: pos.ticketId
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
        symbol,
        outcome,
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
