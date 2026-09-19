/**
 * Phase 1 — OpenAI Independent Second Opinion Shadow Layer
 * QuantumAI IATI OS
 * 
 * ARCHITECTURAL ROLE:
 * - Independent second-opinion risk reviewer only (advisory).
 * - Primary AI engine remains Google Gemini.
 * - OpenAI has NO broker credentials, NO cTrader access, and cannot place/modify orders.
 * - Operates in OBSERVATION shadow mode without execution authority.
 */

import { EconomicContextService, NormalizedEconomicEvent } from '../../../../src/server/services/economicContextService';

export type SecondOpinionReview =
  | "PASS"
  | "REVIEW"
  | "REJECT"
  | "UNAVAILABLE";

export type SecondOpinionBias =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL";

export type SecondOpinionAgreement =
  | "AGREE"
  | "PARTIAL"
  | "DISAGREE";

export type ContradictionLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface EconomicContextEvent {
  currency: string;
  event: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  scheduledAt: string;
  minutesUntil: number;
  previous?: string | null;
  forecast?: string | null;
  actual?: string | null;
  status?: "UPCOMING" | "RELEASED" | "LIVE_WINDOW";
}

export interface EconomicContext {
  events: EconomicContextEvent[];
  blackoutActive: boolean;
  blackoutReason?: string;
}

export interface SecondOpinionInput {
  signalId: string;
  pair: string;
  timeframe: string;

  candidateDirection: "BUY" | "SELL" | "NEUTRAL";
  candidateConfidence: number;

  entry?: number;
  entryZone?: {
    min: number;
    max: number;
  };

  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;

  indicators?: Record<string, unknown>;
  marketStructure?: Record<string, unknown>;
  volatility?: Record<string, unknown>;
  liquidity?: Record<string, unknown>;
  agentVotes?: unknown[];

  evidence?: string[];
  invalidationConditions?: string[];

  economicContext?: EconomicContext;

  dataMode?: string;
  dataLineage?: Record<string, unknown>;
}

export interface SecondOpinionResult {
  signalId: string;

  review: SecondOpinionReview;

  candidateDirectionSupported: boolean;

  independentBias: SecondOpinionBias;
  confidence: number;

  agreement: SecondOpinionAgreement;
  contradictionLevel: ContradictionLevel;

  riskFlags: string[];
  keyConcerns: string[];
  invalidationConcerns: string[];

  economicRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

  summary: string;

  model: string;
  latencyMs: number;
  reviewedAt: string;
}

export interface SecondOpinionAuditRecord {
  signalId: string;
  pair: string;
  timeframe: string;

  candidateDirection: "BUY" | "SELL" | "NEUTRAL";
  candidateConfidence: number;

  independentBias: SecondOpinionBias;
  independentConfidence: number;

  agreement: SecondOpinionAgreement;
  contradictionLevel: ContradictionLevel;

  review: SecondOpinionReview;
  economicRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

  riskFlags: string[];
  keyConcerns: string[];

  entry?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;

  executionEligibilityAtReview: string;

  model: string;
  latencyMs: number;
  reviewedAt: string;
}

export interface SecondOpinionPolicyEvaluation {
  hypotheticalDecision: "ALLOW" | "REVIEW" | "BLOCK";
  reasons: string[];
}

/**
 * Deterministic policy evaluator for Second Opinion results
 * The result is advisory and produces a hypothetical policy decision.
 */
export function evaluateSecondOpinionPolicy(result: SecondOpinionResult): SecondOpinionPolicyEvaluation {
  const reasons: string[] = [];

  if (result.review === "UNAVAILABLE") {
    reasons.push("OpenAI second opinion service is unavailable; advisory policy defaults to REVIEW.");
    return { hypotheticalDecision: "REVIEW", reasons };
  }

  // DISAGREE + HIGH Contradiction OR explicit REJECT => BLOCK
  if (result.review === "REJECT" || (result.agreement === "DISAGREE" && result.contradictionLevel === "HIGH")) {
    reasons.push(`OpenAI reviewer flagged major conflict/rejection (${result.keyConcerns.join("; ") || "High technical or event contradiction"}).`);
    return { hypotheticalDecision: "BLOCK", reasons };
  }

  // PARTIAL Agreement, MEDIUM Contradiction, or REVIEW review status => REVIEW
  if (result.review === "REVIEW" || result.agreement === "PARTIAL" || result.contradictionLevel === "MEDIUM") {
    reasons.push(`OpenAI reviewer recommended review (Agreement: ${result.agreement}, Contradiction: ${result.contradictionLevel}).`);
    return { hypotheticalDecision: "REVIEW", reasons };
  }

  // HIGH Economic Risk => REVIEW
  if (result.economicRisk === "HIGH") {
    reasons.push("Elevated economic event risk detected; execution timing requires human/governance review.");
    return { hypotheticalDecision: "REVIEW", reasons };
  }

  // AGREE + LOW Contradiction + PASS => ALLOW
  if (result.review === "PASS" && result.agreement === "AGREE" && result.contradictionLevel === "LOW") {
    reasons.push("OpenAI reviewer independently agrees with setup direction and geometry under low contradiction.");
    return { hypotheticalDecision: "ALLOW", reasons };
  }

  reasons.push(`Review status: ${result.review}, Agreement: ${result.agreement}`);
  return { hypotheticalDecision: result.review === "PASS" ? "ALLOW" : "REVIEW", reasons };
}

/**
 * Helper to build EconomicContext from existing EconomicContextService
 */
export function buildEconomicContextForSymbol(symbol: string): EconomicContext {
  const clean = (symbol || '').replace(/[\/\-_]/g, '').toUpperCase();
  let baseCurrency = clean.length >= 6 ? clean.substring(0, 3) : 'EUR';
  let quoteCurrency = clean.length >= 6 ? clean.substring(3, 6) : 'USD';
  if (clean.includes('XAU') || clean.includes('GOLD')) { baseCurrency = 'XAU'; quoteCurrency = 'USD'; }
  if (clean.includes('NAS') || clean.includes('TECH')) { baseCurrency = 'USD'; quoteCurrency = 'USD'; }
  if (clean.includes('BTC')) { baseCurrency = 'USD'; quoteCurrency = 'USD'; }

  const evaluation = EconomicContextService.evaluateEconomicContext({ symbol });
  const allEvents = EconomicContextService.getEvents();
  const nowMs = Date.now();

  const relevantEvents: EconomicContextEvent[] = allEvents
    .filter(e => e.currency === baseCurrency || e.currency === quoteCurrency || (baseCurrency === 'XAU' && e.currency === 'USD'))
    .map(e => {
      const scheduledMs = new Date(e.timestampUtc).getTime();
      const minutesUntil = Math.round((scheduledMs - nowMs) / 60000);
      let status: "UPCOMING" | "RELEASED" | "LIVE_WINDOW" = "UPCOMING";
      if (Math.abs(minutesUntil) <= 30) status = "LIVE_WINDOW";
      else if (minutesUntil < -30) status = "RELEASED";

      return {
        currency: e.currency,
        event: e.title,
        impact: e.impact as "HIGH" | "MEDIUM" | "LOW",
        scheduledAt: e.timestampUtc,
        minutesUntil,
        previous: e.previous !== undefined && e.previous !== null ? String(e.previous) : null,
        forecast: e.forecast !== undefined && e.forecast !== null ? String(e.forecast) : null,
        actual: e.actual !== undefined && e.actual !== null ? String(e.actual) : null,
        status
      };
    });

  return {
    events: relevantEvents,
    blackoutActive: evaluation.hasHighImpactEventActive,
    blackoutReason: evaluation.hasHighImpactEventActive ? evaluation.reason : undefined
  };
}

export class SecondOpinionService {
  private static instance: SecondOpinionService;
  private auditLedger: Map<string, SecondOpinionAuditRecord> = new Map();
  private inFlightReviews: Map<string, Promise<SecondOpinionResult>> = new Map();

  public static getInstance(): SecondOpinionService {
    if (!SecondOpinionService.instance) {
      SecondOpinionService.instance = new SecondOpinionService();
    }
    return SecondOpinionService.instance;
  }

  /**
   * System Prompt strictly preventing confirmation bias and keeping evaluation objective
   */
  public getSystemPrompt(): string {
    return [
      "You are an independent second-opinion risk reviewer for a quantitative trading system.",
      "You are NOT the primary signal generator.",
      "You must independently evaluate the supplied market evidence.",
      "You must be willing to disagree with the candidate signal.",
      "Do not assume that the candidate direction is correct.",
      "Do not increase or decrease the candidate confidence merely because another AI produced it.",
      "",
      "Evaluate:",
      "1. Directional bias",
      "2. Market structure",
      "3. Trend",
      "4. Momentum",
      "5. Volatility",
      "6. Liquidity and spread",
      "7. Entry geometry",
      "8. Stop-loss placement",
      "9. Take-profit geometry",
      "10. Invalidation conditions",
      "11. Multi-agent evidence",
      "12. Economic-calendar/event risk",
      "13. Timing risk",
      "14. Contradictions between evidence sources",
      "",
      "IMPORTANT ECONOMIC RULES:",
      "Economic events can:",
      "- increase volatility",
      "- increase spread/slippage",
      "- change market regime",
      "- invalidate technical assumptions",
      "- create directional uncertainty",
      "- make timing unsuitable even when directional bias remains valid",
      "",
      "A HIGH-impact event does NOT automatically mean BUY or SELL.",
      "Do not predict the result of an economic release unless the supplied data supports such an assessment.",
      "If forecast, previous, or actual values are missing, treat them as UNKNOWN.",
      "",
      "Clearly distinguish:",
      "- directional risk",
      "- event risk",
      "- execution timing risk",
      "- technical invalidation",
      "",
      "If the technical setup is bullish but a major event is imminent, it is valid to say:",
      "\"Directional bias remains bullish, but timing/event risk is elevated.\"",
      "Do not convert event risk directly into an opposite trade direction.",
      "Do not invent economic data.",
      "Do not browse for external news in this phase.",
      "Only use the economic information supplied by QuantumAI.",
      "Do not authorize broker execution.",
      "",
      "You MUST respond ONLY with a strict JSON object matching this exact schema:",
      "{",
      '  "review": "PASS | REVIEW | REJECT",',
      '  "candidateDirectionSupported": boolean,',
      '  "independentBias": "BULLISH | BEARISH | NEUTRAL",',
      '  "confidence": number (0 to 100),',
      '  "agreement": "AGREE | PARTIAL | DISAGREE",',
      '  "contradictionLevel": "LOW | MEDIUM | HIGH",',
      '  "riskFlags": string[],',
      '  "keyConcerns": string[],',
      '  "invalidationConcerns": string[],',
      '  "economicRisk": "LOW | MEDIUM | HIGH | UNKNOWN",',
      '  "summary": string',
      "}"
    ].join("\n");
  }

  /**
   * Main entrypoint: Review a trade candidate signal asynchronously
   */
  public async reviewSignal(input: SecondOpinionInput): Promise<SecondOpinionResult> {
    const startTime = Date.now();
    const signalId = input.signalId;

    // 1. Idempotency Check: return existing review if already completed
    if (this.auditLedger.has(signalId)) {
      const existing = this.auditLedger.get(signalId)!;
      return {
        signalId: existing.signalId,
        review: existing.review,
        candidateDirectionSupported: existing.agreement !== "DISAGREE",
        independentBias: existing.independentBias,
        confidence: existing.independentConfidence,
        agreement: existing.agreement,
        contradictionLevel: existing.contradictionLevel,
        riskFlags: existing.riskFlags,
        keyConcerns: existing.keyConcerns,
        invalidationConcerns: [],
        economicRisk: existing.economicRisk,
        summary: `Cached shadow review from ${existing.reviewedAt}`,
        model: existing.model,
        latencyMs: existing.latencyMs,
        reviewedAt: existing.reviewedAt
      };
    }

    // 2. In-flight Lock: prevent parallel duplicate executions for the same signalId
    if (this.inFlightReviews.has(signalId)) {
      return this.inFlightReviews.get(signalId)!;
    }

    const reviewPromise = this.executeReviewInternal(input, startTime);
    this.inFlightReviews.set(signalId, reviewPromise);

    try {
      return await reviewPromise;
    } finally {
      this.inFlightReviews.delete(signalId);
    }
  }

  private async executeReviewInternal(input: SecondOpinionInput, startTime: number): Promise<SecondOpinionResult> {
    const isEnabled = process.env.OPENAI_SECOND_OPINION_ENABLED === 'true';
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_SECOND_OPINION_MODEL?.trim();
    const timeoutMs = Number(process.env.OPENAI_SECOND_OPINION_TIMEOUT_MS) || 10000;

    // Fail-closed to UNAVAILABLE if disabled or misconfigured
    if (!isEnabled || !apiKey || !model) {
      const unavailableResult: SecondOpinionResult = {
        signalId: input.signalId,
        review: "UNAVAILABLE",
        candidateDirectionSupported: false,
        independentBias: "NEUTRAL",
        confidence: 0,
        agreement: "DISAGREE",
        contradictionLevel: "LOW",
        riskFlags: ["OPENAI_SERVICE_UNAVAILABLE"],
        keyConcerns: [
          !isEnabled
            ? "OpenAI second opinion shadow layer is disabled (OPENAI_SECOND_OPINION_ENABLED!=true)."
            : (!apiKey ? "OPENAI_API_KEY is not configured." : "OPENAI_SECOND_OPINION_MODEL is blank.")
        ],
        invalidationConcerns: [],
        economicRisk: "UNKNOWN",
        summary: "OpenAI second opinion service is currently unavailable.",
        model: model || "UNCONFIGURED",
        latencyMs: Date.now() - startTime,
        reviewedAt: new Date().toISOString()
      };

      this.recordAudit(input, unavailableResult);
      return unavailableResult;
    }

    try {
      // Build objective user prompt without leading bias
      const promptPayload = {
        pair: input.pair,
        timeframe: input.timeframe,
        candidateDirection: input.candidateDirection,
        entryGeometry: {
          entry: input.entry,
          entryZone: input.entryZone,
          stopLoss: input.stopLoss,
          takeProfit1: input.takeProfit1,
          takeProfit2: input.takeProfit2
        },
        marketEvidence: {
          indicators: input.indicators,
          marketStructure: input.marketStructure,
          volatility: input.volatility,
          liquidity: input.liquidity,
          evidenceStatements: input.evidence,
          invalidationConditions: input.invalidationConditions
        },
        economicContext: input.economicContext || buildEconomicContextForSymbol(input.pair),
        dataMode: input.dataMode || "LIVE_CTRADER"
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: this.getSystemPrompt() },
            {
              role: "user",
              content: `Please conduct an independent risk assessment for the following market setup:\n${JSON.stringify(promptPayload, null, 2)}`
            }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty OpenAI completion response");
      }

      const parsed = JSON.parse(content);
      const validatedResult = this.validateAndNormalizeResponse(input.signalId, parsed, model, Date.now() - startTime);

      this.logReviewSummary(validatedResult, input.pair);
      this.recordAudit(input, validatedResult);
      return validatedResult;
    } catch (err: any) {
      // Fail-closed to UNAVAILABLE upon any network, parse, or timeout error
      const errorResult: SecondOpinionResult = {
        signalId: input.signalId,
        review: "UNAVAILABLE",
        candidateDirectionSupported: false,
        independentBias: "NEUTRAL",
        confidence: 0,
        agreement: "DISAGREE",
        contradictionLevel: "LOW",
        riskFlags: ["OPENAI_INFERENCE_ERROR"],
        keyConcerns: [`OpenAI review failed: ${err.message || 'Unknown error'}`],
        invalidationConcerns: [],
        economicRisk: "UNKNOWN",
        summary: "OpenAI second opinion encountered an error and returned UNAVAILABLE.",
        model,
        latencyMs: Date.now() - startTime,
        reviewedAt: new Date().toISOString()
      };

      this.recordAudit(input, errorResult);
      return errorResult;
    }
  }

  /**
   * Validates and clamps every field from OpenAI response
   */
  private validateAndNormalizeResponse(
    signalId: string,
    raw: any,
    model: string,
    latencyMs: number
  ): SecondOpinionResult {
    // Validate review enum
    const validReviews = ["PASS", "REVIEW", "REJECT", "UNAVAILABLE"];
    const rawReview = String(raw.review || '').toUpperCase();
    const review: SecondOpinionReview = validReviews.includes(rawReview)
      ? (rawReview as SecondOpinionReview)
      : "UNAVAILABLE";

    // Validate bias enum
    const validBiases = ["BULLISH", "BEARISH", "NEUTRAL"];
    const rawBias = String(raw.independentBias || '').toUpperCase();
    const independentBias: SecondOpinionBias = validBiases.includes(rawBias)
      ? (rawBias as SecondOpinionBias)
      : "NEUTRAL";

    // Validate agreement enum
    const validAgreements = ["AGREE", "PARTIAL", "DISAGREE"];
    const rawAgree = String(raw.agreement || '').toUpperCase();
    const agreement: SecondOpinionAgreement = validAgreements.includes(rawAgree)
      ? (rawAgree as SecondOpinionAgreement)
      : "DISAGREE";

    // Validate contradiction enum
    const validContradictions = ["LOW", "MEDIUM", "HIGH"];
    const rawContradiction = String(raw.contradictionLevel || '').toUpperCase();
    const contradictionLevel: ContradictionLevel = validContradictions.includes(rawContradiction)
      ? (rawContradiction as ContradictionLevel)
      : "LOW";

    // Validate economicRisk enum
    const validEconRisk = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"];
    const rawEconRisk = String(raw.economicRisk || '').toUpperCase();
    const economicRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" = validEconRisk.includes(rawEconRisk)
      ? (rawEconRisk as any)
      : "UNKNOWN";

    // Clamp confidence
    const rawConf = Number(raw.confidence);
    const confidence = isNaN(rawConf) ? 0 : Math.max(0, Math.min(100, Math.round(rawConf)));

    return {
      signalId,
      review,
      candidateDirectionSupported: Boolean(raw.candidateDirectionSupported),
      independentBias,
      confidence,
      agreement,
      contradictionLevel,
      riskFlags: Array.isArray(raw.riskFlags) ? raw.riskFlags.map(String) : [],
      keyConcerns: Array.isArray(raw.keyConcerns) ? raw.keyConcerns.map(String) : [],
      invalidationConcerns: Array.isArray(raw.invalidationConcerns) ? raw.invalidationConcerns.map(String) : [],
      economicRisk,
      summary: typeof raw.summary === 'string' ? raw.summary : 'No summary provided',
      model,
      latencyMs,
      reviewedAt: new Date().toISOString()
    };
  }

  private recordAudit(input: SecondOpinionInput, result: SecondOpinionResult): void {
    const auditRecord: SecondOpinionAuditRecord = {
      signalId: input.signalId,
      pair: input.pair,
      timeframe: input.timeframe,
      candidateDirection: input.candidateDirection,
      candidateConfidence: input.candidateConfidence,
      independentBias: result.independentBias,
      independentConfidence: result.confidence,
      agreement: result.agreement,
      contradictionLevel: result.contradictionLevel,
      review: result.review,
      economicRisk: result.economicRisk,
      riskFlags: result.riskFlags,
      keyConcerns: result.keyConcerns,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit1: input.takeProfit1,
      takeProfit2: input.takeProfit2,
      executionEligibilityAtReview: "WAITING_FOR_ENTRY", // Default baseline
      model: result.model,
      latencyMs: result.latencyMs,
      reviewedAt: result.reviewedAt
    };

    this.auditLedger.set(input.signalId, auditRecord);
  }

  /**
   * Safe structured logger avoiding any key or secret leakage
   */
  private logReviewSummary(result: SecondOpinionResult, pair: string): void {
    console.log(`🔍 [OpenAI Second Opinion] Signal: ${result.signalId} | Pair: ${pair} | Review: ${result.review} | Agreement: ${result.agreement} | Contradiction: ${result.contradictionLevel} | EconRisk: ${result.economicRisk} | Model: ${result.model} | Latency: ${result.latencyMs}ms`);
  }

  public getAuditRecord(signalId: string): SecondOpinionAuditRecord | undefined {
    return this.auditLedger.get(signalId);
  }

  public getAllAuditRecords(): SecondOpinionAuditRecord[] {
    return Array.from(this.auditLedger.values());
  }

  public clearAuditRecords(): void {
    this.auditLedger.clear();
  }
}

export const secondOpinionService = SecondOpinionService.getInstance();
