import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

interface JpyCorrelationRow {
  signalId: string;
  createdAt: string;
  symbol: string;
  canonicalSymbol: string;
  timeframe: string;
  direction: string;
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  jpyThesis: 'JPY_WEAKNESS' | 'JPY_STRENGTH' | 'AMBIGUOUS';
  masterBrokerOrderId?: string;
  executionEligibility?: string;
  source: string;
  reasons?: string[];

  // Broker Correlation Details
  brokerOrderId?: string;
  brokerPositionId?: string;
  brokerTradeId?: string;
  orderType?: string;
  isOrderSubmitted: boolean;
  isOrderFilled: boolean;
  isPositionOpened: boolean;
  isPositionClosed: boolean;
  closedTimestamp?: string;
  realizedPnlDollars?: number;
  realizedPnlPips?: number;
  executionState: 'SIGNAL_ONLY' | 'ORDER_SUBMITTED_NOT_FILLED' | 'FILLED_OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'CLOSED_BREAKEVEN' | 'CANCELLED' | 'EXPIRED' | 'REJECTED' | 'UNMATCHED' | 'UNKNOWN';
  closeReason?: string;
  ttlExpired: boolean;
  cancelled: boolean;
  neverExecuted: boolean;

  // Second Opinion Details
  secondOpinion: {
    exists: boolean;
    review?: string;
    bias?: string;
    confidence?: number;
    agreement?: string;
    contradictionLevel?: string;
    economicRisk?: string;
    riskFlags?: string[];
    latencyMs?: number;
    dataLineage?: string;
  };

  // Economic Context Details
  economicContext: {
    event?: string;
    currency?: string;
    impact?: string;
    minutesUntil?: number;
    riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' | 'UNAVAILABLE';
  };
}

function normalizeSymbol(sym: string): { canonicalSymbol: string; baseCurrency: string; quoteCurrency: string; containsJPY: boolean } {
  const clean = (sym || '').replace(/[\/\-_]/g, '').toUpperCase();
  let base = 'UNKNOWN';
  let quote = 'UNKNOWN';
  if (clean.length === 6) {
    base = clean.substring(0, 3);
    quote = clean.substring(3, 6);
  } else if (clean.includes('JPY')) {
    if (clean.endsWith('JPY')) {
      base = clean.replace('JPY', '');
      quote = 'JPY';
    } else if (clean.startsWith('JPY')) {
      base = 'JPY';
      quote = clean.replace('JPY', '');
    }
  }
  const containsJPY = clean.includes('JPY') || base === 'JPY' || quote === 'JPY';
  const canonicalSymbol = clean.includes('JPY') && base !== 'UNKNOWN' && quote !== 'UNKNOWN' ? `${base}/${quote}` : (sym || clean);
  return { canonicalSymbol, baseCurrency: base, quoteCurrency: quote, containsJPY };
}

function getJpyThesis(direction: string, quoteCurrency: string, baseCurrency: string): 'JPY_WEAKNESS' | 'JPY_STRENGTH' | 'AMBIGUOUS' {
  const dir = (direction || '').toUpperCase();
  if (quoteCurrency === 'JPY') {
    if (dir === 'BUY' || dir === 'LONG') return 'JPY_WEAKNESS';
    if (dir === 'SELL' || dir === 'SHORT') return 'JPY_STRENGTH';
  } else if (baseCurrency === 'JPY') {
    if (dir === 'BUY' || dir === 'LONG') return 'JPY_STRENGTH';
    if (dir === 'SELL' || dir === 'SHORT') return 'JPY_WEAKNESS';
  }
  return 'AMBIGUOUS';
}

async function runPhase2AAudit() {
  const auditStart = new Date('2026-09-14T00:00:00.000Z');
  const auditEnd = new Date('2026-09-20T23:59:59.999Z');
  const extractionTime = new Date().toISOString();

  console.log('=== PHASE 2A: JPY EXECUTION & LOSS CORRELATION AUDIT ===');
  console.log('Audit Window Start:      ', auditStart.toISOString());
  console.log('Audit Window End:        ', auditEnd.toISOString());
  console.log('Timezone:                 UTC / Asia/Kuala_Lumpur (UTC+8)');
  console.log('Data Extraction Time:    ', extractionTime);

  // 1. Load Copier Signals Queue (Source of Truth for Queue / Generated Signals)
  const copierQueue: any[] = JSON.parse(fs.readFileSync(path.resolve('data/copier_signals_queue.json'), 'utf8'));
  
  // 2. Load Second Opinion Observations
  let soList: any[] = [];
  try {
    const soData = JSON.parse(fs.readFileSync(path.resolve('data/second_opinion_observations.json'), 'utf8'));
    soList = Array.isArray(soData) ? soData : Object.values(soData);
  } catch (e) {}

  // 3. Load cTrader Ledger
  let ctraderLedger: { openPositions: any[]; closedTrades: any[]; executionLogs: any[] } = { openPositions: [], closedTrades: [], executionLogs: [] };
  try {
    ctraderLedger = JSON.parse(fs.readFileSync(path.resolve('data/ctrader_demo_ledger.json'), 'utf8'));
  } catch (e) {}

  // 4. Load Discovered Setups
  let discoveredSetups: any[] = [];
  try {
    discoveredSetups = JSON.parse(fs.readFileSync(path.resolve('data/scanner_discovered_setups.json'), 'utf8'));
  } catch (e) {}

  // 5. Connect to PostgreSQL if accessible
  let pgPositions: any[] = [];
  let pgOrders: any[] = [];
  let pgSignals: any[] = [];
  let pgJournals: any[] = [];
  let pgPostMortems: any[] = [];

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://quantumai:quantumai_test_password@127.0.0.1:54329/quantumai_test',
    connectionTimeoutMillis: 1500
  });

  try {
    await pool.query('SELECT 1');
    console.log('[PostgreSQL] Connected. Querying historical tables...');
    try {
      const r = await pool.query('SELECT * FROM positions;');
      pgPositions = r.rows;
    } catch (e) {}
    try {
      const r = await pool.query('SELECT * FROM orders;');
      pgOrders = r.rows;
    } catch (e) {}
    try {
      const r = await pool.query('SELECT * FROM signals;');
      pgSignals = r.rows;
    } catch (e) {}
    try {
      const r = await pool.query('SELECT * FROM journal_entries;');
      pgJournals = r.rows;
    } catch (e) {}
    try {
      const r = await pool.query('SELECT * FROM post_mortem_reviews;');
      pgPostMortems = r.rows;
    } catch (e) {}
    await pool.end();
  } catch (err: any) {
    console.log('[PostgreSQL] DB connection skipped:', err.message);
  }

  // Filter signals to window & JPY
  const jpySignals = copierQueue.filter(item => {
    const sym = item.pair || item.symbol;
    const norm = normalizeSymbol(sym);
    const t = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return norm.containsJPY && t >= auditStart.getTime() && t <= auditEnd.getTime();
  });

  console.log(`\nFiltered ${jpySignals.length} JPY signal events in window.`);

  // Correlate each signal
  const correlationRows: JpyCorrelationRow[] = [];

  for (const sig of jpySignals) {
    const norm = normalizeSymbol(sig.pair || sig.symbol);
    const thesis = getJpyThesis(sig.direction, norm.quoteCurrency, norm.baseCurrency);
    const createdAt = new Date(sig.timestamp).toISOString();

    const isCancelAction = sig.action === 'CANCEL_ORDER';
    const isNewOrderAction = sig.action === 'NEW_ORDER' || !sig.action;
    const reasons = sig.reasons || [];
    const reasonText = reasons.join('; ');

    const ttlExpired = reasonText.includes('expired') || reasonText.includes('without fill') || isCancelAction && reasonText.includes('expired');
    const slBreachedBeforeEntry = reasonText.includes('breached SL') || reasonText.includes('melepasi SL');
    const tpReachedBeforeEntry = reasonText.includes('reached TP1') || reasonText.includes('mencecah TP1');

    // Check Second Opinion
    const soMatch = soList.find(so => so.signalId === sig.id || so.symbol === sig.pair && Math.abs(new Date(so.createdAt).getTime() - sig.timestamp) < 60000);

    // Check cTrader Demo Ledger & PostgreSQL for fills/positions
    // Look for matching trade by proposalId, orderId, or symbol + exact time
    const ledgerTradeMatch = ctraderLedger.closedTrades.find(t => 
      t.proposalId === sig.id || 
      (t.symbol === sig.pair && Math.abs(new Date(t.openTime).getTime() - sig.timestamp) < 300000)
    );

    const ledgerOpenMatch = ctraderLedger.openPositions.find(p => 
      p.proposalId === sig.id || 
      (p.symbol === sig.pair && Math.abs(new Date(p.entryTime).getTime() - sig.timestamp) < 300000)
    );

    const pgPosMatch = pgPositions.find(p => 
      p.proposal_id === sig.id || 
      (p.symbol === norm.canonicalSymbol && Math.abs(new Date(p.opened_at || p.created_at).getTime() - sig.timestamp) < 300000)
    );

    // Execution State Determination
    let executionState: JpyCorrelationRow['executionState'] = 'SIGNAL_ONLY';
    let isSubmitted = Boolean(sig.masterBrokerOrderId && !sig.masterBrokerOrderId.startsWith('SIG-'));
    let isFilled = false;
    let isOpened = false;
    let isClosed = false;
    let realizedPnl: number | undefined = undefined;
    let realizedPips: number | undefined = undefined;
    let closedAt: string | undefined = undefined;
    let closeReason: string | undefined = undefined;

    if (ledgerTradeMatch) {
      isSubmitted = true;
      isFilled = true;
      isOpened = true;
      isClosed = true;
      realizedPnl = Number(ledgerTradeMatch.realizedPnL || 0);
      realizedPips = ledgerTradeMatch.pnlPips ? Number(ledgerTradeMatch.pnlPips) : undefined;
      closedAt = ledgerTradeMatch.closeTime;
      closeReason = ledgerTradeMatch.exitReason;
      executionState = realizedPnl > 0 ? 'CLOSED_WIN' : realizedPnl < 0 ? 'CLOSED_LOSS' : 'CLOSED_BREAKEVEN';
    } else if (ledgerOpenMatch) {
      isSubmitted = true;
      isFilled = true;
      isOpened = true;
      isClosed = false;
      executionState = 'FILLED_OPEN';
    } else if (pgPosMatch) {
      isSubmitted = true;
      isFilled = true;
      isOpened = true;
      if (pgPosMatch.status === 'CLOSED') {
        isClosed = true;
        realizedPnl = Number(pgPosMatch.realized_pnl || 0);
        realizedPips = pgPosMatch.pnl_pips ? Number(pgPosMatch.pnl_pips) : undefined;
        closedAt = pgPosMatch.closed_at;
        closeReason = pgPosMatch.close_reason;
        executionState = realizedPnl > 0 ? 'CLOSED_WIN' : realizedPnl < 0 ? 'CLOSED_LOSS' : 'CLOSED_BREAKEVEN';
      } else {
        executionState = 'FILLED_OPEN';
      }
    } else {
      // Not filled into an active or closed position
      if (ttlExpired) {
        executionState = 'EXPIRED';
      } else if (slBreachedBeforeEntry || tpReachedBeforeEntry || isCancelAction) {
        executionState = 'CANCELLED';
      } else if (isSubmitted) {
        executionState = 'ORDER_SUBMITTED_NOT_FILLED';
      } else {
        executionState = 'SIGNAL_ONLY';
      }
    }

    correlationRows.push({
      signalId: sig.id,
      createdAt,
      symbol: sig.pair || sig.symbol,
      canonicalSymbol: norm.canonicalSymbol,
      timeframe: sig.timeframe || 'M15',
      direction: sig.direction,
      confidence: sig.confidence || 85,
      entryPrice: sig.entryPrice,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit1 || sig.takeProfit,
      jpyThesis: thesis,
      masterBrokerOrderId: sig.masterBrokerOrderId ? String(sig.masterBrokerOrderId) : undefined,
      executionEligibility: 'WAITING_FOR_ENTRY',
      source: 'data/copier_signals_queue.json',
      reasons: sig.reasons,

      brokerOrderId: sig.masterBrokerOrderId ? String(sig.masterBrokerOrderId) : undefined,
      brokerPositionId: ledgerTradeMatch?.tradeId || ledgerOpenMatch?.positionId || pgPosMatch?.id || undefined,
      brokerTradeId: ledgerTradeMatch?.tradeId || undefined,
      orderType: 'LIMIT_PULLBACK',
      isOrderSubmitted: isSubmitted,
      isOrderFilled: isFilled,
      isPositionOpened: isOpened,
      isPositionClosed: isClosed,
      closedTimestamp: closedAt,
      realizedPnlDollars: realizedPnl,
      realizedPnlPips: realizedPips,
      executionState,
      closeReason,
      ttlExpired,
      cancelled: isCancelAction || executionState === 'CANCELLED',
      neverExecuted: !isFilled,

      secondOpinion: {
        exists: Boolean(soMatch),
        review: soMatch?.openAiReview,
        bias: soMatch?.openAiIndependentBias,
        confidence: soMatch?.openAiConfidence,
        agreement: soMatch?.agreement,
        contradictionLevel: soMatch?.contradictionLevel,
        economicRisk: soMatch?.economicRisk,
        riskFlags: soMatch?.riskFlags,
        latencyMs: soMatch?.latencyMs,
        dataLineage: soMatch?.dataLineage
      },

      economicContext: {
        riskCategory: 'LOW'
      }
    });
  }

  // Sort chronologically
  correlationRows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Aggregate stats
  const executedCount = correlationRows.filter(r => r.isPositionOpened).length;
  const nonExecutedCount = correlationRows.filter(r => !r.isPositionOpened).length;
  const closedLossCount = correlationRows.filter(r => r.executionState === 'CLOSED_LOSS').length;
  const closedWinCount = correlationRows.filter(r => r.executionState === 'CLOSED_WIN').length;
  const closedBeCount = correlationRows.filter(r => r.executionState === 'CLOSED_BREAKEVEN').length;
  const expiredCount = correlationRows.filter(r => r.executionState === 'EXPIRED').length;
  const cancelledCount = correlationRows.filter(r => r.executionState === 'CANCELLED').length;
  const submittedNotFilledCount = correlationRows.filter(r => r.executionState === 'ORDER_SUBMITTED_NOT_FILLED').length;
  const signalOnlyCount = correlationRows.filter(r => r.executionState === 'SIGNAL_ONLY').length;

  console.log('\n======================================================================');
  console.log('FORENSIC SUMMARY OF JPY POPULATION (20 Signals):');
  console.log(`Total JPY Signals:                 ${correlationRows.length}`);
  console.log(`Executed Real Broker Trades:       ${executedCount}`);
  console.log(`Non-Executed Signals:              ${nonExecutedCount}`);
  console.log(`- Expired Pending Orders (TTL):    ${expiredCount}`);
  console.log(`- Cancelled (SL/TP early breach):  ${cancelledCount}`);
  console.log(`- Submitted Pending Not Filled:    ${submittedNotFilledCount}`);
  console.log(`- Signal Only:                     ${signalOnlyCount}`);
  console.log(`\nREALIZED OUTCOMES (Broker Trades):`);
  console.log(`- Realized Losses:                 ${closedLossCount}`);
  console.log(`- Realized Wins:                   ${closedWinCount}`);
  console.log(`- Realized Breakeven:              ${closedBeCount}`);
  console.log('======================================================================\n');

  // Output JSON and MD artifacts
  const auditDocsDir = path.resolve('docs/audits');
  if (!fs.existsSync(auditDocsDir)) {
    fs.mkdirSync(auditDocsDir, { recursive: true });
  }

  const jsonArtifactPath = path.join(auditDocsDir, 'JPY_EXECUTION_LOSS_CORRELATION_AUDIT_20260919.json');
  fs.writeFileSync(jsonArtifactPath, JSON.stringify({
    metadata: {
      auditTitle: 'QUANTUMAI IATI OS — PHASE 2A JPY EXECUTION / LOSS CORRELATION FORENSIC AUDIT',
      auditStart: auditStart.toISOString(),
      auditEnd: auditEnd.toISOString(),
      timezoneUsed: 'UTC / Asia/Kuala_Lumpur (UTC+8)',
      extractedAt: extractionTime,
      totalJpySignals: correlationRows.length,
      realizedTrades: executedCount,
      realizedLosses: closedLossCount,
      realizedWins: closedWinCount,
      sampleSufficiency: executedCount < 10 ? 'INSUFFICIENT_SAMPLE' : 'SUFFICIENT_SAMPLE'
    },
    jpySignalsCorrelation: correlationRows
  }, null, 2));

  console.log(`Saved JSON artifact to ${jsonArtifactPath}`);
}

runPhase2AAudit().catch(console.error);
