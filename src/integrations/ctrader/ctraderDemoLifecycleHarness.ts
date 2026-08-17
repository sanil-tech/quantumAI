import fs from 'fs';
import path from 'path';
import { CTraderTransport, ExtractedExecutionEvent, ExtractedOrderErrorEvent } from './ctraderTransport';
import { CTraderVolumeNormalizer, CTraderSymbolRegistry, CTraderSymbolSpec, VolumeNormalizationResult } from './ctraderSymbolService';

export interface P19HarnessConfig {
  environment: string;
  confirmDemoExecution: boolean;
  clientId: string;
  clientSecret: string;
  accountId: string;
  accessToken: string;
  host: string;
  port: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  lots: number;
  timeoutMs?: number;
}

export type P19LifecycleStatus =
  | 'NOT_STARTED'
  | 'PREFLIGHT_PASSED'
  | 'AUTHENTICATED'
  | 'METADATA_RETRIEVED'
  | 'VOLUME_NORMALIZED'
  | 'ORDER_TRANSMITTED'
  | 'ORDER_REJECTED'
  | 'DEMO_ORDER_CONFIRMED'
  | 'DEMO_ORDER_UNVERIFIED'
  | 'CLOSE_TRANSMITTED'
  | 'DEMO_LIFECYCLE_CONFIRMED'
  | 'DEMO_CLOSE_UNVERIFIED'
  | 'FAILED_CLOSED';

export interface P19EvidenceArtifact {
  testId: string;
  timestamp: string;
  environment: string;
  accountIdRedacted: string;
  brokerHost: string;
  brokerPort: number;
  endpointValidation: {
    host: string;
    port: number;
    approvedHost: string;
    approvedPort: number;
    valid: boolean;
  };
  symbol: string;
  symbolId?: number;
  symbolMetadata?: CTraderSymbolSpec;
  requestedQuantity: number;
  inputType: string;
  normalizedVolumeCents?: number;
  normalizationResult?: VolumeNormalizationResult;
  preFlightChecks: {
    environmentIsDemo: boolean;
    explicitConfirmationPresent: boolean;
    credentialsPresent: boolean;
    accountPresent: boolean;
    symbolSpecified: boolean;
    volumeSpecified: boolean;
    endpointValidated: boolean;
    passed: boolean;
  };
  clientMsgId?: string;
  clientOrderId?: string;
  requestPayloadSummary?: any;
  orderExecutionEvent?: ExtractedExecutionEvent;
  orderErrorEvent?: ExtractedOrderErrorEvent;
  brokerOrderId?: number;
  brokerDealId?: number;
  brokerPositionId?: number;
  reconciliationResult?: {
    reconciled: boolean;
    positionFound: boolean;
    matchedSymbolId: boolean;
    matchedVolume: boolean;
    openPositionsCount: number;
  };
  closeExecutionEvent?: ExtractedExecutionEvent;
  closeReconciliationResult?: {
    reconciled: boolean;
    positionClosed: boolean;
    openPositionsCount: number;
  };
  finalLifecycleStatus: P19LifecycleStatus;
  errorMessage?: string;
}

export class CTraderDemoLifecycleHarness {
  public static readonly APPROVED_DEMO_HOST = 'demo.ctraderapi.com';
  public static readonly APPROVED_DEMO_PORT = 5035;

  /**
   * Pre-Flight Safety Verification.
   * Truly Fail-Closed: Rejects any missing, whitespace, non-numeric, or non-approved configuration.
   */
  public static verifyPreFlightSafety(config: P19HarnessConfig): { passed: boolean; details: any } {
    if (!config || typeof config !== 'object') {
      throw new Error('SAFETY_VIOLATION: Configuration object is null or undefined.');
    }

    // Strict Fail-Closed Environment Checks:
    if (config.environment === 'LIVE') {
      throw new Error('SAFETY_VIOLATION_FATAL: LIVE environment is strictly prohibited from P19 test harness.');
    }
    if (config.environment !== 'DEMO') {
      throw new Error(`SAFETY_VIOLATION: Execution environment must be exactly "DEMO" (received: "${config.environment}").`);
    }
    if (config.confirmDemoExecution !== true) {
      throw new Error('SAFETY_VIOLATION: Explicit DEMO confirmation flag (confirmDemoExecution = true) is required.');
    }

    // Host Integrity
    if (config.host === undefined || config.host === null || typeof config.host !== 'string' || config.host.trim().length === 0) {
      throw new Error('SAFETY_VIOLATION: Missing, empty, or whitespace-only host configuration.');
    }
    const rawHost = config.host.trim();
    if (rawHost !== this.APPROVED_DEMO_HOST) {
      throw new Error(`SAFETY_VIOLATION: DEMO host must be exactly "${this.APPROVED_DEMO_HOST}" (received: "${config.host}").`);
    }

    // Port Integrity
    if (config.port === undefined || config.port === null || typeof config.port === 'boolean' || typeof config.port === 'object') {
      throw new Error('SAFETY_VIOLATION: Missing or invalid port configuration.');
    }
    const parsedPort = typeof config.port === 'string' ? Number(config.port) : config.port;
    if (!Number.isFinite(parsedPort) || Number.isNaN(parsedPort) || !Number.isInteger(parsedPort) || parsedPort <= 0) {
      throw new Error(`SAFETY_VIOLATION: Port must be a positive integer (received: ${config.port}).`);
    }
    if (parsedPort !== this.APPROVED_DEMO_PORT) {
      throw new Error(`SAFETY_VIOLATION: DEMO port must be exactly ${this.APPROVED_DEMO_PORT} (received: ${config.port}).`);
    }

    // Credentials Integrity
    const hasClientId = typeof config.clientId === 'string' && config.clientId.trim().length > 0;
    const hasClientSecret = typeof config.clientSecret === 'string' && config.clientSecret.trim().length > 0;
    const hasAccessToken = typeof config.accessToken === 'string' && config.accessToken.trim().length > 0;
    if (!hasClientId || !hasClientSecret || !hasAccessToken) {
      throw new Error('SAFETY_VIOLATION: Missing required cTrader DEMO API credentials.');
    }

    // Account ID Integrity
    if (!config.accountId || typeof config.accountId !== 'string' || config.accountId.trim().length === 0) {
      throw new Error('SAFETY_VIOLATION: Missing or invalid cTrader DEMO account ID.');
    }
    const parsedAcc = Number(config.accountId.trim());
    if (!Number.isFinite(parsedAcc) || Number.isNaN(parsedAcc) || !Number.isInteger(parsedAcc) || parsedAcc <= 0) {
      throw new Error(`SAFETY_VIOLATION: Account ID must be a positive integer (received: "${config.accountId}").`);
    }

    // Symbol Integrity
    if (!config.symbol || typeof config.symbol !== 'string' || config.symbol.trim().length === 0) {
      throw new Error('SAFETY_VIOLATION: Target symbol must be explicitly specified.');
    }

    // Volume Integrity
    if (config.lots === undefined || config.lots === null || !Number.isFinite(config.lots) || Number.isNaN(config.lots) || config.lots <= 0) {
      throw new Error(`SAFETY_VIOLATION: Target lot volume must be a positive finite number (received: ${config.lots}).`);
    }

    const details = {
      environmentIsDemo: true,
      explicitConfirmationPresent: true,
      credentialsPresent: true,
      accountPresent: true,
      symbolSpecified: true,
      volumeSpecified: true,
      endpointValidated: true,
      passed: true
    };

    return { passed: true, details };
  }

  /**
   * Build the ProtoOANewOrderReq payload object strictly using normalized parameters.
   */
  public static buildNewOrderPayload(
    accountId: number,
    symbolId: number,
    side: 'BUY' | 'SELL',
    normalizedVolumeCents: number,
    clientOrderId: string
  ): any {
    if (!Number.isInteger(normalizedVolumeCents) || normalizedVolumeCents <= 0) {
      throw new Error(`INVALID_ORDER_VOLUME: Normalized volume in cents must be a positive integer (got ${normalizedVolumeCents}).`);
    }

    return {
      ctidTraderAccountId: accountId,
      symbolId,
      orderType: 1, // MARKET
      tradeSide: side === 'BUY' ? 1 : 2, // 1=BUY, 2=SELL
      volume: normalizedVolumeCents,
      comment: 'P19_CONTROLLED_DEMO_TEST',
      label: 'P19_DEMO',
      clientOrderId
    };
  }

  /**
   * Verifies broker-side position existence and parameter matching during reconciliation.
   */
  public static verifyReconciliation(
    positions: any[],
    targetPositionId: number,
    targetSymbolId: number,
    targetVolumeCents: number
  ): { reconciled: boolean; positionFound: boolean; matchedSymbolId: boolean; matchedVolume: boolean; openPositionsCount: number } {
    if (!Array.isArray(positions)) {
      return { reconciled: false, positionFound: false, matchedSymbolId: false, matchedVolume: false, openPositionsCount: 0 };
    }

    const pos = positions.find((p: any) => Number(p.positionId) === targetPositionId);
    if (!pos) {
      return { reconciled: true, positionFound: false, matchedSymbolId: false, matchedVolume: false, openPositionsCount: positions.length };
    }

    const symbolMatches = Number(pos.tradeData?.symbolId || pos.symbolId) === targetSymbolId;
    const volumeMatches = Number(pos.tradeData?.volume || pos.volume) === targetVolumeCents;

    return {
      reconciled: true,
      positionFound: true,
      matchedSymbolId: symbolMatches,
      matchedVolume: volumeMatches,
      openPositionsCount: positions.length
    };
  }

  /**
   * Verifies that the targeted position is no longer present in open positions.
   */
  public static verifyClosure(positions: any[], targetPositionId: number): { reconciled: boolean; positionClosed: boolean; openPositionsCount: number } {
    if (!Array.isArray(positions)) {
      return { reconciled: false, positionClosed: false, openPositionsCount: 0 };
    }
    const pos = positions.find((p: any) => Number(p.positionId) === targetPositionId);
    return {
      reconciled: true,
      positionClosed: !pos,
      openPositionsCount: positions.length
    };
  }

  /**
   * Redacts sensitive secrets for secure machine-readable audit logging.
   */
  public static redactAccountId(accountId: string): string {
    if (!accountId || accountId.length < 4) return '***';
    return `${accountId.slice(0, 2)}***${accountId.slice(-2)}`;
  }

  /**
   * Executes the strictly controlled end-to-end DEMO lifecycle test.
   */
  public static async runSingleOrderDemoLifecycle(
    config: P19HarnessConfig,
    injectedTransport?: CTraderTransport
  ): Promise<P19EvidenceArtifact> {
    const testId = `p19_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const rawHost = config?.host;
    const rawPort = config?.port;

    const evidence: P19EvidenceArtifact = {
      testId,
      timestamp,
      environment: config?.environment || 'UNKNOWN',
      accountIdRedacted: this.redactAccountId(config?.accountId),
      brokerHost: rawHost,
      brokerPort: typeof rawPort === 'number' ? rawPort : Number(rawPort),
      endpointValidation: {
        host: rawHost,
        port: typeof rawPort === 'number' ? rawPort : Number(rawPort),
        approvedHost: this.APPROVED_DEMO_HOST,
        approvedPort: this.APPROVED_DEMO_PORT,
        valid: rawHost === this.APPROVED_DEMO_HOST && Number(rawPort) === this.APPROVED_DEMO_PORT
      },
      symbol: config?.symbol,
      requestedQuantity: config?.lots,
      inputType: 'LOTS',
      preFlightChecks: {
        environmentIsDemo: false,
        explicitConfirmationPresent: false,
        credentialsPresent: false,
        accountPresent: false,
        symbolSpecified: false,
        volumeSpecified: false,
        endpointValidated: false,
        passed: false
      },
      finalLifecycleStatus: 'NOT_STARTED'
    };

    const transport = injectedTransport || new CTraderTransport();

    try {
      // 1. Pre-Flight Safety Verification (Throws if anything is invalid)
      const preFlight = this.verifyPreFlightSafety(config);
      evidence.preFlightChecks = preFlight.details;
      evidence.finalLifecycleStatus = 'PREFLIGHT_PASSED';

      // 2. Connect & Authenticate
      await transport.connect(config.host, Number(config.port), config.timeoutMs || 8000);

      // App Auth (2100)
      const appAuthRes = await transport.sendRequest(2100, {
        clientId: config.clientId.trim(),
        clientSecret: config.clientSecret.trim()
      });
      if (appAuthRes.payloadType !== 2101) {
        throw new Error(`APP_AUTH_FAILED: Expected 2101, got ${appAuthRes.payloadType}`);
      }

      // Account Auth (2102)
      const accountAuthRes = await transport.sendRequest(2102, {
        ctidTraderAccountId: Number(config.accountId.trim()),
        accessToken: config.accessToken.trim()
      });
      if (accountAuthRes.payloadType !== 2103) {
        throw new Error(`ACCOUNT_AUTH_FAILED: Expected 2103, got ${accountAuthRes.payloadType}`);
      }

      evidence.finalLifecycleStatus = 'AUTHENTICATED';

      // 3. Retrieve Authoritative Symbol Metadata
      const symbolsListRes = await transport.sendRequest(2114, {
        ctidTraderAccountId: Number(config.accountId.trim())
      });
      const lightSymbols: any[] = symbolsListRes.decodedPayload?.symbol || [];
      const normalizedTargetName = config.symbol.toUpperCase().replace('/', '').replace('_', '');
      const foundLightSymbol = lightSymbols.find((s: any) => {
        const name = (s.symbolName || '').toUpperCase().replace('/', '').replace('_', '');
        return name === normalizedTargetName;
      });

      if (!foundLightSymbol || !foundLightSymbol.symbolId) {
        throw new Error(`SYMBOL_NOT_FOUND: Symbol "${config.symbol}" is not available on DEMO broker account.`);
      }

      const symbolId = Number(foundLightSymbol.symbolId);
      evidence.symbolId = symbolId;

      // Fetch Full Symbol Spec (2116)
      const symbolByIdRes = await transport.sendRequest(2116, {
        ctidTraderAccountId: Number(config.accountId.trim()),
        symbolId: [symbolId]
      });
      const fullSymbols: any[] = symbolByIdRes.decodedPayload?.symbol || [];
      const fullSymbol = fullSymbols.find((s: any) => Number(s.symbolId) === symbolId);

      if (!fullSymbol) {
        throw new Error(`SYMBOL_METADATA_UNAVAILABLE: Full specification not returned for symbolId ${symbolId}.`);
      }

      const symbolSpec: CTraderSymbolSpec = {
        symbolId,
        symbolName: fullSymbol.symbolName || config.symbol,
        digits: Number(fullSymbol.digits || 5),
        pipPosition: Number(fullSymbol.pipPosition || 4),
        minVolume: Number(fullSymbol.minVolume),
        maxVolume: Number(fullSymbol.maxVolume),
        stepVolume: Number(fullSymbol.stepVolume),
        lotSize: Number(fullSymbol.lotSize || 10000000),
        enableShortSelling: fullSymbol.enableShortSelling,
        measurementUnits: fullSymbol.measurementUnits
      };

      CTraderSymbolRegistry.registerSymbol(symbolSpec);
      evidence.symbolMetadata = symbolSpec;
      evidence.finalLifecycleStatus = 'METADATA_RETRIEVED';

      // 4. Authoritative Volume Normalization
      const normResult = CTraderVolumeNormalizer.normalizeVolume(symbolSpec, config.lots, 'LOTS');
      evidence.normalizationResult = normResult;

      if (!normResult.isValid || !normResult.normalizedVolumeCents) {
        evidence.finalLifecycleStatus = 'FAILED_CLOSED';
        throw new Error(`VOLUME_NORMALIZATION_FAILED: ${normResult.rejectionReason} (Code: ${normResult.rejectionCode})`);
      }

      evidence.normalizedVolumeCents = normResult.normalizedVolumeCents;
      evidence.finalLifecycleStatus = 'VOLUME_NORMALIZED';

      // 5. Transmit Exactly ONE ProtoOANewOrderReq (2106)
      const clientMsgId = `p19_msg_${testId}`;
      const clientOrderId = `p19_ord_${testId}`;
      evidence.clientMsgId = clientMsgId;
      evidence.clientOrderId = clientOrderId;

      const orderPayload = this.buildNewOrderPayload(
        Number(config.accountId.trim()),
        symbolId,
        config.side,
        normResult.normalizedVolumeCents,
        clientOrderId
      );
      evidence.requestPayloadSummary = {
        payloadType: 2106,
        symbolId,
        tradeSide: config.side,
        volumeCents: normResult.normalizedVolumeCents,
        clientOrderId
      };

      evidence.finalLifecycleStatus = 'ORDER_TRANSMITTED';

      const orderRes = await transport.sendRequest(2106, orderPayload, config.timeoutMs || 10000, clientMsgId);
      const executionEvent: ExtractedExecutionEvent = (orderRes as any).executionEvent;

      if (!executionEvent) {
        evidence.finalLifecycleStatus = 'DEMO_ORDER_UNVERIFIED';
        throw new Error('DEMO_ORDER_UNVERIFIED: Broker did not return an execution event for order request.');
      }

      // Strict Fail-Closed Execution Type Check: MUST equal 3 (ORDER_FILLED)
      if (executionEvent.executionType !== 3) {
        evidence.finalLifecycleStatus = 'ORDER_REJECTED';
        evidence.errorMessage = executionEvent.errorCode || `UNEXPECTED_EXECUTION_TYPE_${executionEvent.executionType}`;
        throw new Error(`DEMO_ORDER_REJECTED: Broker execution event type was ${executionEvent.executionType} (expected 3: ORDER_FILLED). Error: ${executionEvent.errorCode || 'NONE'}`);
      }

      evidence.orderExecutionEvent = executionEvent;
      evidence.brokerOrderId = executionEvent.order?.orderId ? Number(executionEvent.order.orderId) : undefined;
      evidence.brokerDealId = executionEvent.deal?.dealId ? Number(executionEvent.deal.dealId) : undefined;
      evidence.brokerPositionId = executionEvent.position?.positionId ? Number(executionEvent.position.positionId) : undefined;

      if (!evidence.brokerPositionId) {
        evidence.finalLifecycleStatus = 'DEMO_ORDER_UNVERIFIED';
        throw new Error('DEMO_ORDER_UNVERIFIED: Broker execution event did not contain a valid positionId.');
      }

      // 6. Broker-Side State Reconciliation (Stage 1)
      const reconcile1 = await transport.sendRequest(2124, {
        ctidTraderAccountId: Number(config.accountId.trim())
      });
      const openPositions1: any[] = reconcile1.decodedPayload?.position || [];

      const reconCheck1 = this.verifyReconciliation(
        openPositions1,
        evidence.brokerPositionId,
        symbolId,
        normResult.normalizedVolumeCents
      );
      evidence.reconciliationResult = reconCheck1;

      if (!reconCheck1.positionFound || !reconCheck1.matchedSymbolId || !reconCheck1.matchedVolume) {
        evidence.finalLifecycleStatus = 'DEMO_ORDER_UNVERIFIED';
        throw new Error('DEMO_ORDER_UNVERIFIED: Broker-side reconciliation failed to confirm position state.');
      }

      evidence.finalLifecycleStatus = 'DEMO_ORDER_CONFIRMED';

      // 7. Close Position (2111)
      const closeMsgId = `p19_close_${testId}`;
      const closePayload = {
        ctidTraderAccountId: Number(config.accountId.trim()),
        positionId: evidence.brokerPositionId,
        volume: normResult.normalizedVolumeCents
      };

      evidence.finalLifecycleStatus = 'CLOSE_TRANSMITTED';
      const closeRes = await transport.sendRequest(2111, closePayload, config.timeoutMs || 10000, closeMsgId);
      const closeExecutionEvent: ExtractedExecutionEvent = (closeRes as any).executionEvent;

      if (!closeExecutionEvent) {
        evidence.finalLifecycleStatus = 'DEMO_CLOSE_UNVERIFIED';
        throw new Error('DEMO_CLOSE_UNVERIFIED: Broker did not return an execution event for close request.');
      }

      // Strict Fail-Closed Close Execution Type Check: MUST equal 3 (ORDER_FILLED)
      if (closeExecutionEvent.executionType !== 3) {
        evidence.finalLifecycleStatus = 'DEMO_CLOSE_UNVERIFIED';
        evidence.errorMessage = closeExecutionEvent.errorCode || `UNEXPECTED_CLOSE_EXECUTION_TYPE_${closeExecutionEvent.executionType}`;
        throw new Error(`DEMO_CLOSE_UNVERIFIED: Broker close execution event type was ${closeExecutionEvent.executionType} (expected 3: ORDER_FILLED). Error: ${closeExecutionEvent.errorCode || 'NONE'}`);
      }

      evidence.closeExecutionEvent = closeExecutionEvent;

      // 8. Final Broker-Side State Reconciliation (Stage 2)
      const reconcile2 = await transport.sendRequest(2124, {
        ctidTraderAccountId: Number(config.accountId.trim())
      });
      const openPositions2: any[] = reconcile2.decodedPayload?.position || [];

      const reconCheck2 = this.verifyClosure(openPositions2, evidence.brokerPositionId);
      evidence.closeReconciliationResult = reconCheck2;

      if (!reconCheck2.positionClosed) {
        evidence.finalLifecycleStatus = 'DEMO_CLOSE_UNVERIFIED';
        throw new Error('DEMO_CLOSE_UNVERIFIED: Position still reported as open following close execution.');
      }

      evidence.finalLifecycleStatus = 'DEMO_LIFECYCLE_CONFIRMED';
    } catch (err: any) {
      if (evidence.finalLifecycleStatus !== 'ORDER_REJECTED' && evidence.finalLifecycleStatus !== 'DEMO_ORDER_UNVERIFIED' && evidence.finalLifecycleStatus !== 'DEMO_CLOSE_UNVERIFIED') {
        evidence.finalLifecycleStatus = 'FAILED_CLOSED';
      }
      evidence.errorMessage = err.message;
    } finally {
      try {
        await transport.disconnect();
      } catch (e) {}

      // Write Evidence Artifact
      try {
        const artifactPath = path.resolve('artifacts/ctrader/P19-demo-lifecycle-evidence.json');
        fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
        fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2), 'utf-8');
      } catch (e) {
        console.error('[P19_EVIDENCE_WRITE_ERROR]', e);
      }
    }

    return evidence;
  }
}
