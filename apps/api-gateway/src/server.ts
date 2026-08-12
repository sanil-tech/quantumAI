import express, { Request, Response } from 'express';
import cors from 'cors';
import { logger, config, errorHandler } from '@iati/core';
import { checkDbConnection } from '@iati/database';
import { getCacheClient } from '@iati/cache';

const app = express();
const PORT = Number(config.PORT) || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  const dbStatus = await checkDbConnection();
  
  let redisStatus = false;
  try {
    const redis = await getCacheClient();
    await redis.ping();
    redisStatus = true;
  } catch (e) {
    redisStatus = false;
  }

  res.status(dbStatus && redisStatus ? 200 : 503).json({
    status: dbStatus && redisStatus ? 'ok' : 'degraded',
    services: {
      api: 'ok',
      database: dbStatus ? 'ok' : 'disconnected',
      cache: redisStatus ? 'ok' : 'disconnected',
    },
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 API Gateway running on port ${PORT} in ${config.NODE_ENV} mode`);
});
