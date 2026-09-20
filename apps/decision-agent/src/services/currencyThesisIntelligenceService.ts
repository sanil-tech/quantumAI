/**
 * Phase 2B — Currency Thesis Intelligence Service
 * QuantumAI IATI OS
 * 
 * OBSERVATION ONLY:
 * - Deterministic currency-level thesis derivation across 8 major currencies:
 *   JPY, USD, EUR, GBP, AUD, CAD, CHF, NZD.
 * - Measures cross-pair concentration, thesis persistence, and time-decay memory.
 * - Strictly isolates Signal emissions from Order submissions, Fills, Positions, and Realized Outcomes.
 * - Read-only integration with SecondOpinionObservationService and EconomicContextService.
 * - INVARIANT: executionAuthority = false (Zero execution authority, zero order manipulation).
 */

import fs from 'fs';
import path from 'path';
import { EconomicContextService } from '../../../../src/server/services/economicContextService';
import { SecondOpinionObservationService } from './secondOpinionObservationService';

export type SupportedCurrency = 'JPY' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'CHF' | 'NZD';

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'JPY',
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'CAD',
  'CHF',
  'NZD'
];

export type ThesisPersistenceClassification = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type ObservationDataMode = 'LIVE' | 'SHADOW' | 'SYNTHETIC' | 'BACKTEST' | 'UNKNOWN';

export type ObservationOutcomeState =
  | 'SIGNAL_ONLY'
  | 'ORDER_SUBMITTED_NOT_FILLED'
  | 'FILLED_OPEN'
  | 'CLOSED_WIN'
  | 'CLOSED_LOSS'
  | 'CLOSED_BREAKEVEN'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'UNMATCHED'
  | 'UNKNOWN';

export interface ParsedPairResult {
  rawSymbol: string;
  normalizedSymbol: string;
  baseCurrency: SupportedCurrency | 'UNKNOWN';
  quoteCurrency: SupportedCurrency | 'UNKNOWN';
  isValid: boolean;
  currencyExposureStatus: 'VALID' | 'UNKNOWN';
}

export interface IngestCandidateSignalInput {
  signalId: string;
  symbol: string;
  timeframe?: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  executionEligibility?: string;
  createdAt?: string | number;
  dataMode?: ObservationDataMode;
  brokerOrderId?: string;
  brokerPositionId?: string;
  executionSequenceId?: string;
  orderType?: string;
  isOrderSubmitted?: boolean;
  isOrderFilled?: boolean;
  isPositionOpened?: boolean;
  isPositionClosed?: boolean;
  outcomeStatus?: ObservationOutcomeState;
  realizedPnl?: number;
  realizedPips?: number;
  closeReason?: string;
  reasons?: string[];
  ttlExpired?: boolean;
  cancelled?: boolean;
}

export interface CurrencyThesisRecord {
  id: string;
  signalId: string;
  symbol: string;
  canonicalSymbol: string;
  baseCurrency: SupportedCurrency | 'UNKNOWN';
  quoteCurrency: SupportedCurrency | 'UNKNOWN';
  timeframe: string;
  direction: 'BUY' | 'SELL';
  confidence: number;

  primaryCurrency: SupportedCurrency | 'UNKNOWN';
  secondaryCurrency: SupportedCurrency | 'UNKNOWN';
  baseThesisKey: string;
  quoteThesisKey: string;
  primaryThesisKey: string;

  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  executionEligibility: string;
  dataMode: ObservationDataMode;
  observedAt: string;

  brokerOrderId?: string;
  brokerPositionId?: string;
  executionSequenceId?: string;
  orderType?: string;
  isOrderSubmitted: boolean;
  isOrderFilled: boolean;
  isPositionOpened: boolean;
  isPositionClosed: boolean;
  outcomeStatus: ObservationOutcomeState;
  realizedPnl?: number;
  realizedPips?: number;
  closeReason?: string;
  reasons?: string[];

  secondOpinion: {
    exists: boolean;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    review?: string;
    bias?: string;
    confidence?: number;
    agreement?: string;
    contradictionLevel?: string;
    economicRisk?: string;
    model?: string;
    latencyMs?: number;
  };

  economicContext: {
    economicRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    blackoutActive?: boolean;
    riskCategory?: string;
    nearbyHighImpactEvents?: string[];
    minutesToNearestHighImpactEvent?: number;
  };

  dataQualityFlags: string[];
}

export interface CurrencyThesisEvidenceSummary {
  currency: SupportedCurrency;
  thesisKey: string;
  persistence: ThesisPersistenceClassification;
  crossPairConcentration: 'LOW' | 'MEDIUM' | 'HIGH';
  
  signalCount: number;
  uniquePairCount: number;
  pairsObserved: string[];
  firstObservedAt: string | null;
  lastObservedAt: string | null;

  signalsLast5m: number;
  signalsLast15m: number;
  signalsLast30m: number;
  signalsLast60m: number;
  signalsLast4h: number;
  signalsLast24h: number;

  averageQuantumConfidence: number;
  maxQuantumConfidence: number;
  directionsObserved: ('BUY' | 'SELL')[];

  agreementCount: number;
  partialAgreementCount: number;
  disagreementCount: number;
  openAiUnavailableCount: number;

  economicRiskLevels: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    UNKNOWN: number;
  };

  ordersSubmitted: number;
  filledPositionCount: number;
  openPositionCount: number;
  closedPositionCount: number;
  realizedLossCount: number;
  realizedWinCount: number;
  breakevenCount: number;
  unmatchedOutcomeCount: number;

  expiredOrders: number;
  cancelledOrders: number;
  unfilledOrders: number;
  underlyingExecutionSequences: number;

  dataQualityFlags: string[];
}

export interface CurrencyOverviewResponse {
  currency: SupportedCurrency;
  currentTheses: CurrencyThesisEvidenceSummary[];
  totalSignals: number;
  totalFilledPositions: number;
  totalRealizedLosses: number;
  totalRealizedWins: number;
  totalBreakevens: number;
  actualBrokerExposureStatus: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  signalThesisExposureStatus: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  dataQualityIssues: string[];
}

export interface HealthDiagnosticResponse {
  enabled: boolean;
  mode: 'OBSERVATION';
  executionAuthority: false;
  persistenceHealthy: boolean;
  supportedCurrencies: SupportedCurrency[];
  latestObservationAt: string | null;
  observationCount: number;
  dataQualityIssueCount: number;
}

export class CurrencyThesisIntelligenceService {
  private static instance: CurrencyThesisIntelligenceService;
  private observations: Map<string, CurrencyThesisRecord> = new Map();
  private signalToObsMap: Map<string, string> = new Map(); // signalId -> obsId
  private brokerOrderToObsMap: Map<string, string> = new Map(); // brokerOrderId -> obsId
  private brokerPosToObsMap: Map<string, string> = new Map(); // brokerPositionId -> obsId
  private cacheFilePath: string;
  private isPersistenceHealthy: boolean = true;

  public constructor(customCachePath?: string) {
    this.cacheFilePath = customCachePath || path.resolve(process.cwd(), 'data', 'currency_thesis_observations.json');
    this.loadFromDisk();
    this.subscribeToEventBus();
  }

  public static getInstance(): CurrencyThesisIntelligenceService {
    if (!CurrencyThesisIntelligenceService.instance) {
      CurrencyThesisIntelligenceService.instance = new CurrencyThesisIntelligenceService();
    }
    return CurrencyThesisIntelligenceService.instance;
  }

  /**
   * Deterministic Pair & Currency Parser
   * Accurately parses standard formats (e.g. 'EUR/JPY', 'EURJPY', 'EUR_JPY', 'EURJPY.pro', 'GBP/USD')
   */
  public parsePair(symbol: string): ParsedPairResult {
    if (!symbol || typeof symbol !== 'string') {
      return {
        rawSymbol: String(symbol),
        normalizedSymbol: 'UNKNOWN',
        baseCurrency: 'UNKNOWN',
        quoteCurrency: 'UNKNOWN',
        isValid: false,
        currencyExposureStatus: 'UNKNOWN'
      };
    }

    const clean = symbol.trim().toUpperCase().replace(/[^A-Z]/g, '');

    // Check for standard 6-character forex pairs (e.g. EURUSD, GBPJPY, AUDNZD)
    if (clean.length >= 6) {
      const candidateBase = clean.substring(0, 3) as SupportedCurrency;
      const candidateQuote = clean.substring(3, 6) as SupportedCurrency;

      const isBaseSupported = SUPPORTED_CURRENCIES.includes(candidateBase);
      const isQuoteSupported = SUPPORTED_CURRENCIES.includes(candidateQuote);

      if (isBaseSupported && isQuoteSupported) {
        return {
          rawSymbol: symbol,
          normalizedSymbol: `${candidateBase}/${candidateQuote}`,
          baseCurrency: candidateBase,
          quoteCurrency: candidateQuote,
          isValid: true,
          currencyExposureStatus: 'VALID'
        };
      }
    }

    return {
      rawSymbol: symbol,
      normalizedSymbol: 'UNKNOWN',
      baseCurrency: 'UNKNOWN',
      quoteCurrency: 'UNKNOWN',
      isValid: false,
      currencyExposureStatus: 'UNKNOWN'
    };
  }

  /**
   * Deterministic Currency Thesis Derivation
   */
  public deriveTheses(
    baseCurrency: SupportedCurrency | 'UNKNOWN',
    quoteCurrency: SupportedCurrency | 'UNKNOWN',
    direction: 'BUY' | 'SELL'
  ): {
    baseThesisKey: string;
    quoteThesisKey: string;
    primaryThesisKey: string;
    primaryCurrency: SupportedCurrency | 'UNKNOWN';
    secondaryCurrency: SupportedCurrency | 'UNKNOWN';
  } {
    if (baseCurrency === 'UNKNOWN' || quoteCurrency === 'UNKNOWN') {
      return {
        baseThesisKey: 'UNKNOWN_THESIS',
        quoteThesisKey: 'UNKNOWN_THESIS',
        primaryThesisKey: 'UNKNOWN_THESIS',
        primaryCurrency: 'UNKNOWN',
        secondaryCurrency: 'UNKNOWN'
      };
    }

    if (direction === 'BUY') {
      const baseThesis = `${baseCurrency}_STRENGTH`;
      const quoteThesis = `${quoteCurrency}_WEAKNESS`;
      return {
        baseThesisKey: baseThesis,
        quoteThesisKey: quoteThesis,
        primaryThesisKey: quoteThesis, // Quote weakness is canonical market expression for cross
        primaryCurrency: baseCurrency,
        secondaryCurrency: quoteCurrency
      };
    } else {
      const baseThesis = `${baseCurrency}_WEAKNESS`;
      const quoteThesis = `${quoteCurrency}_STRENGTH`;
      return {
        baseThesisKey: baseThesis,
        quoteThesisKey: quoteThesis,
        primaryThesisKey: quoteThesis, // Quote strength is canonical market expression for cross
        primaryCurrency: baseCurrency,
        secondaryCurrency: quoteCurrency
      };
    }
  }

  /**
   * Ingest and record a candidate signal into currency thesis observation memory
   */
  public recordSignal(input: IngestCandidateSignalInput): CurrencyThesisRecord {
    const dataQualityFlags: string[] = [];

    if (!input.signalId || typeof input.signalId !== 'string') {
      dataQualityFlags.push('MISSING_SIGNAL_ID');
    }

    // Duplicate detection
    if (input.signalId && this.signalToObsMap.has(input.signalId)) {
      dataQualityFlags.push('DUPLICATE_SIGNAL');
      const existingId = this.signalToObsMap.get(input.signalId)!;
      return this.observations.get(existingId)!;
    }

    const pairParse = this.parsePair(input.symbol);
    if (!pairParse.isValid) {
      dataQualityFlags.push('UNKNOWN_SYMBOL');
      dataQualityFlags.push('MISSING_CURRENCY_MAPPING');
    }

    const theses = this.deriveTheses(pairParse.baseCurrency, pairParse.quoteCurrency, input.direction);

    // Query genuine Second Opinion if available (READ-ONLY)
    let secondOpinionInfo: CurrencyThesisRecord['secondOpinion'] = {
      exists: false,
      status: 'UNAVAILABLE'
    };

    try {
      const soService = SecondOpinionObservationService.getInstance();
      const existingObs = soService.getObservationBySignalId(input.signalId);
      if (existingObs) {
        secondOpinionInfo = {
          exists: true,
          status: 'AVAILABLE',
          review: existingObs.openAiReview,
          bias: existingObs.openAiBias,
          confidence: existingObs.openAiConfidence,
          agreement: existingObs.agreement,
          contradictionLevel: existingObs.contradictionLevel,
          economicRisk: existingObs.economicRisk,
          model: existingObs.model,
          latencyMs: existingObs.latencyMs
        };
      } else {
        dataQualityFlags.push('OPENAI_UNAVAILABLE');
      }
    } catch {
      dataQualityFlags.push('OPENAI_UNAVAILABLE');
    }

    // Query Economic Context (READ-ONLY)
    let economicContextInfo: CurrencyThesisRecord['economicContext'] = {
      economicRisk: 'UNKNOWN'
    };

    try {
      if (pairParse.isValid) {
        const econEval = EconomicContextService.evaluateEconomicContext({ symbol: pairParse.normalizedSymbol });
        economicContextInfo = {
          economicRisk: econEval.riskCategory as any || 'LOW',
          blackoutActive: econEval.blackoutActive,
          riskCategory: econEval.riskCategory,
          nearbyHighImpactEvents: econEval.nearbyHighImpactEvents?.map(e => `${e.country}: ${e.title}`) || [],
          minutesToNearestHighImpactEvent: econEval.minutesToNearestHighImpactEvent
        };
      } else {
        dataQualityFlags.push('MISSING_ECONOMIC_CONTEXT');
      }
    } catch {
      dataQualityFlags.push('MISSING_ECONOMIC_CONTEXT');
    }

    if (input.dataMode && input.dataMode !== 'LIVE') {
      dataQualityFlags.push('NON_LIVE_LINEAGE');
    }

    if (!input.brokerOrderId && !input.brokerPositionId) {
      dataQualityFlags.push('MISSING_BROKER_LINK');
    }

    if (!input.executionSequenceId) {
      dataQualityFlags.push('UNKNOWN_EXECUTION_SEQUENCE');
    }

    const obsId = `CTO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const timestampStr = input.createdAt
      ? (typeof input.createdAt === 'number' ? new Date(input.createdAt).toISOString() : new Date(input.createdAt).toISOString())
      : new Date().toISOString();

    const record: CurrencyThesisRecord = {
      id: obsId,
      signalId: input.signalId || obsId,
      symbol: input.symbol,
      canonicalSymbol: pairParse.normalizedSymbol,
      baseCurrency: pairParse.baseCurrency,
      quoteCurrency: pairParse.quoteCurrency,
      timeframe: input.timeframe || 'M15',
      direction: input.direction,
      confidence: input.confidence,

      primaryCurrency: theses.primaryCurrency,
      secondaryCurrency: theses.secondaryCurrency,
      baseThesisKey: theses.baseThesisKey,
      quoteThesisKey: theses.quoteThesisKey,
      primaryThesisKey: theses.primaryThesisKey,

      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      executionEligibility: input.executionEligibility || 'UNKNOWN',
      dataMode: input.dataMode || 'LIVE',
      observedAt: timestampStr,

      brokerOrderId: input.brokerOrderId,
      brokerPositionId: input.brokerPositionId,
      executionSequenceId: input.executionSequenceId,
      orderType: input.orderType || 'LIMIT_PULLBACK',
      isOrderSubmitted: Boolean(input.isOrderSubmitted),
      isOrderFilled: Boolean(input.isOrderFilled),
      isPositionOpened: Boolean(input.isPositionOpened),
      isPositionClosed: Boolean(input.isPositionClosed),
      outcomeStatus: input.outcomeStatus || (input.isOrderFilled ? 'FILLED_OPEN' : (input.isOrderSubmitted ? 'ORDER_SUBMITTED_NOT_FILLED' : 'SIGNAL_ONLY')),
      realizedPnl: input.realizedPnl,
      realizedPips: input.realizedPips,
      closeReason: input.closeReason,
      reasons: input.reasons,

      secondOpinion: secondOpinionInfo,
      economicContext: economicContextInfo,
      dataQualityFlags
    };

    this.observations.set(obsId, record);
    if (record.signalId) this.signalToObsMap.set(record.signalId, obsId);
    if (record.brokerOrderId) this.brokerOrderToObsMap.set(record.brokerOrderId, obsId);
    if (record.brokerPositionId) this.brokerPosToObsMap.set(record.brokerPositionId, obsId);

    this.saveToDisk();
    return record;
  }

  /**
   * Correlate closed broker trade (READ-ONLY matching)
   */
  public correlateClosedTrade(trade: {
    brokerPositionId?: string;
    brokerOrderId?: string;
    signalId?: string;
    symbol: string;
    realizedProfit: number;
    pnlPips?: number;
    direction?: 'BUY' | 'SELL';
    closedAt?: Date | string;
    dataMode?: ObservationDataMode;
    closeReason?: string;
  }): { matched: boolean; observationId?: string; outcomeStatus: ObservationOutcomeState } {
    let matchedObs: CurrencyThesisRecord | undefined;

    if (trade.signalId && this.signalToObsMap.has(trade.signalId)) {
      matchedObs = this.observations.get(this.signalToObsMap.get(trade.signalId)!);
    } else if (trade.brokerPositionId && this.brokerPosToObsMap.has(trade.brokerPositionId)) {
      matchedObs = this.observations.get(this.brokerPosToObsMap.get(trade.brokerPositionId)!);
    } else if (trade.brokerOrderId && this.brokerOrderToObsMap.has(trade.brokerOrderId)) {
      matchedObs = this.observations.get(this.brokerOrderToObsMap.get(trade.brokerOrderId)!);
    }

    const outcomeStatus: ObservationOutcomeState = trade.realizedProfit < -0.001
      ? 'CLOSED_LOSS'
      : trade.realizedProfit > 0.001
      ? 'CLOSED_WIN'
      : 'CLOSED_BREAKEVEN';

    if (matchedObs) {
      matchedObs.isOrderFilled = true;
      matchedObs.isPositionOpened = true;
      matchedObs.isPositionClosed = true;
      matchedObs.outcomeStatus = outcomeStatus;
      matchedObs.realizedPnl = trade.realizedProfit;
      matchedObs.realizedPips = trade.pnlPips;
      matchedObs.closeReason = trade.closeReason;
      if (trade.brokerPositionId) matchedObs.brokerPositionId = trade.brokerPositionId;
      if (trade.brokerOrderId) matchedObs.brokerOrderId = trade.brokerOrderId;

      this.saveToDisk();
      return { matched: true, observationId: matchedObs.id, outcomeStatus };
    }

    return { matched: false, outcomeStatus };
  }

  /**
   * Determine deterministic Thesis Persistence Classification
   */
  public classifyPersistence(
    signalCount: number,
    uniquePairCount: number,
    timeSpanMs: number,
    dataQualityFlags: string[]
  ): ThesisPersistenceClassification {
    if (dataQualityFlags.includes('MISSING_SIGNAL_ID') || dataQualityFlags.includes('MISSING_CURRENCY_MAPPING')) {
      return 'UNKNOWN';
    }

    // Deterministic rules:
    // HIGH: >= 6 signals OR (>= 2 unique pairs AND >= 4 signals AND span >= 30m)
    if (signalCount >= 6 || (uniquePairCount >= 2 && signalCount >= 4 && timeSpanMs >= 30 * 60 * 1000)) {
      return 'HIGH';
    }

    // MEDIUM: >= 3 signals OR (>= 2 unique pairs AND >= 2 signals)
    if (signalCount >= 3 || (uniquePairCount >= 2 && signalCount >= 2)) {
      return 'MEDIUM';
    }

    // LOW: 1-2 signals, single pair, or very brief window
    return 'LOW';
  }

  /**
   * Get evidence summaries for a specific currency
   */
  public getCurrencyTheses(currency: SupportedCurrency, dataMode: ObservationDataMode = 'LIVE'): CurrencyThesisEvidenceSummary[] {
    const now = Date.now();
    const relevantObs = Array.from(this.observations.values()).filter(
      obs => (obs.baseCurrency === currency || obs.quoteCurrency === currency) &&
             (dataMode === 'UNKNOWN' || obs.dataMode === dataMode)
    );

    // Group by thesis key relevant to this currency
    const thesisGroups: Map<string, CurrencyThesisRecord[]> = new Map();

    for (const obs of relevantObs) {
      const key = obs.baseCurrency === currency ? obs.baseThesisKey : obs.quoteThesisKey;
      if (!thesisGroups.has(key)) {
        thesisGroups.set(key, []);
      }
      thesisGroups.get(key)!.push(obs);
    }

    const summaries: CurrencyThesisEvidenceSummary[] = [];

    for (const [thesisKey, list] of thesisGroups.entries()) {
      const pairsSet = new Set<string>();
      const sequenceSet = new Set<string>();
      const directionsSet = new Set<'BUY' | 'SELL'>();
      const dqFlagsSet = new Set<string>();

      let minTime = Infinity;
      let maxTime = -Infinity;
      let confSum = 0;
      let maxConf = 0;

      let count5m = 0;
      let count15m = 0;
      let count30m = 0;
      let count60m = 0;
      let count4h = 0;
      let count24h = 0;

      let agreeCount = 0;
      let partialCount = 0;
      let disagreeCount = 0;
      let openAiUnavail = 0;

      const econRisks = { LOW: 0, MEDIUM: 0, HIGH: 0, UNKNOWN: 0 };

      let submitted = 0;
      let filled = 0;
      let openPos = 0;
      let closedPos = 0;
      let wins = 0;
      let losses = 0;
      let be = 0;
      let unmatched = 0;
      let expired = 0;
      let cancelled = 0;
      let unfilled = 0;

      for (const obs of list) {
        pairsSet.add(obs.canonicalSymbol || obs.symbol);
        directionsSet.add(obs.direction);
        if (obs.executionSequenceId) sequenceSet.add(obs.executionSequenceId);
        obs.dataQualityFlags?.forEach(f => dqFlagsSet.add(f));

        const obsTime = new Date(obs.observedAt).getTime();
        if (obsTime < minTime) minTime = obsTime;
        if (obsTime > maxTime) maxTime = obsTime;

        confSum += obs.confidence;
        if (obs.confidence > maxConf) maxConf = obs.confidence;

        const ageMs = now - obsTime;
        if (ageMs <= 5 * 60 * 1000) count5m++;
        if (ageMs <= 15 * 60 * 1000) count15m++;
        if (ageMs <= 30 * 60 * 1000) count30m++;
        if (ageMs <= 60 * 60 * 1000) count60m++;
        if (ageMs <= 4 * 60 * 60 * 1000) count4h++;
        if (ageMs <= 24 * 60 * 60 * 1000) count24h++;

        if (obs.secondOpinion.exists) {
          if (obs.secondOpinion.agreement === 'AGREE') agreeCount++;
          else if (obs.secondOpinion.agreement === 'PARTIAL') partialCount++;
          else if (obs.secondOpinion.agreement === 'DISAGREE') disagreeCount++;
        } else {
          openAiUnavail++;
        }

        const riskCat = obs.economicContext.economicRisk || 'UNKNOWN';
        if (riskCat in econRisks) econRisks[riskCat as keyof typeof econRisks]++;
        else econRisks.UNKNOWN++;

        if (obs.isOrderSubmitted) submitted++;
        if (obs.isOrderFilled) filled++;
        if (obs.isPositionOpened && !obs.isPositionClosed) openPos++;
        if (obs.isPositionClosed) closedPos++;

        if (obs.outcomeStatus === 'CLOSED_WIN') wins++;
        else if (obs.outcomeStatus === 'CLOSED_LOSS') losses++;
        else if (obs.outcomeStatus === 'CLOSED_BREAKEVEN') be++;
        else if (obs.outcomeStatus === 'EXPIRED') expired++;
        else if (obs.outcomeStatus === 'CANCELLED') cancelled++;
        else if (obs.outcomeStatus === 'ORDER_SUBMITTED_NOT_FILLED' || (!obs.isOrderFilled && obs.isOrderSubmitted)) unfilled++;
        else if (obs.outcomeStatus === 'UNMATCHED') unmatched++;
      }

      const timeSpanMs = list.length > 1 ? maxTime - minTime : 0;
      const flagsList = Array.from(dqFlagsSet);
      const persistence = this.classifyPersistence(list.length, pairsSet.size, timeSpanMs, flagsList);
      const concentration = pairsSet.size >= 3 ? 'HIGH' : pairsSet.size === 2 ? 'MEDIUM' : 'LOW';

      summaries.push({
        currency,
        thesisKey,
        persistence,
        crossPairConcentration: concentration,
        signalCount: list.length,
        uniquePairCount: pairsSet.size,
        pairsObserved: Array.from(pairsSet),
        firstObservedAt: minTime !== Infinity ? new Date(minTime).toISOString() : null,
        lastObservedAt: maxTime !== -Infinity ? new Date(maxTime).toISOString() : null,

        signalsLast5m: count5m,
        signalsLast15m: count15m,
        signalsLast30m: count30m,
        signalsLast60m: count60m,
        signalsLast4h: count4h,
        signalsLast24h: count24h,

        averageQuantumConfidence: list.length > 0 ? Math.round(confSum / list.length) : 0,
        maxQuantumConfidence: maxConf,
        directionsObserved: Array.from(directionsSet),

        agreementCount: agreeCount,
        partialAgreementCount: partialCount,
        disagreementCount: disagreeCount,
        openAiUnavailableCount: openAiUnavail,

        economicRiskLevels: econRisks,

        ordersSubmitted: submitted,
        filledPositionCount: filled,
        openPositionCount: openPos,
        closedPositionCount: closedPos,
        realizedLossCount: losses,
        realizedWinCount: wins,
        breakevenCount: be,
        unmatchedOutcomeCount: unmatched,

        expiredOrders: expired,
        cancelledOrders: cancelled,
        unfilledOrders: unfilled,
        underlyingExecutionSequences: sequenceSet.size || (filled > 0 ? 1 : 0),

        dataQualityFlags: flagsList
      });
    }

    return summaries;
  }

  /**
   * Get Complete Currency Overview
   */
  public getCurrencyOverview(currency: SupportedCurrency, dataMode: ObservationDataMode = 'LIVE'): CurrencyOverviewResponse {
    const theses = this.getCurrencyTheses(currency, dataMode);
    let totalSignals = 0;
    let totalFilled = 0;
    let totalLosses = 0;
    let totalWins = 0;
    let totalBE = 0;
    const dqSet = new Set<string>();

    for (const t of theses) {
      totalSignals += t.signalCount;
      totalFilled += t.filledPositionCount;
      totalLosses += t.realizedLossCount;
      totalWins += t.realizedWinCount;
      totalBE += t.breakevenCount;
      t.dataQualityFlags.forEach(f => dqSet.add(f));
    }

    const actualBrokerExposureStatus = totalFilled >= 3 ? 'HIGH' : totalFilled >= 1 ? 'MEDIUM' : 'NONE';
    const signalThesisExposureStatus = totalSignals >= 10 ? 'HIGH' : totalSignals >= 3 ? 'MEDIUM' : totalSignals >= 1 ? 'LOW' : 'NONE';

    return {
      currency,
      currentTheses: theses,
      totalSignals,
      totalFilledPositions: totalFilled,
      totalRealizedLosses: totalLosses,
      totalRealizedWins: totalWins,
      totalBreakevens: totalBE,
      actualBrokerExposureStatus,
      signalThesisExposureStatus,
      dataQualityIssues: Array.from(dqSet)
    };
  }

  /**
   * Get Overview across all 8 currencies
   */
  public getAllCurrenciesOverview(dataMode: ObservationDataMode = 'LIVE'): CurrencyOverviewResponse[] {
    return SUPPORTED_CURRENCIES.map(c => this.getCurrencyOverview(c, dataMode));
  }

  /**
   * Get Observation History for a currency
   */
  public getCurrencyHistory(currency: SupportedCurrency, limit: number = 100): CurrencyThesisRecord[] {
    return Array.from(this.observations.values())
      .filter(obs => obs.baseCurrency === currency || obs.quoteCurrency === currency)
      .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get Health Diagnostics
   */
  public getHealthDiagnostic(): HealthDiagnosticResponse {
    let latestTime: string | null = null;
    let maxT = -Infinity;
    let dqCount = 0;

    for (const obs of this.observations.values()) {
      const t = new Date(obs.observedAt).getTime();
      if (t > maxT) {
        maxT = t;
        latestTime = obs.observedAt;
      }
      if (obs.dataQualityFlags && obs.dataQualityFlags.length > 0) {
        dqCount += obs.dataQualityFlags.length;
      }
    }

    return {
      enabled: true,
      mode: 'OBSERVATION',
      executionAuthority: false,
      persistenceHealthy: this.isPersistenceHealthy,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      latestObservationAt: latestTime,
      observationCount: this.observations.size,
      dataQualityIssueCount: dqCount
    };
  }

  /**
   * Clear in-memory observations (Used primarily in test suites)
   */
  public clearObservations(): void {
    this.observations.clear();
    this.signalToObsMap.clear();
    this.brokerOrderToObsMap.clear();
    this.brokerPosToObsMap.clear();
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        fs.unlinkSync(this.cacheFilePath);
      } catch (_) {}
    }
  }

  private subscribeToEventBus(): void {
    try {
      import('@iati/event-bus').then(({ globalEventBus, EventTypes }) => {
        globalEventBus.subscribe(EventTypes.TradeClosed, async (event: any) => {
          try {
            const payload = event?.payload;
            if (!payload || !payload.symbol || payload.pnlDollars === undefined) return;
            this.correlateClosedTrade({
              brokerPositionId: payload.positionId,
              brokerOrderId: payload.tradeId,
              signalId: payload.proposalId,
              symbol: payload.symbol,
              realizedProfit: Number(payload.pnlDollars),
              pnlPips: payload.pnlPips !== undefined ? Number(payload.pnlPips) : undefined,
              direction: payload.direction as any,
              closedAt: payload.closedAt,
              dataMode: payload.isOfflineMock || payload.environment === 'SYNTHETIC' ? 'SYNTHETIC' : 'LIVE'
            });
          } catch (_) {}
        });
      }).catch(() => {});
    } catch (_) {}
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        if (raw.trim()) {
          const list: CurrencyThesisRecord[] = JSON.parse(raw);
          for (const obs of list) {
            this.observations.set(obs.id, obs);
            if (obs.signalId) this.signalToObsMap.set(obs.signalId, obs.id);
            if (obs.brokerOrderId) this.brokerOrderToObsMap.set(obs.brokerOrderId, obs.id);
            if (obs.brokerPositionId) this.brokerPosToObsMap.set(obs.brokerPositionId, obs.id);
          }
        }
      }
      this.isPersistenceHealthy = true;
    } catch (err) {
      console.error('[CurrencyThesisIntelligenceService] Failed to load disk persistence:', err);
      this.isPersistenceHealthy = false;
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.observations.values());
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(list, null, 2), 'utf-8');
      this.isPersistenceHealthy = true;
    } catch (err) {
      console.error('[CurrencyThesisIntelligenceService] Failed to write disk persistence:', err);
      this.isPersistenceHealthy = false;
    }
  }
}

export const currencyThesisIntelligenceService = CurrencyThesisIntelligenceService.getInstance();
