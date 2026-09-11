import { Router, Request, Response } from 'express';
import { TradingRepository, PositionRecord } from '@iati/database';
import { learningService } from '../services/learningService';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';

export const manualTradesRouter = Router();
const repo = new TradingRepository();

/**
 * POST /api/forex/manual-entry
 * Records a manual trade execution to PostgreSQL for AI learning
 * Called from ChartWidget when user executes BUY/SELL
 */
manualTradesRouter.post('/forex/manual-entry', async (req: Request, res: Response) => {
  try {
    const {
      symbol,
      direction,
      plannedEntry,
      plannedStopLoss,
      plannedTakeProfit1,
      plannedTakeProfit2,
      actualEntry,
      positionSize,
      enteredAt,
      notes,
      aiConfidence,
      invalidationLevel,
      reasons
    } = req.body;

    if (!symbol || !direction || !actualEntry) {
      return res.status(400).json({
        success: false,
        error: 'symbol, direction, and actualEntry are required'
      });
    }

    // Create position record in PostgreSQL
    const positionId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const setupId = `manual_${symbol.replace('/', '')}_${Date.now()}`;

    const position: PositionRecord = {
      positionId,
      ticketId: positionId.replace('trade_', '').slice(0, 8),
      setupId,
      accountId: 'DEFAULT',
      symbol,
      direction,
      quantity: Number(positionSize || 0.1),
      entryPrice: Number(actualEntry),
      currentPrice: Number(actualEntry),
      stopLoss: Number(plannedStopLoss || 0),
      takeProfit: Number(plannedTakeProfit1 || 0),
      takeProfit2: Number(plannedTakeProfit2 || 0),
      unrealizedProfit: 0,
      realizedProfit: 0,
      pnlPips: 0,
      status: 'ACTIVE',
      broker: 'DEMO',
      environment: 'DEMO',
      source: 'MANUAL_USER_CHART_ENTRY',
      openedAt: enteredAt ? new Date(enteredAt) : new Date(),
      notes: `Manual Entry from Chart. AI Confidence: ${aiConfidence}%. Planned Entry: ${plannedEntry}. Reasons: ${Array.isArray(reasons) ? reasons.join(', ') : reasons}. Notes: ${notes}`
    };

    // Save to PostgreSQL
    const savedPosition = await repo.savePosition(position);

    // Save audit event
    await repo.saveTradeEvent({
      id: `evt_manual_entry_${Date.now()}`,
      tradeId: positionId,
      setupId,
      eventType: 'POSITION_OPENED',
      actor: 'ManualChartEntry',
      details: {
        source: 'ChartWidget',
        plannedEntry,
        plannedStopLoss,
        plannedTakeProfit1,
        actualEntry,
        aiConfidence,
        invalidationLevel
      }
    });

    res.json({
      success: true,
      message: 'Manual trade entry recorded to PostgreSQL for AI learning',
      trade: {
        manualTradeId: savedPosition.positionId,
        symbol,
        direction,
        actualEntry: Number(actualEntry),
        positionSize: Number(positionSize || 0.1),
        enteredAt: savedPosition.openedAt,
        status: 'ACTIVE'
      }
    });
  } catch (err: any) {
    console.error('Manual entry save error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to save manual trade entry'
    });
  }
});

/**
 * POST /api/forex/manual-entry/close
 * Closes a manual trade and records the outcome for AI learning
 */
manualTradesRouter.post('/forex/manual-entry/close', async (req: Request, res: Response) => {
  try {
    const { manualTradeId, exitPrice, exitReason, notes } = req.body;

    if (!manualTradeId || !exitPrice) {
      return res.status(400).json({
        success: false,
        error: 'manualTradeId and exitPrice are required'
      });
    }

    const position = await repo.getPositionById(manualTradeId);
    if (!position) {
      return res.status(404).json({
        success: false,
        error: `Position ${manualTradeId} not found`
      });
    }

    const exitPriceNum = Number(exitPrice);
    const priceDiff = position.direction === 'BUY'
      ? (exitPriceNum - position.entryPrice)
      : (position.entryPrice - exitPriceNum);

    const pipScale = position.symbol.includes('JPY') ? 100 : 10000;
    const pnlPips = Math.round(priceDiff * pipScale);
    const pnlDollars = Number((pnlPips * position.quantity * 10).toFixed(2));

    // Close position in database atomically
    const closeResult = await repo.closePositionTransaction({
      positionId: manualTradeId,
      closePrice: exitPriceNum,
      realizedProfit: pnlDollars,
      pnlPips,
      closeReason: exitReason || 'MANUAL_EXIT',
      accountId: 'DEFAULT'
    });

    // Save audit event
    await repo.saveTradeEvent({
      id: `evt_manual_close_${Date.now()}`,
      tradeId: manualTradeId,
      setupId: position.setupId,
      eventType: 'POSITION_CLOSED',
      actor: 'ManualChartEntry',
      details: {
        exitPrice: exitPriceNum,
        pnlDollars,
        pnlPips,
        exitReason,
        notes
      }
    });

    // Publish TradeClosed event for learning service
    const tradeClosedPayload: TradeClosedPayload = {
      tradeId: manualTradeId,
      positionId: manualTradeId,
      accountId: position.accountId || 'DEFAULT',
      symbol: position.symbol,
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice: exitPriceNum,
      stopLoss: position.stopLoss || 0,
      takeProfit: position.takeProfit || 0,
      pnlDollars,
      pnlPips,
      proposalId: position.setupId,
      environment: 'DEMO',
      closedAt: closeResult.position.closedAt || new Date()
    };

    // Trigger AI learning service (idempotent)
    await globalEventBus.publish({
      id: `evt_bus_manual_close_${Date.now()}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: tradeClosedPayload
    });

    try {
      await learningService.processClosedTrade(tradeClosedPayload);
    } catch (learnErr: any) {
      console.warn(`Learning service notice: ${learnErr.message}`);
    }

    res.json({
      success: true,
      message: 'Manual trade closed and recorded. AI learning triggered.',
      trade: {
        manualTradeId,
        exitPrice: exitPriceNum,
        pnlDollars,
        pnlPips,
        exitReason,
        closedAt: closeResult.position.closedAt
      }
    });
  } catch (err: any) {
    console.error('Manual close error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to close manual trade'
    });
  }
});

/**
 * GET /api/forex/manual-entries
 * Retrieves all manual trades for AI learning review
 */
manualTradesRouter.get('/forex/manual-entries', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const result = await repo.getPositions({
      accountId: 'DEFAULT',
      status: 'ALL',
      limit,
      offset
    });

    const manualTrades = result.positions.filter(p =>
      p.source === 'MANUAL_USER_CHART_ENTRY' || p.setupId?.includes('manual_')
    );

    res.json({
      success: true,
      count: manualTrades.length,
      trades: manualTrades
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
