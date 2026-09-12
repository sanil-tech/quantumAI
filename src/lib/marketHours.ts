import { CurrencyPair } from '../types';

export type MarketSessionType = 'SYDNEY' | 'TOKYO' | 'LONDON' | 'NEW_YORK' | 'WEEKEND' | 'CRYPTO_24_7';

export interface MarketStatusInfo {
  isOpen: boolean;
  isCrypto: boolean;
  status: 'OPEN' | 'WEEKEND_CLOSED' | 'CLOSED';
  sessionName: MarketSessionType;
  nextOpenUtc: Date | null;
  formattedNextOpenMs: string;
  formattedNextOpenEn: string;
  badgeLabelMs: string;
  badgeLabelEn: string;
  detailedNoticeMs: string;
  detailedNoticeEn: string;
}

/**
 * Checks if a given currency pair is a 24/7 Cryptocurrency asset
 */
export function isCryptoPair(pair: CurrencyPair | string): boolean {
  if (!pair) return false;
  const clean = pair.toUpperCase().replace(/[\/\-_]/g, '');
  return clean.includes('BTC') || clean.includes('ETH') || clean.includes('SOL') || clean.includes('CRYPTO');
}

/**
 * Returns the exact market status, weekend state, and countdown/open schedule
 * for any asset at any given timestamp (defaults to current Date).
 */
export function getMarketStatus(pair: CurrencyPair | string, now: Date = new Date()): MarketStatusInfo {
  const isCrypto = isCryptoPair(pair);

  if (isCrypto) {
    return {
      isOpen: true,
      isCrypto: true,
      status: 'OPEN',
      sessionName: 'CRYPTO_24_7',
      nextOpenUtc: null,
      formattedNextOpenMs: 'Beroperasi 24/7/365',
      formattedNextOpenEn: '24/7/365 Continuous',
      badgeLabelMs: '🟢 24/7 AKTIF',
      badgeLabelEn: '🟢 24/7 ACTIVE',
      detailedNoticeMs: 'Pasaran Kripto (BTC/USD) beroperasi 24 jam sehari, 7 hari seminggu tanpa henti termasuk hujung minggu.',
      detailedNoticeEn: 'Crypto markets (BTC/USD) trade continuously 24/7/365 without weekend closure.'
    };
  }

  // Standard Forex / Commodities / Indices Market Hours (UTC)
  // Forex market opens Sunday 21:00 UTC (5:00 AM Monday MYT) and closes Friday 21:00 UTC (5:00 AM Saturday MYT)
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  let isWeekendClosed = false;
  let nextOpen = new Date(now.getTime());

  if (day === 6) {
    // Saturday: Entire day is closed
    isWeekendClosed = true;
    const daysUntilSunday = 1;
    nextOpen.setUTCDate(now.getUTCDate() + daysUntilSunday);
    nextOpen.setUTCHours(21, 0, 0, 0);
  } else if (day === 0) {
    // Sunday: Closed until 21:00 UTC
    if (hour < 21) {
      isWeekendClosed = true;
      nextOpen.setUTCHours(21, 0, 0, 0);
    }
  } else if (day === 5) {
    // Friday: Closed after 21:00 UTC
    if (hour >= 21) {
      isWeekendClosed = true;
      const daysUntilSunday = 2;
      nextOpen.setUTCDate(now.getUTCDate() + daysUntilSunday);
      nextOpen.setUTCHours(21, 0, 0, 0);
    }
  }

  // Active Forex Session identification (when market is open)
  let sessionName: MarketSessionType = 'WEEKEND';
  if (!isWeekendClosed) {
    // UTC Sessions:
    // Sydney: 21:00 - 06:00 UTC
    // Tokyo: 00:00 - 09:00 UTC
    // London: 07:00 - 16:00 UTC
    // New York: 12:00 - 21:00 UTC
    if (hour >= 12 && hour < 21) {
      sessionName = 'NEW_YORK';
    } else if (hour >= 7 && hour < 16) {
      sessionName = 'LONDON';
    } else if (hour >= 0 && hour < 9) {
      sessionName = 'TOKYO';
    } else {
      sessionName = 'SYDNEY';
    }
  }

  if (isWeekendClosed) {
    const diffMs = Math.max(0, nextOpen.getTime() - now.getTime());
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    // Local time representation of next open for user
    const localOpenStr = nextOpen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const localDayStrMs = nextOpen.toLocaleDateString('ms-MY', { weekday: 'long' });
    const localDayStrEn = nextOpen.toLocaleDateString('en-US', { weekday: 'long' });

    const openSummaryMs = `${localDayStrMs} ${localOpenStr} (${diffHours}j ${diffMinutes}m lagi)`;
    const openSummaryEn = `${localDayStrEn} ${localOpenStr} (in ${diffHours}h ${diffMinutes}m)`;

    return {
      isOpen: false,
      isCrypto: false,
      status: 'WEEKEND_CLOSED',
      sessionName: 'WEEKEND',
      nextOpenUtc: nextOpen,
      formattedNextOpenMs: openSummaryMs,
      formattedNextOpenEn: openSummaryEn,
      badgeLabelMs: '🔴 PASARAN TUTUP (Hujung Minggu)',
      badgeLabelEn: '🔴 MARKET CLOSED (Weekend)',
      detailedNoticeMs: `Pasaran Forex & Komoditi ditutup pada hujung minggu. Dibuka semula pada ${openSummaryMs}. Gunakan BTC/USD untuk dagangan hujung minggu 24/7.`,
      detailedNoticeEn: `Forex & Commodity markets are closed for the weekend. Reopening ${openSummaryEn}. Use BTC/USD for 24/7 weekend trading.`
    };
  }

  return {
    isOpen: true,
    isCrypto: false,
    status: 'OPEN',
    sessionName,
    nextOpenUtc: null,
    formattedNextOpenMs: `Sesi Aktif: ${sessionName}`,
    formattedNextOpenEn: `Active Session: ${sessionName}`,
    badgeLabelMs: `🟢 DIBUKA (${sessionName})`,
    badgeLabelEn: `🟢 OPEN (${sessionName})`,
    detailedNoticeMs: `Pasaran sedang beroperasi secara langsung pada Sesi ${sessionName}.`,
    detailedNoticeEn: `Market is currently active during the ${sessionName} session.`
  };
}
