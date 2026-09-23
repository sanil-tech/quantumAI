import {describe,it,expect} from 'vitest';
import {signalValidationGate} from '../src/server/services/validation/signalValidationGate';
import {executionEligibilityGate} from '../src/server/services/validation/executionEligibilityGate';
import {approveCopierSignal} from '../src/server/services/copierSafetyPolicy';
function setup(direction:'BUY'|'SELL') {
 const buy=direction==='BUY';
 return signalValidationGate.validateSignal({symbol:'GBP/USD',timeframe:'M15',direction,currentPrice:1.33,
 entryPrice:buy?1.329:1.331,stopLoss:buy?1.326:1.334,takeProfit1:buy?1.335:1.325,takeProfit2:buy?1.3398:1.3202,
 modelConfidence:90,indicators:{ema50:buy?1.328:1.332,ema200:buy?1.325:1.335,rsi14:buy?60:40,adx:30,plusDI:buy?30:10,minusDI:buy?10:30,superTrendDirection:buy?'BULLISH':'BEARISH',atr:0.002},reasoningEvidence:['Trend aligned pullback']});
}
describe('Canonical pullback approval integration',()=>{
 it.each(['BUY','SELL'] as const)('permits Grade A %s LIMIT waiting for entry, but never MARKET execution',direction=>{
 const r=setup(direction),s=r.canonicalSignal;expect(r.isExecutable).toBe(true);expect(s.validationStatus).toBe('WARNING');expect(s.confidence).toBeGreaterThanOrEqual(75);expect(r.validationReport.errors).toEqual([]);
 const eligibility=executionEligibilityGate.evaluateEligibility(s,{currentPrice:1.33,spreadPips:1.2});expect(eligibility.executionEligibility).toBe('WAITING_FOR_ENTRY');
 expect(()=>approveCopierSignal(s,eligibility.executionEligibility)).not.toThrow();
 expect(()=>executionEligibilityGate.assertExecutionInvariant(s,eligibility.executionEligibility,'MARKET')).toThrow();
 });
 it('continues blocking low confidence even with informational warning',()=>{const s=setup('BUY').canonicalSignal;s.confidence=74;expect(()=>approveCopierSignal(s,'WAITING_FOR_ENTRY')).toThrow('GRADE_A');});
 it.each(['REVIEW','REJECTED'] as const)('continues blocking %s',validationStatus=>{const s=setup('BUY').canonicalSignal;s.validationStatus=validationStatus;expect(()=>approveCopierSignal(s,'WAITING_FOR_ENTRY')).toThrow('GRADE_A');});
});
