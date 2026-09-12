import { getMarketStatus, isCryptoPair } from '../src/lib/marketHours';

describe('Market Hours & Weekend Awareness', () => {
  it('correctly identifies crypto pairs as 24/7 active even on Saturday/Sunday', () => {
    // Saturday 12:00 UTC
    const saturday = new Date(Date.UTC(2026, 8, 12, 12, 0, 0));
    const btcStatus = getMarketStatus('BTC/USD', saturday);
    expect(btcStatus.isOpen).toBe(true);
    expect(btcStatus.isCrypto).toBe(true);
    expect(btcStatus.status).toBe('OPEN');
    expect(btcStatus.sessionName).toBe('CRYPTO_24_7');
    expect(isCryptoPair('BTC/USD')).toBe(true);
  });

  it('correctly flags Forex pairs (EUR/USD, GBP/USD, etc.) as closed on Saturday', () => {
    // Saturday 12:00 UTC
    const saturday = new Date(Date.UTC(2026, 8, 12, 12, 0, 0));
    const eurusdStatus = getMarketStatus('EUR/USD', saturday);
    expect(eurusdStatus.isOpen).toBe(false);
    expect(eurusdStatus.isCrypto).toBe(false);
    expect(eurusdStatus.status).toBe('WEEKEND_CLOSED');
    expect(eurusdStatus.sessionName).toBe('WEEKEND');
    expect(eurusdStatus.nextOpenUtc).not.toBeNull();
    expect(eurusdStatus.badgeLabelMs).toContain('PASARAN TUTUP');
  });

  it('correctly flags Gold (XAU/USD) as closed on Sunday before 21:00 UTC', () => {
    // Sunday 15:00 UTC
    const sundayAfternoon = new Date(Date.UTC(2026, 8, 13, 15, 0, 0));
    const goldStatus = getMarketStatus('XAU/USD', sundayAfternoon);
    expect(goldStatus.isOpen).toBe(false);
    expect(goldStatus.status).toBe('WEEKEND_CLOSED');
  });

  it('correctly flags Forex as open on Sunday after 21:00 UTC (Sydney Open)', () => {
    // Sunday 22:00 UTC
    const sundayNight = new Date(Date.UTC(2026, 8, 13, 22, 0, 0));
    const eurusdStatus = getMarketStatus('EUR/USD', sundayNight);
    expect(eurusdStatus.isOpen).toBe(true);
    expect(eurusdStatus.status).toBe('OPEN');
    expect(eurusdStatus.sessionName).toBe('SYDNEY');
  });

  it('correctly flags Forex as open during Wednesday London session', () => {
    // Wednesday 10:00 UTC
    const wednesday = new Date(Date.UTC(2026, 8, 16, 10, 0, 0));
    const eurusdStatus = getMarketStatus('EUR/USD', wednesday);
    expect(eurusdStatus.isOpen).toBe(true);
    expect(eurusdStatus.status).toBe('OPEN');
    expect(eurusdStatus.sessionName).toBe('LONDON');
  });
});
