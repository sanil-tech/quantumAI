import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { CTraderTransport } from '../src/integrations/ctrader/ctraderTransport';

export interface Phase7GDiagnosticResult {
  timestamp: string;
  targetHost: string;
  targetPort: number;
  credentialsMetadata: {
    clientId: { configured: boolean; length: number; sha256_prefix: string };
    clientSecret: { configured: boolean; length: number; sha256_prefix: string };
    accessToken: { configured: boolean; length: number; sha256_prefix: string };
    accountId: { configured: boolean; numeric: boolean; length: number };
  };
  tlsConnection: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
  applicationAuth: 'SUCCESS' | 'CH_CLIENT_AUTH_FAILURE' | 'PROTOCOL_FAILURE' | 'SKIPPED';
  accountDiscovery: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  accountAuthorization: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  discoveredAccountsCount: number;
  configuredAccountMatched: boolean;
  classification: 'A. APPLICATION AUTH BLOCKED' | 'B. ACCOUNT DISCOVERY BLOCKED' | 'C. ACCOUNT AUTHORIZATION BLOCKED' | 'D. DEMO ACCOUNT READ-ONLY AUTHENTICATED';
  ordersTransmitted: number;
  safetyGateBlocked: boolean;
  readOnlyModeEnforced: boolean;
}

function getRedactedMetadata(val?: string) {
  if (!val) return { configured: false, length: 0, sha256_prefix: 'NONE' };
  const trimmed = val.trim();
  const hash = crypto.createHash('sha256').update(trimmed).digest('hex');
  return {
    configured: true,
    length: trimmed.length,
    sha256_prefix: hash.substring(0, 8) + '...'
  };
}

export async function runPhase7GDiagnostic(): Promise<Phase7GDiagnosticResult> {
  const host = 'demo.ctraderapi.com';
  const port = 5035;

  const rawClientId = process.env.CTRADER_CLIENT_ID || '';
  const rawClientSecret = process.env.CTRADER_CLIENT_SECRET || '';
  const rawAccessToken = process.env.CTRADER_ACCESS_TOKEN || '';
  const rawAccountId = process.env.CTRADER_ACCOUNT_ID || '';

  const result: Phase7GDiagnosticResult = {
    timestamp: new Date().toISOString(),
    targetHost: host,
    targetPort: port,
    credentialsMetadata: {
      clientId: getRedactedMetadata(rawClientId),
      clientSecret: getRedactedMetadata(rawClientSecret),
      accessToken: getRedactedMetadata(rawAccessToken),
      accountId: {
        configured: !!rawAccountId.trim(),
        numeric: /^\d+$/.test(rawAccountId.trim()),
        length: rawAccountId.trim().length
      }
    },
    tlsConnection: 'FAILURE',
    applicationAuth: 'SKIPPED',
    accountDiscovery: 'SKIPPED',
    accountAuthorization: 'SKIPPED',
    discoveredAccountsCount: 0,
    configuredAccountMatched: false,
    classification: 'A. APPLICATION AUTH BLOCKED',
    ordersTransmitted: 0,
    safetyGateBlocked: true,
    readOnlyModeEnforced: true
  };

  console.log('======================================================================');
  console.log('QUANTUMAI / IATI OS ? PHASE 7G APPLICATION AUTH DIAGNOSTIC');
  console.log('======================================================================');
  console.log('Target Host:', host);
  console.log('Target Port:', port);
  console.log('Credentials Summary:');
  console.log('  CLIENT_ID:    ', JSON.stringify(result.credentialsMetadata.clientId));
  console.log('  CLIENT_SECRET:', JSON.stringify(result.credentialsMetadata.clientSecret));
  console.log('  ACCESS_TOKEN: ', JSON.stringify(result.credentialsMetadata.accessToken));
  console.log('  ACCOUNT_ID:   ', JSON.stringify(result.credentialsMetadata.accountId));

  const transport = new CTraderTransport();

  try {
    console.log('\n1. Establishing TLS 1.3 socket to demo.ctraderapi.com:5035...');
    await transport.connect(host, port, 7000);
    result.tlsConnection = 'SUCCESS';
    console.log('   TLS Connection: ESTABLISHED');

    console.log('2. Transmitting ProtoOAApplicationAuthReq (payloadType: 2100)...');
    try {
      const appAuthRes = await transport.sendRequest(2100, {
        clientId: rawClientId.trim(),
        clientSecret: rawClientSecret.trim()
      }, 7000);

      if (appAuthRes.payloadType === 2101) {
        result.applicationAuth = 'SUCCESS';
        console.log('   Application Auth: SUCCESS (ProtoOAApplicationAuthRes 2101)');
      } else {
        result.applicationAuth = 'PROTOCOL_FAILURE';
        console.log('   Application Auth: UNEXPECTED PAYLOAD TYPE', appAuthRes.payloadType);
      }
    } catch (authErr: any) {
      if (authErr.message?.includes('CH_CLIENT_AUTH_FAILURE')) {
        result.applicationAuth = 'CH_CLIENT_AUTH_FAILURE';
        console.log('   Application Auth: REJECTED (CH_CLIENT_AUTH_FAILURE)');
      } else {
        result.applicationAuth = 'PROTOCOL_FAILURE';
        console.log('   Application Auth: ERROR -', authErr.message);
      }
    }

    if (result.applicationAuth !== 'SUCCESS') {
      console.log('\n[-] Application Authentication failed. STOPPING per Phase 7G stop condition.');
      result.classification = 'A. APPLICATION AUTH BLOCKED';
      await transport.disconnect();
      return result;
    }

    // Step 5: Account Discovery
    console.log('3. Transmitting ProtoOAGetAccountListByAccessTokenReq (payloadType: 2149)...');
    try {
      const accListRes = await transport.sendRequest(2149, {
        accessToken: rawAccessToken.trim()
      }, 7000);

      const accounts = accListRes.decodedPayload?.ctidTraderAccount || [];
      result.discoveredAccountsCount = accounts.length;
      result.accountDiscovery = 'SUCCESS';
      console.log('   Account Discovery: SUCCESS (Found ' + accounts.length + ' accounts)');

      const demoAccount = accounts.find((a: any) => !a.isLive && String(a.ctidTraderAccountId) === rawAccountId.trim());
      if (demoAccount) {
        result.configuredAccountMatched = true;
        console.log('   Configured DEMO Account: MATCHED');
      }

      // Step 6: Account Authorization
      const targetAccountId = demoAccount ? demoAccount.ctidTraderAccountId : (accounts[0] ? accounts[0].ctidTraderAccountId : Number(rawAccountId));
      console.log('4. Transmitting ProtoOAAccountAuthReq (payloadType: 2102)...');
      const accAuthRes = await transport.sendRequest(2102, {
        ctidTraderAccountId: Number(targetAccountId),
        accessToken: rawAccessToken.trim()
      }, 7000);

      if (accAuthRes.payloadType === 2103) {
        result.accountAuthorization = 'SUCCESS';
        result.classification = 'D. DEMO ACCOUNT READ-ONLY AUTHENTICATED';
        console.log('   Account Auth: SUCCESS (ProtoOAAccountAuthRes 2103)');
      } else {
        result.accountAuthorization = 'FAILED';
        result.classification = 'C. ACCOUNT AUTHORIZATION BLOCKED';
      }
    } catch (accErr: any) {
      console.log('   Account Operation Error:', accErr.message);
      result.classification = 'B. ACCOUNT DISCOVERY BLOCKED';
    }

    await transport.disconnect();
  } catch (netErr: any) {
    console.error('[-] Network / TLS Failure:', netErr.message);
    result.tlsConnection = 'FAILURE';
    result.classification = 'A. APPLICATION AUTH BLOCKED';
    try { await transport.disconnect(); } catch (e) {}
  }

  return result;
}

if (process.argv[1] && process.argv[1].endsWith('phase7g-application-auth-diagnostic.ts')) {
  runPhase7GDiagnostic().then((res) => {
    console.log('\n======================================================================');
    console.log('PHASE 7G FINAL DIAGNOSTIC RESULT:');
    console.log('======================================================================');
    console.log('CLASSIFICATION:         ', res.classification);
    console.log('TLS CONNECTION:         ', res.tlsConnection);
    console.log('APPLICATION AUTH:       ', res.applicationAuth);
    console.log('ACCOUNT DISCOVERY:      ', res.accountDiscovery);
    console.log('ACCOUNT AUTH:           ', res.accountAuthorization);
    console.log('ORDERS TRANSMITTED:     ', res.ordersTransmitted);
    console.log('READ ONLY MODE:         ', res.readOnlyModeEnforced);
    console.log('SAFETY GATE BLOCKED:    ', res.safetyGateBlocked);
    console.log('======================================================================');
  });
}
