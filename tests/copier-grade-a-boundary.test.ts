import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { approveCopierSignal, assertCopierApproval, selectDirectCopyRecipients, manualEntryOnly } from '../src/server/services/copierSafetyPolicy';
import type { CanonicalSignal } from '../src/server/services/validation/signalValidationTypes';
const memory=vi.hoisted(()=>({files:new Map<string,string>(),deliveries:new Set<string>()}));
vi.mock('fs',()=>({existsSync:(p:string)=>memory.files.has(p),readFileSync:(p:string)=>memory.files.get(p),writeFileSync:(p:string,s:string)=>memory.files.set(p,s),mkdirSync:vi.fn()}));
vi.mock('../src/server/services/multiClientCopierService',()=>({multiClientCopierService:{}}));
vi.mock('../src/server/services/vipSubscriptionService',()=>({vipSubscriptionService:{
 verifyVipToken:(token:string,account:string)=>({valid:token===`token-${account}`,error:'ACCOUNT_TOKEN_MISMATCH'}),
 verifyLicense:()=>({valid:true,status:'ACTIVE'}),
 isSignalDelivered:(a:string,id:string)=>memory.deliveries.has(`${a}:${id}`),
 recordSignalDelivery:(a:string,id:string)=>memory.deliveries.add(`${a}:${id}`)
}}));
import {copierRouter,publishCopierSignal} from '../src/server/routes/copier';
let seq=0;
function canonical(overrides:Partial<CanonicalSignal>={}):CanonicalSignal { return {
 signalId:`audit-${++seq}`,symbol:'GBP/USD',direction:'BUY',confidence:80,validationStatus:'PASS',validationErrors:[],
 expiryTime:Date.now()+60000,executionStatus:'WAITING_FOR_ENTRY',entryPrice:1.33,stopLoss:1.327,takeProfit1:1.336,takeProfit2:1.34,...overrides
} as CanonicalSignal; }
function publish(s=canonical()) {const terms={id:s.signalId,pair:s.symbol,direction:s.direction,entryPrice:s.entryPrice,stopLoss:s.stopLoss,takeProfit1:s.takeProfit1,takeProfit2:s.takeProfit2!,lotSize:0.01};return publishCopierSignal(terms,approveCopierSignal(s,'WAITING_FOR_ENTRY'));}
const app=express();app.use(express.json());app.use('/api',copierRouter);
beforeEach(()=>{process.env.ADMIN_API_KEY='audit-admin';process.env.NODE_ENV='test';});
describe('Grade A and recipient boundary',()=>{
 it.each([NaN,Infinity,0,70,74.99,101])('rejects invalid or sub-A confidence %s',confidence=>expect(()=>approveCopierSignal(canonical({confidence}),'WAITING_FOR_ENTRY')).toThrow('GRADE_A'));
 it.each([75,85,100])('permits validated A/A+ confidence %s',confidence=>expect(approveCopierSignal(canonical({confidence}),'WAITING_FOR_ENTRY').confidence).toBe(confidence));
 it.each(['REVIEW','WARNING','REJECTED'])('rejects validation %s',validationStatus=>expect(()=>approveCopierSignal(canonical({validationStatus:validationStatus as any}),'WAITING_FOR_ENTRY')).toThrow());
 it.each(['BLOCKED','EXPIRED','EXECUTED','NOT_ELIGIBLE'])('rejects eligibility %s',e=>expect(()=>approveCopierSignal(canonical(),e as any)).toThrow());
 it('rejects expiry and validation errors',()=>{expect(()=>approveCopierSignal(canonical({expiryTime:Date.now()-1}),'WAITING_FOR_ENTRY')).toThrow();expect(()=>approveCopierSignal(canonical({validationErrors:['bad feed']}),'WAITING_FOR_ENTRY')).toThrow();});
 it('rejects forged JSON and changed price terms',()=>{const s=canonical(),p=approveCopierSignal(s,'WAITING_FOR_ENTRY');const terms={pair:s.symbol,direction:s.direction,entryPrice:s.entryPrice,stopLoss:s.stopLoss,takeProfit1:s.takeProfit1,takeProfit2:s.takeProfit2};expect(()=>assertCopierApproval(terms,{...p})).toThrow();expect(()=>assertCopierApproval({...terms,entryPrice:1.5},p)).toThrow();expect(()=>assertCopierApproval(terms,p)).not.toThrow();});
 it('excludes both master aliases, cBot accounts and duplicate API identities',()=>{
 const sub=(accountNumber:string,ctidTraderAccountId:number,executionChannel?:string)=>({accountNumber,ctidTraderAccountId,executionChannel,status:'ACTIVE'});
 expect(selectDirectCopyRecipients([sub('5881460',48282756),sub('48282756',48282756),sub('5918521',900,'CBOT'),sub('5916063',48739330),sub('48739330',48739330)])).toEqual([sub('5916063',48739330)]);
 });
});
describe('cBot bridge without broker or network effects',()=>{
 it('does not accept an unapproved new order even with claimed grade',()=>expect(()=>publishCopierSignal({pair:'GBP/USD',direction:'BUY',entryPrice:1.33,stopLoss:1.327,takeProfit1:1.336,takeProfit2:1.34,lotSize:0.04,approvedGrade:'A+'})).toThrow('GRADE_A'));
 it('publishes, delivers once, and delivers the next same-pair opportunity',async()=>{
 const first=publish();let r=await request(app).get('/api/copier/signal?account=5918521').set('Authorization','Bearer token-5918521');expect(r.body.signal.id).toBe(first.id);
 r=await request(app).get('/api/copier/signal?account=5918521').set('Authorization','Bearer token-5918521');expect(r.body.hasSignal).toBe(false);
 const second=publish();r=await request(app).get('/api/copier/signal?account=5918521').set('Authorization','Bearer token-5918521');expect(r.body.signal.id).toBe(second.id);expect(second.id).not.toBe(first.id);
 });
 it('keeps original timestamp on publication retry',()=>{const s=canonical(),a=publish(s),b=publish(s);expect(b).toBe(a);});
 it('wrong-account token cannot consume a signal',async()=>{const s=publish();const r=await request(app).get('/api/copier/signal?account=5918521').set('Authorization','Bearer token-5918523');expect(r.status).toBe(403);expect(memory.deliveries.has(`5918521:${s.id}`)).toBe(false);});
 it('reports observed polling separately from license status and requires admin',async()=>{
 let r=await request(app).get('/api/copier/receiver-health?account=5918521');expect(r.status).toBe(401);
 r=await request(app).get('/api/copier/receiver-health?account=5918521').set('x-admin-key','audit-admin');expect(r.body.connectionStatus).toBe('CONNECTED');expect(r.body.lastDeliveredSignalId).toBeTruthy();
 r=await request(app).get('/api/copier/receiver-health?account=5918523').set('x-admin-key','audit-admin');expect(r.body.licenseStatus).toBe('ACTIVE');expect(r.body.connectionStatus).toBe('NOT_OBSERVED');
 });
 it('HTTP ingestion and test order cannot dispatch ungraded orders',async()=>{
 const r=await request(app).post('/api/copier/signal').set('x-admin-key','audit-admin').send({pair:'GBP/USD',direction:'BUY',entryPrice:1.33,stopLoss:1.32,takeProfit1:1.34,confidence:99});expect(r.status).toBe(422);
 const t=await request(app).post('/api/copier/test-dual-order').set('x-admin-key','audit-admin').send({});expect(t.status).toBe(422);
 });
});

describe('Browser entry boundary',()=>{
 it.each([true,undefined,'false',0])('rejects automatic or ambiguous entry %s before execution',async isAutoExecution=>{
  const execute=vi.fn((_req,res)=>res.json({executed:true}));const local=express();local.use(express.json());local.post('/entry',manualEntryOnly,execute);
  const r=await request(local).post('/entry').send({isAutoExecution});expect(r.status).toBe(422);expect(execute).not.toHaveBeenCalled();
 });
 it('preserves explicitly manual entries without copier fanout',async()=>{const local=express();local.use(express.json());local.post('/entry',manualEntryOnly,(_req,res)=>res.json({manual:true}));const r=await request(local).post('/entry').send({isAutoExecution:false});expect(r.body.manual).toBe(true);});
});
