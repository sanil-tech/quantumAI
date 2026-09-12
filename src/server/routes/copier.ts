import { Router, Request, Response } from 'express';
import { multiClientCopierService } from '../services/multiClientCopierService';

export const copierRouter = Router();

/**
 * GET /api/copier/status
 */
copierRouter.get('/copier/status', (req: Request, res: Response) => {
  try {
    const status = multiClientCopierService.getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/subscribers
 */
copierRouter.get('/copier/subscribers', (req: Request, res: Response) => {
  try {
    const subscribers = multiClientCopierService.getSubscribers();
    res.json({ subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/subscribers/add
 */
copierRouter.post('/copier/subscribers/add', (req: Request, res: Response) => {
  try {
    const { name, email, accountNumber, ctidTraderAccountId, brokerName, environment, riskMode, initialBalance } = req.body;
    if (!name || !accountNumber) {
      return res.status(400).json({ error: 'Name and Account Number are required' });
    }

    const sub = multiClientCopierService.addSubscriber({
      name,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
      accountNumber,
      ctidTraderAccountId,
      brokerName: brokerName || 'Spotware cTrader Open API',
      environment: environment || 'DEMO',
      riskMode: riskMode || 'BALANCED',
      initialBalance: Number(initialBalance) || 10000
    });

    res.json({ success: true, subscriber: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/subscribers/toggle
 */
copierRouter.post('/api/copier/subscribers/toggle', (req: Request, res: Response) => {
  try {
    const { subscriberId } = req.body;
    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId is required' });
    }

    const sub = multiClientCopierService.toggleSubscriberStatus(subscriberId);
    if (!sub) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({ success: true, subscriber: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/subscribers/risk
 */
copierRouter.post('/copier/subscribers/risk', (req: Request, res: Response) => {
  try {
    const { subscriberId, riskMode } = req.body;
    if (!subscriberId || !riskMode) {
      return res.status(400).json({ error: 'subscriberId and riskMode are required' });
    }

    const sub = multiClientCopierService.updateSubscriberRisk(subscriberId, riskMode);
    if (!sub) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({ success: true, subscriber: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/copier/logs
 */
copierRouter.get('/copier/logs', (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = multiClientCopierService.getAuditLogs(limit);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/copier/master/toggle
 */
copierRouter.post('/copier/master/toggle', (req: Request, res: Response) => {
  try {
    const { active } = req.body;
    multiClientCopierService.setMasterStatus(Boolean(active));
    res.json({ success: true, masterActive: Boolean(active) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
