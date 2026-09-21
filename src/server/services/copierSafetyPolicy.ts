import type { CanonicalSignal, ExecutionEligibilityState } from './validation/signalValidationTypes';
export const MIN_AUTOMATED_SIGNAL_CONFIDENCE = 75;
export interface CopierApproval { readonly signalId: string; readonly confidence: number; readonly expiresAt: number; readonly eligibility: ExecutionEligibilityState; }
type Terms = { pair: string; direction: string; entryPrice: number; stopLoss: number; takeProfit1: number; takeProfit2?: number };
const issued = new WeakMap<CopierApproval, Terms>();
const normalize = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
// HTTP JSON cannot recreate a server-issued in-process approval.
export function approveCopierSignal(signal: CanonicalSignal, eligibility: ExecutionEligibilityState, now = Date.now()): CopierApproval {
  if (!signal || !Number.isFinite(signal.confidence) || signal.confidence < MIN_AUTOMATED_SIGNAL_CONFIDENCE || signal.confidence > 100 ||
      signal.validationStatus !== 'PASS' || signal.validationErrors?.length || !Number.isFinite(signal.expiryTime) || signal.expiryTime <= now ||
      !['WAITING_FOR_ENTRY','ELIGIBLE_FOR_EXECUTION'].includes(eligibility) || ['INVALIDATED','REJECTED','EXPIRED','CLOSED','EXECUTED'].includes(signal.executionStatus))
    throw new Error('GRADE_A_APPROVAL_REQUIRED: A current validated Grade A/A+ signal is required');
  const proof = Object.freeze({signalId:signal.signalId,confidence:signal.confidence,expiresAt:signal.expiryTime,eligibility});
  issued.set(proof,{pair:signal.symbol,direction:signal.direction,entryPrice:signal.entryPrice,stopLoss:signal.stopLoss,takeProfit1:signal.takeProfit1,takeProfit2:signal.takeProfit2});
  return proof;
}
export function assertCopierApproval(signal: Terms, proof?: CopierApproval): asserts proof is CopierApproval {
  const terms = proof && issued.get(proof);
  if (!terms || proof!.expiresAt <= Date.now() || normalize(terms.pair) !== normalize(signal.pair) || terms.direction !== signal.direction ||
      terms.entryPrice !== signal.entryPrice || terms.stopLoss !== signal.stopLoss || terms.takeProfit1 !== signal.takeProfit1 || (terms.takeProfit2 || 0) !== (signal.takeProfit2 || 0))
    throw new Error('GRADE_A_APPROVAL_REQUIRED: Missing, expired or mismatched server approval');
}
export function selectDirectCopyRecipients<T extends {accountNumber:string;ctidTraderAccountId:number;status:string;executionChannel?:string}>(subs:T[],masterIds=['5881460','48282756',process.env.CTRADER_ACCOUNT_ID || '']):T[] {
  const seen=new Set<string>();
  return subs.filter(s=>{const id=String(s.ctidTraderAccountId);
    if(!['ACTIVE','TRIAL'].includes(s.status) || s.executionChannel==='CBOT' || masterIds.includes(s.accountNumber) || masterIds.includes(id) ||
       !Number.isSafeInteger(s.ctidTraderAccountId) || s.ctidTraderAccountId<=0 || seen.has(id)) return false;
    seen.add(id);return true;});
}

// Browser auto-execution must use the server scanner; an advisory confidence value is not approval.
export function manualEntryOnly(req: {body?: {isAutoExecution?: unknown}}, res: any, next: () => void): void {
  if (req.body?.isAutoExecution !== false) {
    res.status(422).json({success:false,code:'AUTO_EXECUTION_SCANNER_REQUIRED',error:'Automatic entries require the server Grade A scanner. Manual entries must explicitly set isAutoExecution:false.'});
    return;
  }
  next();
}
