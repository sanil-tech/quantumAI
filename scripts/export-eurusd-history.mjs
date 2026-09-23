import 'dotenv/config';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import protobuf from 'protobufjs';
import crypto from 'node:crypto';
const output = process.argv[2];
if (!output) throw new Error('Output file required');
const account = Number(process.env.CTRADER_ACCOUNT_ID || 48282756);
const root = new protobuf.Root();
const protoDir=path.resolve('src/integrations/ctrader/proto');
root.resolvePath=(_origin,target)=>path.join(protoDir,path.basename(target));
root.loadSync(['OpenApiCommonModelMessages.proto','OpenApiCommonMessages.proto','OpenApiModelMessages.proto','OpenApiMessages.proto'].map(p=>path.join(protoDir,p)));
const wrapper=root.lookupType('ProtoMessage');
const names={2100:'ProtoOAApplicationAuthReq',2101:'ProtoOAApplicationAuthRes',2102:'ProtoOAAccountAuthReq',2103:'ProtoOAAccountAuthRes',2114:'ProtoOASymbolsListReq',2115:'ProtoOASymbolsListRes',2116:'ProtoOASymbolByIdReq',2117:'ProtoOASymbolByIdRes',2137:'ProtoOAGetTrendbarsReq',2138:'ProtoOAGetTrendbarsRes',2142:'ProtoOAErrorRes',50:'ProtoOAErrorRes'};
const allowed=new Set([2100,2102,2114,2116,2137]); // Authentication and read-only metadata/history only.
let buffer=Buffer.alloc(0),seq=0;const pending=new Map();
const socket=tls.connect({host:'demo.ctraderapi.com',port:5035,servername:'demo.ctraderapi.com',rejectUnauthorized:true});
socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=4&&buffer.length>=buffer.readUInt32BE(0)+4){const len=buffer.readUInt32BE(0),msg=wrapper.toObject(wrapper.decode(buffer.subarray(4,4+len)),{longs:Number});buffer=buffer.subarray(4+len);const item=pending.get(msg.clientMsgId);if(!item)continue;pending.delete(msg.clientMsgId);clearTimeout(item.timer);if(msg.payloadType===2142||msg.payloadType===50){const err=root.lookupType(names[msg.payloadType]).decode(msg.payload);item.reject(new Error('BROKER_HISTORY_ERROR: '+err.errorCode));}else if(names[msg.payloadType]){item.resolve(root.lookupType(names[msg.payloadType]).toObject(root.lookupType(names[msg.payloadType]).decode(msg.payload),{longs:Number,enums:Number}));}else item.reject(new Error('UNEXPECTED_RESPONSE'));}});
socket.on('error',err=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('HISTORY_CONNECTION_FAILED: '+err.code));}pending.clear();});
function request(type,payload){if(!allowed.has(type))throw new Error('READ_ONLY_REQUEST_REQUIRED');return new Promise((resolve,reject)=>{const id='history-'+(++seq),Type=root.lookupType(names[type]);const data={...payload,payloadType:type};const error=Type.verify(data);if(error)return reject(new Error(error));const encoded=wrapper.encode(wrapper.create({payloadType:type,payload:Type.encode(Type.create(data)).finish(),clientMsgId:id})).finish();const frame=Buffer.alloc(encoded.length+4);frame.writeUInt32BE(encoded.length);Buffer.from(encoded).copy(frame,4);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('HISTORY_TIMEOUT'));},15000);pending.set(id,{resolve,reject,timer});socket.write(frame);});}
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CONNECT_TIMEOUT')),15000);socket.once('secureConnect',()=>{clearTimeout(timer);resolve();});socket.once('error',()=>{clearTimeout(timer);reject(new Error('CONNECT_FAILED'));});});
 await request(2100,{clientId:process.env.CTRADER_CLIENT_ID,clientSecret:process.env.CTRADER_CLIENT_SECRET});
 await request(2102,{ctidTraderAccountId:account,accessToken:process.env.CTRADER_ACCESS_TOKEN});
 const symbols=await request(2114,{ctidTraderAccountId:account,includeArchivedSymbols:false});
 const symbol=symbols.symbol?.find(s=>s.symbolName==='EURUSD'||s.symbolName==='EUR/USD');if(!symbol)throw new Error('BROKER_EURUSD_NOT_FOUND');
 const detail=await request(2116,{ctidTraderAccountId:account,symbolId:[symbol.symbolId]});
 const spec=detail.symbol?.[0];if(!spec)throw new Error('BROKER_SPEC_UNAVAILABLE');
 const end=Math.floor(Date.now()/3600000)*3600000, evaluationStart=(()=>{const d=new Date(end);d.setUTCMonth(d.getUTCMonth()-6);return d.getTime();})(), start=evaluationStart-30*86400000;
 const bars=new Map();let windows=0;
 for(let from=start;from<end;from+=7*86400000){let to=Math.min(end-1,from+7*86400000-1);let pages=0;while(to>=from){if(++pages>100)throw new Error('PAGINATION_LIMIT');await new Promise(r=>setTimeout(r,250));const reply=await request(2137,{ctidTraderAccountId:account,symbolId:symbol.symbolId,period:9,fromTimestamp:from,toTimestamp:to,count:10000});for(const b of reply.trendbar||[]){const low=Number(b.low),time=Number(b.utcTimestampInMinutes)*60;if(time*1000<start||time*1000>=end)continue;bars.set(time,{time,open:(low+Number(b.deltaOpen||0))/100000,high:(low+Number(b.deltaHigh||0))/100000,low:low/100000,close:(low+Number(b.deltaClose||0))/100000,volume:Number(b.volume)});}if(!reply.hasMore)break;const oldest=Math.min(...(reply.trendbar||[]).map(b=>Number(b.utcTimestampInMinutes)*60000));if(!Number.isFinite(oldest)||oldest>to)throw new Error('HISTORY_PAGINATION_STALLED');to=oldest-1;}if(++windows%10===0)console.log('Read-only history: '+windows+' weekly windows, '+bars.size+' H1 bars');}
 const candles=[...bars.values()].sort((a,b)=>a.time-b.time);
 const result={source:'CTRADER_BROKER',instrument:'EUR/USD',brokerSymbol:symbol.symbolName,symbolId:symbol.symbolId,timeframe:'H1',evaluationStart,requestedFrom:start,requestedTo:end,fetchedAt:Date.now(),synthetic:false,spec:{digits:spec.digits,pipPosition:spec.pipPosition,lotSize:spec.lotSize,minVolume:spec.minVolume,maxVolume:spec.maxVolume,stepVolume:spec.stepVolume},candles};
 result.dataHash=crypto.createHash('sha256').update(JSON.stringify(candles)).digest('hex');fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(result));console.log(JSON.stringify({bars:candles.length,from:candles[0]?.time,to:candles.at(-1)?.time,dataHash:result.dataHash}));
} catch(err){console.error(err.message);process.exitCode=1;} finally {socket.destroy();}
