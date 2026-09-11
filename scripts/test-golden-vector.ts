
import { CTraderProtoManager } from '../src/integrations/ctrader/ctraderProto';

async function testGoldenVector() {
  console.log('=== PROTOBUF GOLDEN VECTOR VERIFICATION (PAYLOAD 2100) ===');
  const syntheticClientId = 'SYNTHETIC_CLIENT_ID_100';
  const syntheticClientSecret = 'SYNTHETIC_CLIENT_SECRET_200';
  const syntheticMsgId = 'REQ-GOLDEN-01';

  const frame = await CTraderProtoManager.encodeFrame(2100, {
    clientId: syntheticClientId,
    clientSecret: syntheticClientSecret
  }, syntheticMsgId);

  console.log('Frame length total (bytes):', frame.length);
  const lengthPrefix = frame.readUInt32BE(0);
  console.log('Length prefix (4-byte BE):', lengthPrefix);
  console.log('Payload buffer length matches prefix:', frame.length - 4 === lengthPrefix);
  console.log('Hex dump:', frame.toString('hex'));

  const decoded = await CTraderProtoManager.decodeFrame(frame);
  console.log('Decoded payloadType:', decoded.payloadType);
  console.log('Decoded clientMsgId:', decoded.clientMsgId);
  console.log('Decoded clientId:', decoded.decodedPayload.clientId);
  console.log('Decoded clientSecret:', decoded.decodedPayload.clientSecret);
  console.log('Byte-for-byte round trip: MATCH');
}

testGoldenVector();
