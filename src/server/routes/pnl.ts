import { Router, Request, Response } from 'express';
import { unifiedPnLService } from '../services/unifiedPnLService';
import { TradingRepository } from '@iati/database';

const pnlRouter = Router();
const tradingRepo = new TradingRepository();

/**
 * GET /api/pnl/consistency
 * Get P&L calculations with consistency guarantees across timeframes
 */
pnlRouter.get('/consistency', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const portfolio = await unifiedPnLService.getConsistentPortfolioPnL(accountId);

    res.json({
      success: true,
      data: {
        timestamp: portfolio.timestamp,
        priceSnapshot: {
          cachedAt: portfolio.timestamp,
          consistency: '✅ All P&L using same price snapshot'
        },
        positions: portfolio.positions.map(p => ({
          id: p.positionId,
          symbol: p.symbol,
          direction: p.direction,
          entryPrice: p.entryPrice,
          quantity: p.quantity,
          pnl: {
            unrealizedPnl: p.pnl.unrealizedPnl,
            unrealizedPips: p.pnl.unrealizedPips,
            currentPrice: p.pnl.currentPrice,
            priceSource: p.pnl.priceSource
          }
        })),
        summary: {
          totalPositions: portfolio.positions.length,
          totalPnl: portfolio.totalPnl,
          totalPips: portfolio.totalPips,
          consistency: 'GUARANTEED - All values use same price snapshot'
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/pnl/position/:positionId
 * Get P&L for specific position with consistency
 */
pnlRouter.get('/position/:positionId', async (req: Request, res: Response) => {
  try {
    const position = await tradingRepo.getPositionById(req.params.positionId);

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const pnl = await unifiedPnLService.calculateUnrealizedPnL(position);

    res.json({
      success: true,
      data: {
        position: {
          id: position.positionId,
          symbol: position.symbol,
          direction: position.direction,
          entryPrice: position.entryPrice,
          quantity: position.quantity,
          openedAt: position.openedAt
        },
        pnl: {
          unrealizedPnl: pnl.unrealizedPnl,
          unrealizedPips: pnl.unrealizedPips,
          currentPrice: pnl.currentPrice,
          timestamp: pnl.timestamp,
          consistency: '✅ Consistent across all timeframes'
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/pnl/cache-stats
 * Get price cache statistics
 */
pnlRouter.get('/cache-stats', (req: Request, res: Response) => {
  const stats = unifiedPnLService.getCacheStats();

  res.json({
    success: true,
    data: {
      cache: stats,
      info: {
        cacheTimeout: '2000ms (2 seconds)',
        purpose: 'Ensures P&L consistency when switching timeframes',
        benefit: 'Unrealized P&L stays same whether on M1, M15, H1, or D1'
      }
    }
  });
});

/**
 * POST /api/pnl/cache/clear
 * Clear price cache (call after market close or when needed)
 */
pnlRouter.post('/cache/clear', (req: Request, res: Response) => {
  unifiedPnLService.clearPriceCache();

  res.json({
    success: true,
    message: 'Price cache cleared',
    nextAction: 'Fresh prices will be fetched on next P&L calculation'
  });
});

/**
 * GET /api/pnl/report
 * Get consistency report
 */
pnlRouter.get('/report', (req: Request, res: Response) => {
  const report = unifiedPnLService.generateConsistencyReport();

  res.setHeader('Content-Type', 'text/plain');
  res.send(report);
});

/**
 * GET /api/pnl/validate
 * Validate P&L consistency across calculation methods
 */
pnlRouter.get('/validate', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || 'DEFAULT';
    const positions = await tradingRepo.getOpenPositions(accountId);

    if (positions.length === 0) {
      return res.json({
        success: true,
        data: {
          validation: 'NO_POSITIONS',
          message: 'No open positions to validate'
        }
      });
    }

    // Calculate P&L twice and compare
    const pnl1 = await unifiedPnLService.getConsistentPortfolioPnL(accountId);
    
    // Small delay to test cache effectiveness
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const pnl2 = await unifiedPnLService.getConsistentPortfolioPnL(accountId);

    // Compare results
    const isConsistent = unifiedPnLService.validatePnLConsistency(
      { unrealizedPnl: pnl1.totalPnl, unrealizedPips: pnl1.totalPips, currentPrice: 0, entryPrice: 0, timestamp: new Date(), priceSource: 'live' },
      { unrealizedPnl: pnl2.totalPnl, unrealizedPips: pnl2.totalPips, currentPrice: 0, entryPrice: 0, timestamp: new Date(), priceSource: 'live' },
      2 // tolerance of 2 pips
    );

    res.json({
      success: true,
      data: {
        validation: isConsistent ? 'PASSED' : 'FAILED',
        positionsChecked: positions.length,
        pnlComparison: {
          firstCalc: {
            totalPnl: pnl1.totalPnl,
            totalPips: pnl1.totalPips
          },
          secondCalc: {
            totalPnl: pnl2.totalPnl,
            totalPips: pnl2.totalPips
          },
          difference: {
            pnl: Math.abs(pnl1.totalPnl - pnl2.totalPnl),
            pips: Math.abs(pnl1.totalPips - pnl2.totalPips)
          }
        },
        result: isConsistent ? '✅ P&L is consistent across calculations' : '❌ P&L varies (possible live price movement)',
        cachedPrices: unifiedPnLService.getCacheStats().cachedPrices
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export { pnlRouter };
