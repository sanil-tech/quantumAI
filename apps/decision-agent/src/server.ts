import express, { Request, Response } from 'express';
import cors from 'cors';
import { logger, config, errorHandler } from '@iati/core';
import { globalEventBus, EventTypes, IEvent } from '@iati/event-bus';
import { MarketStateUpdatedPayload, TradeProposal, TradeProposedPayload } from '@iati/core-types';
import { ChiefDecisionAgent } from './chiefAgent';

const app = express();
const PORT = Number(config.PORT) || 3003;

app.use(cors());
app.use(express.json());

const chiefAgent = new ChiefDecisionAgent();

const decisionStore = new Map<string, TradeProposal>();
const decisionHistory = new Map<string, TradeProposal[]>();

export class DecisionService {
  async processMarketStateUpdate(payload: MarketStateUpdatedPayload): Promise<TradeProposal> {
    const proposal = await chiefAgent.evaluateMarketState(payload.market_state);

    // Save to store
    decisionStore.set(payload.symbol, proposal);
    const history = decisionHistory.get(payload.symbol) || [];
    history.push(proposal);
    if (history.length > 200) history.shift();
    decisionHistory.set(payload.symbol, history);

    // Publish TradeProposed Event
    const eventPayload: TradeProposedPayload = {
      symbol: payload.symbol,
      direction: proposal.direction,
      confidence: proposal.confidence,
      evidence: proposal.evidence,
      trade_proposal: proposal,
      timestamp: new Date()
    };

    await globalEventBus.publish({
      id: `evt-proposal-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: EventTypes.TradeProposed,
      timestamp: new Date(),
      payload: eventPayload
    });

    return proposal;
  }

  getLatestProposal(symbol: string): TradeProposal | undefined {
    return decisionStore.get(symbol);
  }

  getHistory(symbol: string): TradeProposal[] {
    return decisionHistory.get(symbol) || [];
  }
}

export const decisionService = new DecisionService();

// Subscribe to MarketStateUpdated Event Bus
globalEventBus.subscribe(EventTypes.MarketStateUpdated, async (event: IEvent<MarketStateUpdatedPayload>) => {
  try {
    const { symbol } = event.payload;
    logger.info(`[DECISION-AGENT] Received MarketStateUpdated for ${symbol}`);
    await decisionService.processMarketStateUpdate(event.payload);
  } catch (err) {
    logger.error(`[DECISION-AGENT] Error processing market state update:`, err);
  }
});

// REST Endpoints
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'decision-agent', timestamp: new Date().toISOString() });
});

app.get('/api/decision/:symbol', (req: Request, res: Response) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const proposal = decisionService.getLatestProposal(symbol);
  if (!proposal) {
    res.status(404).json({ error: `No trade decision found for symbol: ${symbol}` });
    return;
  }
  res.json({ symbol, decision: proposal });
});

app.get('/api/decision/history/:symbol', (req: Request, res: Response) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const history = decisionService.getHistory(symbol);
  res.json({ symbol, count: history.length, history });
});

app.get('/api/agents/status', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    total_agents: 5,
    agents: [
      { id: 'agent-trend', name: 'Trend Analysis Agent', weight: 0.25, status: 'ONLINE' },
      { id: 'agent-structure', name: 'Market Structure Agent', weight: 0.25, status: 'ONLINE' },
      { id: 'agent-momentum', name: 'Momentum Oscillators Agent', weight: 0.20, status: 'ONLINE' },
      { id: 'agent-liquidity', name: 'Liquidity & Microstructure Agent', weight: 0.15, status: 'ONLINE' },
      { id: 'agent-forecast', name: 'Probabilistic Forecast Agent', weight: 0.15, status: 'ONLINE' }
    ]
  });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🤖 Multi-Agent AI Decision Engine running on port ${PORT}`);
  });
}

export { app };
