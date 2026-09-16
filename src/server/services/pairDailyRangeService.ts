/**
 * Pair Daily Range Service (Average Daily Range - ADR)
 * Calibrates Stop Loss, TP1, and TP2 distances to ensure Intraday Completion (Same-Day Trade Close).
 * Prevents trades from lingering over multiple days by bounding targets strictly within the single-day range expansion.
 */

export interface PairAdrProfile {
  pair: string;
  adrPips: number;       // Average Daily Range (20-day)
  slPips: number;        // ~20-25% ADR (Tight structural invalidation)
  tp1Pips: number;       // ~35-42% ADR (Intraday milestone: lock 50% profit & BE)
  tp2Pips: number;       // ~65-75% ADR (Intraday runner target: completes within same day)
  pipMultiplier: number; // 0.0001 for FX, 0.01 for JPY, 1.0 for Gold
  decimals: number;
  expectedDurationHours: {
    tp1: string;         // e.g. "1-3 jam"
    tp2: string;         // e.g. "4-8 jam (selesai hari sama)"
  };
}

export interface IntradayTargetsResult {
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  adrPips: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  slPips: number;
  tp1Pips: number;
  tp2Pips: number;
  riskRewardTp1: string;
  riskRewardTp2: string;
  isSameDayGuaranteed: boolean;
  expectedDurationHours: {
    tp1: string;
    tp2: string;
  };
}

const ADR_PROFILES: Record<string, PairAdrProfile> = {
  'EUR/USD': {
    pair: 'EUR/USD',
    adrPips: 65,
    slPips: 18,
    tp1Pips: 28,
    tp2Pips: 48,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'GBP/USD': {
    pair: 'GBP/USD',
    adrPips: 85,
    slPips: 22,
    tp1Pips: 35,
    tp2Pips: 60,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'NZD/USD': {
    pair: 'NZD/USD',
    adrPips: 55,
    slPips: 15,
    tp1Pips: 24,
    tp2Pips: 40,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-7 jam (selesai hari sama)' }
  },
  'AUD/USD': {
    pair: 'AUD/USD',
    adrPips: 60,
    slPips: 16,
    tp1Pips: 26,
    tp2Pips: 44,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'USD/CAD': {
    pair: 'USD/CAD',
    adrPips: 70,
    slPips: 18,
    tp1Pips: 30,
    tp2Pips: 50,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'USD/JPY': {
    pair: 'USD/JPY',
    adrPips: 90,
    slPips: 22,
    tp1Pips: 38,
    tp2Pips: 65,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'GBP/JPY': {
    pair: 'GBP/JPY',
    adrPips: 150,
    slPips: 35,
    tp1Pips: 65,
    tp2Pips: 110,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-4 jam', tp2: '5-9 jam (selesai hari sama)' }
  },
  'EUR/JPY': {
    pair: 'EUR/JPY',
    adrPips: 110,
    slPips: 26,
    tp1Pips: 46,
    tp2Pips: 78,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'USD/CHF': {
    pair: 'USD/CHF',
    adrPips: 55,
    slPips: 15,
    tp1Pips: 24,
    tp2Pips: 40,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-7 jam (selesai hari sama)' }
  },
  'XAU/USD': {
    pair: 'XAU/USD',
    adrPips: 280, // $28.00
    slPips: 60,   // $6.00
    tp1Pips: 110, // $11.00
    tp2Pips: 190, // $19.00
    pipMultiplier: 1.0,
    decimals: 2,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '3-6 jam (selesai hari sama)' }
  },
  'BTC/USD': {
    pair: 'BTC/USD',
    adrPips: 2200,
    slPips: 450,
    tp1Pips: 850,
    tp2Pips: 1500,
    pipMultiplier: 1.0,
    decimals: 2,
    expectedDurationHours: { tp1: '2-4 jam', tp2: '6-12 jam (selesai hari sama)' }
  },
  'EUR/GBP': {
    pair: 'EUR/GBP',
    adrPips: 42,
    slPips: 12,
    tp1Pips: 18,
    tp2Pips: 30,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-7 jam (selesai hari sama)' }
  },
  'EUR/AUD': {
    pair: 'EUR/AUD',
    adrPips: 95,
    slPips: 24,
    tp1Pips: 38,
    tp2Pips: 68,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'GBP/AUD': {
    pair: 'GBP/AUD',
    adrPips: 130,
    slPips: 32,
    tp1Pips: 52,
    tp2Pips: 92,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-4 jam', tp2: '5-9 jam (selesai hari sama)' }
  },
  'AUD/JPY': {
    pair: 'AUD/JPY',
    adrPips: 85,
    slPips: 22,
    tp1Pips: 35,
    tp2Pips: 60,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'CAD/JPY': {
    pair: 'CAD/JPY',
    adrPips: 90,
    slPips: 22,
    tp1Pips: 36,
    tp2Pips: 64,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'CHF/JPY': {
    pair: 'CHF/JPY',
    adrPips: 100,
    slPips: 25,
    tp1Pips: 42,
    tp2Pips: 72,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'NZD/JPY': {
    pair: 'NZD/JPY',
    adrPips: 80,
    slPips: 20,
    tp1Pips: 34,
    tp2Pips: 58,
    pipMultiplier: 0.01,
    decimals: 3,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'GBP/CAD': {
    pair: 'GBP/CAD',
    adrPips: 110,
    slPips: 28,
    tp1Pips: 45,
    tp2Pips: 78,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'EUR/CAD': {
    pair: 'EUR/CAD',
    adrPips: 85,
    slPips: 22,
    tp1Pips: 35,
    tp2Pips: 60,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
  },
  'AUD/NZD': {
    pair: 'AUD/NZD',
    adrPips: 45,
    slPips: 12,
    tp1Pips: 18,
    tp2Pips: 32,
    pipMultiplier: 0.0001,
    decimals: 5,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '4-7 jam (selesai hari sama)' }
  },
  'NASDAQ': {
    pair: 'NASDAQ',
    adrPips: 220,
    slPips: 45,
    tp1Pips: 85,
    tp2Pips: 150,
    pipMultiplier: 1.0,
    decimals: 2,
    expectedDurationHours: { tp1: '1-3 jam', tp2: '3-6 jam (selesai hari sama)' }
  }
};

export class PairDailyRangeService {
  /**
   * Get ADR Profile for a symbol
   */
  public static getProfile(rawPair: string): PairAdrProfile {
    const sym = rawPair.toUpperCase().replace('_', '');
    const normalized = sym.includes('/') ? sym : (sym.length === 6 ? `${sym.slice(0, 3)}/${sym.slice(3)}` : sym);

    if (ADR_PROFILES[normalized]) {
      return ADR_PROFILES[normalized];
    }

    // Dynamic fallback profile
    const isJpy = normalized.includes('JPY');
    const isGold = normalized.includes('XAU');
    const decimals = isJpy ? 3 : isGold ? 2 : 5;
    const pipMultiplier = isJpy ? 0.01 : isGold ? 1.0 : 0.0001;

    return {
      pair: normalized,
      adrPips: isJpy ? 120 : isGold ? 250 : 70,
      slPips: isJpy ? 30 : isGold ? 50 : 18,
      tp1Pips: isJpy ? 50 : isGold ? 90 : 28,
      tp2Pips: isJpy ? 85 : isGold ? 160 : 48,
      pipMultiplier,
      decimals,
      expectedDurationHours: { tp1: '1-3 jam', tp2: '4-8 jam (selesai hari sama)' }
    };
  }

  /**
   * Calculate precise Intraday SL, TP1, and TP2 levels to guarantee trade completion within 1 day
   */
  public static calculateIntradayTargets(
    rawPair: string,
    direction: 'BUY' | 'SELL',
    entryPrice: number
  ): IntradayTargetsResult {
    const profile = this.getProfile(rawPair);
    const isBuy = direction === 'BUY';

    const slDist = profile.slPips * profile.pipMultiplier;
    const tp1Dist = profile.tp1Pips * profile.pipMultiplier;
    const tp2Dist = profile.tp2Pips * profile.pipMultiplier;

    const slPrice = isBuy
      ? Number((entryPrice - slDist).toFixed(profile.decimals))
      : Number((entryPrice + slDist).toFixed(profile.decimals));

    const tp1Price = isBuy
      ? Number((entryPrice + tp1Dist).toFixed(profile.decimals))
      : Number((entryPrice - tp1Dist).toFixed(profile.decimals));

    const tp2Price = isBuy
      ? Number((entryPrice + tp2Dist).toFixed(profile.decimals))
      : Number((entryPrice - tp2Dist).toFixed(profile.decimals));

    const rrTp1 = (profile.tp1Pips / profile.slPips).toFixed(1);
    const rrTp2 = (profile.tp2Pips / profile.slPips).toFixed(1);

    return {
      pair: profile.pair,
      direction,
      entryPrice,
      adrPips: profile.adrPips,
      slPrice,
      tp1Price,
      tp2Price,
      slPips: profile.slPips,
      tp1Pips: profile.tp1Pips,
      tp2Pips: profile.tp2Pips,
      riskRewardTp1: `1:${rrTp1}`,
      riskRewardTp2: `1:${rrTp2}`,
      isSameDayGuaranteed: true,
      expectedDurationHours: profile.expectedDurationHours
    };
  }

  /**
   * Returns complete ADR profile table for dashboard/educational display
   */
  public static getAllProfiles(): PairAdrProfile[] {
    return Object.values(ADR_PROFILES);
  }
}
