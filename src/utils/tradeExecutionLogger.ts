/**
 * Trade Execution Path Logging Decorator
 * 
 * Decorates trade execution and broker connection handshake functions
 * with comprehensive execution path tracing, API rejection code capturing,
 * timeout event tracking, and performance latency telemetry.
 */

export interface TradeExecutionDetails {
  pair?: string;
  symbol?: string;
  direction?: 'BUY' | 'SELL';
  entryPrice?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  lotSize?: number;
  setupId?: string;
  accountNumber?: string;
  endpoint?: string;
  [key: string]: any;
}

export interface TradeExecutionLogOptions {
  actionName?: string;
  timeoutMs?: number;
  endpoint?: string;
  onRejection?: (code: string, message: string, details?: any) => void;
  onSuccess?: (result: any, latencyMs: number) => void;
}

export interface TradeExecutionResult<T = any> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  latencyMs: number;
  timestamp: string;
}

/**
 * Higher-Order Function / Decorator to wrap any trade execution function with detailed path logging,
 * timeout detection, and API rejection code extraction.
 */
export function withTradeExecutionLogging<Args extends any[], R>(
  executionFn: (...args: Args) => Promise<R>,
  options: TradeExecutionLogOptions = {}
): (...args: Args) => Promise<R> {
  const actionName = options.actionName || 'TRADE_EXECUTION_HANDSHAKE';
  const timeoutMs = options.timeoutMs || 8000;
  const endpoint = options.endpoint || '/api/autotrader/trade/execute';

  return async (...args: Args): Promise<R> => {
    const handshakeId = `hs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const startTime = performance.now();
    const timestampStr = new Date().toISOString();

    // Try to extract payload params from arguments if available
    const payload = (args[0] && typeof args[0] === 'object') ? args[0] : {};

    // 1. Console Group Initiation Log
    console.group(`🚀 [EXECUTION_PATH] ${actionName} [ID: ${handshakeId}]`);
    console.log(`%c[INITIATED] ${timestampStr}`, 'color: #3b82f6; font-weight: bold;');
    console.log(`📍 Endpoint: %c${endpoint}`, 'color: #10b981; font-weight: bold;');
    console.log(`⏱️ Configured Timeout: ${timeoutMs}ms`);
    console.log('📦 Trade Payload:', payload);

    // Setup Timeout Abort Controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      // Execute original function with argument injected or standard call
      const result = await Promise.race([
        executionFn(...args),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            const err: any = new Error(`Trade execution handshake timed out after ${timeoutMs}ms`);
            err.code = 'ERR_HANDSHAKE_TIMEOUT';
            err.isTimeout = true;
            reject(err);
          });
        })
      ]);

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      // 2. Success Trace Log
      console.log(`%c[HANDSHAKE_CONFIRMED] Latency: ${latencyMs}ms`, 'color: #10b981; font-weight: bold;');
      console.log('✅ Response Data:', result);
      console.groupEnd();

      if (options.onSuccess) {
        options.onSuccess(result, latencyMs);
      }

      // Dispatch browser custom event for developer debugging overlay/inspectors
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('QUANTUM_EXECUTION_TRACE', {
          detail: {
            handshakeId,
            status: 'SUCCESS',
            actionName,
            endpoint,
            latencyMs,
            payload,
            result,
            timestamp: timestampStr
          }
        }));
      }

      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      let errorCode = error?.code || 'ERR_EXECUTION_REJECTED';
      let httpStatus = error?.status || error?.httpStatus || (error?.isTimeout ? 408 : 500);
      let errorMessage = error?.message || 'Trade execution failed or was rejected by broker API';

      if (error?.isTimeout || errorCode === 'ERR_HANDSHAKE_TIMEOUT') {
        errorCode = 'ERR_HANDSHAKE_TIMEOUT';
        errorMessage = `[TIMEOUT] Broker connection handshake timed out (${latencyMs}ms >= ${timeoutMs}ms).`;
      }

      // Extract specific API rejection codes if embedded in response payload
      if (error?.responsePayload) {
        if (error.responsePayload.errorCode) errorCode = error.responsePayload.errorCode;
        if (error.responsePayload.error) errorMessage = error.responsePayload.error;
      }

      // 3. Rejection & Error Trace Log
      console.error(`%c[HANDSHAKE_REJECTED] Code: ${errorCode} | Status: ${httpStatus} | Latency: ${latencyMs}ms`, 'color: #ef4444; font-weight: bold;');
      console.error(`❌ Rejection Reason: ${errorMessage}`);
      console.error('⚠️ Full Error Stack:', error);
      console.groupEnd();

      if (options.onRejection) {
        options.onRejection(errorCode, errorMessage, { httpStatus, latencyMs, payload, error });
      }

      // Dispatch browser custom event for error inspection
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('QUANTUM_EXECUTION_TRACE', {
          detail: {
            handshakeId,
            status: 'REJECTED',
            actionName,
            endpoint,
            errorCode,
            httpStatus,
            errorMessage,
            latencyMs,
            payload,
            timestamp: timestampStr
          }
        }));
      }

      throw error;
    }
  };
}

/**
 * Decorated fetch helper for executing trade requests with full path logging,
 * automatic HTTP error code handling, and timeout enforcement.
 */
export async function fetchWithTradeExecutionLogging(
  url: string,
  init: RequestInit = {},
  options: TradeExecutionLogOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs || 8000;
  const endpoint = options.endpoint || url;
  const actionName = options.actionName || `API_${init.method || 'GET'}`;

  const decoratedFetch = withTradeExecutionLogging(
    async (requestUrl: string, requestInit: RequestInit) => {
      const response = await fetch(requestUrl, requestInit);

      if (!response.ok) {
        let responseBody: any = {};
        try {
          responseBody = await response.clone().json();
        } catch (_) {}

        const error: any = new Error(
          responseBody.error || responseBody.message || `API rejected request with HTTP ${response.status} ${response.statusText}`
        );
        error.status = response.status;
        error.code = responseBody.errorCode || `HTTP_REJECTION_${response.status}`;
        error.responsePayload = responseBody;

        // Specific API Rejection Code Mapping
        if (response.status === 400) error.code = responseBody.errorCode || 'ERR_INVALID_TRADE_PARAMS';
        else if (response.status === 401) error.code = 'ERR_UNAUTHORIZED_BROKER';
        else if (response.status === 403) error.code = 'ERR_BROKER_ACCESS_DENIED';
        else if (response.status === 408) error.code = 'ERR_BROKER_TIMEOUT';
        else if (response.status === 429) error.code = 'ERR_RATE_LIMIT_EXCEEDED';
        else if (response.status === 502) error.code = 'ERR_BAD_BROKER_GATEWAY';
        else if (response.status === 503) error.code = 'ERR_BROKER_SERVICE_UNAVAILABLE';

        throw error;
      }

      return response;
    },
    {
      actionName,
      timeoutMs,
      endpoint,
      ...options
    }
  );

  return decoratedFetch(url, init);
}
