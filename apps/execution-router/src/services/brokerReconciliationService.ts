import { TradingRepository, PositionRecord } from '@iati/database';
import { ExecutionRouter } from '../router/executionRouter';
import { CTraderAdapter } from '../adapters/ctraderAdapter';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { ctraderMarketDataFeedService } from '../../../../src/server/services/ctraderMarketDataFeedService';
import { CTraderSymbolRegistry } from '../../../../src/integrations/ctrader/ctraderSymbolService';

export type ReconciliationStatus = 'MATCHED' | 'BROKER_ONLY' | 'DATABASE_ONLY' | 'DIVERGED' | 'AUTO_HEALED';

export interface PositionReconciliationResult {
  symbol: string;
  brokerPositionId?: string;
  databasePositionId?: string;
  status: ReconciliationStatus;
  details: {
    brokerVolume?: number;
    databaseVolume?: number;
    brokerDirection?: string;
    databaseDirection?: string;
    brokerEntryPrice?: number;
    databaseEntryPrice?: number;
    discrepancyReason?: string;
  };
}

export interface BrokerReconciliationReport {
  timestamp: Date;
  environment: string;
  totalBrokerPositions: number;
  totalDatabasePositions: number;
  matchedCount: number;
  brokerOnlyCount: number;
  databaseOnlyCount: number;
  divergedCount: number;
  status: 'MATCHED' | 'DIVERGENCE_DETECTED';
  results: PositionReconciliationResult[];
}

export class BrokerReconciliationService {
  private static instance: BrokerReconciliationService;
  private isReconciling: boolean = false;
  private latestReport: BrokerReconciliationReport = {
    timestamp: new Date(),
    environment: 'DEMO',
    totalBrokerPositions: 0,
    totalDatabasePositions: 0,
    matchedCount: 0,
    brokerOnlyCount: 0,
    databaseOnlyCount: 0,
    divergedCount: 0,
    status: 'MATCHED',
    results: []
  };

  public constructor(
    private executionRouter: ExecutionRouter = new ExecutionRouter(),
    private tradingRepo: TradingRepository = new TradingRepository()
  ) {}

  public static getInstance(
    executionRouter?: ExecutionRouter,
    tradingRepo?: TradingRepository
  ): BrokerReconciliationService {
    if (!BrokerReconciliationService.instance || (executionRouter && tradingRepo)) {
      BrokerReconciliationService.instance = new BrokerReconciliationService(executionRouter, tradingRepo);
    }
    return BrokerReconciliationService.instance;
  }

  public getLatestReport(): BrokerReconciliationReport {
    return this.latestReport;
  }

  public async reconcile(accountId: string = '5877246_DEMO'): Promise<BrokerReconciliationReport> {
    if (this.isReconciling) return this.latestReport;
    this.isReconciling = true;

    try {
      // 1. Fetch broker positions directly from live singleton feed or cTrader adapter
      let brokerPositions: any[] = [];
      let brokerInstance: CTraderAdapter | undefined;
      let brokerFetched = false;
      try {
        const rawFeedPositions = await ctraderMarketDataFeedService.fetchRawOpenPositions().catch(() => null);
        if (Array.isArray(rawFeedPositions)) {
          brokerFetched = true;
          if (rawFeedPositions.length > 0) {
            brokerPositions = rawFeedPositions.map((p: any) => {
            const symId = Number(p.tradeData?.symbolId ?? p.symbolId ?? 1);
            const symSpec = CTraderSymbolRegistry.getSymbolById(symId);
            const rawName = symSpec?.symbolName || (
              symId === 1 ? 'EURUSD' :
              symId === 2 ? 'GBPUSD' :
              symId === 3 ? 'EURJPY' :
              symId === 4 ? 'USDJPY' :
              symId === 5 ? 'AUDUSD' :
              symId === 6 ? 'USDCHF' :
              symId === 7 ? 'GBPJPY' :
              symId === 8 ? 'USDCAD' :
              symId === 12 ? 'NZDUSD' :
              symId === 41 ? 'XAUUSD' : 'EURUSD'
            );
            const formattedSymbol = rawName.includes('/') ? rawName : (rawName.length === 6 ? `${rawName.slice(0, 3)}/${rawName.slice(3)}` : rawName);
            const rawVol = Number(p.tradeData?.volume ?? p.volume ?? 100000);
            const quantity = rawVol >= 100000 ? Number((rawVol / 10000000).toFixed(2)) : (rawVol >= 10 ? Number((rawVol / 100000).toFixed(2)) : rawVol);
            const tradeSide = (p.tradeData?.tradeSide ?? p.tradeSide) === 1 ? 'BUY' : 'SELL';
            const entryPrice = Number(p.price ?? p.tradeData?.entryPrice ?? p.entryPrice ?? 0);
            const posId = String(p.positionId ?? p.tradeData?.positionId);

            return {
              position_id: posId,
              ticketId: posId,
              brokerPositionId: posId,
              symbol: formattedSymbol,
              direction: tradeSide,
              quantity: quantity || 0.01,
              entry_price: entryPrice,
              stop_loss: Number(p.stopLoss || 0),
              take_profit: Number(p.takeProfit || 0),
              status: 'OPEN'
            };
          });
          }
        }

        if (brokerPositions.length === 0 && !brokerFetched) {
          const broker = (this.executionRouter.getBroker('ctrader-broker-01') as CTraderAdapter | undefined) 
            || new CTraderAdapter({ accountId: accountId || '48282756' });
          brokerInstance = broker;
          if (!broker.isConnected()) {
            await broker.connect().catch(() => {});
          }
          const livePositions = await broker.getPositions();
          if (Array.isArray(livePositions)) {
            brokerFetched = true;
            brokerPositions = livePositions.map(p => ({
              position_id: String(p.position_id),
              ticketId: String(p.position_id),
              brokerPositionId: String(p.position_id),
              symbol: p.symbol,
              direction: p.direction,
              quantity: typeof p.quantity === 'number' ? p.quantity : 0.01,
              entry_price: p.entry_price,
              stop_loss: p.stop_loss || 0,
              take_profit: p.take_profit || 0,
              status: 'OPEN'
            }));
          }
        }
      } catch (adapterErr: any) {
        console.warn('[BrokerReconciliation] cTrader getPositions error:', adapterErr.message);
      }

      // Query database open positions across demo accounts
      const dbRes = await this.tradingRepo.query(`SELECT * FROM positions WHERE status = 'OPEN' ORDER BY opened_at DESC`).catch(() => ({ rows: [] }));
      const dbPositions = dbRes.rows.map(r => this.tradingRepo.mapPositionRow(r));

      const results: PositionReconciliationResult[] = [];
      const brokerMatchedSet = new Set<string>();
      const dbMatchedSet = new Set<string>();

      // 1. Cross-reference DB positions against broker positions
      for (const dbPos of dbPositions) {
        const dbTicket = String(dbPos.ticketId || dbPos.brokerPositionId || dbPos.positionId.replace('trade_', ''));
        // Match strictly by unique numeric cTrader ticket / positionId
        const match = brokerPositions.find(
          bp => String(bp.position_id) === dbTicket ||
                String(bp.ticketId) === dbTicket ||
                String(bp.brokerPositionId) === dbTicket
        );

        if (match) {
          brokerMatchedSet.add(match.position_id);
          dbMatchedSet.add(dbPos.positionId);

          // DB Symbol & Entry Price Parity Auto-Correction: if DB holds mis-mapped symbol/entry, sync from cTrader truth!
          if (match.symbol && (dbPos.symbol !== match.symbol || Math.abs(dbPos.entryPrice - match.entry_price) > 0.001)) {
            console.log(`🛡️ [BrokerReconciliation] Symbol/Price discrepancy on ticket #${match.position_id}: DB was (${dbPos.symbol} @ ${dbPos.entryPrice}), correcting to cTrader truth (${match.symbol} @ ${match.entry_price}).`);
            await this.tradingRepo.query(
              `UPDATE positions SET symbol = $1, entry_price = $2, current_price = $2, updated_at = NOW() WHERE position_id = $3 OR ticket_id = $3`,
              [match.symbol, match.entry_price, dbPos.positionId]
            ).catch(() => {});
            dbPos.symbol = match.symbol;
            dbPos.entryPrice = match.entry_price;
          }

          const volumeDiff = Math.abs(match.quantity - dbPos.quantity);
          const priceDiff = Math.abs(match.entry_price - dbPos.entryPrice);
          const isDiverged = volumeDiff > 0.001 || (match.direction !== dbPos.direction);

          // === ACTIVE SL/TP PROTECTION & SELF-HEALING GUARD ===
          const symClean = (dbPos.symbol || match.symbol || '').replace('/', '').toUpperCase();
          const isJpy = symClean.includes('JPY');
          const isGold = symClean.includes('XAU') || symClean.includes('GOLD');
          const isNas = symClean.includes('NAS') || symClean.includes('TECH') || symClean.includes('USTEC');
          const isBtc = symClean.includes('BTC');
          const decimals = isJpy ? 3 : (isGold || isNas || isBtc) ? 2 : 5;
          const autoSl = isGold ? 20.0 : isJpy ? 0.35 : isBtc ? 500.0 : isNas ? 100.0 : 0.0030;
          const autoTp = isGold ? 40.0 : isJpy ? 0.70 : isBtc ? 1000.0 : isNas ? 200.0 : 0.0060;
          const minBuffer = isGold ? 2.0 : isJpy ? 0.08 : 0.0008;

          // Detect missing SL on cTrader
          const isSlMissingOnBroker = !match.stop_loss || match.stop_loss <= 0;

          // Detect missing or out-of-regime TP (e.g. cross-pair contamination like EURJPY TP < 170.0)
          const isTpOutOfRegime = (!match.take_profit || match.take_profit <= 0) ||
            (symClean === 'EURJPY' && (match.take_profit < 170.0 || match.take_profit > 200.0)) ||
            (symClean === 'GBPJPY' && (match.take_profit < 195.0 || match.take_profit > 235.0)) ||
            (symClean === 'USDJPY' && (match.take_profit < 140.0 || match.take_profit > 175.0)) ||
            (isGold && (match.take_profit < 3000.0 || match.take_profit > 6000.0));

          let wasAutoHealed = false;

          if ((isSlMissingOnBroker || isTpOutOfRegime) && brokerInstance) {
            try {
              const liveTick = ctraderMarketDataFeedService.getLatestTick(dbPos.symbol as any) ||
                               ctraderMarketDataFeedService.getLatestTick(symClean as any);
              const liveAsk = liveTick?.ask && liveTick.ask > 0 ? liveTick.ask : match.entry_price;
              const liveBid = liveTick?.bid && liveTick.bid > 0 ? liveTick.bid : match.entry_price;

              let safeSl = match.stop_loss;
              let safeTp = match.take_profit;

              if (isSlMissingOnBroker) {
                if (match.direction === 'BUY') {
                  const maxAllowedBuySl = Math.min(match.entry_price - minBuffer, liveBid - minBuffer);
                  safeSl = Number((maxAllowedBuySl - autoSl).toFixed(decimals));
                } else {
                  const minAllowedSellSl = Math.max(match.entry_price + minBuffer, liveAsk + minBuffer);
                  safeSl = Number((minAllowedSellSl + autoSl).toFixed(decimals));
                }
              }

              if (isTpOutOfRegime) {
                if (match.direction === 'BUY') {
                  const minAllowedBuyTp = Math.max(match.entry_price + minBuffer, liveAsk + minBuffer);
                  safeTp = Number((minAllowedBuyTp + autoTp).toFixed(decimals));
                } else {
                  const maxAllowedSellTp = Math.min(match.entry_price - minBuffer, liveBid - minBuffer);
                  safeTp = Number((maxAllowedSellTp - autoTp).toFixed(decimals));
                }
              }

              console.log(`🛡️ [BrokerReconciliation-AutoHeal] Amending unprotected position #${match.position_id} (${dbPos.symbol}): SL=${safeSl}, TP=${safeTp}`);
              const amendOk = await brokerInstance.amendPositionSLTP(match.position_id, safeSl, safeTp);
              if (amendOk) {
                match.stop_loss = safeSl;
                match.take_profit = safeTp;
                wasAutoHealed = true;

                await this.tradingRepo.query(
                  `UPDATE positions SET stop_loss = $1, take_profit = $2, updated_at = NOW() WHERE position_id = $3 OR ticket_id = $3`,
                  [safeSl, safeTp, dbPos.positionId]
                ).catch(() => {});
                console.log(`✅ [BrokerReconciliation-AutoHeal] Position #${match.position_id} (${dbPos.symbol}) successfully healed on cTrader & DB.`);
              }
            } catch (healErr: any) {
              console.warn(`[BrokerReconciliation-AutoHeal] Error healing position #${match.position_id}:`, healErr.message);
            }
          }

          // DB volume parity check: if cTrader volume differs from DB, sync DB
          if (match.quantity > 0 && Math.abs(Number(dbPos.quantity) - match.quantity) > 0.001) {
            await this.tradingRepo.query(
              `UPDATE positions SET quantity = $1, updated_at = NOW() WHERE position_id = $2 OR ticket_id = $2`,
              [match.quantity, dbPos.positionId]
            ).catch(() => {});
            dbPos.quantity = match.quantity;
          }

          // DB TP parity check: if cTrader has valid TP but DB still holds contaminated TP, sync DB
          if (match.take_profit > 0 && !isTpOutOfRegime && Number(dbPos.takeProfit) !== match.take_profit) {
            await this.tradingRepo.query(
              `UPDATE positions SET take_profit = $1, updated_at = NOW() WHERE position_id = $2 OR ticket_id = $2`,
              [match.take_profit, dbPos.positionId]
            ).catch(() => {});
          }
          if (match.stop_loss > 0 && !isSlMissingOnBroker && Number(dbPos.stopLoss) !== match.stop_loss) {
            await this.tradingRepo.query(
              `UPDATE positions SET stop_loss = $1, updated_at = NOW() WHERE position_id = $2 OR ticket_id = $2`,
              [match.stop_loss, dbPos.positionId]
            ).catch(() => {});
          }

            results.push({
            symbol: dbPos.symbol,
            brokerPositionId: match.position_id,
            databasePositionId: dbPos.positionId,
            status: isDiverged ? 'DIVERGED' : wasAutoHealed ? 'AUTO_HEALED' : 'MATCHED',
            details: {
              brokerVolume: match.quantity,
              databaseVolume: dbPos.quantity,
              brokerDirection: match.direction,
              databaseDirection: dbPos.direction,
              brokerEntryPrice: match.entry_price,
              databaseEntryPrice: dbPos.entryPrice,
              discrepancyReason: isDiverged ? 'Volume or Direction mismatch detected' : (wasAutoHealed ? 'Unprotected SL/TP auto-healed' : undefined)
            }
          });
        } else if (brokerFetched || ctraderMarketDataFeedService.isConnected()) {
          // DATABASE_ONLY: Position was closed on broker (e.g. SL/TP hit or manual close)
          results.push({
            symbol: dbPos.symbol,
            databasePositionId: dbPos.positionId,
            status: 'DATABASE_ONLY',
            details: {
              databaseVolume: dbPos.quantity,
              databaseDirection: dbPos.direction,
              databaseEntryPrice: dbPos.entryPrice,
              discrepancyReason: 'Position closed on cTrader server side (SL/TP or manual close)'
            }
          });

          // Auto-reconcile closed position in database with live market exit price
          try {
            const symClean = dbPos.symbol.replace('/', '').toUpperCase();
            const liveTick = ctraderMarketDataFeedService.getLatestTick(dbPos.symbol as any) ||
                             ctraderMarketDataFeedService.getLatestTick(symClean as any);

            const liveSpot = (liveTick && (liveTick.bid > 0 || liveTick.ask > 0))
              ? (dbPos.direction === 'BUY' ? liveTick.bid : liveTick.ask)
              : (dbPos.currentPrice && dbPos.currentPrice > 0 ? dbPos.currentPrice : dbPos.entryPrice);

            const isJpy = symClean.includes('JPY');
            const isGold = symClean.includes('XAU') || symClean.includes('GOLD');
            const isBtc = symClean.includes('BTC');
            const isNas = symClean.includes('NAS') || symClean.includes('TECH') || symClean.includes('USTEC');

            const pipMultiplier = isJpy ? 0.01 : (isGold || isBtc || isNas) ? 1 : 0.0001;
            const priceDiff = dbPos.direction === 'BUY' ? (liveSpot - dbPos.entryPrice) : (dbPos.entryPrice - liveSpot);
            const pnlPips = Number((priceDiff / pipMultiplier).toFixed(1));
            const dollarPerPip = isGold ? 1.0 : (isBtc ? 1.0 : (isNas ? 1.0 : (isJpy ? 0.65 : 10.0)));
            const rawQty = typeof dbPos.quantity === 'number' && dbPos.quantity > 0 ? dbPos.quantity : 0.01;
            const effectiveLots = rawQty >= 1000 ? rawQty / 10000000 : (rawQty >= 10 ? rawQty / 100000 : rawQty);
            const realizedProfit = Number((pnlPips * dollarPerPip * effectiveLots).toFixed(2));

            await this.tradingRepo.query(
              `UPDATE positions 
               SET status = 'CLOSED', 
                   close_price = $1, 
                   realized_profit = $2, 
                   pnl_pips = $3, 
                   close_reason = $4, 
                   closed_at = COALESCE(closed_at, NOW()),
                   updated_at = NOW()
               WHERE position_id = $5 OR ticket_id = $5`,
              [liveSpot, realizedProfit, pnlPips, 'BROKER_SIDE_CLOSED', dbPos.positionId]
            ).catch(err => {
              console.warn(`[BrokerReconciliation] Update closed position error for ${dbPos.positionId}:`, err.message);
            });

            globalEventBus.publish<TradeClosedPayload>({
              type: EventTypes.TRADE_CLOSED,
              timestamp: new Date(),
              trade_id: dbPos.positionId,
              symbol: dbPos.symbol,
              direction: dbPos.direction as any,
              entry_price: dbPos.entryPrice,
              exit_price: liveSpot,
              pnl: realizedProfit,
              pnl_pips: pnlPips,
              close_reason: 'BROKER_SIDE_CLOSED',
              opened_at: dbPos.openedAt ? new Date(dbPos.openedAt) : new Date(),
              closed_at: new Date()
            });
          } catch (err: any) {
            console.warn(`[BrokerReconciliation] Reconcile close error for ${dbPos.positionId}:`, err.message);
          }
        }
      }

      // 2. Cross-reference remaining broker positions & Auto-persist to DB
      for (const bp of brokerPositions) {
        if (!brokerMatchedSet.has(bp.position_id)) {
          results.push({
            symbol: bp.symbol,
            brokerPositionId: bp.position_id,
            status: 'BROKER_ONLY',
            details: {
              brokerVolume: bp.quantity,
              brokerDirection: bp.direction,
              brokerEntryPrice: bp.entry_price,
              discrepancyReason: 'Position opened directly on cTrader - Auto-persisted to DB'
            }
          });

          // If broker position has no SL, auto-heal on broker before inserting into DB!
          if ((!bp.stop_loss || bp.stop_loss <= 0) && brokerInstance) {
            const symClean = (bp.symbol || '').replace('/', '').toUpperCase();
            const isJpy = symClean.includes('JPY');
            const isGold = symClean.includes('XAU') || symClean.includes('GOLD');
            const isNas = symClean.includes('NAS') || symClean.includes('TECH') || symClean.includes('USTEC');
            const isBtc = symClean.includes('BTC');
            const decimals = isJpy ? 3 : (isGold || isNas || isBtc) ? 2 : 5;
            const autoSl = isGold ? 20.0 : isJpy ? 0.35 : isBtc ? 500.0 : isNas ? 100.0 : 0.0030;
            const autoTp = isGold ? 40.0 : isJpy ? 0.70 : isBtc ? 1000.0 : isNas ? 200.0 : 0.0060;
            const minBuffer = isGold ? 2.0 : isJpy ? 0.08 : 0.0008;

            const safeSl = bp.direction === 'BUY'
              ? Number((bp.entry_price - (autoSl + minBuffer)).toFixed(decimals))
              : Number((bp.entry_price + (autoSl + minBuffer)).toFixed(decimals));
            const safeTp = bp.direction === 'BUY'
              ? Number((bp.entry_price + (autoTp + minBuffer)).toFixed(decimals))
              : Number((bp.entry_price - (autoTp + minBuffer)).toFixed(decimals));

            const healed = await brokerInstance.amendPositionSLTP(bp.position_id, safeSl, safeTp).catch(() => false);
            if (healed) {
              bp.stop_loss = safeSl;
              bp.take_profit = safeTp;
              console.log(`✅ [BrokerReconciliation-AutoHeal] Broker-only position #${bp.position_id} healed with SL=${safeSl}, TP=${safeTp}`);
            }
          }

          // Auto-persist live cTrader positions to PostgreSQL with authoritative broker synchronization
          try {
            await this.tradingRepo.query(`
              INSERT INTO positions (
                position_id, ticket_id, setup_id, account_id, symbol, direction, quantity,
                entry_price, current_price, stop_loss, take_profit, status, broker, environment, opened_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'OPEN', 'CTRADER', 'DEMO', NOW(), NOW())
              ON CONFLICT (position_id) DO UPDATE SET
                status = 'OPEN',
                close_reason = NULL,
                closed_at = NULL,
                close_price = NULL,
                realized_profit = NULL,
                current_price = EXCLUDED.current_price,
                stop_loss = EXCLUDED.stop_loss,
                take_profit = EXCLUDED.take_profit,
                updated_at = NOW()
            `, [
              `trade_${bp.position_id}`, bp.position_id, `cTrader_live_${(bp.symbol || '').replace('/', '')}_${bp.direction}`,
              accountId || '48282756', bp.symbol, bp.direction, bp.quantity, bp.entry_price,
              bp.entry_price, bp.stop_loss || 0, bp.take_profit || 0
            ]).catch(() => {});

            // Also restore matching ticket_id if it was previously falsely closed
            await this.tradingRepo.query(`
              UPDATE positions 
              SET status = 'OPEN', close_reason = NULL, closed_at = NULL, close_price = NULL, realized_profit = NULL, updated_at = NOW()
              WHERE ticket_id = $1 AND status != 'OPEN'
            `, [String(bp.position_id)]).catch(() => {});
          } catch (_) {}
        }
      }

      const matchedCount = results.filter(r => r.status === 'MATCHED' || r.status === 'AUTO_HEALED').length;
      const brokerOnlyCount = results.filter(r => r.status === 'BROKER_ONLY').length;
      const databaseOnlyCount = results.filter(r => r.status === 'DATABASE_ONLY').length;
      const divergedCount = results.filter(r => r.status === 'DIVERGED').length;

      this.latestReport = {
        timestamp: new Date(),
        environment: 'DEMO',
        totalBrokerPositions: brokerPositions.length,
        totalDatabasePositions: dbPositions.length,
        matchedCount,
        brokerOnlyCount,
        databaseOnlyCount,
        divergedCount,
        status: (brokerOnlyCount === 0 && databaseOnlyCount === 0 && divergedCount === 0) ? 'MATCHED' : 'DIVERGENCE_DETECTED',
        results
      };

      return this.latestReport;
    } finally {
      this.isReconciling = false;
    }
  }
}

export const brokerReconciliationService = BrokerReconciliationService.getInstance();
