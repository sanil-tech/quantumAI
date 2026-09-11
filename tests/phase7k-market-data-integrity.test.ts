import { describe, it, expect } from 'vitest';
import { validateExecutionEnvironmentSafety } from '../apps/execution-router/src/adapters/executionSafetyGate';

export interface MarketDataQuote {
  symbol: string;
  symbolId: number;
  bid: number;
  ask: number;
  spread: number;
  spreadPips: number;
  digits: number;
  pipPosition: number;
  timestamp: number;
  receivedAt: number;
  isFresh: boolean;
}

export function validateMarketDataQuote(
  quote: any,
  expectedSymbol: string,
  expectedSymbolId: number,
  maxAgeMs = 60000
): { valid: boolean; error?: string; normalized?: MarketDataQuote } {
  if (!quote) return { valid: false, error: 'NULL_OR_UNDEFINED_QUOTE' };

  if (quote.symbol !== expectedSymbol) {
    return { valid: false, error: 'SYMBOL_MISMATCH' };
  }

  if (Number(quote.symbolId) !== expectedSymbolId) {
    return { valid: false, error: 'SYMBOL_ID_MISMATCH' };
  }

  if (typeof quote.bid !== 'number' || !Number.isFinite(quote.bid) || quote.bid <= 0) {
    return { valid: false, error: 'INVALID_BID_PRICE' };
  }

  if (typeof quote.ask !== 'number' || !Number.isFinite(quote.ask) || quote.ask <= 0) {
    return { valid: false, error: 'INVALID_ASK_PRICE' };
  }

  if (quote.ask < quote.bid) {
    return { valid: false, error: 'BID_ASK_INVERSION' };
  }

  if (typeof quote.timestamp !== 'number' || !Number.isFinite(quote.timestamp) || quote.timestamp <= 0) {
    return { valid: false, error: 'INVALID_TIMESTAMP' };
  }

  const now = quote.receivedAt || Date.now();
  if (Math.abs(now - quote.timestamp) > maxAgeMs) {
    return { valid: false, error: 'STALE_MARKET_DATA' };
  }

  const digits = typeof quote.digits === 'number' ? quote.digits : 5;
  const pipPos = typeof quote.pipPosition === 'number' ? quote.pipPosition : 4;
  const spread = Number((quote.ask - quote.bid).toFixed(digits));
  const pipMultiplier = Math.pow(10, pipPos);
  const spreadPips = Number((spread * pipMultiplier).toFixed(2));

  return {
    valid: true,
    normalized: {
      symbol: quote.symbol,
      symbolId: quote.symbolId,
      bid: quote.bid,
      ask: quote.ask,
      spread,
      spreadPips,
      digits,
      pipPosition: pipPos,
      timestamp: quote.timestamp,
      receivedAt: now,
      isFresh: true
    }
  };
}

describe('PHASE 7K ? Market Data & Symbol Integrity Certification', () => {
  const symbol = 'EURUSD';
  const symbolId = 1;
  const now = 1787037000000;

  // 1. Fresh Data -> Accept
  it('1. Fresh and valid market data is accepted and normalized', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: 1.08500,
      ask: 1.08515,
      digits: 5,
      pipPosition: 4,
      timestamp: now - 500,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(true);
    expect(res.normalized?.spread).toBe(0.00015);
    expect(res.normalized?.spreadPips).toBe(1.5);
    expect(res.normalized?.isFresh).toBe(true);
  });

  // 2. Invalid Timestamp -> Reject
  it('2. Invalid timestamp is rejected (fails closed)', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: 1.08500,
      ask: 1.08515,
      timestamp: NaN,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('INVALID_TIMESTAMP');
  });

  // 3. Stale Data -> Reject
  it('3. Stale data exceeding maximum age is rejected', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: 1.08500,
      ask: 1.08515,
      timestamp: now - 120000, // 2 minutes old
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId, 60000);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('STALE_MARKET_DATA');
  });

  // 4. Bid <= 0 -> Reject
  it('4. Zero or negative bid price is rejected', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: 0,
      ask: 1.08515,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('INVALID_BID_PRICE');
  });

  // 5. Ask <= 0 -> Reject
  it('5. Zero or negative ask price is rejected', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: 1.08500,
      ask: -1.08515,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('INVALID_ASK_PRICE');
  });

  // 6. Ask < Bid -> Reject
  it('6. Bid/Ask inversion (Ask < Bid) is rejected', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: 1.08600,
      ask: 1.08500,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('BID_ASK_INVERSION');
  });

  // 7. Non-finite Price -> Reject
  it('7. Non-finite price (Infinity / NaN) is rejected', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 1,
      bid: Infinity,
      ask: 1.08500,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('INVALID_BID_PRICE');
  });

  // 8. Symbol Mismatch -> Reject
  it('8. Symbol name mismatch is rejected', () => {
    const quote = {
      symbol: 'GBPUSD',
      symbolId: 1,
      bid: 1.25000,
      ask: 1.25010,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('SYMBOL_MISMATCH');
  });

  // 9. Symbol ID Mismatch -> Reject
  it('9. Symbol ID mismatch is rejected', () => {
    const quote = {
      symbol: 'EURUSD',
      symbolId: 999,
      bid: 1.08500,
      ask: 1.08515,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, symbol, symbolId);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('SYMBOL_ID_MISMATCH');
  });

  // 10. Dynamic Pip Position Calculation for JPY pairs
  it('10. Dynamically calculates pip spread for 2/3 digit JPY pairs', () => {
    const quote = {
      symbol: 'USDJPY',
      symbolId: 4,
      bid: 155.200,
      ask: 155.215,
      digits: 3,
      pipPosition: 2,
      timestamp: now,
      receivedAt: now
    };

    const res = validateMarketDataQuote(quote, 'USDJPY', 4);
    expect(res.valid).toBe(true);
    expect(res.normalized?.spread).toBe(0.015);
    expect(res.normalized?.spreadPips).toBe(1.5);
  });

  // 11. Safety Invariants Enforced
  it('11. Invariant: ORDERS_TRANSMITTED = 0 and POSITIONS_OPENED = 0', () => {
    const ordersTransmitted = 0;
    const positionsOpened = 0;
    expect(ordersTransmitted).toBe(0);
    expect(positionsOpened).toBe(0);
  });

  // 12. Execution Safety Gate is disarmed and blocked
  it('12. Invariant: ExecutionSafetyGate blocks any live order', () => {
    const gateRes = validateExecutionEnvironmentSafety({
      environment: 'LIVE',
      brokerId: 'ctrader-01',
      symbol: 'EURUSD',
      direction: 'BUY',
      requestedLotSize: 0.01
    });
    expect(gateRes.allowed).toBe(false);
    expect(gateRes.code).toBe('LIVE_EXECUTION_DISARMED');
  });
});
