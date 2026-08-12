import express, { Request, Response } from 'express';
import cors from 'cors';
import { logger, config, errorHandler } from '@iati/core';
import { globalEventBus, EventTypes, IEvent } from '@iati/event-bus';
import { RiskClearedPayload } from '@iati/core-types';
import { ExecutionRouter } from './router/executionRouter';
import { PaperBrokerAdapter } from './adapters/paperBrokerAdapter';

const app = express();
const PORT = Number(config.PORT) || 3005;

app.use(cors());
app.use(express.json());

export const executionRouter = new ExecutionRouter();

export class ExecutionService {
  async processRiskCleared(payload: RiskClearedPayload): Promise<void> {
    try {
      await executionRouter.handleRiskCleared(payload);
    } catch (err) {
      logger.error(`[EXECUTION-SERVICE] Failed to process RiskCleared:`, err);
    }
  }
}

export const executionService = new ExecutionService();

// Subscribe to RiskCleared Event
globalEventBus.subscribe(EventTypes.RiskCleared, async (event: IEvent<RiskClearedPayload>) => {
  logger.info(`[EXECUTION-SERVICE] Received RiskCleared for ${event.payload.symbol}`);
  await executionService.processRiskCleared(event.payload);
});

// REST Endpoints
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'execution-router', timestamp: new Date().toISOString() });
});

app.get('/api/execution/orders', (req: Request, res: Response) => {
  const orders = executionRouter.orderManager.getAllOrders();
  res.json({ count: orders.length, orders });
});

app.get('/api/execution/positions', async (req: Request, res: Response) => {
  const paperBroker = executionRouter.brokerAdapters.get(executionRouter.defaultBrokerId) as PaperBrokerAdapter;
  const positions = paperBroker ? paperBroker.positionManager.getAllPositions() : [];
  res.json({ count: positions.length, positions });
});

app.get('/api/execution/performance', async (req: Request, res: Response) => {
  const paperBroker = executionRouter.brokerAdapters.get(executionRouter.defaultBrokerId) as PaperBrokerAdapter;
  const accountStatus = paperBroker ? await paperBroker.getAccountStatus() : undefined;
  const orders = executionRouter.orderManager.getAllOrders();
  const filledCount = orders.filter(o => o.status === 'FILLED').length;
  const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;

  res.json({
    account_status: accountStatus,
    metrics: {
      total_orders: orders.length,
      filled_orders: filledCount,
      rejected_orders: rejectedCount,
      average_slippage_pips: paperBroker ? paperBroker.simulationEngine.getSlippageEngine().getAverageSlippagePips() : 0
    }
  });
});

app.post('/api/execution/order', async (req: Request, res: Response) => {
  const payload = req.body as RiskClearedPayload;

  if (!payload || !payload.approval_id || !payload.trade_proposal) {
    res.status(400).json({ error: 'Valid RiskCleared payload with approval_id and trade_proposal required' });
    return;
  }

  try {
    const result = await executionRouter.handleRiskCleared(payload);
    res.json({ message: 'Execution order routed successfully', result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Execution error' });
  }
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`⚡ Execution Router & Paper Trading Engine running on port ${PORT}`);
  });
}

export { app };
