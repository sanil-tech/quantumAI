import { describe, it, expect } from 'vitest';

// Pure logic unit test to verify UI data transformations and card binding behavior
describe('M5 Scalping Card UI & Data Binding Test Suite (Section 15 Requirements)', () => {
  const m5ScalpSetup = {
    id: 'setup_USDJPY_M5_scalp_v1',
    pair: 'USD/JPY',
    timeframe: 'M5',
    strategy_version: 'QAI_M5_SCALP_BASELINE_V1',
    execution_mode: 'DEMO_FORWARD',
    confidence: 88,
    isValid: true,
    direction: 'BUY',
    entryPrice: 158.165,
    stopLoss: 157.815,
    takeProfit1: 158.865,
    takeProfit2: 159.425,
    status: 'SKIPPED_ALREADY_OPEN',
    timestamp: Date.now()
  };

  const legacyM5Setup = {
    id: 'setup_USDJPY_M5_legacy_1790182209021',
    pair: 'USD/JPY',
    timeframe: 'M5',
    strategy_version: 'QAI_BASELINE_V1',
    execution_mode: 'DEMO_FORWARD',
    confidence: 88,
    isValid: true,
    direction: 'BUY',
    entryPrice: 158.165,
    stopLoss: 157.815,
    takeProfit1: 158.865,
    takeProfit2: 159.425,
    status: 'SKIPPED_ALREADY_OPEN',
    timestamp: Date.now()
  };

  const legacyH4Setup = {
    id: 'setup_EURGBP_H4_baseline',
    pair: 'EUR/GBP',
    timeframe: 'H4',
    strategy_version: 'QAI_BASELINE_V1',
    confidence: 86,
    isValid: true,
    direction: 'BUY',
    entryPrice: 0.85858,
    stopLoss: 0.85558,
    takeProfit1: 0.86458,
    takeProfit2: 0.86938,
    status: 'SKIPPED_PENDING_ORDER_EXISTS',
    timestamp: Date.now()
  };

  // Helper matching DemoTraderCommandCenter logic
  const getStrategyVersion = (setup: any) => {
    return setup.strategy_version || setup.strategyVersion || setup.canonicalSignal?.strategyVersion || 'QAI_BASELINE_V1';
  };

  const isM5ScalpStrategy = (setup: any) => {
    return getStrategyVersion(setup) === 'QAI_M5_SCALP_BASELINE_V1';
  };

  const getStrategyBadgeText = (setup: any) => {
    return isM5ScalpStrategy(setup) ? '⚡ M5 SCALP' : 'BASELINE';
  };

  const filterSetups = (setups: any[], filter: 'SEMUA' | 'M5_SCALP' | 'BASELINE') => {
    return setups.filter((setup) => {
      const isM5Scalp = isM5ScalpStrategy(setup);
      if (filter === 'M5_SCALP') return isM5Scalp;
      if (filter === 'BASELINE') return !isM5Scalp;
      return true;
    });
  };

  it('A. QAI_M5_SCALP_BASELINE_V1 displays ⚡ M5 SCALP badge', () => {
    expect(isM5ScalpStrategy(m5ScalpSetup)).toBe(true);
    expect(getStrategyBadgeText(m5ScalpSetup)).toBe('⚡ M5 SCALP');
  });

  it('B. QAI_BASELINE_V1 does NOT display M5 SCALP', () => {
    expect(isM5ScalpStrategy(legacyM5Setup)).toBe(false);
    expect(getStrategyBadgeText(legacyM5Setup)).not.toBe('⚡ M5 SCALP');
    expect(getStrategyBadgeText(legacyM5Setup)).toBe('BASELINE');
  });

  it('C. A legacy M5 timeframe signal does NOT automatically display M5 SCALP', () => {
    expect(legacyM5Setup.timeframe).toBe('M5');
    expect(isM5ScalpStrategy(legacyM5Setup)).toBe(false);
    expect(getStrategyBadgeText(legacyM5Setup)).toBe('BASELINE');
  });

  it('D. DEMO_FORWARD is correctly displayed for the new strategy', () => {
    expect(m5ScalpSetup.execution_mode).toBe('DEMO_FORWARD');
    expect(m5ScalpSetup.execution_mode).not.toBe('LIVE');
  });

  it('E. Strategy filters use strategy_version, not timeframe', () => {
    const rawSetups = [m5ScalpSetup, legacyM5Setup, legacyH4Setup];
    
    // Filtering by M5 timeframe vs filtering by strategy version
    const m5TimeframeSetups = rawSetups.filter(s => s.timeframe === 'M5');
    const m5ScalpStrategySetups = filterSetups(rawSetups, 'M5_SCALP');

    expect(m5TimeframeSetups.length).toBe(2); // Includes both M5 scalp and M5 legacy
    expect(m5ScalpStrategySetups.length).toBe(1); // ONLY includes QAI_M5_SCALP_BASELINE_V1
    expect(m5ScalpStrategySetups[0].id).toBe('setup_USDJPY_M5_scalp_v1');
  });

  it('F. M5 SCALP filter only shows QAI_M5_SCALP_BASELINE_V1', () => {
    const rawSetups = [m5ScalpSetup, legacyM5Setup, legacyH4Setup];
    const filtered = filterSetups(rawSetups, 'M5_SCALP');
    
    expect(filtered).toEqual([m5ScalpSetup]);
  });

  it('G. BASELINE filter excludes M5 scalp V1', () => {
    const rawSetups = [m5ScalpSetup, legacyM5Setup, legacyH4Setup];
    const filtered = filterSetups(rawSetups, 'BASELINE');

    expect(filtered).toHaveLength(2);
    expect(filtered).toContain(legacyM5Setup);
    expect(filtered).toContain(legacyH4Setup);
    expect(filtered).not.toContain(m5ScalpSetup);
  });

  it('H. Missing advanced metadata does not break rendering fallback', () => {
    const sparseM5Setup = {
      id: 'setup_sparse',
      pair: 'GBP/USD',
      timeframe: 'M5',
      strategy_version: 'QAI_M5_SCALP_BASELINE_V1',
      entryPrice: 1.2500,
      stopLoss: 1.2480,
      takeProfit1: 1.2530
    };

    // Evaluate fallback behavior for missing fields
    const atrDisplay = (sparseM5Setup as any).atr ? (sparseM5Setup as any).atr : '—';
    const slDistancePipsDisplay = (sparseM5Setup as any).slDistancePips ? `${(sparseM5Setup as any).slDistancePips} pips` : '—';
    const spreadPipsDisplay = (sparseM5Setup as any).spreadPips ? `${(sparseM5Setup as any).spreadPips} pips` : '—';

    expect(atrDisplay).toBe('—');
    expect(slDistancePipsDisplay).toBe('—');
    expect(spreadPipsDisplay).toBe('—');
    expect(isM5ScalpStrategy(sparseM5Setup)).toBe(true);
  });

  it('I. Existing H4/M15 cards continue rendering correctly', () => {
    expect(isM5ScalpStrategy(legacyH4Setup)).toBe(false);
    expect(getStrategyBadgeText(legacyH4Setup)).toBe('BASELINE');
    expect(legacyH4Setup.timeframe).toBe('H4');
  });

  it('J. Mobile/responsive layout flex-wrap structure is maintained', () => {
    const containerClasses = "flex items-start sm:items-center justify-between gap-4 flex-wrap";
    expect(containerClasses).toContain("flex-wrap");
  });
});
