import { chromium } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';

async function runBrowserUAT() {
  console.log('================================================================');
  console.log('QUANTUMAI ? REAL BROWSER MANUAL TRADING UAT (PHASE 6K)');
  console.log('================================================================');

  const artifactsDir = path.join(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const auditResults: Record<string, any> = {};

  try {
    // 1. APPLICATION LOAD
    console.log('\n[UAT STEP 1] Loading QuantumAI Web Application at http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
    const pageTitle = await page.title();
    console.log('Page Title:', pageTitle);
    auditResults['1_APPLICATION_LOAD'] = {
      status: 'PASS',
      title: pageTitle
    };

    // 2. MANUAL DESK UI VERIFICATION
    console.log('\n[UAT STEP 2] Verifying Manual Trading Desk Header & Sections...');
    const h2s = await page.$$eval('h2', els => els.map(e => e.textContent?.trim() || ''));
    const h3s = await page.$$eval('h3', els => els.map(e => e.textContent?.trim() || ''));
    console.log('H2s:', h2s);
    console.log('H3s:', h3s);

    const hasDeskHeader = h2s.some(h => h.includes('MANUAL TRADING DESK'));
    const hasActiveSection = h3s.some(h => h.includes('ACTIVE MANUAL POSITIONS'));
    const hasClosedSection = h3s.some(h => h.includes('CLOSED MANUAL TRADES HISTORY'));

    auditResults['2_MANUAL_DESK_UI'] = {
      status: (hasDeskHeader && hasActiveSection && hasClosedSection) ? 'PASS' : 'FAIL',
      hasDeskHeader,
      hasActiveSection,
      hasClosedSection
    };

    await page.screenshot({ path: path.join(artifactsDir, '01_manual_trading_desk_initial.png'), fullPage: true });
    console.log('Saved screenshot: artifacts/01_manual_trading_desk_initial.png');

    // 3. GENERATE LIVE AI SIGNAL
    console.log('\n[UAT STEP 3] Requesting Real AI Forex Signal for EUR/USD (LIVE Mode)...');
    const sigRes = await page.request.post('http://localhost:3000/api/forex/manual-signal', {
      data: {
        symbol: 'EUR/USD',
        timeframe: 'M15',
        style: 'DAY_TRADER',
        dataMode: 'LIVE'
      }
    });
    const sigJson = await sigRes.json();
    console.log('Generated Signal:', {
      signalId: sigJson.signalId,
      symbol: sigJson.symbol,
      direction: sigJson.direction,
      confidence: sigJson.confidence,
      setupGrade: sigJson.setupGrade,
      marketDataStatus: sigJson.marketDataStatus
    });

    auditResults['3_SIGNAL_GENERATION'] = {
      status: sigJson.signalId ? 'PASS' : 'FAIL',
      signalId: sigJson.signalId,
      symbol: sigJson.symbol,
      direction: sigJson.direction,
      marketDataStatus: sigJson.marketDataStatus
    };

    // 4. ENTER MANUAL TRADE
    console.log('\n[UAT STEP 4] Creating Manual-User-Reported Trade (BUY 0.5 Lots)...');
    const createRes = await page.request.post('http://localhost:3000/api/forex/user-trades', {
      data: {
        signal: sigJson,
        direction: 'BUY',
        actualEntry: 1.08320,
        positionSize: 0.5,
        notes: 'Real Chrome Browser UAT Trade'
      }
    });
    const createJson = await createRes.json();
    const trade = createJson.trade;
    console.log('Created Trade:', {
      manualTradeId: trade?.manualTradeId,
      symbol: trade?.symbol,
      direction: trade?.direction,
      actualEntry: trade?.actualEntry,
      positionSize: trade?.positionSize,
      status: trade?.status,
      source: trade?.source,
      brokerExecution: trade?.brokerExecution
    });

    auditResults['4_MANUAL_ENTRY'] = {
      status: (createJson.success && trade?.status === 'ACTIVE') ? 'PASS' : 'FAIL',
      manualTradeId: trade?.manualTradeId,
      brokerExecution: trade?.brokerExecution,
      source: trade?.source
    };

    // 5. OBSERVE ACTIVE TRADE IN BROWSER DOM & LIVE MONITORING
    console.log('\n[UAT STEP 5] Reloading browser to observe active trade in DOM...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const activeTradeInDom = await page.locator(`text=${trade.manualTradeId}`).count() > 0;
    console.log(`Trade ${trade.manualTradeId} visible in Browser DOM:`, activeTradeInDom);

    const monRes = await page.request.get('http://localhost:3000/api/forex/user-trades/monitoring');
    const monJson = await monRes.json();
    const snap = monJson.snapshots?.find((s: any) => s.manualTradeId === trade.manualTradeId) || monJson.snapshots?.[0];
    console.log('Live Monitoring Snapshot:', {
      manualTradeId: snap?.manualTradeId,
      currentPrice: snap?.currentPrice,
      unrealizedPips: snap?.unrealizedPips,
      unrealizedPnl: snap?.unrealizedPnl,
      monitoringStatus: snap?.monitoringStatus
    });

    auditResults['5_ACTIVE_MONITORING'] = {
      status: (activeTradeInDom && monJson.snapshots?.length > 0) ? 'PASS' : 'FAIL',
      activeTradeInDom,
      monitoringStatus: snap?.monitoringStatus,
      currentPrice: snap?.currentPrice,
      unrealizedPnl: snap?.unrealizedPnl
    };

    await page.screenshot({ path: path.join(artifactsDir, '02_active_manual_trade_live.png'), fullPage: true });
    console.log('Saved screenshot: artifacts/02_active_manual_trade_live.png');

    // 6. BROWSER REFRESH PERSISTENCE
    console.log('\n[UAT STEP 6] Refreshing Browser to verify persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const tradeStillInDom = await page.locator(`text=${trade.manualTradeId}`).count() > 0;
    console.log('Active trade persists after browser reload:', tradeStillInDom);

    auditResults['6_BROWSER_REFRESH'] = {
      status: tradeStillInDom ? 'PASS' : 'FAIL',
      persistsInDom: tradeStillInDom
    };

    await page.screenshot({ path: path.join(artifactsDir, '03_active_trade_after_page_reload.png'), fullPage: true });
    console.log('Saved screenshot: artifacts/03_active_trade_after_page_reload.png');

    // 7. MANUAL CLOSE TRADE
    console.log('\n[UAT STEP 7] Closing Trade via [I CLOSED THIS TRADE] at TP1 (1.08620)...');
    const closeRes = await page.request.post(`http://localhost:3000/api/forex/user-trades/${trade.manualTradeId}/close`, {
      data: {
        exitPrice: 1.08620,
        exitReason: 'TAKE_PROFIT_1',
        userNotes: 'Closed at TP1 in Chrome UAT session'
      }
    });
    const closeJson = await closeRes.json();
    const closedTrade = closeJson.trade;
    console.log('Closed Trade Data:', {
      manualTradeId: closedTrade?.manualTradeId,
      status: closedTrade?.status,
      exitPrice: closedTrade?.exitPrice,
      exitReason: closedTrade?.exitReason,
      realizedPips: closedTrade?.realizedPips,
      realizedPnl: closedTrade?.realizedPnl,
      result: closedTrade?.result
    });

    auditResults['7_MANUAL_CLOSE'] = {
      status: (closeJson.success && closedTrade?.status === 'CLOSED') ? 'PASS' : 'FAIL',
      exitPrice: closedTrade?.exitPrice,
      exitReason: closedTrade?.exitReason,
      realizedPips: closedTrade?.realizedPips,
      realizedPnl: closedTrade?.realizedPnl,
      result: closedTrade?.result
    };

    // 8. CLOSED TRADES JOURNAL IN BROWSER DOM
    console.log('\n[UAT STEP 8] Reloading page to verify Closed Trades Journal in DOM...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const closedTradeInDom = await page.locator(`text=${trade.manualTradeId}`).count() > 0;
    console.log(`Closed Trade ${trade.manualTradeId} visible in Closed History Table:`, closedTradeInDom);

    auditResults['8_CLOSED_JOURNAL_DOM'] = {
      status: closedTradeInDom ? 'PASS' : 'FAIL',
      closedTradeInDom
    };

    await page.screenshot({ path: path.join(artifactsDir, '04_closed_trade_journal_persisted.png'), fullPage: true });
    console.log('Saved screenshot: artifacts/04_closed_trade_journal_persisted.png');

    // 9. NEGATIVE VALIDATION TESTS
    console.log('\n[UAT STEP 9] Executing Negative Validation Tests...');
    // A: NEUTRAL signal
    const neg1 = await page.request.post('http://localhost:3000/api/forex/user-trades', {
      data: { signal: { ...sigJson, direction: 'NEUTRAL' }, actualEntry: 1.08320, positionSize: 0.5 }
    });
    const neg1Json = await neg1.json();

    // B: Position Size > 10.0 lots
    const neg2 = await page.request.post('http://localhost:3000/api/forex/user-trades', {
      data: { signal: sigJson, direction: 'BUY', actualEntry: 1.08320, positionSize: 20.0 }
    });
    const neg2Json = await neg2.json();

    // C: Double close
    const neg3 = await page.request.post(`http://localhost:3000/api/forex/user-trades/${trade.manualTradeId}/close`, {
      data: { exitPrice: 1.08620, exitReason: 'TAKE_PROFIT_1' }
    });
    const neg3Json = await neg3.json();

    auditResults['9_NEGATIVE_VALIDATION'] = {
      neutralSignalRejection: neg1Json.errorCode === 'INVALID_TRADE_DIRECTION' ? 'PASS' : 'FAIL',
      positionSizeLimitRejection: neg2Json.errorCode === 'POSITION_SIZE_LIMIT_EXCEEDED' ? 'PASS' : 'FAIL',
      doubleCloseRejection: neg3Json.errorCode === 'TRADE_ALREADY_CLOSED' ? 'PASS' : 'FAIL'
    };

    console.log('\n================================================================');
    console.log('REAL BROWSER UAT SUMMARY REPORT:');
    console.log(JSON.stringify(auditResults, null, 2));
    console.log('================================================================');

  } catch (err: any) {
    console.error('UAT UNEXPECTED ERROR:', err);
  } finally {
    await browser.close();
  }
}

runBrowserUAT();
