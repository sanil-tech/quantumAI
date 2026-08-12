import express, { Request, Response } from 'express';
import cors from 'cors';
import { logger, config, errorHandler, normalizeSymbol, validateCandleArray } from '@iati/core';
import { globalEventBus, EventTypes, IEvent } from '@iati/event-bus';
import { MarketDataUpdatedPayload, MarketState, MarketStateUpdatedPayload } from '@iati/core-types';
import { MarketFeatureEngine } from './features/featureEngine';
import { MarketStructureAnalyzer } from './structure/structureAnalyzer';
import { MarketRegimeEngine } from './regime/regimeEngine';

const app = express();
const PORT = Number(config.PORT) || 3002;

app.use(cors());
app.use(express.json());

const featureEngine = new MarketFeatureEngine();
const structureAnalyzer = new MarketStructureAnalyzer();
const regimeEngine = new MarketRegimeEngine();

// In-Memory state store and history
const marketStateStore = new Map<string, MarketState>();
const marketHistoryStore = new Map<string, MarketState[]>();

export class IntelligenceService {
  async processCandleUpdate(symbol: string, candles: any[]): Promise<MarketState> {
    const normSymbol = normalizeSymbol(symbol);
    const validation = validateCandleArray(candles);
    if (!validation.valid) {
      throw new Error(`INVALID_MARKET_DATA: Cannot process market data for ${normSymbol}: ${validation.reason}`);
    }

    const latestCandle = candles[candles.length - 1];
    const rawTime = latestCandle.time !== undefined ? latestCandle.time : latestCandle.timestamp;
    const candleTimeMs = rawTime instanceof Date
      ? rawTime.getTime()
      : typeof rawTime === 'number'
        ? (rawTime < 1e11 ? rawTime * 1000 : rawTime)
        : Date.now();

    // Out-of-order check against stored latest state
    const existingState = marketStateStore.get(normSymbol);
    if (existingState && existingState.timestamp) {
      const existingMs = new Date(existingState.timestamp).getTime();
      if (candleTimeMs < existingMs) {
        logger.warn(`[INTELLIGENCE] Dropping out-of-order market data update for ${normSymbol}`);
        return existingState;
      }
    }

    const features = featureEngine.extractAllFeatures(candles);
    const structure = structureAnalyzer.analyzeStructure(candles);
    const marketState = regimeEngine.generateMarketState(normSymbol, features, structure);

    marketState.symbol = normSymbol;
    marketState.timestamp = new Date(candleTimeMs);

    // Save to store
    marketStateStore.set(normSymbol, marketState);
    const history = marketHistoryStore.get(normSymbol) || [];
    history.push(marketState);
    if (history.length > 200) history.shift();
    marketHistoryStore.set(normSymbol, history);

    // Publish event
    const eventPayload: MarketStateUpdatedPayload = {
      symbol: normSymbol,
      market_state: marketState,
      regime: marketState.regime.regime,
      confidence: marketState.confidence,
      timestamp: new Date(candleTimeMs)
    };

    await globalEventBus.publish({
      id: `intel-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: EventTypes.MarketStateUpdated,
      timestamp: new Date(candleTimeMs),
      payload: eventPayload
    });

    return marketState;
  }

  getLatestState(symbol: string): MarketState | undefined {
    return marketStateStore.get(symbol);
  }

  getHistory(symbol: string): MarketState[] {
    return marketHistoryStore.get(symbol) || [];
  }
}

export const intelligenceService = new IntelligenceService();

// Subscribe to MarketDataUpdated Event Bus
globalEventBus.subscribe(EventTypes.MarketDataUpdated, async (event: IEvent<MarketDataUpdatedPayload>) => {
  try {
    const { symbol, candle } = event.payload;
    logger.info(`[INTELLIGENCE] Received MarketDataUpdated for ${symbol}`);
    await intelligenceService.processCandleUpdate(symbol, [candle]);
  } catch (err) {
    logger.error(`[INTELLIGENCE] Error processing market data update:`, err);
  }
});

// REST Endpoints
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'intelligence', timestamp: new Date().toISOString() });
});

app.get('/api/intelligence/state/:symbol', (req: Request, res: Response) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const state = intelligenceService.getLatestState(symbol);
  if (!state) {
    res.status(404).json({ error: `Market state not found for symbol: ${symbol}` });
    return;
  }
  res.json({ symbol, state });
});

app.get('/api/intelligence/regime/:symbol', (req: Request, res: Response) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const state = intelligenceService.getLatestState(symbol);
  if (!state) {
    res.status(404).json({ error: `Regime not found for symbol: ${symbol}` });
    return;
  }
  res.json({ symbol, regime: state.regime, confidence: state.confidence, evidence: state.evidence });
});

app.get('/api/intelligence/history/:symbol', (req: Request, res: Response) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const history = intelligenceService.getHistory(symbol);
  res.json({ symbol, count: history.length, history });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🧠 Market Intelligence Engine running on port ${PORT}`);
  });
}

export { app };
