import { GoogleGenAI } from "@google/genai";

export type GeminiErrorCategory =
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface GeminiErrorAnalysis {
  category: GeminiErrorCategory;
  httpStatus: number | undefined;
  providerErrorCode: string | undefined;
  providerMessage: string;
  isRetryable: boolean;
}

/**
 * Classifies an error thrown by the Gemini API into precise error categories based on HTTP status and provider error payload.
 */
export function classifyGeminiError(err: any): GeminiErrorAnalysis {
  const message = typeof err?.message === 'string' ? err.message : String(err || '');
  let httpStatus: number | undefined = err?.status || err?.statusCode || err?.error?.code;

  if (!httpStatus) {
    const statusMatch = message.match(/"code":\s*(\d{3})/) || message.match(/\b(401|403|404|429|500|502|503|504)\b/);
    if (statusMatch) {
      httpStatus = parseInt(statusMatch[1], 10);
    }
  }

  let providerErrorCode: string | undefined = err?.code || err?.error?.status;
  if (!providerErrorCode) {
    const codeMatch = message.match(/"status":\s*"([^"]+)"/);
    if (codeMatch) providerErrorCode = codeMatch[1];
  }

  const msgLower = message.toLowerCase();

  // 1. Model Not Found / Deprecated (HTTP 404)
  if (
    httpStatus === 404 ||
    msgLower.includes("not_found") ||
    msgLower.includes("no longer available") ||
    msgLower.includes("is not found")
  ) {
    return {
      category: 'MODEL_NOT_FOUND',
      httpStatus: 404,
      providerErrorCode: providerErrorCode || 'NOT_FOUND',
      providerMessage: message,
      isRetryable: true, // Retryable across models (attempt fallback model)
    };
  }

  // 2. Rate Limit / Quota (HTTP 429)
  if (
    httpStatus === 429 ||
    msgLower.includes("resource_exhausted") ||
    msgLower.includes("quota") ||
    msgLower.includes("rate limit") ||
    msgLower.includes("too many requests")
  ) {
    return {
      category: 'RATE_LIMITED',
      httpStatus: 429,
      providerErrorCode: providerErrorCode || 'RESOURCE_EXHAUSTED',
      providerMessage: message,
      isRetryable: true,
    };
  }

  // 3. Auth / Credentials (HTTP 401 / 403)
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    msgLower.includes("unauthenticated") ||
    msgLower.includes("permission_denied") ||
    msgLower.includes("invalid api key") ||
    msgLower.includes("api key not valid")
  ) {
    return {
      category: 'AUTHENTICATION_ERROR',
      httpStatus: httpStatus || 403,
      providerErrorCode: providerErrorCode || 'PERMISSION_DENIED',
      providerMessage: message,
      isRetryable: false,
    };
  }

  // 4. Server Error (HTTP 5xx)
  if (
    (httpStatus && httpStatus >= 500 && httpStatus <= 599) ||
    msgLower.includes("internal_error") ||
    msgLower.includes("unavailable") ||
    msgLower.includes("service error")
  ) {
    return {
      category: 'SERVER_ERROR',
      httpStatus: httpStatus || 500,
      providerErrorCode: providerErrorCode || 'INTERNAL',
      providerMessage: message,
      isRetryable: true,
    };
  }

  // 5. Network / Timeout
  if (
    err?.name === 'AbortError' ||
    msgLower.includes("timeout") ||
    msgLower.includes("etimedout") ||
    msgLower.includes("enotfound") ||
    msgLower.includes("fetch failed") ||
    msgLower.includes("network error")
  ) {
    return {
      category: 'NETWORK_TIMEOUT',
      httpStatus: undefined,
      providerErrorCode: err?.code || 'NETWORK_TIMEOUT',
      providerMessage: message,
      isRetryable: true,
    };
  }

  return {
    category: 'UNKNOWN_ERROR',
    httpStatus,
    providerErrorCode,
    providerMessage: message,
    isRetryable: false,
  };
}

/**
 * Lazy initialization of GoogleGenAI client with standard options.
 */
export const getGeminiClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is not set.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

export const PRIMARY_GEMINI_MODEL = "gemini-3.6-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash";

/**
 * Safely calls Gemini API trying primary model (gemini-3.6-flash) then fallback (gemini-3.5-flash)
 * upon retryable errors, with precise error classification and structured logging.
 */
export const callGeminiSafe = async (ai: GoogleGenAI, requestOptions: any) => {
  const modelsToTry = [PRIMARY_GEMINI_MODEL, FALLBACK_GEMINI_MODEL];
  const attemptedErrors: Array<{ model: string; analysis: GeminiErrorAnalysis }> = [];

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    const nextModelName = modelsToTry[i + 1];
    const hasNextModel = Boolean(nextModelName);

    try {
      const opts = { ...requestOptions, model: modelName };
      const response = await ai.models.generateContent(opts);
      if (response) return response;
    } catch (err: any) {
      const analysis = classifyGeminiError(err);
      attemptedErrors.push({ model: modelName, analysis });

      const willAttemptFallback = hasNextModel && analysis.isRetryable;
      const finalOutcome = willAttemptFallback
        ? `Attempting fallback model: ${nextModelName}`
        : `Execution failed on ${modelName}. No further fallbacks.`;

      const sanitizedMessage = analysis.providerMessage.replace(/[\r\n]+/g, ' ');

      console.warn(
        `[Gemini API Failure] ` +
        `model="${modelName}" ` +
        `httpStatus=${analysis.httpStatus ?? 'N/A'} ` +
        `category="${analysis.category}" ` +
        `errorCode="${analysis.providerErrorCode ?? 'N/A'}" ` +
        `errorMessage="${sanitizedMessage}" ` +
        `fallbackAttempted=${willAttemptFallback} ` +
        `outcome="${finalOutcome}"`
      );

      if (!willAttemptFallback) {
        break;
      }
    }
  }

  // Build explicit error reflecting actual failure categories
  const primaryAnalysis = attemptedErrors[0]?.analysis;
  const categories = Array.from(new Set(attemptedErrors.map(e => e.analysis.category))).join(', ');
  const details = attemptedErrors
    .map(e => `[Model: ${e.model} | Category: ${e.analysis.category} | HTTP ${e.analysis.httpStatus ?? 'N/A'}: ${e.analysis.providerMessage}]`)
    .join('; ');

  const hasQuotaError = attemptedErrors.some(e => e.analysis.category === 'RATE_LIMITED');
  let errorMessage: string;
  if (hasQuotaError) {
    errorMessage = `Gemini API rate limiting or quota exceeded (429): ${details}`;
  } else {
    errorMessage = `Gemini API call failed (${categories}): ${details}`;
  }

  const errorObj = new Error(errorMessage);
  (errorObj as any).category = primaryAnalysis?.category || 'UNKNOWN_ERROR';
  (errorObj as any).httpStatus = primaryAnalysis?.httpStatus;
  (errorObj as any).attemptedErrors = attemptedErrors;

  throw errorObj;
};

