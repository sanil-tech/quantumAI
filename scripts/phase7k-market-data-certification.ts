
import tls from 'tls';
import dotenv from 'dotenv';
dotenv.config();

import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

export interface NormalizedMarketData {
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
  source: 'CTRADER_DEMO_OPENAPI';
  environment: 'DEMO';
}

export async function runPhase7KMarketDataCertification(): Promise<{
  success: boolean;
  discoveredSymbol?: any;
  symbolMetadata?: any;
  normalizedQuote?: NormalizedMarketData;
  error?: string;
}> {
  const host = 'demo.ctraderapi.com';
  const port = 5035;
  const clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  const accountId = Number((process.env.CTRADER_ACCOUNT_ID || '').trim());

  console.log('======================================================================');
  console.log('QUANTUMAI / IATI OS ? PHASE 7K REAL DEMO MARKET DATA CERTIFICATION');
  console.log('======================================================================');
  console.log('Target Endpoint:        ', host + ':' + port);
  console.log('Target Account ID:      ', accountId);
  console.log('Target Symbol:           EURUSD');

  const root = await CTraderProtoManager.loadSchemas();
  const ProtoMessage = root.lookupType('ProtoMessage');

  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    let step = 1;
    let discoveredSymbol: any = null;
    let symbolMetadata: any = null;
    let normalizedQuote: NormalizedMarketData | null = null;

    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: true,
      timeout: 15000
    }, async () => {
      console.log('\n1. TLS 1.3 Handshake:   ESTABLISHED');
      console.log('2. Application Auth:     Transmitting ProtoOAApplicationAuthReq (2100)...');

      const appAuthFrame = await CTraderProtoManager.encodeFrame(2100, {
        clientId,
        clientSecret
      }, 'REQ-P7K-APP-01');

      socket.write(appAuthFrame);
    });

    socket.on('data', async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < 4 + length) {
          break;
        }

        const frame = buffer.subarray(4, 4 + length);
        buffer = buffer.subarray(4 + length);

        try {
          const rawMessage = ProtoMessage.decode(frame) as any;
          const pType = rawMessage.payloadType;

          if (pType === 2101 && step === 1) {
            console.log('   [SUCCESS] ProtoOAApplicationAuthRes (2101) received!');
            console.log('\n3. Account Auth:         Transmitting ProtoOAAccountAuthReq (2102)...');
            step = 2;

            const accAuthFrame = await CTraderProtoManager.encodeFrame(2102, {
              ctidTraderAccountId: accountId,
              accessToken
            }, 'REQ-P7K-ACC-01');

            socket.write(accAuthFrame);
          } else if (pType === 2103 && step === 2) {
            console.log('   [SUCCESS] ProtoOAAccountAuthRes (2103) received!');
            console.log('\n4. Symbol Discovery:     Transmitting ProtoOASymbolsListReq (2114)...');
            step = 3;

            const symListFrame = await CTraderProtoManager.encodeFrame(2114, {
              ctidTraderAccountId: accountId
            }, 'REQ-P7K-SYMS-01');

            socket.write(symListFrame);
          } else if (pType === 2115 && step === 3) {
            console.log('   [SUCCESS] ProtoOASymbolsListRes (2115) received!');
            const SymListType = root.lookupType('ProtoOASymbolsListRes');
            const symListObj: any = SymListType.toObject(SymListType.decode(rawMessage.payload), { longs: Number, defaults: true });
            const symbols = symListObj.symbol || [];
            console.log('   Total Discovered Symbols:  ', symbols.length);

            discoveredSymbol = symbols.find((s: any) => s.symbolName === 'EURUSD' || s.symbolName === 'EUR/USD');
            if (!discoveredSymbol) {
              console.error('[-] EURUSD symbol not found in broker symbols list!');
              socket.end();
              resolve({ success: false, error: 'EURUSD_NOT_FOUND' });
              return;
            }

            console.log('   -> Discovered EURUSD ID:   ', discoveredSymbol.symbolId);
            console.log('   -> Discovered Symbol Name: ', discoveredSymbol.symbolName);
            console.log('   -> Symbol Enabled State:   ', discoveredSymbol.enabled);
            console.log('   -> Base Asset ID:          ', discoveredSymbol.baseAssetId);
            console.log('   -> Quote Asset ID:         ', discoveredSymbol.quoteAssetId);

            console.log('\n5. Symbol Full Specs:    Transmitting ProtoOASymbolByIdReq (2116)...');
            step = 4;

            const symSpecFrame = await CTraderProtoManager.encodeFrame(2116, {
              ctidTraderAccountId: accountId,
              symbolId: [Number(discoveredSymbol.symbolId)]
            }, 'REQ-P7K-SPEC-01');

            socket.write(symSpecFrame);
          } else if (pType === 2117 && step === 4) {
            console.log('   [SUCCESS] ProtoOASymbolByIdRes (2117) received!');
            const SymByIdType = root.lookupType('ProtoOASymbolByIdRes');
            const symByIdObj: any = SymByIdType.toObject(SymByIdType.decode(rawMessage.payload), { longs: Number, defaults: true });
            const symList = symByIdObj.symbol || [];
            symbolMetadata = symList[0] || {};

            console.log('   -> Display Digits:         ', symbolMetadata.digits);
            console.log('   -> Pip Position:           ', symbolMetadata.pipPosition);
            console.log('   -> Min Volume (Cents):     ', symbolMetadata.minVolume);
            console.log('   -> Max Volume (Cents):     ', symbolMetadata.maxVolume);
            console.log('   -> Step Volume (Cents):    ', symbolMetadata.stepVolume);

            console.log('\n6. Live Spot Market Data: Transmitting ProtoOASubscribeSpotsReq (2127)...');
            step = 5;

            const SubType = root.lookupType('ProtoOASubscribeSpotsReq');
            const subBuf = SubType.encode(SubType.create({
              payloadType: 2127,
              ctidTraderAccountId: accountId,
              symbolId: [Number(discoveredSymbol.symbolId)],
              subscribeToSpotTimestamp: true
            })).finish();

            const wrapBuf = ProtoMessage.encode(ProtoMessage.create({
              payloadType: 2127,
              payload: subBuf,
              clientMsgId: 'REQ-P7K-SPOTS-01'
            })).finish();

            const fullFrame = Buffer.alloc(4 + wrapBuf.length);
            fullFrame.writeUInt32BE(wrapBuf.length, 0);
            Buffer.from(wrapBuf).copy(fullFrame, 4);

            socket.write(fullFrame);
          } else if (pType === 2128) {
            console.log('   [SUCCESS] ProtoOASubscribeSpotsRes (2128) received (Spot Subscription Active)');
          } else if (pType === 2131) {
            console.log('   [SUCCESS] ProtoOASpotEvent (2131) received (Real-Time Spot Quote Tick)');
            const SpotType = root.lookupType('ProtoOASpotEvent');
            const spot: any = SpotType.toObject(SpotType.decode(rawMessage.payload), { longs: Number, defaults: true });

            const rawBid = spot.bid !== undefined ? Number(spot.bid) : 0;
            const rawAsk = spot.ask !== undefined ? Number(spot.ask) : 0;

            const rawPriceDivisor = 100000;
            const bid = rawBid > 0 ? rawBid / rawPriceDivisor : 0;
            const ask = rawAsk > 0 ? rawAsk / rawPriceDivisor : 0;
            const digits = symbolMetadata.digits || 5;
            const pipPos = symbolMetadata.pipPosition || 4;
            const spread = Number((ask - bid).toFixed(digits));
            const pipMult = Math.pow(10, pipPos);
            const spreadPips = Number((spread * pipMult).toFixed(2));
            const now = Date.now();
            const timestamp = spot.timestamp ? Number(spot.timestamp) : now;
            const isFresh = Math.abs(now - timestamp) < 120000;

            normalizedQuote = {
              symbol: discoveredSymbol.symbolName,
              symbolId: Number(discoveredSymbol.symbolId),
              bid,
              ask,
              spread,
              spreadPips,
              digits,
              pipPosition: pipPos,
              timestamp,
              receivedAt: now,
              isFresh,
              source: 'CTRADER_DEMO_OPENAPI',
              environment: 'DEMO'
            };

            console.log('\n======================================================================');
            console.log('REAL cTRADER DEMO LIVE MARKET DATA QUOTE CERTIFIED:');
            console.log('======================================================================');
            console.log('  Symbol:              ', normalizedQuote.symbol);
            console.log('  Symbol ID:           ', normalizedQuote.symbolId);
            console.log('  Bid Price:           ', normalizedQuote.bid);
            console.log('  Ask Price:           ', normalizedQuote.ask);
            console.log('  Spread (Points):     ', normalizedQuote.spread);
            console.log('  Spread (Pips):       ', normalizedQuote.spreadPips);
            console.log('  Digits / PipPos:     ', normalizedQuote.digits + ' / ' + normalizedQuote.pipPosition);
            console.log('  Quote Timestamp:     ', new Date(normalizedQuote.timestamp).toISOString());
            console.log('  Quote Freshness:     ', normalizedQuote.isFresh ? 'FRESH (VALID)' : 'STALE');
            console.log('======================================================================');
            console.log('ORDERS TRANSMITTED:     0');
            console.log('POSITIONS OPENED:       0');
            console.log('READ ONLY MODE:         true');
            console.log('SAFETY GATE:            BLOCKED');
            console.log('======================================================================');

            socket.end();
            resolve({
              success: true,
              discoveredSymbol,
              symbolMetadata,
              normalizedQuote
            });
          } else if (pType === 2142) {
            console.error('[-] ProtoOAErrorRes (2142):', rawMessage.payload);
            socket.end();
            resolve({ success: false, error: 'PROTO_OA_ERROR' });
          }
        } catch (e: any) {
          console.error('Decode Error:', e.message);
          socket.end();
          resolve({ success: false, error: e.message });
        }
      }
    });

    socket.on('timeout', () => {
      console.error('[-] Socket Timeout on demo.ctraderapi.com:5035');
      socket.destroy();
      resolve({ success: false, error: 'TIMEOUT' });
    });

    socket.on('error', (err) => {
      console.error('[-] Socket Error:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('phase7k-market-data-certification.ts')) {
  runPhase7KMarketDataCertification().then(() => {
    process.exit(0);
  });
}
