import express, { Request, Response } from 'express';
import cors from 'cors';
import { logger, config, errorHandler } from '@iati/core';
import { MarketDataService } from './services/marketDataService';

const app = express();
const PORT = Number(config.PORT) || 3001;
const service = new MarketDataService();

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'market-data', timestamp: new Date().toISOString() });
});

app.get('/api/v1/market-data/candles/:symbol', async (req: Request, res: Response, next) => {
  try {
    const symbolStr = (req.params.symbol as string).toUpperCase();
    const timeframe = (req.query.timeframe as string) || '1h';
    const candles = await service.getCandles(symbolStr, timeframe);
    res.json({ symbol: symbolStr, timeframe, count: candles.length, data: candles });
  } catch (err) {
    next(err);
  }
});

app.post('/api/v1/market-data/ingest', async (req: Request, res: Response, next) => {
  try {
    const { symbol, timeframe = '1h', count = 50 } = req.body;
    if (!symbol) {
      res.status(400).json({ error: 'Symbol is required' });
      return;
    }
    const candles = await service.ingestCandles(symbol, timeframe, count);
    res.json({ success: true, symbol, timeframe, ingestedCount: candles.length });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`📈 Market Data Service running on port ${PORT}`);
  });
}

export { app, service };
