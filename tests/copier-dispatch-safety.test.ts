import { describe,it,expect,vi,beforeEach } from 'vitest';
import { approveCopierSignal } from '../src/server/services/copierSafetyPolicy';
const state=vi.hoisted(()=>({broker:vi.fn(),publish:vi.fn(),save:vi.fn(),subscribers:[
 {id:'master',accountNumber:'5881460',ctidTraderAccountId:48282756},
 {id:'alias',accountNumber:'48282756',ctidTraderAccountId:48282756},
 {id:'client',accountNumber:'5916063',ctidTraderAccountId:48739330},
 {id:'duplicate',accountNumber:'48739330',ctidTraderAccountId:48739330},
 {id:'cbot',accountNumber:'5918521',ctidTraderAccountId:5918521}
].map(s=>({...s,status:'ACTIVE',balance:1200,riskPercent:1,totalCopiedTrades:0,latencyMs:0}))}));
vi.mock('fs',()=>({existsSync:(p:string)=>p.endsWith('copier_subscribers.json'),readFileSync:()=>JSON.stringify(state.subscribers),writeFileSync:vi.fn(),mkdirSync:vi.fn()}));
vi.mock('../src/server/routes/broker',()=>({serverBrokerConnection:{}}));
vi.mock('../src/server/routes/execution',()=>({sharedAutoTraderState:{openTrades:[]}}));
vi.mock('../src/server/routes/auth',()=>({subscriberTokenStore:new Map()}));
vi.mock('../src/server/routes/copier',()=>({publishCopierSignal:state.publish}));
vi.mock('../src/server/services/ctraderMarketDataFeedService',()=>({ctraderMarketDataFeedService:{executeMarketOrderForSubscriber:state.broker,discoverAndSyncAllAccounts:vi.fn().mockResolvedValue([])}}));
vi.mock('../packages/database/src/repository',()=>({TradingRepository:class{savePosition=state.save}}));
vi.useFakeTimers();
import {multiClientCopierService as service} from '../src/server/services/multiClientCopierService';
let seq=0;
function fixture(eligibility:any='ELIGIBLE_FOR_EXECUTION'){
 const signal={signalId:`direct-${++seq}`,symbol:'GBP/USD',direction:'BUY',confidence:80,validationStatus:'PASS',validationErrors:[],expiryTime:Date.now()+60000,executionStatus:'VALID',entryPrice:1.33,stopLoss:1.327,takeProfit1:1.336,takeProfit2:1.34};
 return {trade:{pair:signal.symbol,direction:'BUY' as const,entryPrice:signal.entryPrice,stopLoss:signal.stopLoss,takeProfit1:signal.takeProfit1,takeProfit2:signal.takeProfit2},approval:approveCopierSignal(signal as any,eligibility)};
}
beforeEach(()=>{state.broker.mockReset();state.publish.mockClear();state.save.mockClear();});
describe('Direct copier execution isolation',()=>{
 it('blocks unapproved manual or HTTP proposals before publishing or broker calls',async()=>{await expect(service.dispatchMasterTrade(fixture().trade)).rejects.toThrow('GRADE_A');expect(state.broker).not.toHaveBeenCalled();expect(state.publish).not.toHaveBeenCalled();});
 it('sends once to a distinct Open API subscriber, excluding master aliases and cBot',async()=>{state.broker.mockResolvedValue({success:true,positionId:'broker-1',executionPrice:1.33});const f=fixture();const r=await service.dispatchMasterTrade(f.trade,f.approval);expect(r.dispatchedCount).toBe(1);expect(state.broker).toHaveBeenCalledTimes(1);expect(state.broker.mock.calls[0][0].ctidTraderAccountId).toBe(48739330);await service.dispatchMasterTrade(f.trade,f.approval);expect(state.broker).toHaveBeenCalledTimes(1);});
 it('never persists simulated success after broker rejection',async()=>{state.broker.mockResolvedValue({success:false,error:'BROKER_REJECTED'});const f=fixture();const r=await service.dispatchMasterTrade(f.trade,f.approval);expect(r.dispatchedCount).toBe(0);expect(r.results[0].status).toBe('FAILED');expect(state.save).not.toHaveBeenCalled();});
 it('does not convert waiting limit signals into market orders',async()=>{const f=fixture('WAITING_FOR_ENTRY');const r=await service.dispatchMasterTrade(f.trade,f.approval);expect(r.dispatchedCount).toBe(0);expect(state.broker).not.toHaveBeenCalled();});
});
