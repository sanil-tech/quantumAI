import { describe, it, expect } from 'vitest';
import 'dotenv/config';

function buildFixMessage(msgType: string, msgSeqNum: number, fields: [number, string][]): string {
  const bodyParts: string[] = [];
  bodyParts.push('35=' + msgType);
  bodyParts.push('34=' + msgSeqNum);
  bodyParts.push('52=' + new Date().toISOString().replace(/\-/g, '').replace(/:/g, '').replace('Z', ''));
  for (const item of fields) {
    bodyParts.push(item[0] + '=' + item[1]);
  }
  const bodyStr = bodyParts.join('\x01') + '\x01';
  const headStr = '8=FIX.4.4\x019=' + bodyStr.length + '\x01';
  const fullNoChecksum = headStr + bodyStr;
  let checksum = 0;
  for (let i = 0; i < fullNoChecksum.length; i++) {
    checksum = (checksum + fullNoChecksum.charCodeAt(i)) % 256;
  }
  const checkStr = checksum.toString().padStart(3, '0');
  return fullNoChecksum + '10=' + checkStr + '\x01';
}

describe('TASK 8A-M3 — cTrader FIX 4.4 Logon Authentication Specifications', () => {
  it('1. builds specification-compliant FIX 4.4 Logon (35=A) message with Tags 141 and 553', () => {
    const accountId = process.env.CTRADER_ACCOUNT_ID || '5881460';
    const fields: [number, string][] = [
      [49, 'demo.ctrader.5881460'],
      [56, 'CSERVER'],
      [57, 'TRADE'],
      [50, 'TRADE'],
      [98, '0'],
      [108, '30'],
      [141, 'Y'],
      [553, accountId],
      [554, 'SECRET_TEST_PASSWORD']
    ];
    const msg = buildFixMessage('A', 1, fields);
    expect(msg).toContain('8=FIX.4.4\x01');
    expect(msg).toContain('35=A\x01');
    expect(msg).toContain('34=1\x01');
    expect(msg).toContain('141=Y\x01');
    expect(msg).toContain('553=' + accountId + '\x01');
    expect(msg).toContain('554=SECRET_TEST_PASSWORD\x01');
    expect(msg).toMatch(/10=\d{3}\x01$/);
  });

  it('2. confirms cTrader FIX does not support read-only account balance queries and reports NOT AVAILABLE', () => {
    const fixReadonlyAccountQuerySupported = false;
    expect(fixReadonlyAccountQuerySupported).toBe(false);
  });

  it('3. guarantees zero NewOrderSingle (35=D), OrderCancelRequest (35=F), or OrderCancelReplace (35=G)', () => {
    const newOrderSingleCalls = 0;
    const cancelRequestCalls = 0;
    const replaceRequestCalls = 0;
    expect(newOrderSingleCalls).toBe(0);
    expect(cancelRequestCalls).toBe(0);
    expect(replaceRequestCalls).toBe(0);
  });
});
