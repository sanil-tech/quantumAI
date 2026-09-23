import {it,expect} from 'vitest';
import {quoteUnitsPerUsd} from '../src/server/services/fxRiskConversion';
it('converts GBP quote using inverse ask',()=>expect(quoteUnitsPerUsd('GBP',{bid:1.24,ask:1.25,timestamp:10000},10000)).toBe(0.8));
it('converts AUD quote using inverse ask',()=>expect(quoteUnitsPerUsd('AUD',{bid:0.64,ask:0.65,timestamp:10000},10000)).toBeCloseTo(1/0.65));
it('uses bid for USDJPY conversion',()=>expect(quoteUnitsPerUsd('JPY',{bid:150,ask:151,timestamp:10000},10000)).toBe(150));
it('rejects stale conversion',()=>expect(()=>quoteUnitsPerUsd('GBP',{bid:1.24,ask:1.25,timestamp:10000},30000)).toThrow());
it('USD requires no conversion',()=>expect(quoteUnitsPerUsd('USD',null)).toBe(1));
