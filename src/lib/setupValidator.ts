import { AiTradeOpportunity, CurrencyPair, IndicatorValues } from '../types';

export interface SetupValidity {
  isValid: boolean;
  status: 'VALID_ACTIVE' | 'OBSOLETE_MOVE_COMPLETED' | 'INVALIDATED_STRUCTURE_BROKEN' | 'OBSOLETE_BAD_RISK_REWARD' | 'INVALIDATED_MOMENTUM_FLIP';
  badgeTextMs: string;
  badgeTextEn: string;
  invalidationReasonMs: string;
  invalidationReasonEn: string;
  recommendedActionMs: string;
  recommendedActionEn: string;
}

export function evaluateSetupValidity(
  opportunity: AiTradeOpportunity | null,
  currentPrice: number,
  indicators?: IndicatorValues | null
): SetupValidity {
  if (!opportunity || opportunity.action === 'WAIT / NO SETUP' || opportunity.action === 'NO_SETUP' || opportunity.action === 'WAIT' || opportunity.action === 'VETO' || !opportunity.entryZone || opportunity.entryZone.min == null || opportunity.entryZone.max == null) {
    return {
      isValid: true,
      status: 'VALID_ACTIVE',
      badgeTextMs: 'TIADA SETUP',
      badgeTextEn: 'NO SETUP',
      invalidationReasonMs: 'Tiada cadangan posisi aktif.',
      invalidationReasonEn: 'No active trade setup.',
      recommendedActionMs: 'Tunggu pengesahan struktur pasaran seterusnya.',
      recommendedActionEn: 'Wait for next market structure confirmation.'
    };
  }

  const { pair, action, entryZone, stopLoss, takeProfit1, takeProfit2, invalidationLevel } = opportunity;
  const decimals = (pair === 'USD/JPY') ? 3 : (pair === 'XAU/USD' || pair === 'NASDAQ' || pair === 'BTC/USD') ? 2 : 5;

  // 1. Check if price HAS ALREADY PASSED TP1 / TP2 BEFORE trigger (Missed entry / Move completed)
  if (action === 'BUY' && currentPrice >= takeProfit1) {
    return {
      isValid: false,
      status: 'OBSOLETE_MOVE_COMPLETED',
      badgeTextMs: '❌ CADANGAN TERBATAL (MOVE SELESAI)',
      badgeTextEn: '❌ OBSOLETE (MOVE COMPLETED)',
      invalidationReasonMs: `Harga semasa (${currentPrice.toFixed(decimals)}) telah melepasi sasaran TP1 (${takeProfit1.toFixed(decimals)}) tanpa menyentuhi entry zone (${entryZone.min.toFixed(decimals)}-${entryZone.max.toFixed(decimals)}). Pergerakan sasaran telah berlaku.`,
      invalidationReasonEn: `Current price (${currentPrice.toFixed(decimals)}) has already passed TP1 target (${takeProfit1.toFixed(decimals)}) without filling entry zone. Move completed.`,
      recommendedActionMs: 'JANGAN KEJAR PASARAN (Do NOT FOMO Buy). Batalkan pesanan masukan dan tunggu pergerakan retracement baru.',
      recommendedActionEn: 'Do NOT FOMO Buy. Cancel entry orders and wait for a fresh pullback.'
    };
  }

  if (action === 'SELL' && currentPrice <= takeProfit1) {
    return {
      isValid: false,
      status: 'OBSOLETE_MOVE_COMPLETED',
      badgeTextMs: '❌ CADANGAN TERBATAL (MOVE SELESAI)',
      badgeTextEn: '❌ OBSOLETE (MOVE COMPLETED)',
      invalidationReasonMs: `Harga semasa (${currentPrice.toFixed(decimals)}) telah jatuh melepasi sasaran TP1 (${takeProfit1.toFixed(decimals)}) tanpa menyentuhi entry zone (${entryZone.min.toFixed(decimals)}-${entryZone.max.toFixed(decimals)}). Pergerakan sasaran telah berlaku.`,
      invalidationReasonEn: `Current price (${currentPrice.toFixed(decimals)}) has dropped past TP1 target (${takeProfit1.toFixed(decimals)}) without filling entry zone. Move completed.`,
      recommendedActionMs: 'JANGAN KEJAR PASARAN (Do NOT FOMO Sell). Batalkan pesanan masukan dan tunggu pergerakan retracement baru.',
      recommendedActionEn: 'Do NOT FOMO Sell. Cancel entry orders and wait for a fresh pullback.'
    };
  }

  // 2. Check if price HAS STRUCK STOP LOSS OR INVALIDATION LEVEL BEFORE TRIGGER
  const effInvalidation = invalidationLevel || stopLoss;
  if (action === 'BUY' && currentPrice <= effInvalidation) {
    return {
      isValid: false,
      status: 'INVALIDATED_STRUCTURE_BROKEN',
      badgeTextMs: '⛔ ANALISIS TERBATAL (SL TEMBUS)',
      badgeTextEn: '⛔ ANALYSIS INVALIDATED (SL BROKEN)',
      invalidationReasonMs: `Harga semasa (${currentPrice.toFixed(decimals)}) telah menembusi paras Stop Loss / Invalidation (${effInvalidation.toFixed(decimals)}). Struktur sokongan SMC telah rosak!`,
      invalidationReasonEn: `Current price (${currentPrice.toFixed(decimals)}) breached SL / Invalidation level (${effInvalidation.toFixed(decimals)}). SMC support structure broken!`,
      recommendedActionMs: 'Analisis BUY terbatal sepenuhnya. Pakar Trader melarang sebarang belian kerana struktur Bearish telah terbentuk.',
      recommendedActionEn: 'BUY setup completely invalidated. Pakar Trader forbids entries as Bearish structure formed.'
    };
  }

  if (action === 'SELL' && currentPrice >= effInvalidation) {
    return {
      isValid: false,
      status: 'INVALIDATED_STRUCTURE_BROKEN',
      badgeTextMs: '⛔ ANALISIS TERBATAL (SL TEMBUS)',
      badgeTextEn: '⛔ ANALYSIS INVALIDATED (SL BROKEN)',
      invalidationReasonMs: `Harga semasa (${currentPrice.toFixed(decimals)}) telah menembusi paras Stop Loss / Invalidation (${effInvalidation.toFixed(decimals)}). Struktur rintangan SMC telah rosak!`,
      invalidationReasonEn: `Current price (${currentPrice.toFixed(decimals)}) breached SL / Invalidation level (${effInvalidation.toFixed(decimals)}). SMC resistance structure broken!`,
      recommendedActionMs: 'Analisis SELL terbatal sepenuhnya. Pakar Trader melarang sebarang jualan kerana struktur Bullish telah terbentuk.',
      recommendedActionEn: 'SELL setup completely invalidated. Pakar Trader forbids entries as Bullish structure formed.'
    };
  }

  // 3. Check Indicator Reversal if provided
  if (indicators) {
    if (action === 'BUY' && indicators.superTrend?.trend === 'BEARISH' && indicators.rsi < 38) {
      return {
        isValid: false,
        status: 'INVALIDATED_MOMENTUM_FLIP',
        badgeTextMs: '⚠️ MOMENTUM TERBATAL (FLIP BEARISH)',
        badgeTextEn: '⚠️ MOMENTUM INVALIDATED (BEARISH FLIP)',
        invalidationReasonMs: `SuperTrend dan RSI (${indicators.rsi.toFixed(0)}) telah bertukar ke Bearish secara drastik. Momentum pasaran menentang cadangan belian.`,
        invalidationReasonEn: `SuperTrend and RSI (${indicators.rsi.toFixed(0)}) flipped strongly Bearish. Downward momentum opposes BUY setup.`,
        recommendedActionMs: 'Tangguhkan pesanan masukan sehingga pertukaran struktur bullish berlaku semula.',
        recommendedActionEn: 'Suspend entry orders until bullish confirmation reappears.'
      };
    }

    if (action === 'SELL' && indicators.superTrend?.trend === 'BULLISH' && indicators.rsi > 62) {
      return {
        isValid: false,
        status: 'INVALIDATED_MOMENTUM_FLIP',
        badgeTextMs: '⚠️ MOMENTUM TERBATAL (FLIP BULLISH)',
        badgeTextEn: '⚠️ MOMENTUM INVALIDATED (BULLISH FLIP)',
        invalidationReasonMs: `SuperTrend dan RSI (${indicators.rsi.toFixed(0)}) telah bertukar ke Bullish secara drastik. Momentum pasaran menentang cadangan jualan.`,
        invalidationReasonEn: `SuperTrend and RSI (${indicators.rsi.toFixed(0)}) flipped strongly Bullish. Upward momentum opposes SELL setup.`,
        recommendedActionMs: 'Tangguhkan pesanan masukan sehingga pertukaran struktur bearish berlaku semula.',
        recommendedActionEn: 'Suspend entry orders until bearish confirmation reappears.'
      };
    }
  }

  // 4. Otherwise, Setup is Valid & Active!
  return {
    isValid: true,
    status: 'VALID_ACTIVE',
    badgeTextMs: '✅ SETUP SAH & AKTIF',
    badgeTextEn: '✅ VALID & ACTIVE SETUP',
    invalidationReasonMs: 'Harga berada dalam julat pergerakan yang sah. Struktur pasaran dan penunjuk teknikal menyokong analisis.',
    invalidationReasonEn: 'Price is in valid setup range. Market structure & indicators support analysis.',
    recommendedActionMs: 'Tunggu harga memasuki Zon Entry atau biarkan Auto Trader mengambil entry.',
    recommendedActionEn: 'Wait for entry zone fill or let Auto Trader execute.'
  };
}
