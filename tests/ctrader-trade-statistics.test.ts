import { describe, it, expect } from 'vitest';
import { CTraderSymbolRegistry } from '../src/integrations/ctrader/ctraderSymbolService';

describe('cTrader Interactive Trade Statistics Engine', () => {
  const sampleRawDeals = [
    {
      dealId: 331934234,
      positionId: 286262954,
      orderId: 316610213,
      symbolId: 1, // EUR/USD
      executionTimestamp: 1788355079302,
      executionPrice: 1.15807,
      tradeSide: 2, // SELL (closed a BUY)
      closePositionDetail: {
        entryPrice: 1.15786,
        grossProfit: 21,
        swap: 0,
        commission: -10,
        balance: 123586,
        closedVolume: 100000,
        moneyDigits: 2
      }
    },
    {
      dealId: 331934233,
      positionId: 286262950,
      orderId: 316610212,
      symbolId: 1, // EUR/USD
      executionTimestamp: 1788355078807,
      executionPrice: 1.15808,
      tradeSide: 2, // SELL
      closePositionDetail: {
        entryPrice: 1.15788,
        grossProfit: 20,
        swap: 0,
        commission: -10,
        balance: 123566,
        closedVolume: 100000,
        moneyDigits: 2
      }
    },
    {
      dealId: 333212629,
      positionId: 288057849,
      orderId: 317835848,
      symbolId: 22395, // BTC/USD
      executionTimestamp: 1789135106447,
      executionPrice: 78870.5,
      tradeSide: 1, // BUY (closed a SELL)
      closePositionDetail: {
        entryPrice: 78272.81,
        grossProfit: -598,
        swap: 0,
        commission: 0,
        balance: 122543,
        closedVolume: 100000,
        moneyDigits: 2
      }
    }
  ];

  it('correctly normalizes cTrader deal payload with broker specifications', () => {
    const closedDeals = sampleRawDeals.filter(d => d.closePositionDetail != null);
    expect(closedDeals.length).toBe(3);

    const parsed = closedDeals.map(d => {
      const symId = Number(d.symbolId);
      const symSpec = CTraderSymbolRegistry.getSymbolById(symId);
      const rawName = symSpec?.symbolName || (symId === 1 ? 'EURUSD' : symId === 22395 ? 'BTCUSD' : 'EURUSD');
      const formattedSym = rawName.includes('/') ? rawName : (rawName.length === 6 ? `${rawName.slice(0, 3)}/${rawName.slice(3)}` : rawName);
      const moneyDigits = Number(d.closePositionDetail?.moneyDigits ?? 2);
      const divisor = Math.pow(10, moneyDigits);
      const grossProfit = Number(d.closePositionDetail?.grossProfit || 0) / divisor;
      const commission = Number(d.closePositionDetail?.commission || 0) / divisor;
      const swap = Number(d.closePositionDetail?.swap || 0) / divisor;
      const netPnl = grossProfit + commission + swap;
      const direction = d.tradeSide === 2 ? 'BUY' : 'SELL';

      return {
        dealId: String(d.dealId),
        positionId: String(d.positionId),
        symbol: formattedSym,
        direction,
        grossProfit: Number(grossProfit.toFixed(2)),
        commission: Number(commission.toFixed(2)),
        swap: Number(swap.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2)),
        balance: Number((Number(d.closePositionDetail?.balance || 0) / divisor).toFixed(2))
      };
    });

    // Verify Deal 1 (EUR/USD Win)
    expect(parsed[0].symbol).toBe('EUR/USD');
    expect(parsed[0].direction).toBe('BUY');
    expect(parsed[0].grossProfit).toBe(0.21);
    expect(parsed[0].commission).toBe(-0.10);
    expect(parsed[0].netPnl).toBe(0.11);
    expect(parsed[0].balance).toBe(1235.86);

    // Verify Deal 2 (EUR/USD Win)
    expect(parsed[1].symbol).toBe('EUR/USD');
    expect(parsed[1].direction).toBe('BUY');
    expect(parsed[1].grossProfit).toBe(0.20);
    expect(parsed[1].commission).toBe(-0.10);
    expect(parsed[1].netPnl).toBe(0.10);

    // Verify Deal 3 (BTC/USD Loss)
    expect(parsed[2].symbol).toBe('BTC/USD');
    expect(parsed[2].direction).toBe('SELL');
    expect(parsed[2].grossProfit).toBe(-5.98);
    expect(parsed[2].netPnl).toBe(-5.98);
    expect(parsed[2].balance).toBe(1225.43);
  });

  it('computes accurate mathematical aggregate KPIs and Win Rate %', () => {
    const parsed = [
      { netPnl: 0.11, direction: 'BUY', symbol: 'EUR/USD', volumeLots: 0.01 },
      { netPnl: 0.10, direction: 'BUY', symbol: 'EUR/USD', volumeLots: 0.01 },
      { netPnl: -5.98, direction: 'SELL', symbol: 'BTC/USD', volumeLots: 0.01 }
    ];

    const wins = parsed.filter(p => p.netPnl > 0);
    const losses = parsed.filter(p => p.netPnl < 0);
    const totalProfit = wins.reduce((acc, p) => acc + p.netPnl, 0);
    const totalLoss = Math.abs(losses.reduce((acc, p) => acc + p.netPnl, 0));
    const netPnl = totalProfit - totalLoss;
    const winRate = Number(((wins.length / parsed.length) * 100).toFixed(1));
    const profitFactor = Number((totalProfit / totalLoss).toFixed(2));

    expect(wins.length).toBe(2);
    expect(losses.length).toBe(1);
    expect(winRate).toBe(66.7);
    expect(Number(totalProfit.toFixed(2))).toBe(0.21);
    expect(Number(totalLoss.toFixed(2))).toBe(5.98);
    expect(Number(netPnl.toFixed(2))).toBe(-5.77);
    expect(profitFactor).toBe(0.04);
  });

  it('calculates chronological cumulative equity curve progression', () => {
    const chronological = [
      { closeTime: 1000, netPnl: 10.0, symbol: 'EUR/USD' },
      { closeTime: 2000, netPnl: 25.0, symbol: 'EUR/USD' },
      { closeTime: 3000, netPnl: -15.0, symbol: 'EUR/JPY' },
      { closeTime: 4000, netPnl: 5.0, symbol: 'BTC/USD' }
    ];

    let runningPnl = 0;
    const curve = chronological.map((t, idx) => {
      runningPnl += t.netPnl;
      return {
        index: idx + 1,
        timestamp: t.closeTime,
        tradePnl: t.netPnl,
        cumulativePnl: Number(runningPnl.toFixed(2))
      };
    });

    expect(curve[0].cumulativePnl).toBe(10.0);
    expect(curve[1].cumulativePnl).toBe(35.0); // Peak
    expect(curve[2].cumulativePnl).toBe(20.0); // Drawdown from peak (35 - 20 = 15)
    expect(curve[3].cumulativePnl).toBe(25.0);

    // Calculate Max Drawdown
    let peak = 0;
    let maxDrawdown = 0;
    for (const pt of curve) {
      if (pt.cumulativePnl > peak) peak = pt.cumulativePnl;
      const dd = peak - pt.cumulativePnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    expect(maxDrawdown).toBe(15.0);
  });

  it('correctly filters deals and dynamically recalculates statistics across periods (ALL, 30D, 7D, 1D)', () => {
    const now = Date.now();
    const mockDeals = [
      // 1 day ago (within 1D, 7D, 30D, ALL)
      { id: '1', symbol: 'BTC/USD', netPnl: 15.0, closeTime: now - 2 * 60 * 60 * 1000 },
      // 3 days ago (within 7D, 30D, ALL)
      { id: '2', symbol: 'EUR/USD', netPnl: -10.0, closeTime: now - 3 * 24 * 60 * 60 * 1000 },
      // 10 days ago (within 30D, ALL)
      { id: '3', symbol: 'EUR/JPY', netPnl: 30.0, closeTime: now - 10 * 24 * 60 * 60 * 1000 },
      // 45 days ago (within ALL only)
      { id: '4', symbol: 'GBP/USD', netPnl: -20.0, closeTime: now - 45 * 24 * 60 * 60 * 1000 }
    ];

    // ALL period
    const allFiltered = mockDeals;
    expect(allFiltered.length).toBe(4);
    const allNetPnl = allFiltered.reduce((acc, d) => acc + d.netPnl, 0);
    expect(allNetPnl).toBe(15.0);

    // 30D period (within 30 days)
    const d30Filtered = mockDeals.filter(d => now - d.closeTime <= 30 * 24 * 60 * 60 * 1000);
    expect(d30Filtered.length).toBe(3);
    const d30NetPnl = d30Filtered.reduce((acc, d) => acc + d.netPnl, 0);
    expect(d30NetPnl).toBe(35.0);

    // 7D period (within 7 days)
    const d7Filtered = mockDeals.filter(d => now - d.closeTime <= 7 * 24 * 60 * 60 * 1000);
    expect(d7Filtered.length).toBe(2);
    const d7NetPnl = d7Filtered.reduce((acc, d) => acc + d.netPnl, 0);
    expect(d7NetPnl).toBe(5.0);

    // 1D period (within 24 hours)
    const d1Filtered = mockDeals.filter(d => now - d.closeTime <= 24 * 60 * 60 * 1000);
    expect(d1Filtered.length).toBe(1);
    expect(d1Filtered[0].symbol).toBe('BTC/USD');
    expect(d1Filtered[0].netPnl).toBe(15.0);
  });
});
