import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

interface SignalRecord {
  signalId: string;
  symbol: string;
  canonicalSymbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  containsJPY: boolean;
  timeframe: string;
  direction: string;
  confidence: number;
  createdAt: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  strategy?: string;
  strategyId?: string;
  strategyVersion?: string;
  dataMode: string;
  dataLineage: string;
  marketRegime?: string;
  signalValidationStatus?: string;
  executionEligibility?: string;
  executionMode?: string;
  economicRisk?: string;
  economicContext?: any;
  source: string;
  reasons?: string[];
  agentVotes?: any;
  agentEvidence?: any;
  invalidation?: any;
  masterBrokerOrderId?: string;
  brokerPositionId?: string;
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
    // BUY XXX/JPY = sell JPY -> JPY_WEAKNESS
    // SELL XXX/JPY = buy JPY -> JPY_STRENGTH
    if (dir === 'BUY' || dir === 'LONG') return 'JPY_WEAKNESS';
    if (dir === 'SELL' || dir === 'SHORT') return 'JPY_STRENGTH';
  } else if (baseCurrency === 'JPY') {
    // BUY JPY/XXX = buy JPY -> JPY_STRENGTH
    // SELL JPY/XXX = sell JPY -> JPY_WEAKNESS
    if (dir === 'BUY' || dir === 'LONG') return 'JPY_STRENGTH';
    if (dir === 'SELL' || dir === 'SHORT') return 'JPY_WEAKNESS';
  }
  return 'AMBIGUOUS';
}

async function runForensicAudit() {
  const extractionTimestamp = new Date().toISOString();
  console.log('======================================================================');
  console.log('QUANTUMAI IATI OS — JPY SIGNAL FORENSIC AUDIT');
  console.log('======================================================================');

  // 1. Audit Window
  // Current local time: 2026-09-19 (Saturday)
  // Current trading week: Monday 2026-09-14 00:00:00 UTC through Sunday 2026-09-20 23:59:59 UTC
  const now = new Date('2026-09-19T13:19:14+08:00');
  const auditStart = new Date('2026-09-14T00:00:00.000Z');
  const auditEnd = new Date('2026-09-20T23:59:59.999Z');
  const timezoneUsed = 'UTC / Asia/Kuala_Lumpur (UTC+8)';

  console.log(`audit_start:               ${auditStart.toISOString()}`);
  console.log(`audit_end:                 ${auditEnd.toISOString()}`);
  console.log(`timezone_used:             ${timezoneUsed}`);
  console.log(`current_server_time:       ${now.toISOString()}`);
  console.log(`data_extraction_timestamp: ${extractionTimestamp}`);
  console.log('----------------------------------------------------------------------\n');

  const allSignals: SignalRecord[] = [];
  const allTrades: any[] = [];
  const secondOpinions: any[] = [];

  // 2. Load Second Opinion Observations
  const soPath = path.resolve('data/second_opinion_observations.json');
  if (fs.existsSync(soPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(soPath, 'utf8'));
      const list = Array.isArray(data) ? data : Object.values(data);
      secondOpinions.push(...list);
      console.log(`[Source: SecondOpinionObservatory] Loaded ${list.length} observation records.`);
    } catch (e: any) {
      console.error('Failed reading second_opinion_observations.json:', e.message);
    }
  }

  // 3. Load Copier Signals Queue
  const queuePath = path.resolve('data/copier_signals_queue.json');
  if (fs.existsSync(queuePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
      if (Array.isArray(data)) {
        console.log(`[Source: CopierSignalsQueue] Loaded ${data.length} queue items.`);
        for (const item of data) {
          const norm = normalizeSymbol(item.pair || item.symbol);
          const createdAt = item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString();
          allSignals.push({
            signalId: item.id || `sig_${item.timestamp}`,
            symbol: item.pair || item.symbol,
            canonicalSymbol: norm.canonicalSymbol,
            baseCurrency: norm.baseCurrency,
            quoteCurrency: norm.quoteCurrency,
            containsJPY: norm.containsJPY,
            timeframe: item.timeframe || 'M15',
            direction: item.direction,
            confidence: item.confidence || 85,
            createdAt,
            entryPrice: item.entryPrice,
            stopLoss: item.stopLoss,
            takeProfit: item.takeProfit1 || item.takeProfit,
            riskReward: item.riskReward,
            strategy: item.action || 'NEW_ORDER',
            dataMode: 'LIVE',
            dataLineage: 'LIVE',
            source: 'copier_signals_queue.json',
            reasons: item.reasons,
            masterBrokerOrderId: item.masterBrokerOrderId ? String(item.masterBrokerOrderId) : undefined
          });
        }
      }
    } catch (e: any) {
      console.error('Failed reading copier_signals_queue.json:', e.message);
    }
  }

  // 4. Load Discovered Setups
  const setupsPath = path.resolve('data/scanner_discovered_setups.json');
  if (fs.existsSync(setupsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(setupsPath, 'utf8'));
      if (Array.isArray(data)) {
        console.log(`[Source: ScannerDiscoveredSetups] Loaded ${data.length} scanner setups.`);
        for (const item of data) {
          const norm = normalizeSymbol(item.pair || item.symbol);
          const createdAt = item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString();
          allSignals.push({
            signalId: item.id || `scanner_${item.timestamp}`,
            symbol: item.pair || item.symbol,
            canonicalSymbol: norm.canonicalSymbol,
            baseCurrency: norm.baseCurrency,
            quoteCurrency: norm.quoteCurrency,
            containsJPY: norm.containsJPY,
            timeframe: item.timeframe || 'M15',
            direction: item.direction,
            confidence: item.confidence || 80,
            createdAt,
            entryPrice: item.entryPrice,
            stopLoss: item.stopLoss,
            takeProfit: item.takeProfit,
            strategy: 'AUTONOMOUS_SCANNER',
            dataMode: 'LIVE',
            dataLineage: 'LIVE',
            source: 'scanner_discovered_setups.json',
            reasons: item.reasons
          });
        }
      }
    } catch (e: any) {
      console.error('Failed reading scanner_discovered_setups.json:', e.message);
    }
  }

  // 5. Load cTrader Demo Ledger
  const ledgerPath = path.resolve('data/ctrader_demo_ledger.json');
  if (fs.existsSync(ledgerPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      if (data.closedTrades) {
        allTrades.push(...data.closedTrades);
      }
      if (data.openPositions) {
        allTrades.push(...data.openPositions);
      }
      console.log(`[Source: cTraderDemoLedger] Loaded ${allTrades.length} ledger positions/trades.`);
    } catch (e: any) {
      console.error('Failed reading ctrader_demo_ledger.json:', e.message);
    }
  }

  // 6. Connect to PostgreSQL (if available)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://quantumai:quantumai_test_password@127.0.0.1:54329/quantumai_test',
    connectionTimeoutMillis: 1500
  });

  let pgConnected = false;
  try {
    const test = await pool.query('SELECT 1');
    if (test) {
      pgConnected = true;
      console.log('[Source: PostgreSQL Database] Connected to database.');

      // Query signals
      try {
        const sigRes = await pool.query(`
          SELECT * FROM signals 
          WHERE created_at >= $1 AND created_at <= $2 
          ORDER BY created_at ASC;
        `, [auditStart.toISOString(), auditEnd.toISOString()]);
        console.log(`[PostgreSQL: signals] Retrieved ${sigRes.rows.length} signals in window.`);
        for (const row of sigRes.rows) {
          const norm = normalizeSymbol(row.symbol || row.pair);
          allSignals.push({
            signalId: row.id || row.signal_id,
            symbol: row.symbol || row.pair,
            canonicalSymbol: norm.canonicalSymbol,
            baseCurrency: norm.baseCurrency,
            quoteCurrency: norm.quoteCurrency,
            containsJPY: norm.containsJPY,
            timeframe: row.timeframe || 'M15',
            direction: row.direction,
            confidence: row.confidence || 80,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            entryPrice: row.entry_price,
            stopLoss: row.stop_loss,
            takeProfit: row.take_profit,
            riskReward: row.risk_reward,
            strategy: row.strategy,
            strategyId: row.strategy_id,
            strategyVersion: row.strategy_version,
            dataMode: row.data_mode || 'LIVE',
            dataLineage: row.data_lineage || 'LIVE',
            marketRegime: row.market_regime,
            signalValidationStatus: row.validation_status,
            executionEligibility: row.execution_eligibility,
            executionMode: row.execution_mode,
            source: 'PostgreSQL:signals',
            reasons: row.reasons
          });
        }
      } catch (err: any) {
        console.log(`[PostgreSQL signals query]: ${err.message}`);
      }

      // Query positions / closed trades
      try {
        const posRes = await pool.query(`
          SELECT * FROM positions 
          WHERE (created_at >= $1 OR opened_at >= $1)
          ORDER BY created_at ASC;
        `, [auditStart.toISOString()]);
        console.log(`[PostgreSQL: positions] Retrieved ${posRes.rows.length} positions.`);
        for (const r of posRes.rows) {
          allTrades.push({
            tradeId: r.id || r.position_id,
            symbol: r.symbol,
            side: r.side || r.direction,
            lots: r.volume || r.lots,
            entryPrice: r.entry_price,
            closePrice: r.exit_price || r.close_price,
            realizedPnL: r.realized_pnl || r.pnl,
            pnlPips: r.pnl_pips,
            openTime: r.opened_at || r.created_at,
            closeTime: r.closed_at,
            exitReason: r.close_reason,
            proposalId: r.proposal_id,
            brokerOrderId: r.broker_order_id,
            brokerPositionId: r.broker_position_id,
            source: 'PostgreSQL:positions'
          });
        }
      } catch (err: any) {
        console.log(`[PostgreSQL positions query]: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.log(`[PostgreSQL] Connection not established (${err.message}) - Proceeding with persisted JSON ledger & observatory files.`);
  } finally {
    if (pgConnected) await pool.end();
  }

  // 7. Filter Signals to Audit Window & Deduplicate
  const windowSignals = allSignals.filter(s => {
    const t = new Date(s.createdAt).getTime();
    return t >= auditStart.getTime() && t <= auditEnd.getTime();
  });

  // Deduplicate by signalId
  const uniqueSignalsMap = new Map<string, SignalRecord>();
  for (const s of windowSignals) {
    if (!uniqueSignalsMap.has(s.signalId)) {
      uniqueSignalsMap.set(s.signalId, s);
    }
  }
  const uniqueSignals = Array.from(uniqueSignalsMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  console.log(`\n======================================================================`);
  console.log(`TOTAL UNIQUE SIGNALS IN WINDOW: ${uniqueSignals.length}`);
  
  const jpySignals = uniqueSignals.filter(s => s.containsJPY);
  const nonJpySignals = uniqueSignals.filter(s => !s.containsJPY);

  console.log(`JPY-RELATED SIGNALS:           ${jpySignals.length} (${uniqueSignals.length > 0 ? ((jpySignals.length / uniqueSignals.length) * 100).toFixed(1) : 0}%)`);
  console.log(`NON-JPY SIGNALS:               ${nonJpySignals.length} (${uniqueSignals.length > 0 ? ((nonJpySignals.length / uniqueSignals.length) * 100).toFixed(1) : 0}%)`);
  console.log(`======================================================================\n`);

  // 8. Detailed Correlation for JPY Signals
  const jpyCorrelations = jpySignals.map(s => {
    const norm = normalizeSymbol(s.symbol);
    const thesis = getJpyThesis(s.direction, norm.quoteCurrency, norm.baseCurrency);

    // Correlate with Second Opinion
    const soMatch = secondOpinions.find(so => so.signalId === s.signalId || so.symbol === s.symbol && Math.abs(new Date(so.createdAt).getTime() - new Date(s.createdAt).getTime()) < 60000);

    // Correlate with Trades/Ledger
    const tradeMatch = allTrades.find(t => 
      (t.proposalId && t.proposalId === s.signalId) ||
      (t.brokerOrderId && s.masterBrokerOrderId && String(t.brokerOrderId) === String(s.masterBrokerOrderId)) ||
      (normalizeSymbol(t.symbol).canonicalSymbol === s.canonicalSymbol && Math.abs(new Date(t.openTime || t.entryTime).getTime() - new Date(s.createdAt).getTime()) < 300000)
    );

    let brokerStatus = 'SIGNAL ONLY';
    if (tradeMatch) {
      if (tradeMatch.closeTime || tradeMatch.exitReason) {
        const pnl = Number(tradeMatch.realizedPnL || 0);
        brokerStatus = pnl > 0 ? 'CLOSED_WIN' : pnl < 0 ? 'CLOSED_LOSS' : 'CLOSED_BREAKEVEN';
      } else {
        brokerStatus = 'OPEN';
      }
    }

    return {
      signal: s,
      canonicalSymbol: norm.canonicalSymbol,
      thesis,
      secondOpinion: soMatch || null,
      trade: tradeMatch || null,
      brokerStatus,
      pnl: tradeMatch ? Number(tradeMatch.realizedPnL || 0) : undefined
    };
  });

  // 9. Chronological Timeline & Interval Calculation
  console.log('=== JPY SIGNAL TIMELINE & REPEATED THESIS FORENSIC TRACE ===');
  let prevTime: number | null = null;
  let prevLossTime: number | null = null;
  let runningConsecutiveLosses = 0;

  for (let i = 0; i < jpyCorrelations.length; i++) {
    const item = jpyCorrelations[i];
    const s = item.signal;
    const currTime = new Date(s.createdAt).getTime();

    const minsSincePrev = prevTime !== null ? Math.round((currTime - prevTime) / 60000) : 'N/A';
    const minsSinceLoss = prevLossTime !== null ? Math.round((currTime - prevLossTime) / 60000) : 'N/A';

    // Signals in last 30m, 60m, 4h, 24h
    const sigs30m = jpyCorrelations.filter((_, idx) => idx < i && currTime - new Date(jpyCorrelations[idx].signal.createdAt).getTime() <= 30 * 60000).length;
    const sigs60m = jpyCorrelations.filter((_, idx) => idx < i && currTime - new Date(jpyCorrelations[idx].signal.createdAt).getTime() <= 60 * 60000).length;
    const sigs4h = jpyCorrelations.filter((_, idx) => idx < i && currTime - new Date(jpyCorrelations[idx].signal.createdAt).getTime() <= 4 * 3600000).length;
    const sigs24h = jpyCorrelations.filter((_, idx) => idx < i && currTime - new Date(jpyCorrelations[idx].signal.createdAt).getTime() <= 24 * 3600000).length;

    console.log(`[#${i + 1}] ${s.createdAt} | ${s.canonicalSymbol} | ${s.timeframe} | ${s.direction} (${s.confidence}%) | Thesis: ${item.thesis} | Broker: ${item.brokerStatus} | MinsSincePrev: ${minsSincePrev} | PriorConsecLosses: ${runningConsecutiveLosses} | Past24hJPY: ${sigs24h}`);

    if (item.brokerStatus === 'CLOSED_LOSS') {
      prevLossTime = currTime;
      runningConsecutiveLosses++;
    } else if (item.brokerStatus === 'CLOSED_WIN') {
      runningConsecutiveLosses = 0;
    }

    prevTime = currTime;
  }

  // 10. JPY Thesis Breakdown
  const weaknessCount = jpyCorrelations.filter(c => c.thesis === 'JPY_WEAKNESS').length;
  const strengthCount = jpyCorrelations.filter(c => c.thesis === 'JPY_STRENGTH').length;
  const ambiguousCount = jpyCorrelations.filter(c => c.thesis === 'AMBIGUOUS').length;

  console.log('\n=== JPY THESIS CLUSTER AGGREGATION ===');
  console.log(`JPY_WEAKNESS Thesis Count:  ${weaknessCount} (${jpyCorrelations.length > 0 ? ((weaknessCount / jpyCorrelations.length) * 100).toFixed(1) : 0}%)`);
  console.log(`JPY_STRENGTH Thesis Count:  ${strengthCount} (${jpyCorrelations.length > 0 ? ((strengthCount / jpyCorrelations.length) * 100).toFixed(1) : 0}%)`);
  console.log(`AMBIGUOUS Thesis Count:     ${ambiguousCount}`);

  // 11. Pair breakdown
  const pairCounts: Record<string, number> = {};
  for (const item of jpyCorrelations) {
    pairCounts[item.canonicalSymbol] = (pairCounts[item.canonicalSymbol] || 0) + 1;
  }
  console.log('\n=== JPY PAIR DISTRIBUTION ===');
  for (const [pair, count] of Object.entries(pairCounts)) {
    console.log(`- ${pair}: ${count} signals`);
  }

  // Save audit data to scratch for comprehensive report generation
  const auditReportData = {
    auditWindow: {
      start: auditStart.toISOString(),
      end: auditEnd.toISOString(),
      timezone: timezoneUsed,
      serverTime: now.toISOString(),
      extractedAt: extractionTimestamp
    },
    counts: {
      totalSignals: uniqueSignals.length,
      jpySignals: jpySignals.length,
      nonJpySignals: nonJpySignals.length,
      jpyWeakness: weaknessCount,
      jpyStrength: strengthCount,
      jpyAmbiguous: ambiguousCount
    },
    pairDistribution: pairCounts,
    jpyCorrelations
  };

  fs.writeFileSync(
    path.resolve('scratch/jpy_forensic_evidence.json'),
    JSON.stringify(auditReportData, null, 2)
  );
  console.log('\nSaved forensic evidence to scratch/jpy_forensic_evidence.json');
}

runForensicAudit().catch(console.error);
