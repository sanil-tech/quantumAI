import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { CurrencyPair, Timeframe, CandleData, IndicatorValues, SmcStructures } from '../src/types';
import { fetchRealCandleHistory, aggregateCandles } from '../src/lib/marketDataGenerator';
import { calculateAllIndicators } from '../src/lib/indicators';
import { analyzeSmcStructures } from '../src/lib/smcEngine';
import { aiDecisionEngine } from '../apps/decision-agent/src/services/aiDecisionEngine';
import { TradingRepository } from '@iati/database';
import { CTraderAdapter } from '../apps/execution-router/src/adapters/ctraderAdapter';

async function runDiagnosis() {
  console.log('================================================================================');
  console.log('🔍 QUANTUMAI SIGNAL HEALTH & GRADE A SCANNER DIAGNOSTIC');
  console.log('================================================================================\n');

  // 1. Inspect Cache File
  const cachePath = path.resolve(process.cwd(), 'data', 'scanner_discovered_setups.json');
  console.log('📁 1. INSPECTING DISCOVERED SETUPS CACHE:');
  if (fs.existsSync(cachePath)) {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const setups = JSON.parse(raw);
    console.log(`- Total setups in data/scanner_discovered_setups.json: ${setups.length}`);
    for (const s of setups) {
      console.log(`  * [${s.pair} ${s.timeframe}] ${s.direction} | Conf: ${s.confidence}% | Status: ${s.status} | Entry: ${s.entryPrice} | SL: ${s.stopLoss} | TP: ${s.takeProfit1} | Timestamp: ${new Date(s.timestamp).toISOString()}`);
    }
  } else {
    console.log('- Cache file does not exist.');
  }

  // 2. Inspect Database Open Positions
  console.log('\n🗄️ 2. INSPECTING DATABASE OPEN POSITIONS:');
  const tradingRepo = new TradingRepository();
  let dbPositions: any[] = [];
  try {
    const res = await tradingRepo.query(`SELECT * FROM positions WHERE status = 'OPEN'`);
    dbPositions = res.rows;
    console.log(`- Total OPEN positions in DB: ${dbPositions.length}`);
    for (const p of dbPositions) {
      console.log(`  * Pos ID: ${p.position_id || p.id} | Symbol: ${p.symbol} | Side: ${p.direction} | Lots: ${p.lot_size || p.quantity} | Entry: ${p.entry_price} | SL: ${p.stop_loss} | TP: ${p.take_profit}`);
    }
  } catch (err: any) {
    console.warn('- Could not query database positions:', err.message);
  }

  // 3. Inspect cTrader Broker Pending Orders & Open Positions
  console.log('\n📡 3. INSPECTING CTRADER DEMO BROKER STATUS:');
  const ctrader = new CTraderAdapter({ accountId: '48282756' });
  try {
    const brokerPositions = await ctrader.getPositions();
    console.log(`- cTrader Live Open Positions: ${brokerPositions.length}`);
    for (const bp of brokerPositions) {
      console.log(`  * Pos #${bp.position_id} | Symbol: ${bp.symbol} | Direction: ${bp.direction} | Volume: ${bp.quantity} | Entry: ${bp.entry_price} | SL: ${bp.stop_loss} | TP: ${bp.take_profit}`);
    }

    const pendingOrders = await ctrader.getPendingOrders();
    console.log(`- cTrader Live Pending Orders: ${pendingOrders.length}`);
    for (const po of pendingOrders) {
      console.log(`  * Order #${po.orderId} | Symbol: ${po.symbol} | Side: ${po.tradeSide} | Price: ${po.limitPrice} | SL: ${po.stopLoss} | TP: ${po.takeProfit}`);
    }
  } catch (err: any) {
    console.warn('- cTrader fetch notice:', err.message);
  }

  // 4. Test Multi-Pair Signal Generation across all Watchlist Pairs & Timeframes
  console.log('\n🧠 4. EVALUATING LIVE AI DECISION ENGINE ACROSS ALL 12 WATCHLIST PAIRS:');
  const watchlist: CurrencyPair[] = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF',
    'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'XAU/USD', 'NASDAQ', 'BTC/USD'
  ];
  const timeframes: Timeframe[] = ['M15', 'H1', 'H4'];

  const results: any[] = [];

  for (const pair of watchlist) {
    for (const tf of timeframes) {
      try {
        const candles = await fetchRealCandleHistory(pair, tf as any, 100).catch(() => []);
        if (!candles || candles.length < 15) {
          results.push({ pair, tf, status: 'NO_CANDLE_DATA', confidence: 0 });
          continue;
        }

        const latest = candles[candles.length - 1];
        const currentPrice = latest.close;
        const indicators: IndicatorValues = calculateAllIndicators(candles);
        const smcData: SmcStructures = analyzeSmcStructures(candles, tf);

        const aiResponse = await aiDecisionEngine.generateOpinion({
          pair,
          timeframe: tf,
          style: 'DAY_TRADER',
          currentPrice,
          indicators,
          smc: smcData,
          riskSettings: { accountSize: 1000, riskPercent: 1.0 }
        });

        if (!aiResponse) {
          results.push({ pair, tf, status: 'NO_AI_RESPONSE', confidence: 0 });
          continue;
        }

        const rawAction = String((aiResponse as any).type || aiResponse.action || (aiResponse.bias === 'BULLISH' ? 'BUY' : aiResponse.bias === 'BEARISH' ? 'SELL' : 'HOLD')).toUpperCase();
        const confidence = Number(aiResponse.confidence || 0);
        const isGradeA = confidence >= 70;

        results.push({
          pair,
          tf,
          action: rawAction,
          confidence,
          isGradeA,
          bias: aiResponse.bias,
          reasons: aiResponse.reasons || [],
          veto: (aiResponse as any).executionVeto || 'NO'
        });
      } catch (err: any) {
        results.push({ pair, tf, status: 'ERROR', error: err.message, confidence: 0 });
      }
    }
  }

  // Summarize Evaluation
  console.log('\n📊 SIGNAL EVALUATION SUMMARY MATRIX:');
  console.log('--------------------------------------------------------------------------------');
  console.log(String('PAIR').padEnd(10) + String('TF').padEnd(6) + String('ACTION').padEnd(10) + String('CONFIDENCE').padEnd(14) + String('GRADE A?').padEnd(12) + 'KEY REASON / BIAS');
  console.log('--------------------------------------------------------------------------------');

  const gradeASetups = results.filter(r => r.isGradeA);
  for (const r of results) {
    const gradeStr = r.isGradeA ? '✅ YES (A)' : '❌ NO (<70%)';
    const reasonSummary = r.reasons && r.reasons.length > 0 ? r.reasons[0].substring(0, 45) : (r.status || 'N/A');
    console.log(
      String(r.pair).padEnd(10) +
      String(r.tf).padEnd(6) +
      String(r.action || 'HOLD').padEnd(10) +
      String(`${r.confidence}%`).padEnd(14) +
      String(gradeStr).padEnd(12) +
      reasonSummary
    );
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`🎯 TOTAL GRADE A SETUPS FOUND RIGHT NOW: ${gradeASetups.length} / ${results.length}`);
  for (const g of gradeASetups) {
    console.log(`  🌟 [${g.pair} ${g.tf}] ${g.action} | Conf: ${g.confidence}% | Reasons: ${g.reasons.join('; ')}`);
  }

  console.log('\n================================================================================');
  process.exit(0);
}

runDiagnosis().catch(err => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});
