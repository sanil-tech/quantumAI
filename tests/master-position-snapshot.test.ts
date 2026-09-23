import {describe,it,expect} from 'vitest';
import {masterPositionSnapshot} from '../src/lib/masterPositionSnapshot';
import {approveCopierSignal, confirmMasterOrder, requireMasterOrder} from '../src/server/services/copierSafetyPolicy';
const proof=()=>approveCopierSignal({signalId:'s',symbol:'GBP/USD',direction:'BUY',confidence:80,validationStatus:'PASS',expiryTime:Date.now()+60000,executionStatus:'VALID',entryPrice:1.3,stopLoss:1.2,takeProfit1:1.5} as any,'WAITING_FOR_ENTRY');
describe('Authoritative master snapshot',()=>{
 it('shows all 11 broker tickets when local storage contains only four, preserving metadata',()=>{const local=Array.from({length:4},(_,i)=>({brokerTicket:String(i),reason:'saved',lotSize:9}));const broker=Array.from({length:11},(_,i)=>({positionId:String(i),lotSize:0.01}));const result=masterPositionSnapshot(local,{success:true,normalizedPositions:broker});expect(result).toHaveLength(11);expect(result[0]).toMatchObject({reason:'saved',lotSize:0.01});});
 it('clears stale local positions for a successful empty account but retains them on failure',()=>{const local=[{id:'old'}];expect(masterPositionSnapshot(local,{success:true,normalizedPositions:[]})).toEqual([]);expect(masterPositionSnapshot(local,{success:false,normalizedPositions:[]})).toBe(local);});
});
describe('Master-first approval',()=>{
 it('requires more than grade A approval',()=>expect(()=>requireMasterOrder(proof())).toThrow('MASTER_ORDER_CONFIRMATION_REQUIRED'));
 it.each(['REJECTED','FAILED','UNKNOWN'])('blocks %s master',status=>expect(()=>confirmMasterOrder(proof(),{status,broker_order_id:'123'},'LIMIT')).toThrow());
 it('rejects synthetic IDs and binds a real pending order immutably',()=>{const p=proof();expect(()=>confirmMasterOrder(p,{status:'FILLED',broker_order_id:'SIG-123'},'LIMIT')).toThrow();confirmMasterOrder(p,{status:'ACCEPTED',broker_order_id:'123'},'LIMIT');expect(requireMasterOrder(p)).toEqual({orderId:'123',orderType:'LIMIT'});expect(()=>confirmMasterOrder(p,{status:'ACCEPTED',broker_order_id:'456'},'LIMIT')).toThrow();});
});
