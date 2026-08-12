import { Router, Request, Response } from 'express';

export const journalRouter = Router();

export const journalEntries: any[] = [];
export const postMortemReviews: any[] = [];

journalRouter.get('/forex/journal', (req: Request, res: Response) => {
  res.json({ entries: journalEntries });
});

journalRouter.post('/forex/journal', (req: Request, res: Response) => {
  const entry = { id: `j_${Date.now()}`, ...req.body, createdAt: Date.now() };
  journalEntries.unshift(entry);
  res.json({ success: true, entry });
});

journalRouter.get('/forex/post-mortem-lessons', (req: Request, res: Response) => {
  res.json({ reviews: postMortemReviews });
});

journalRouter.post('/forex/post-mortem', (req: Request, res: Response) => {
  const review = { id: `pm_${Date.now()}`, ...req.body, createdAt: Date.now() };
  postMortemReviews.unshift(review);
  res.json({ success: true, review });
});
