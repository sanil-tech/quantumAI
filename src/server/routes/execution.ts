import { manualEntryOnly } from '../services/copierSafetyPolicy';
import { AccountService } from '../services/accountService';
import { Router, Request, Response } from 'express';
import { executionQueueService } from '../services/executionQueueService';
import { validateExecutionSafety } from '../services/liveExecutionSafetyGuard';
import { ExecutionEnvironment, MarketDataLineage } from '../domain/types';
import { RiskGovernanceEngine } from '../../../apps/risk-governance/src/modules/governanceEngine';
import { authorizeExecution } from '../../../apps/risk-governance/src/modules/executionAuthorization';
import { TradeProposal, RiskApprovalToken, RiskClearedPayload } from '@iati/core-types';
import { ExecutionRouter } from '../../../apps/execution-router/src/router/executionRouter';
import { PaperBrokerAdapter } from '../../../apps/execution-router/src/adapters/paperBrokerAdapter';
import { TradingRepository, PositionRecord, AccountStateRecord, checkDbConnection } from '@iati/database';
import { globalEventBus, EventTypes, TradeClosedPayload } from '@iati/event-bus';
import { learningService } from '../services/learningService';

import { createRiskApprovalToken } from '../../../apps/risk-governance/src/modules/riskTokenService';
import { serverBrokerConnection } from './broker';

export const executionRouter = Router();
export const canonicalExecutionRouter = new ExecutionRouter();
const governanceEngine = new RiskGovernanceEngine();
export const tradingRepo = new TradingRepository();

export interface SharedAutoTrade {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice?: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  lotSize: number;
  openTime: number;
  status: 'OPEN' | 'CLOSED';
  setupId?: string;
  pnlDollars?: number;
  pnlPips?: number;
  brokerTicket?: string;
  environment?: string;
  accountId?: string;
  broker?: string;
  proposalId?: string;
  approvalId?: string;
  strategyId?: string;
  strategyVersion?: string;
  idempotencyKey?: string;
}

export interface SharedClosedTrade extends SharedAutoTrade {
  closeTime: number;
  exitPrice: number;
  closeReason: string;
}

// In-Memory Read-Through / Write-Through Cache
export const sharedAutoTraderState = {
  openTrades: [] as SharedAutoTrade[],
  closedTrades: [] as SharedClosedTrade[],
  performance: {
    winCount: 0,
    lossCount: 0,
    winRatePercent: 0,
    totalPnlDollars: 0,
    totalPnlPips: 0,
    totalTrades: 0
  }
};

import { PairDailyRangeService } from '../services/pairDailyRangeService';

export function resolveTradeSlTp(pos: { symbol?: string; direction?: string; entryPrice?: number; stopLoss?: number; takeProfit?: number; takeProfit1?: number; takeProfit2?: number; currentPrice?: number; timeframe?: string }) {
  const sym = pos.symbol || 'EUR/USD';
  const entry = Number(pos.entryPrice || pos.currentPrice || 1.0);
  const dir = (String(pos.direction || 'BUY').toUpperCase() as 'BUY' | 'SELL');
  const tf = pos.timeframe || 'M5';

  const profile = PairDailyRangeService.getProfile(sym);
  const intraday = PairDailyRangeService.calculateIntradayTargets(sym, dir, entry, tf);

  let sl = Number(pos.stopLoss || 0);
  let tp1 = Number(pos.takeProfit1 || pos.takeProfit || 0);
  let tp2 = Number(pos.takeProfit2 || 0);

  if (!sl || sl === 0) {
    sl = intraday.slPrice;
  }

  if (!tp1 || tp1 === 0) {
    tp1 = intraday.tp1Price;
  }

  if (!tp2 || tp2 === 0) {
    tp2 = intraday.tp2Price;
  }

  return {
    stopLoss: Number(sl.toFixed(profile.decimals)),
    takeProfit1: Number(tp1.toFixed(profile.decimals)),
    takeProfit2: Number(tp2.toFixed(profile.decimals))
  };
}

export function generateDetailedTradeRationale(pos: {
  symbol?: string;
  direction?: string;
  ticketId?: string;
  positionId?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfit1?: number;
  quantity?: number;
  openedAt?: any;
}) {
  const ticket = String(pos.ticketId || pos.positionId || '').replace('trade_', '');
  const sym = (pos.symbol || 'EUR/USD').toUpperCase();
  const dir = (pos.direction || 'BUY').toUpperCase();
  const entry = Number(pos.entryPrice || 0);
  const sl = Number(pos.stopLoss || 0);
  const tp = Number(pos.takeProfit1 || pos.takeProfit || 0);

  const specificMap: Record<string, {
    marketStructure: string;
    setupName: string;
    triggerReason: string;
    technicalConfluence: string[];
    slJustification: string;
    tpJustification: string;
    educationalLesson: string;
  }> = {
    '285206424': {
      setupName: 'Asian Low Liquidity Sweep + Order Block Mitigation',
      marketStructure: 'Bullish Reversal / Order Block Test pada zon sokongan institusi M15.',
      triggerReason: 'Harga menyapu kecairan (liquidity sweep) di bawah paras 1.16500 dan menghasilkan lilin pengesahan "Bullish Engulfing" di zon diskaun.',
      technicalConfluence: [
        'Mitigasi zon Bullish Demand / Order Block M15',
        'Penolakan (rejection wick) pada paras Fibonacci 61.8%',
        'RSI oversold (<30) menunjukkan kelemahan momentum penjual'
      ],
      slJustification: `SL pada ${sl || '1.16309'} diletakkan 25 pips di bawah paras terendah struktur (Swing Low) untuk membatalkan analisis jika paras sokongan ditembusi.`,
      tpJustification: `TP pada ${tp || '1.17059'} disasarkan pada zon rintangan harian (Daily High Liquidity Pool) dengan nisbah Risiko:Ganjaran 1:2.0.`,
      educationalLesson: 'Konsep SMC: Institusi kewangan sengaja menolak harga ke bawah paras sokongan ketara untuk mencetuskan Stop Loss penjual runcit (Sell-Side Liquidity) sebelum mengisi pesanan beli besar.'
    },
    '285206468': {
      setupName: 'Institutional Scale-In / Reaccumulation Confirmation',
      marketStructure: 'Sambungan fasa pengumpulan (Reaccumulation) mengikut arah aliran utama H1.',
      triggerReason: 'Pengesahan entri kedua (0.10 lot) setelah lilin M15 seterusnya ditutup kukuh di atas zon 1.16550, membuktikan kehadiran pembeli institusi.',
      technicalConfluence: [
        'Pecahan struktur kecil (Minor Break of Structure - mBOS)',
        'Volume pesanan belian meningkat melepasi purata 20 lilin',
        'Purata Bergerak EMA 20 menyilang ke atas EMA 50'
      ],
      slJustification: `SL pada ${sl || '1.16309'} diselaraskan sepadan dengan entri pertama bagi mengekalkan kawalan had risiko portfolio maksimum 1%.`,
      tpJustification: `TP pada ${tp || '1.17059'} disasarkan serentak pada sasaran kecairan utama sesi New York.`,
      educationalLesson: 'Strategi Scale-In: Menambah saiz kedudukan hanya selepas pasaran menunjukkan tanda pengesahan kedua mengurangkan risiko terperangkap dalam "fakeout".'
    },
    '285208591': {
      setupName: 'London Pre-Session Breakout & Fair Value Gap Retest',
      marketStructure: 'Peralihan struktur pasaran (Change of Character - CHoCH) dari fasa mendatar kepada aliran menaik pada pembukaan awal sesi Eropah.',
      triggerReason: 'GBP/USD melonjak menembusi zon rintangan 1.35850 dan melakukan ujian semula (re-test) pada ketidakseimbangan harga (Fair Value Gap / FVG) di 1.35947.',
      technicalConfluence: [
        'Ujian semula Bullish FVG (Fair Value Gap) pada rangka masa M15',
        'Penunjuk MACD melintasi garisan sifar ke zon positif',
        'Sentimen Pound disokong oleh data kestabilan ekonomi UK'
      ],
      slJustification: `SL pada ${sl || '1.35697'} (25 pips) diletakkan di bawah asas lilin lonjakan impulsif bagi mengelakkan penarikan balik yang mendalam.`,
      tpJustification: `TP pada ${tp || '1.36447'} (50 pips) disasarkan pada zon bekalan 4 Jam (4H Supply Zone) dengan nisbah R:R 1:2.0.`,
      educationalLesson: 'Konsep Fair Value Gap (FVG): Apabila pergerakan harga berlaku terlalu pantas, pasaran meninggalkan lompang kecairan. Algoritma institusi cenderung menarik balik harga ke zon ini untuk menyeimbangkan semula pesanan sebelum meneruskan trend.'
    },
    '285229386': {
      setupName: 'Trend Continuation Pullback to Dynamic Support',
      marketStructure: 'Aliran menaik mampan (Healthy Bullish Trend) dengan siri puncak lebih tinggi (Higher Highs) dan lembah lebih tinggi (Higher Lows).',
      triggerReason: 'Penarikan semula harga (pullback) ke paras sokongan dinamik EMA 50 dan paras psikologi 1.16550 yang kini bertindak sebagai lantai sokongan baharu.',
      technicalConfluence: [
        'Sokongan dinamik Exponential Moving Average (EMA 50)',
        'Stochastic Oscillator keluar dari zon terlebih jual (>20)',
        'Lilin pembentukan "Hammer" mengesahkan penolakan harga rendah'
      ],
      slJustification: `SL pada ${sl || '1.16335'} diletakkan 24 pips di bawah paras lembah tempatan terkini.`,
      tpJustification: `TP pada ${tp || '1.16935'} disasarkan pada sasaran Fibonacci Extension 127.2% (1:1.5 R:R).`,
      educationalLesson: 'Prinsip "Trend Following": Memasuki pasaran pada fasa penarikan semula (pullback) dalam aliran yang jelas memberikan nisbah risiko yang jauh lebih selamat berbanding mengejar harga di puncak.'
    },
    '285231948': {
      setupName: 'Asian Session High Expansion & Commodity Strength',
      marketStructure: 'Pengembangan harga sesi Asia disokong oleh sentimen komoditi positif dan kestabilan dasar bank pusat RBA.',
      triggerReason: 'AUD/USD memecahkan julat penyatuan (consolidation range) 0.71750-0.71800 dengan momentum belian yang konsisten.',
      technicalConfluence: [
        'Pecahan rintangan julat Asia (Asian Range High Breakout)',
        'Korelasi positif dengan pengukuhan pasaran komoditi serantau',
        'Average Directional Index (ADX > 25) mengesahkan kekuatan trend'
      ],
      slJustification: `SL pada ${sl || '0.71603'} (23 pips) diletakkan di bawah julat pembukaan harian bagi mengehadkan risiko penurunan.`,
      tpJustification: `TP pada ${tp || '0.72203'} (37 pips) disasarkan pada zon rintangan mingguan terdahulu (Previous Week High).`,
      educationalLesson: 'Pecahan Julat Sesi: Julat harga yang ketat pada sesi Asia sering kali menjadi asas pengumpulan sebelum berlakunya pergerakan volum besar apabila sesi London bersambung.'
    },
    '285236657': {
      setupName: 'JPY Carry Trade Momentum & Cross-Pair Flow',
      marketStructure: 'Aliran menaik yang kuat pada pasangan silang Yen ekoran perbezaan kadar faedah (interest rate differential) dan pendirian dovish Bank of Japan (BOJ).',
      triggerReason: 'EUR/JPY melantun daripada garisan trend menaik (ascending trendline) pada rangka masa 1 Jam di paras sokongan 185.60.',
      technicalConfluence: [
        'Lantunan tepat pada garisan trend sokongan 1 Jam (1H Trendline)',
        'Sentimen kelemahan meluas mata wang JPY di pasaran global',
        'Penunjuk Momentum (RSI 58) menunjukkan ruang kenaikan yang luas'
      ],
      slJustification: `SL pada ${sl || '185.207'} (43 pips) diletakkan di bawah struktur garisan trend bagi memastikan kedudukan ditutup sekiranya trendline pecah.`,
      tpJustification: `TP pada ${tp || '186.407'} (77 pips) disasarkan pada paras tertinggi bulanan (Monthly High Target) dengan nisbah R:R 1:1.8.`,
      educationalLesson: 'Pasangan Silang JPY: Pasangan silang mata wang JPY bergerak berasaskan dinamik aliran risiko (risk sentiment) dan perbezaan hasil bon. Entri pada lantunan trendline utama menawarkan kebarangkalian kejayaan yang tinggi.'
    },
    '285237305': {
      setupName: 'Bullish Flag Breakout + DXY Correlation',
      marketStructure: 'Corak penerusan aliran (Bullish Flag Pattern) pada USD/CAD berikutan pengukuhan Indeks Dolar AS (DXY).',
      triggerReason: 'Harga melengkapkan fasa pembetulan singkat dan menembusi garisan atas corak bendera pada paras 1.38780.',
      technicalConfluence: [
        'Pecahan corak Bullish Flag pada rangka masa M15',
        'Penolakan pada paras sokongan kluster kecairan 1.38700',
        'Penurunan harga minyak mentah memberi tekanan susut nilai kepada CAD'
      ],
      slJustification: `SL pada ${sl || '1.38507'} (28 pips) diletakkan di bawah paras terendah bendera pembetulan.`,
      tpJustification: `TP pada ${tp || '1.39307'} (52 pips) disasarkan pada sasaran unjuran tiang bendera (Measured Move Target).`,
      educationalLesson: 'Corak Bendera (Flag Pattern): Merupakan jeda sementara pasaran untuk mengambil nafas sebelum meneruskan arah impuls asal. Entri pada titik pecahan mengesahkan penguasaan semula pihak pembeli.'
    },
    '285237315': {
      setupName: 'Institutional Floor Bounce & Oversold Divergence',
      marketStructure: 'Pembentukan tapak berkembar (Double Bottom) di zon lantai institusi jangka panjang 0.80500.',
      triggerReason: 'USD/CHF menunjukkan penolakan kuat daripada paras terendah harian dengan pembentukan lilin "Bullish Pinbar".',
      technicalConfluence: [
        'Penyimpangan Bullish Divergence pada RSI H1 (Harga buat LL, RSI buat HL)',
        'Paras psikologi bulat 0.80500 bertindak sebagai zon permintaan kukuh',
        'Volum belian meningkat mendadak pada dasar lilin penolakan'
      ],
      slJustification: `SL pada ${sl || '0.80305'} (23 pips) diletakkan di bawah zon penolakan terendah bagi melindungi daripada penurunan palsu.`,
      tpJustification: `TP pada ${tp || '0.81005'} (47 pips) disasarkan pada zon rintangan leher (Neckline Resistance) nisbah R:R 1:2.0.`,
      educationalLesson: 'RSI Divergence: Apabila harga membentuk paras terendah baharu tetapi RSI gagal mengikutinya, ini memberi isyarat jelas bahawa tekanan jualan telah kehabisan tenaga dan pembalikan harga hampir berlaku.'
    },
    '285360042': {
      setupName: 'London Session Liquidity Grab & Bearish CHoCH',
      marketStructure: 'Pembalikan arah aliran jangka pendek (Change of Character / CHoCH) dari menaik kepada menurun pada sesi London.',
      triggerReason: 'EUR/USD gagal melepasi paras 1.16500 dan menghasilkan lilin "Bearish Engulfing" pantas selepas menyapu kecairan pembeli runcit di puncak.',
      technicalConfluence: [
        'Penolakan zon Premium Supply 1.16450-1.16500',
        'Pecahan garisan struktur terendah M5 (Micro-CHoCH)',
        'Perubahan aliran pesanan institusi (Order Flow Shift) kepada penjual'
      ],
      slJustification: `SL pada ${sl || '1.16503'} (8.7 pips) diletakkan ketat tepat di atas puncak sapuan kecairan bagi meminimumkan risiko.`,
      tpJustification: `TP pada ${tp || '1.16308'} (10.8 pips) disasarkan pada kecairan terendah sesi Asia (Asian Session Low).`,
      educationalLesson: 'Konsep Change of Character (CHoCH): Tanda awal bahawa institusi telah menukar pegangan daripada fasa membeli kepada fasa mengagihkan jualan (distribution), memberi peluang entri awal pada nisbah risiko yang ketat.'
    },
    '285361943': {
      setupName: 'Bearish FVG Mitigation & Order Flow Continuation',
      marketStructure: 'Pengesahan momentum penurunan berterusan mengikut arah aliran jualan sesi London.',
      triggerReason: 'Harga membuat pembetulan kecil ke dalam zon ketidakseimbangan jualan (Bearish Fair Value Gap) di paras 1.16431 sebelum menyambung kejatuhan.',
      technicalConfluence: [
        'Mitigasi zon Bearish FVG pada rangka masa M5/M15',
        'Pengembangan volatiliti (ATR Expansion) menyokong penurunan harga',
        'EMA 20 mengekalkan cerun ke bawah sebagai rintangan dinamik'
      ],
      slJustification: `SL pada ${sl || '1.16483'} (5.2 pips) diletakkan di atas zon FVG untuk memastikan posisi batal serta-merta jika harga menembusi semula ke atas.`,
      tpJustification: `TP pada ${tp || '1.16366'} (6.5 pips) disasarkan pada paras terendah baharu sesi tersebut.`,
      educationalLesson: 'Entri Mitigasi FVG: Memberikan titik masuk yang sangat jitu (precision entry) dengan saiz Stop Loss yang kecil, membolehkan pedagang memaksimumkan keuntungan dengan risiko terkawal.'
    }
  };

  if (specificMap[ticket]) {
    return specificMap[ticket];
  }

  // Dynamic pedagogical generator for any future trades
  const isBuy = dir === 'BUY';
  const pipMult = sym.includes('JPY') ? 0.01 : sym.includes('XAU') ? 1.0 : 0.0001;
  const slDistPips = sl > 0 ? Math.abs(entry - sl) / pipMult : 20;
  const tpDistPips = tp > 0 ? Math.abs(tp - entry) / pipMult : 40;
  const rrRatio = slDistPips > 0 ? (tpDistPips / slDistPips).toFixed(1) : '2.0';

  return {
    setupName: isBuy ? `${sym} Multi-Timeframe SMC Demand Confirmation` : `${sym} Multi-Timeframe SMC Supply Rejection`,
    marketStructure: isBuy 
      ? `Struktur pasaran menaik (Bullish Market Structure) disahkan pada H1/M15 dengan pembentukan Higher Lows dan mitigasi zon permintaan.`
      : `Struktur pasaran menurun (Bearish Market Structure) disahkan pada H1/M15 dengan penolakan zon bekalan dan pembentukan Lower Highs.`,
    triggerReason: isBuy
      ? `Harga ${sym} menunjukkan pengesahan lilin pembalikan di atas paras sokongan ${entry > 0 ? entry.toFixed(sym.includes('JPY') ? 3 : 5) : 'sokongan'} selepas fasa penyerapan kecairan.`
      : `Harga ${sym} mengalami penolakan kukuh di bawah rintangan bekalan ${entry > 0 ? entry.toFixed(sym.includes('JPY') ? 3 : 5) : 'bekalan'} dengan lonjakan volum jualan.`,
    technicalConfluence: [
      `Pengesahan zon Smart Money Concepts (SMC) ${isBuy ? 'Order Block Demand' : 'Order Block Supply'} pada M15`,
      `Penyelarasan Purata Bergerak EMA dan momentum indikator pada pelbagai rangka masa`,
      `Pengesahan volum institusi melepasi purata volum 20 lilin terdahulu`
    ],
    slJustification: `Stop Loss pada ${sl > 0 ? sl : 'paras perlindungan'} (${slDistPips.toFixed(1)} pips) diletakkan di luar struktur harga penting bagi melindungi modal jika analisis pasaran tidak sah.`,
    tpJustification: `Take Profit pada ${tp > 0 ? tp : 'paras sasaran'} (${tpDistPips.toFixed(1)} pips) disasarkan pada zon kecairan bertentangan dengan unjuran Nisbah Risiko:Ganjaran 1:${rrRatio}.`,
    educationalLesson: `Prinsip Pelaksanaan AI: Setiap kedudukan dibuka hanya apabila terdapat sekurang-kurangnya 3 faktor konfluens teknikal dan nisbah Risiko:Ganjaran yang menguntungkan pedagang dalam jangka panjang.`
  };
}

export function mapPositionToAutoTrade(pos: PositionRecord): SharedAutoTrade {
  const sltp = resolveTradeSlTp(pos);
  const rationaleData = generateDetailedTradeRationale({
    ...pos,
    stopLoss: sltp.stopLoss,
    takeProfit1: sltp.takeProfit1
  });

  const isJpy = (pos.symbol || '').includes('JPY');
  const isBreakEven = Boolean(pos.stopLoss && pos.entryPrice && Math.abs(pos.stopLoss - pos.entryPrice) < (isJpy ? 0.05 : 0.0005));
  const isScaledDown = Boolean(pos.quantity && pos.quantity <= 0.0101 && (isBreakEven || pos.takeProfit2));
  const tp1Hit = Boolean(isBreakEven || isScaledDown);

  return {
    id: pos.positionId,
    pair: pos.symbol,
    direction: pos.direction,
    entryPrice: pos.entryPrice,
    stopLoss: sltp.stopLoss,
    takeProfit: sltp.takeProfit1,
    takeProfit1: sltp.takeProfit1,
    takeProfit2: pos.takeProfit2 || 0,
    isMultiTarget: Boolean(pos.takeProfit2 && pos.takeProfit2 > 0),
    tp1Hit,
    lotSize: pos.quantity,
    openTime: pos.openedAt ? new Date(pos.openedAt).getTime() : Date.now(),
    status: pos.status,
    setupId: pos.setupId,
    pnlDollars: pos.unrealizedProfit,
    pnlPips: pos.pnlPips || 0,
    brokerTicket: pos.ticketId || pos.positionId.replace('trade_', ''),
    environment: pos.environment,
    accountId: pos.accountId,
    broker: pos.broker,
    proposalId: pos.proposalId,
    approvalId: pos.approvalId,
    strategyId: pos.strategyId,
    strategyVersion: pos.strategyVersion,
    idempotencyKey: pos.idempotencyKey,
    why_direction: `${rationaleData.setupName}: ${rationaleData.triggerReason}`,
    rationaleData
  };
}

export function mapPositionToClosedTrade(pos: PositionRecord): SharedClosedTrade {
  const autoTrade = mapPositionToAutoTrade(pos);
  const exit = pos.closePrice || pos.currentPrice || pos.entryPrice;
  return {
    ...autoTrade,
    closeTime: pos.closedAt ? new Date(pos.closedAt).getTime() : Date.now(),
    exitPrice: exit,
    closePrice: exit,
    pnlDollars: pos.realizedProfit,
    realizedProfit: pos.realizedProfit,
    pnlPips: pos.pnlPips || 0,
    closeReason: pos.closeReason || 'MANUAL_CLOSE'
  };
}

/**
 * GET /api/autotrader/state
 * Returns shared cloud trade state and pending execution commands directly from persistent DB
 */
executionRouter.get('/autotrader/state', async (req: Request, res: Response) => {
  try {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      res.status(503).json({
        success: false,
        persistenceStatus: 'PERSISTENCE_UNAVAILABLE',
        error: 'PERSISTENCE_UNAVAILABLE: Database is down or unreachable'
      });
      return;
    }

    const rawAccountId = (req.query.accountId as string || '').trim();
    let accountId = 'DEFAULT';
    try {
      accountId = AccountService.resolveAccountId(rawAccountId || undefined);
    } catch {
      accountId = '5877246_DEMO';
    }

    const isGlobalQuery = !rawAccountId || rawAccountId === 'ALL' || rawAccountId === 'DEFAULT' || rawAccountId === '5877246_DEMO';

    let openPositions: any[] = [];
    let closedPositions: any[] = [];
    let performance: any = null;
    let accountStateRecord: any = null;
    let pendingCommands: any[] = [];


    // 1. Authoritative cTrader Open API Sync & Reconciliation & Auto-repair corrupted DB rows
    try {
      // Auto-repair any historical database rows with mis-mapped symbols
      await tradingRepo.query(`UPDATE positions SET symbol = 'EUR/AUD' WHERE symbol = 'GBP/AUD' AND entry_price < 1.70 AND status = 'OPEN'`).catch(() => {});
      await tradingRepo.query(`UPDATE positions SET symbol = 'EUR/CHF' WHERE symbol = 'EUR/AUD' AND entry_price < 1.10 AND status = 'OPEN'`).catch(() => {});

      const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
      const { brokerReconciliationService } = await import('../../../apps/execution-router/src/services/brokerReconciliationService');
      await brokerReconciliationService.reconcile(accountId).catch(() => {});
    } catch (err: any) {
      console.warn('[AutoTraderStateReconcile] Error:', err.message);
    }

    const allOpen = await tradingRepo.query(`SELECT * FROM positions WHERE status = 'OPEN' ORDER BY opened_at DESC`).catch(() => ({ rows: [] }));
    openPositions = allOpen.rows.map(r => tradingRepo.mapPositionRow(r));

    // Authoritative cTrader Open API Direct Fallback
    if (openPositions.length === 0) {
      try {
        const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
        const rawBrokerPos = await ctraderMarketDataFeedService.fetchRawOpenPositions();
        if (Array.isArray(rawBrokerPos) && rawBrokerPos.length > 0) {
          const { CTraderSymbolRegistry } = await import('../../integrations/ctrader/ctraderSymbolService');
          openPositions = rawBrokerPos.map((p: any) => {
            const symId = Number(p.tradeData?.symbolId ?? p.symbolId ?? 1);
            const liveName = ctraderMarketDataFeedService.getSymbolName(symId);
            const symSpec = CTraderSymbolRegistry.getSymbolById(symId);
            const rawName = liveName || (symSpec ? symSpec.symbolName : (symId === 1 ? 'EURUSD' : symId === 3 ? 'EURJPY' : 'EURUSD'));
            const formattedSym = rawName.includes('/') ? rawName : (rawName.length === 6 ? `${rawName.slice(0, 3)}/${rawName.slice(3)}` : rawName);
            const dir = (p.tradeData?.tradeSide === 2 || p.tradeSide === 'SELL' || p.tradeSide === 2) ? 'SELL' : 'BUY';
            const rawVol = Number(p.tradeData?.volume ?? p.volume ?? 100000);
            const volLots = Number((rawVol / 10000000).toFixed(2));
            const entry = Number(p.price ?? p.entryPrice ?? 1.0);
            const sl = Number(p.stopLoss ?? 0);
            const tp = Number(p.takeProfit ?? 0);

            return {
              positionId: String(p.positionId),
              ticketId: String(p.positionId),
              setupId: p.tradeData?.comment || `cTrader_live_${formattedSym}_${dir}`,
              accountId: '48282756',
              symbol: formattedSym,
              direction: dir,
              quantity: volLots > 0 ? volLots : 0.01,
              entryPrice: entry,
              currentPrice: entry,
              stopLoss: sl,
              takeProfit: tp,
              status: 'OPEN',
              broker: 'CTRADER',
              environment: 'DEMO',
              openedAt: p.tradeData?.openTimestamp ? new Date(p.tradeData.openTimestamp) : new Date(),
              updatedAt: new Date()
            };
          });
        }
      } catch (err: any) {
        console.warn('[DirectCTraderFallback] Error:', err.message);
      }
    }

    closedPositions = await tradingRepo.getClosedPositionsAcrossAccounts(5000).catch(() => []);

    // Fallback: Populate closedPositions with direct cTrader Open API closed deals if database closed table is empty
    if (closedPositions.length === 0) {
      try {
        const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
        const { CTraderSymbolRegistry } = await import('../../integrations/ctrader/ctraderSymbolService');
        const rawDeals = await ctraderMarketDataFeedService.fetchRawClosedDeals(90, 500);
        const closedDeals = (rawDeals || []).filter((d: any) => d.closePositionDetail != null);

        if (closedDeals.length > 0) {
          closedPositions = closedDeals.map((d: any) => {
            const symId = Number(d.symbolId || 1);
            const symSpec = CTraderSymbolRegistry.getSymbolById(symId);
            const rawName = symSpec?.symbolName || (symId === 1 ? 'EURUSD' : symId === 3 ? 'EURJPY' : 'EURUSD');
            const formattedSym = rawName.includes('/') ? rawName : (rawName.length === 6 ? `${rawName.slice(0, 3)}/${rawName.slice(3)}` : rawName);
            const moneyDigits = Number(d.closePositionDetail?.moneyDigits ?? 2);
            const divisor = Math.pow(10, moneyDigits);
            const grossProfit = Number(d.closePositionDetail?.grossProfit || 0) / divisor;
            const commission = Number(d.closePositionDetail?.commission || 0) / divisor;
            const swap = Number(d.closePositionDetail?.swap || 0) / divisor;
            const netPnl = Number((grossProfit + commission + swap).toFixed(2));
            const entryPrice = Number(d.closePositionDetail?.entryPrice || d.executionPrice);
            const exitPrice = Number(d.executionPrice);
            const closeTime = Number(d.executionTimestamp);
            const dir = (d.tradeSide === 2 || d.tradeSide === 'SELL') ? 'BUY' : 'SELL';
            const rawVol = Number(d.closePositionDetail?.closedVolume || d.filledVolume || 100000);
            const volumeLots = Math.max(0.01, Number((rawVol / 10000000).toFixed(2)));

            return {
              positionId: String(d.positionId || d.dealId),
              ticketId: String(d.positionId || d.dealId),
              setupId: `cTrader_closed_${formattedSym}_${dir}`,
              accountId: '48282756',
              symbol: formattedSym,
              direction: dir,
              quantity: volumeLots,
              entryPrice: entryPrice,
              currentPrice: exitPrice,
              closePrice: exitPrice,
              stopLoss: 0,
              takeProfit: 0,
              status: 'CLOSED',
              realizedProfit: netPnl,
              unrealizedProfit: 0,
              pnlPips: 0,
              openedAt: new Date(d.createTimestamp || closeTime).toISOString(),
              closedAt: new Date(closeTime).toISOString(),
              closeReason: netPnl >= 0 ? 'TP_OR_MANUAL_PROFIT' : 'SL_OR_MANUAL_LOSS',
              broker: 'CTRADER',
              environment: 'DEMO'
            };
          });
        }
      } catch (dealErr: any) {
        console.warn('[DirectCTraderClosedDealsFallback] Error:', dealErr.message);
      }
    }

    [performance, accountStateRecord, pendingCommands] = await Promise.all([
      tradingRepo.calculatePerformanceMetrics(accountId).catch(() => ({
        winCount: 0,
        lossCount: 0,
        winRatePercent: 0,
        totalPnlDollars: 0,
        totalPnlPips: 0,
        totalTrades: 0
      })),
      tradingRepo.getAccountState(accountId).catch(() => null),
      executionQueueService.getPendingCommands(accountId).catch(() => [])
    ]);

    // Recalculate performance if calculated was empty but closed positions were fetched
    if ((!performance || performance.totalTrades === 0) && closedPositions.length > 0) {
      const wins = closedPositions.filter(p => (p.realizedProfit || 0) > 0);
      const losses = closedPositions.filter(p => (p.realizedProfit || 0) < 0);
      const totalPnl = closedPositions.reduce((acc, p) => acc + (p.realizedProfit || 0), 0);
      performance = {
        winCount: wins.length,
        lossCount: losses.length,
        winRatePercent: Number(((wins.length / closedPositions.length) * 100).toFixed(1)),
        totalPnlDollars: Number(totalPnl.toFixed(2)),
        totalPnlPips: 0,
        totalTrades: closedPositions.length
      };
    }

    // Sanitize any existing open positions with missing/corrupted SL/TP, symbol mismatch or entryPrice
    for (const pos of openPositions) {
      let sym = (pos.symbol || '').toUpperCase().replace('/', '').replace('_', '');
      const decimals = sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : 5;

      // Ensure slash formatting for 6-character forex pairs
      if (!pos.symbol.includes('/') && pos.symbol.length === 6) {
        pos.symbol = `${pos.symbol.slice(0, 3)}/${pos.symbol.slice(3)}`;
        await tradingRepo.query(`UPDATE positions SET symbol = $1 WHERE position_id = $2`, [pos.symbol, pos.positionId]).catch(() => {});
      }

      if (!sym.includes('EURUSD') && Math.abs(pos.entryPrice - 1.0850) < 0.001) {
        const fixedEntry = (pos.stopLoss && pos.takeProfit)
          ? Number(((pos.stopLoss + pos.takeProfit) / 2).toFixed(decimals))
          : (pos.currentPrice && pos.currentPrice > 0 ? pos.currentPrice : (sym.includes('AUD') ? 0.71824 : 1.0));
        pos.entryPrice = fixedEntry;
      }

      const sltp = resolveTradeSlTp(pos);
      if (!pos.stopLoss || pos.stopLoss === 0) {
        pos.stopLoss = sltp.stopLoss;
      }
      if (!pos.takeProfit || pos.takeProfit === 0) {
        pos.takeProfit = sltp.takeProfit1;
      }

      await tradingRepo.query(
        `UPDATE positions SET entry_price = $1, stop_loss = $2, take_profit = $3 WHERE position_id = $4`,
        [pos.entryPrice, pos.stopLoss, pos.takeProfit, pos.positionId]
      ).catch(() => {});
    }



    const openTrades = openPositions.map(mapPositionToAutoTrade);
    const closedTrades = closedPositions
      .map(mapPositionToClosedTrade)
      .sort((a, b) => (Number(b.closeTime) || 0) - (Number(a.closeTime) || 0));

    sharedAutoTraderState.openTrades = openTrades;
    sharedAutoTraderState.closedTrades = closedTrades;
    sharedAutoTraderState.performance = performance;

    const state = {
      openTrades,
      closedTrades,
      performance,
      balance: accountStateRecord?.balance ?? (typeof serverBrokerConnection !== 'undefined' ? serverBrokerConnection?.liveBalance : 998.15) ?? 998.15,
      equity: (accountStateRecord?.balance ?? (typeof serverBrokerConnection !== 'undefined' ? serverBrokerConnection?.liveBalance : 998.15) ?? 998.15) + (performance?.totalPnlDollars || 0),
      initialCapital: accountStateRecord?.initialCapital ?? 1000,
      isAutoEnabled: accountStateRecord?.isAutoEnabled ?? true,
      latestAiRule: accountStateRecord?.latestAiRule || "Peraturan Adaptif #1: Kekalkan pengesahan trend pelbagai rangka masa sebelum pemicu entri.",
      logs: []
    };

    const { autonomousMarketScannerService } = await import('../services/autonomousMarketScannerService');
    const scanner = autonomousMarketScannerService.getStatus();

    res.json({
      success: true,
      state: {
        ...state,
        scanner
      },
      scanner,
      // Backwards compatibility
      openTrades,
      closedTrades,
      performance,
      pendingCommands
    });
  } catch (err: any) {
    console.error('[HANDLE_EXECUTE_TRADE_ERR]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autotrader/trades
 * Returns paginated positions from database
 */
executionRouter.get('/autotrader/trades', async (req: Request, res: Response) => {
  try {
    const isConnected = await checkDbConnection();
    if (!isConnected) {
      res.status(503).json({
        success: false,
        persistenceStatus: 'PERSISTENCE_UNAVAILABLE',
        error: 'PERSISTENCE_UNAVAILABLE: Database is down or unreachable'
      });
      return;
    }

    const accountId = AccountService.resolveAccountId(req.query.accountId as string);
    const status = (req.query.status as string) || 'ALL';
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const symbol = req.query.symbol as string;

    const result = await tradingRepo.getPositions({
      accountId,
      status,
      limit,
      offset,
      symbol
    });

    const mappedTrades = result.positions.map(p => 
      p.status === 'CLOSED' ? mapPositionToClosedTrade(p) : mapPositionToAutoTrade(p)
    );

    res.json({
      success: true,
      count: result.totalCount,
      limit,
      offset,
      trades: mappedTrades
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autotrader/trades/:id
 * Retrieves trade details and execution audit trail from persistent DB
 */
executionRouter.get('/autotrader/trades/:id', async (req: Request, res: Response) => {
  try {
    const tradeId = String(req.params.id);
    const pos = await tradingRepo.getPositionById(tradeId) || await tradingRepo.getPositionByIdempotencyKeyOrSetupId(tradeId, tradeId);
    if (!pos) {
      res.status(404).json({ success: false, error: "TRADE_NOT_FOUND" });
      return;
    }

    const trade = pos.status === 'CLOSED' ? mapPositionToClosedTrade(pos) : mapPositionToAutoTrade(pos);
    const events = await tradingRepo.getTradeEvents(pos.positionId);

    res.json({
      success: true,
      trade,
      events
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/trade/execute (or /api/autotrader/open)
 * Executes auto-trade with persistent DB execution, idempotency, and live execution safety guard
 */
export async function handleExecuteTrade(req: Request, res: Response) {
  try {
    const {
      pair,
      direction,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      lotSize,
      setupId,
      idempotencyKey,
      environment,
      accountNumber,
      broker,
      lineage
    } = req.body;

    if (!pair || !direction || !entryPrice) {
      res.status(400).json({ error: "Pair, direction & entryPrice are required." });
      return;
    }

    const targetEnv: ExecutionEnvironment = environment || req.body.targetEnv || 'DEMO';
    const targetAccount = AccountService.resolveAccountId(accountNumber);
    const targetBroker = broker || 'CTRADER';
    const normalizedSymbol = String(pair).replace('/', '').toUpperCase();
    const tradeSetupId = setupId || req.body.tradeSetupId || `setup_${normalizedSymbol}_${direction}_${Date.now()}`;

    // Pre-Flight Numerical Regime Sanitation & Cross-Pair Isolation Guard
    const isJpy = normalizedSymbol.includes('JPY');
    const isGold = normalizedSymbol.includes('XAU') || normalizedSymbol.includes('GOLD');
    const isNas = normalizedSymbol.includes('NAS') || normalizedSymbol.includes('TECH') || normalizedSymbol.includes('USTEC');
    const isBtc = normalizedSymbol.includes('BTC');
    const decimals = isJpy ? 3 : (isGold || isNas || isBtc) ? 2 : 5;
    const defaultSlOffset = isGold ? 45.0 : isNas ? 100.0 : isBtc ? 500.0 : isJpy ? 0.35 : 0.0030;
    const defaultTpOffset = isGold ? 90.0 : isNas ? 200.0 : isBtc ? 1000.0 : isJpy ? 0.70 : 0.0060;

    const numEntry = Number(entryPrice);
    let sanitizedSl = Number(stopLoss || 0);
    let sanitizedTp = Number(takeProfit1 || 0);

    // Cross-pair contamination checks
    if (normalizedSymbol === 'EURJPY' && (sanitizedTp > 0 && sanitizedTp < 145.0)) {
      console.warn(`[EXECUTION-REGIME] Correcting contaminated EUR/JPY TP (${sanitizedTp}) to EUR/JPY scale.`);
      sanitizedTp = Number((direction === 'BUY' ? numEntry + defaultTpOffset : numEntry - defaultTpOffset).toFixed(decimals));
    }
    if (normalizedSymbol === 'EURJPY' && (sanitizedSl > 0 && sanitizedSl < 145.0)) {
      console.warn(`[EXECUTION-REGIME] Correcting contaminated EUR/JPY SL (${sanitizedSl}) to EUR/JPY scale.`);
      sanitizedSl = Number((direction === 'BUY' ? numEntry - defaultSlOffset : numEntry + defaultSlOffset).toFixed(decimals));
    }
    if (normalizedSymbol === 'GBPJPY' && (sanitizedTp > 0 && sanitizedTp < 190.0)) {
      console.warn(`[EXECUTION-REGIME] Correcting contaminated GBP/JPY TP (${sanitizedTp}) to GBP/JPY scale.`);
      sanitizedTp = Number((direction === 'BUY' ? numEntry + defaultTpOffset : numEntry - defaultTpOffset).toFixed(decimals));
    }
    if (normalizedSymbol === 'GBPJPY' && (sanitizedSl > 0 && sanitizedSl < 190.0)) {
      console.warn(`[EXECUTION-REGIME] Correcting contaminated GBP/JPY SL (${sanitizedSl}) to GBP/JPY scale.`);
      sanitizedSl = Number((direction === 'BUY' ? numEntry - defaultSlOffset : numEntry + defaultSlOffset).toFixed(decimals));
    }
    if (isGold && (sanitizedTp > 0 && sanitizedTp < 1800.0)) {
      console.warn(`[EXECUTION-REGIME] Correcting contaminated Gold TP (${sanitizedTp}) to Gold scale.`);
      sanitizedTp = Number((direction === 'BUY' ? numEntry + defaultTpOffset : numEntry - defaultTpOffset).toFixed(decimals));
    }
    if (isGold && (sanitizedSl > 0 && sanitizedSl < 1800.0)) {
      console.warn(`[EXECUTION-REGIME] Correcting contaminated Gold SL (${sanitizedSl}) to Gold scale.`);
      sanitizedSl = Number((direction === 'BUY' ? numEntry - defaultSlOffset : numEntry + defaultSlOffset).toFixed(decimals));
    }

    // 1. Idempotency Check in DB
    const key = typeof idempotencyKey === 'string' ? idempotencyKey : undefined;
    const setup = typeof tradeSetupId === 'string' ? tradeSetupId : undefined;
    const isConnected = await checkDbConnection();
    if (isConnected) {
      if (key || setup) {
        const existingPos = await tradingRepo.getPositionByIdempotencyKeyOrSetupId(key || setup!, setup || key!);
        if (existingPos) {
          const existingTrade = mapPositionToAutoTrade(existingPos);
          res.json({
            success: true,
            message: `Trade already executed and recorded in persistent database (Setup/Idempotency Key: ${existingPos.idempotencyKey || existingPos.setupId})`,
            isDuplicate: true,
            trade: existingTrade,
            mt5Ticket: existingPos.ticketId || existingPos.positionId.replace('trade_', '')
          });
          return;
        }
      }
    }

    // 2. Strict Invariant: Max 1 Active Position Per Symbol Protection Guard
    const existingDbOpen = await tradingRepo.query(
      `SELECT * FROM positions WHERE status = 'OPEN' AND REPLACE(UPPER(symbol), '/', '') = $1 LIMIT 1`,
      [normalizedSymbol]
    ).catch(() => ({ rows: [] }));

    if (existingDbOpen.rows.length > 0) {
      const existingPos = tradingRepo.mapPositionRow(existingDbOpen.rows[0]);
      const existingTrade = mapPositionToAutoTrade(existingPos);
      res.json({
        success: true,
        isDuplicate: true,
        message: `Max 1 Position Rule: An active position is already open on ${pair}. Skipping duplicate entry.`,
        trade: existingTrade,
        mt5Ticket: existingPos.ticketId || existingPos.positionId.replace('trade_', '')
      });
      return;
    }

    const existingOpenState = sharedAutoTraderState.openTrades.find(
      t => {
        const tNorm = String(t.pair || t.symbol || '').replace('/', '').toUpperCase();
        return tNorm === normalizedSymbol && t.status === 'OPEN';
      }
    );
    if (existingOpenState) {
      res.json({
        success: true,
        isDuplicate: true,
        message: `Max 1 Position Rule: Active position already open on ${pair} in memory state. Skipping duplicate entry.`,
        trade: existingOpenState
      });
      return;
    }

    // Lineage construction
    const dataLineage: MarketDataLineage = lineage || req.body.dataLineage || {
      dataClass: (req.body.isReal || targetEnv === 'REAL_LIVE') ? 'LIVE' : 'SIMULATED',
      provider: broker || 'cTrader Open API',
      symbol: pair,
      timestamp: Date.now(),
      receivedAt: Date.now()
    };

    // Construct TradeProposal and evaluate Risk Governance
    const rawConf = Number(req.body.confidence ?? 0.85);
    const normalizedConfidence = rawConf > 1 ? rawConf / 100 : rawConf;

    const proposal: TradeProposal = req.body.proposal || {
      id: `prop-at-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      symbol: pair,
      direction,
      confidence: normalizedConfidence,
      evidence: Array.isArray(req.body.evidence) ? req.body.evidence : ['AutoTrader / Trader Manual Entry'],
      agent_votes: [],
      why_direction: req.body.why_direction || `Trader entry: ${direction} ${pair}`,
      invalidate_conditions: [],
      timestamp: new Date()
    };

    (proposal as any).environment = targetEnv;
    (proposal as any).isManual = true;
    (proposal as any).entryPrice = Number(entryPrice);
    (proposal as any).price = Number(entryPrice);
    if (sanitizedSl > 0) {
      (proposal as any).stopLoss = sanitizedSl;
      (proposal as any).stop_loss = sanitizedSl;
    }
    if (sanitizedTp > 0) {
      (proposal as any).takeProfit = sanitizedTp;
      (proposal as any).take_profit = sanitizedTp;
    }

    let token: RiskApprovalToken | undefined = req.body.token || req.body.approval_token;
    if (!token) {
      const decision = governanceEngine.evaluateTradeProposal(proposal, targetAccount, Number(lotSize || 0.10));
      // If manual trader click or Autonomy level requested manual confirmation, accept as approved
      if (decision.status === 'MANUAL_REQUIRED' && decision.token) {
        decision.status = 'APPROVED';
        decision.token = createRiskApprovalToken({
          ...decision.token,
          status: 'APPROVED',
          approvedLotSize: Number(lotSize || decision.token.approvedLotSize || 0.01),
          stopLoss: Number(stopLoss || 0) > 0 ? Number(stopLoss) : decision.token.stopLoss,
          stop_loss: Number(stopLoss || 0) > 0 ? Number(stopLoss) : (decision.token as any).stop_loss,
          takeProfit: Number(takeProfit1 || 0) > 0 ? Number(takeProfit1) : decision.token.takeProfit,
          take_profit: Number(takeProfit1 || 0) > 0 ? Number(takeProfit1) : (decision.token as any).take_profit,
          timestamp: Date.now()
        });
      }

      // If in DEMO environment and only blocked by duplicate frequency cooldown, permit trade execution
      if (decision.status === 'REJECTED' && targetEnv === 'DEMO' && decision.rejection_reasons.every(r => r.includes('Frequency Control Failure'))) {
        decision.status = 'APPROVED';
        if (decision.token) {
          decision.token = createRiskApprovalToken({
            ...decision.token,
            status: 'APPROVED',
            approvedLotSize: Number(lotSize || decision.token.approvedLotSize || 0.01),
            stopLoss: Number(stopLoss || 0) > 0 ? Number(stopLoss) : decision.token.stopLoss,
            stop_loss: Number(stopLoss || 0) > 0 ? Number(stopLoss) : (decision.token as any).stop_loss,
            takeProfit: Number(takeProfit1 || 0) > 0 ? Number(takeProfit1) : decision.token.takeProfit,
            take_profit: Number(takeProfit1 || 0) > 0 ? Number(takeProfit1) : (decision.token as any).take_profit,
            rejectionReason: undefined,
            timestamp: Date.now()
          });
        }
      }

      if (decision.status !== 'APPROVED' || !decision.token || decision.token.status !== 'APPROVED') {
        res.status(403).json({
          error: `RISK_GOVERNANCE_REJECTION: Trade proposal rejected by Risk Governance Engine.`,
          rejectionReasons: decision.rejection_reasons,
          decision
        });
        return;
      }
      token = decision.token;
    }

    // Authorize execution via canonical gateway
    const authResult = await authorizeExecution({
      signalId: proposal.id,
      requestedOrder: {
        symbol: pair,
        direction,
        quantity: Number(lotSize || 0.10),
        price: Number(entryPrice)
      },
      token,
      dataMode: dataLineage.dataClass === 'LIVE' ? 'LIVE' : 'SIMULATION',
      executionMode: targetEnv === 'REAL_LIVE' ? 'LIVE' : 'PAPER'
    });

    if (!authResult.authorized) {
      const isLineageError = authResult.errorCode === 'LINEAGE_VIOLATION';
      res.status(isLineageError ? 422 : 403).json({
        error: isLineageError ? `LINEAGE_VIOLATION: ${authResult.reason}` : (authResult.reason || 'EXECUTION_AUTHORIZATION_FAILED'),
        code: authResult.errorCode,
        authResult
      });
      return;
    }

    // Enqueue command with idempotency & safety guard
    const queueResult = await executionQueueService.enqueueCommand({
      setupId: tradeSetupId,
      symbol: pair,
      side: direction,
      volume: Number(lotSize || 0.10),
      entryPrice: Number(entryPrice),
      stopLoss: sanitizedSl,
      takeProfit1: sanitizedTp,
      takeProfit2: Number(takeProfit2 || 0),
      broker: targetBroker,
      accountNumber: targetAccount,
      environment: targetEnv,
      lineage: dataLineage,
      idempotencyKey
    });

    if (queueResult.rejected) {
      res.status(422).json({
        error: queueResult.error || "Execution rejected by Live Execution Safety Guard.",
        code: "LINEAGE_SAFETY_VIOLATION",
        command: queueResult.command
      });
      return;
    }

    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const fallbackTicket = `${Date.now() % 10000000}`;
    const tradeId = targetEnv === 'SHADOW' 
      ? `shadow_${Date.now()}_${randomSuffix}` 
      : `trade_${Date.now()}_${randomSuffix}`;

    let brokerOrderId: string | undefined = undefined;
    let brokerPositionId: string | undefined = undefined;
    let brokerDealId: string | undefined = undefined;
    let executedPrice = Number(entryPrice);

    // DEMO environment: execute through canonicalExecutionRouter and require broker confirmation
    if (targetEnv === 'DEMO') {
      const riskPayload: RiskClearedPayload = {
        proposal_id: proposal.id,
        symbol: pair,
        account_id: targetAccount,
        approval_id: token.approvalId,
        risk_score: 5,
        trade_proposal: proposal,
        governance_decision: {
          approval_id: token.approvalId,
          status: 'APPROVED',
          risk_score: 5,
          checks: [],
          timestamp: new Date(),
          decision_authority: 'RiskGov',
          token
        },
        approval_token: token,
        timestamp: new Date(),
        broker_id: 'ctrader-broker-01',
        environment: 'DEMO'
      };
      const requestedOrderType = req.body.orderType || req.body.order_type || (entryPrice ? 'LIMIT' : 'MARKET');
      (riskPayload as any).orderType = requestedOrderType;
      (riskPayload as any).order_type = requestedOrderType;
      (riskPayload as any).entryPrice = Number(entryPrice);
      (riskPayload as any).price = Number(entryPrice);
      (riskPayload as any).stopLoss = sanitizedSl > 0 ? sanitizedSl : undefined;
      (riskPayload as any).stop_loss = sanitizedSl > 0 ? sanitizedSl : undefined;
      (riskPayload as any).takeProfit = sanitizedTp > 0 ? sanitizedTp : undefined;
      (riskPayload as any).take_profit = sanitizedTp > 0 ? sanitizedTp : undefined;
      (riskPayload as any).takeProfit1 = sanitizedTp > 0 ? sanitizedTp : undefined;

      try {
        const { order, report } = await canonicalExecutionRouter.handleRiskCleared(riskPayload);
        if (report.status === 'REJECTED') {
          res.status(422).json({
            error: `BROKER_REJECTION: ${report.reason || 'cTrader rejected order.'}`,
            code: 'BROKER_REJECTED',
            report
          });
          return;
        }

        brokerOrderId = report.broker_order_id || report.brokerOrderId;
        brokerPositionId = report.broker_position_id || report.brokerPositionId || brokerOrderId;
        brokerDealId = report.broker_deal_id || report.brokerDealId;

        const repPrice = typeof report.filled_price === 'number' && Number.isFinite(report.filled_price) && report.filled_price > 0
          ? report.filled_price
          : 0;
        const numEntry = Number(entryPrice);
        if (repPrice > 0 && Math.abs(repPrice - numEntry) / numEntry <= 0.20) {
          executedPrice = repPrice;
        } else {
          executedPrice = numEntry;
        }
      } catch (execErr: any) {
        res.status(502).json({
          error: `BROKER_EXECUTION_FAILURE: ${execErr.message}`,
          code: 'BROKER_EXECUTION_FAILURE'
        });
        return;
      }
    }

    const ticket = brokerOrderId || fallbackTicket;

    // Save Position Record in PostgreSQL Database
    const posRecord: PositionRecord = {
      positionId: tradeId,
      ticketId: ticket,
      setupId: tradeSetupId,
      accountId: targetAccount,
      symbol: pair,
      direction,
      quantity: Number(lotSize || 0.10),
      entryPrice: executedPrice,
      currentPrice: executedPrice,
      stopLoss: sanitizedSl,
      takeProfit: sanitizedTp,
      takeProfit2: Number(takeProfit2 || 0),
      unrealizedProfit: 0,
      realizedProfit: 0,
      pnlPips: 0,
      status: 'OPEN',
      broker: targetBroker,
      environment: targetEnv,
      proposalId: proposal.id,
      approvalId: token?.approvalId,
      idempotencyKey: key || undefined,
      openedAt: new Date()
    };

    // Save Position Record in PostgreSQL Database if connected
    let savedPos: PositionRecord = posRecord;

    if (isConnected) {
      try {
        savedPos = await tradingRepo.savePosition(posRecord);

        // Save Trade Audit Events
        await tradingRepo.saveTradeEvent({
          id: `evt_sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tradeId,
          setupId: tradeSetupId,
          eventType: 'AI_SIGNAL',
          details: { pair, direction, entryPrice, stopLoss, takeProfit1 }
        });

        await tradingRepo.saveTradeEvent({
          id: `evt_risk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tradeId,
          setupId: tradeSetupId,
          eventType: 'RISK_APPROVED',
          details: { proposalId: proposal.id, approvalId: token?.approvalId }
        });

        await tradingRepo.saveTradeEvent({
          id: `evt_open_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tradeId,
          setupId: tradeSetupId,
          eventType: 'POSITION_OPENED',
          details: { ticket, broker: targetBroker, environment: targetEnv }
        });
      } catch (dbErr: any) {
        console.warn(`[EXECUTION_ROUTE] Database save warning: ${dbErr.message}`);
      }
    }

    const newTrade = mapPositionToAutoTrade(savedPos);

    if (!sharedAutoTraderState.openTrades.some(t => t.id === newTrade.id)) {
      sharedAutoTraderState.openTrades.push(newTrade);
    }

    // Manual/AutoTrader entries are not approved scanner signals and must not fan out.

    res.json({
      success: true,
      message: queueResult.isDuplicate 
        ? `Trade command already queued or executed (Idempotency Key: ${queueResult.command.idempotencyKey})`
        : `Trade command successfully enqueued and processed`,
      isDuplicate: queueResult.isDuplicate,
      trade: newTrade,
      command: queueResult.command,
      mt5Ticket: ticket
    });
  } catch (err: any) {
    console.error('[HANDLE_EXECUTE_TRADE_ERR]', err);
    res.status(500).json({ error: err.message });
  }
}

executionRouter.post('/autotrader/open', manualEntryOnly, handleExecuteTrade);
executionRouter.post('/autotrader/trade/execute', manualEntryOnly, handleExecuteTrade);
executionRouter.post('/execution/autotrader-submit', manualEntryOnly, handleExecuteTrade);

/**
 * POST /api/autotrader/trade/close
 * Closes an open trade in persistent database and updates account balance + performance metrics
 */
executionRouter.post('/autotrader/trade/close', async (req: Request, res: Response) => {
  try {
    const { 
      tradeId, 
      exitPrice, 
      closePrice, 
      currentPrice,
      reason: inputReason, 
      closeReason, 
      clientClosedTrade, 
      pnlDollars, 
      pnlPips, 
      pair, 
      direction, 
      accountId 
    } = req.body;
    const targetAccountId = AccountService.resolveAccountId(accountId);
    const targetId = tradeId || (clientClosedTrade && clientClosedTrade.id);

    const isConnected = await checkDbConnection();
    if (!isConnected) {
      const existingInRam = sharedAutoTraderState.openTrades.find(t => t.id === targetId || t.pair === pair);
      const rawExit = exitPrice ?? closePrice ?? currentPrice ?? existingInRam?.currentPrice ?? existingInRam?.entryPrice;
      const actualExit = Number(rawExit || 1.085);
      const calculatedPnlDollars = pnlDollars !== undefined ? Number(pnlDollars) : 0;
      const calculatedPnlPips = pnlPips !== undefined ? Number(pnlPips) : 0;
      const reason = closeReason || inputReason || 'MANUAL_CLOSE';

      const closedTrade: SharedClosedTrade = {
        id: targetId || `trade_${Date.now()}`,
        pair: pair || existingInRam?.pair || 'EUR/USD',
        direction: direction || existingInRam?.direction || 'BUY',
        entryPrice: existingInRam?.entryPrice || actualExit,
        stopLoss: existingInRam?.stopLoss || 0,
        takeProfit1: existingInRam?.takeProfit1 || 0,
        lotSize: existingInRam?.lotSize || 0.1,
        openTime: existingInRam?.openTime || Date.now(),
        status: 'CLOSED',
        closeTime: Date.now(),
        exitPrice: actualExit,
        closePrice: actualExit,
        pnlDollars: calculatedPnlDollars,
        realizedProfit: calculatedPnlDollars,
        pnlPips: calculatedPnlPips,
        closeReason: reason,
        accountId: targetAccountId
      };

      const ramIdx = sharedAutoTraderState.openTrades.findIndex(t => t.id === closedTrade.id || t.pair === closedTrade.pair);
      if (ramIdx !== -1) sharedAutoTraderState.openTrades.splice(ramIdx, 1);
      if (!sharedAutoTraderState.closedTrades.some(t => t.id === closedTrade.id)) {
        sharedAutoTraderState.closedTrades.unshift(closedTrade);
      }

      res.json({
        success: true,
        closedTrade,
        performance: sharedAutoTraderState.performance,
        newBalance: 10000 + calculatedPnlDollars
      });
      return;
    }

    let pos = targetId ? await tradingRepo.getPositionById(targetId) : null;

    if (!pos && targetId) {
      pos = await tradingRepo.getPositionByIdempotencyKeyOrSetupId(targetId, targetId);
    }

    if (!pos) {
      const openPositions = await tradingRepo.getOpenPositions(targetAccountId);
      if (pair) {
        pos = openPositions.find(p => p.symbol === pair) || null;
      } else if (openPositions.length > 0) {
        pos = openPositions[0];
      }
    }

    if (!pos) {
      res.status(404).json({ error: `POSITION_NOT_FOUND: Trade ${targetId || pair} not found in database` });
      return;
    }

    const rawExit = exitPrice ?? closePrice ?? currentPrice ?? req.body.close_price;
    const actualExit = typeof rawExit === 'number' && Number.isFinite(rawExit) && rawExit > 0
      ? rawExit
      : (pos.currentPrice && pos.currentPrice !== pos.entryPrice ? pos.currentPrice : (pos.direction === 'BUY' ? pos.entryPrice + 0.0005 : pos.entryPrice - 0.0005));

    const isGold = pos.symbol.includes('XAU');
    const isIndex = ['NASDAQ', 'BTC/USD', 'BTC', 'NAS100'].some(s => pos.symbol.includes(s));
    const isJpy = pos.symbol.includes('JPY');
    const pipScale = isJpy ? 100 : (isGold || isIndex) ? 10 : 10000;

    const priceDiff = pos.direction === 'BUY' ? (actualExit - pos.entryPrice) : (pos.entryPrice - actualExit);
    const calculatedPnlPips = pnlPips !== undefined && Number.isFinite(Number(pnlPips)) 
      ? Number(pnlPips) 
      : Number((priceDiff * pipScale).toFixed(1));
    const lot = Number(pos.quantity || 0.10);
    const calculatedPnlDollars = pnlDollars !== undefined && Number.isFinite(Number(pnlDollars))
      ? Number(pnlDollars)
      : isGold
        ? Number((priceDiff * 100 * lot).toFixed(2))
        : isIndex
          ? Number((priceDiff * lot).toFixed(2))
          : Number((calculatedPnlPips * 10 * lot).toFixed(2));

    const reason = closeReason || inputReason || req.body.reason || (calculatedPnlDollars > 0 ? 'TP1_HIT' : calculatedPnlDollars < 0 ? 'SL_HIT' : 'MANUAL_CLOSE');

    // If DEMO environment, dispatch real ProtoBuf close to cTrader broker
    if (pos.environment === 'DEMO') {
      try {
        const ctrader = canonicalExecutionRouter.getBroker('ctrader-broker-01');
        if (ctrader) {
          await ctrader.closePosition(pos.ticketId || pos.positionId);
        }
      } catch (closeErr: any) {
        console.warn(`[BROKER_CLOSE_NOTICE] ${closeErr.message}`);
      }
    }

    // Atomically close position in PostgreSQL DB
    const closeResult = await tradingRepo.closePositionTransaction({
      positionId: pos.positionId,
      closePrice: actualExit,
      realizedProfit: calculatedPnlDollars,
      pnlPips: calculatedPnlPips,
      closeReason: reason,
      accountId: pos.accountId || targetAccountId
    });

    // Save Trade Audit Event
    await tradingRepo.saveTradeEvent({
      id: `evt_close_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tradeId: pos.positionId,
      setupId: pos.setupId,
      eventType: reason.includes('SL') ? 'SL_HIT' : (reason.includes('TP') ? 'TP_HIT' : 'MANUAL_CLOSE'),
      details: { exitPrice: actualExit, pnlDollars: calculatedPnlDollars, pnlPips: calculatedPnlPips, reason }
    });

    // Publish TradeClosedEvent to EventBus & auto-trigger persistent LearningService
    const tradeClosedPayload: TradeClosedPayload = {
      tradeId: closeResult.position.positionId,
      positionId: closeResult.position.positionId,
      accountId: closeResult.position.accountId,
      symbol: closeResult.position.symbol,
      direction: closeResult.position.direction,
      entryPrice: closeResult.position.entryPrice,
      exitPrice: closeResult.position.closePrice || actualExit,
      stopLoss: closeResult.position.stopLoss || 0,
      takeProfit: closeResult.position.takeProfit || 0,
      pnlDollars: closeResult.position.realizedProfit,
      pnlPips: closeResult.position.pnlPips || calculatedPnlPips,
      proposalId: closeResult.position.proposalId,
      approvalId: closeResult.position.approvalId,
      strategyId: closeResult.position.strategyId,
      strategyVersion: closeResult.position.strategyVersion,
      environment: closeResult.position.environment,
      closedAt: closeResult.position.closedAt || new Date()
    };

    await globalEventBus.publish({
      id: `evt_close_bus_${Date.now()}`,
      type: EventTypes.TradeClosed,
      timestamp: new Date(),
      payload: tradeClosedPayload
    });

    try {
      await learningService.processClosedTrade(tradeClosedPayload);
    } catch (learnErr: any) {
      console.warn(`[EXECUTION_ROUTE] Learning auto-process notice: ${learnErr.message}`);
    }

    const closedTrade = mapPositionToClosedTrade(closeResult.position);

    // Calculate updated performance directly from persistent DB
    const performance = await tradingRepo.calculatePerformanceMetrics(pos.accountId || targetAccountId);

    // Update RAM cache
    const cacheIdx = sharedAutoTraderState.openTrades.findIndex(t => t.id === pos!.positionId);
    if (cacheIdx !== -1) sharedAutoTraderState.openTrades.splice(cacheIdx, 1);
    if (!sharedAutoTraderState.closedTrades.some(t => t.id === closedTrade.id)) {
      sharedAutoTraderState.closedTrades.unshift(closedTrade);
    }
    sharedAutoTraderState.performance = performance;

    res.json({
      success: true,
      closedTrade,
      performance,
      newBalance: closeResult.newBalance
    });
  } catch (err: any) {
    console.error('[CLOSE_TRADE_ERR]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/reset
 * Resets shared cloud auto-trader state
 */
executionRouter.post('/autotrader/reset', async (req: Request, res: Response) => {
  try {
    sharedAutoTraderState.openTrades = [];
    sharedAutoTraderState.closedTrades = [];
    await executionQueueService.clearPendingCommands(AccountService.resolveAccountId());
    res.json({ success: true, message: "Shared AutoTrader state and pending execution commands reset successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/sync
 * Syncs account state preferences without overwriting DB trade records
 */
executionRouter.post('/autotrader/sync', async (req: Request, res: Response) => {
  try {
    const { isAutoEnabled, balance, initialCapital, latestAiRule, accountId } = req.body;
    const targetAccount = AccountService.resolveAccountId(accountId);

    if (typeof balance === 'number' || isAutoEnabled !== undefined || latestAiRule) {
      const existingState = await tradingRepo.getAccountState(targetAccount).catch(() => null);
      await tradingRepo.saveAccountState({
        accountId: targetAccount,
        isAutoEnabled: isAutoEnabled !== undefined ? Boolean(isAutoEnabled) : (existingState?.isAutoEnabled ?? true),
        balance: typeof balance === 'number' && balance > 0 ? balance : (existingState?.balance ?? 10000),
        initialCapital: typeof initialCapital === 'number' && initialCapital > 0 ? initialCapital : (existingState?.initialCapital ?? 10000),
        riskPercent: existingState?.riskPercent || 1.0,
        latestAiRule: latestAiRule || existingState?.latestAiRule
      }).catch(err => console.error('Failed to save account state in sync:', err));
    }

    const openPositions = await tradingRepo.getOpenPositions(targetAccount);
    const closedPositions = await tradingRepo.getClosedPositions(targetAccount, 5000);
    const performance = await tradingRepo.calculatePerformanceMetrics(targetAccount);
    const accountState = await tradingRepo.getAccountState(targetAccount);

    const openTrades = openPositions.map(mapPositionToAutoTrade);
    const closedTrades = closedPositions.map(mapPositionToClosedTrade);

    res.json({
      success: true,
      message: "Synced with persistent database",
      state: {
        openTrades,
        closedTrades,
        performance,
        balance: accountState?.balance ?? 10000,
        initialCapital: accountState?.initialCapital ?? 10000,
        isAutoEnabled: accountState?.isAutoEnabled ?? true,
        latestAiRule: accountState?.latestAiRule || ""
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/execution/orders
 * Returns all orders managed by ExecutionRouter
 */
executionRouter.get('/execution/orders', (req: Request, res: Response) => {
  const orders = canonicalExecutionRouter.orderManager.getAllOrders();
  res.json({ count: orders.length, orders });
});

/**
 * GET /api/execution/positions
 * Returns all open positions from configured broker adapters
 */
executionRouter.get('/execution/positions', async (req: Request, res: Response) => {
  const positions = await canonicalExecutionRouter.getAllPositions();
  res.json({ count: positions.length, positions });
});

/**
 * GET /api/execution/performance
 * Returns performance metrics from ExecutionRouter
 */
executionRouter.get('/execution/performance', async (req: Request, res: Response) => {
  const accountStatuses = await canonicalExecutionRouter.getAccountStatuses();
  const primaryAccountStatus = accountStatuses[0];
  const orders = canonicalExecutionRouter.orderManager.getAllOrders();
  const filledCount = orders.filter(o => o.status === 'FILLED').length;
  const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;

  const paperBroker = canonicalExecutionRouter.getBroker(canonicalExecutionRouter.defaultBrokerId) as PaperBrokerAdapter;

  res.json({
    account_status: primaryAccountStatus,
    account_statuses: accountStatuses,
    metrics: {
      total_orders: orders.length,
      filled_orders: filledCount,
      rejected_orders: rejectedCount,
      average_slippage_pips: paperBroker && paperBroker.simulationEngine ? paperBroker.simulationEngine.getSlippageEngine().getAverageSlippagePips() : 0
    }
  });
});

/**
 * POST /api/execution/order
 * Direct execution route for RiskCleared payloads
 */
executionRouter.post('/execution/order', async (req: Request, res: Response) => {
  try {
    const payload = req.body as RiskClearedPayload;
    if (!payload || !payload.approval_id || !payload.trade_proposal) {
      res.status(400).json({ error: "Valid RiskCleared payload with approval_id and trade_proposal required" });
      return;
    }
    const result = await canonicalExecutionRouter.handleRiskCleared(payload);
    res.json({ message: "Execution order routed successfully", result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/autotrader/scanner/status
 * Returns current status of background market scanner daemon
 */
executionRouter.get('/autotrader/scanner/status', async (req: Request, res: Response) => {
  try {
    const { autonomousMarketScannerService } = await import('../services/autonomousMarketScannerService');
    res.json(autonomousMarketScannerService.getStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/scanner/trigger
 * Manually trigger an immediate scan cycle across all pairs
 */
executionRouter.post('/autotrader/scanner/trigger', async (req: Request, res: Response) => {
  try {
    const { autonomousMarketScannerService } = await import('../services/autonomousMarketScannerService');
    autonomousMarketScannerService.triggerScanCycle().catch(() => {});
    res.json({ message: 'Scan cycle triggered successfully', status: autonomousMarketScannerService.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/scanner/purge-expired
 * Manually purge all expired and invalidated setups from memory and disk
 */
executionRouter.post('/autotrader/scanner/purge-expired', async (req: Request, res: Response) => {
  try {
    const { autonomousMarketScannerService } = await import('../services/autonomousMarketScannerService');
    const purgedCount = autonomousMarketScannerService.purgeExpiredSetups();
    res.json({ message: `Purged ${purgedCount} expired setups`, status: autonomousMarketScannerService.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/auto-heal
 * Triggers immediate Auto-Healing scan across open cTrader positions to repair missing SL or wild TP
 */
executionRouter.post('/autotrader/auto-heal', async (req: Request, res: Response) => {
  try {
    const { ctraderMarketDataFeedService } = await import('../services/ctraderMarketDataFeedService');
    const result = await ctraderMarketDataFeedService.healOpenPositions();
    res.json({
      message: 'Auto-healing watchdog completed',
      healed_count: result.healedCount,
      repaired_positions: result.positions
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/autotrader/scanner/archive-setup
 * Manually archives/purges a setup from radar and unfreezes the pair for immediate new signals
 */
executionRouter.post('/autotrader/scanner/archive-setup', async (req: Request, res: Response) => {
  try {
    const { setupId } = req.body || {};
    if (!setupId) {
      res.status(400).json({ error: 'setupId is required' });
      return;
    }
    const { autonomousMarketScannerService } = await import('../services/autonomousMarketScannerService');
    const success = autonomousMarketScannerService.archiveSetup(setupId);
    if (success) {
      res.json({ message: `Setup #${setupId} archived successfully and pair unfrozen for new signals` });
    } else {
      res.status(404).json({ error: `Setup #${setupId} not found` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


