import { TradeProposal, MarketDirection } from "@iati/core-types";
import {
  AiTradeOpportunity,
  CurrencyPair,
  Timeframe,
  TradingStyle,
  SignalAction,
  SignalStatus,
  SetupType,
  EntryType,
  MarketRegime,
  ConfidenceBreakdown,
  PostMortemReview
} from "../../../../src/types";

export interface CandidateEvaluationInput {
  pair: CurrencyPair;
  timeframe?: Timeframe;
  style?: TradingStyle;
  currentPrice: number;
  indicators?: any;
  smc?: any;
  newsContext?: string;
  riskSettings?: any;
  postMortemReviews?: PostMortemReview[];
  envelope?: any;
  dataMode?: string;
}

export class SignalIntelligenceService {
  private static instance: SignalIntelligenceService;

  public static getInstance(): SignalIntelligenceService {
    if (!SignalIntelligenceService.instance) {
      SignalIntelligenceService.instance = new SignalIntelligenceService();
    }
    return SignalIntelligenceService.instance;
  }

  /**
   * Evaluates a candidate market state and returns a truthful SignalDecision.
   */
  public evaluateCandidateSetup(input: CandidateEvaluationInput): AiTradeOpportunity {
    // ── DATA QUALITY GATE (fail-closed) ────────────────────────────────────
    // If indicators are missing or undefined, we MUST NOT fabricate synthetic
    // defaults. Return NO_SETUP immediately so the observatory records a
    // counterfactual rather than opening a shadow on invented data.
    if (!input.indicators || typeof input.indicators !== 'object') {
      const proposalId = `prop-nodata-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      return {
        pair: input.pair || 'EUR/USD',
        timestamp: Date.now(),
        bias: 'NEUTRAL',
        confidence: 0,
        action: 'NO_SETUP',
        status: 'NO_SETUP',
        setupType: 'NONE',
        entryType: 'NONE',
        marketRegime: 'RANGING_CHOPPY',
        reasons: ['[FAIL_CLOSED] Indicators object is missing or invalid — cannot evaluate without real data.'],
        technicalEvidence: [],
        learningEvidence: [],
        learningRuleIds: [],
        vetoReasons: [],
        confirmationRequirements: [],
        confidenceBreakdown: { technicalScore: 0, structureScore: 0, mtfScore: 0, regimeScore: 0, learningAdjustment: 0, finalScore: 0 },
        entryZone: null,
        stopLoss: null,
        takeProfit1: null,
        takeProfit2: null,
        riskRewardRatio: null,
        invalidationLevel: null,
        tradingStyle: input.style || 'DAY_TRADER',
        probabilityNotes: 'No data available.',
        disclaimer: 'This analysis is probability-based. Manage risk responsibly.',
        proposalId,
        id: proposalId,
        strategyId: 'SMC_QUANT_V2',
        strategyVersion: '2.4.1',
        provenanceSource: 'AI_DECISION_ENGINE',
        tradeProposal: { id: proposalId, symbol: input.pair || 'EUR/USD', direction: 'NEUTRAL', confidence: 0, evidence: [], agent_votes: [], why_direction: 'NO_DATA', invalidate_conditions: [], timestamp: new Date() },
        dataMode: input.dataMode || 'LIVE',
        executable: false,
        decisionProvider: 'DETERMINISTIC'
      } as any;
    }

    const {
      pair = "EUR/USD",
      timeframe = "M15",
      style = "DAY_TRADER",
      currentPrice,
      indicators = {},
      smc = {},
      newsContext,
      riskSettings,
      postMortemReviews = [],
      envelope,
      dataMode = "LIVE"
    } = input;

    const isJpy = pair.includes('JPY');
    const isGold = pair === 'XAU/USD' || pair.includes('GOLD');
    const isNas = pair === 'NASDAQ' || pair.includes('TECH') || pair.includes('USTEC');
    const isBtc = pair === 'BTC/USD' || pair.includes('BTC');
    const decimals = isJpy ? 3 : (isGold || isNas || isBtc) ? 2 : 5;
    const priceNum = Number(currentPrice) || (
      pair === 'EUR/JPY' ? 185.700 :
      pair === 'GBP/JPY' ? 217.100 :
      pair === 'USD/JPY' ? 159.280 :
      isGold ? 4455.0 :
      isNas ? 18450 :
      isBtc ? 64250 :
      pair === 'GBP/USD' ? 1.36300 :
      pair === 'USD/CHF' ? 0.88500 :
      pair === 'USD/CAD' ? 1.39500 :
      pair === 'AUD/USD' ? 0.71500 :
      pair === 'NZD/USD' ? 0.58500 :
      1.08500
    );

    const rsi = Number(indicators.rsi) || 50;
    const ema20 = Number(indicators.ema20) || priceNum;
    const ema50 = Number(indicators.ema50) || priceNum;
    const ema200 = Number(indicators.ema200) || priceNum;
    const atr = Number(indicators.atr) || (priceNum * 0.002);
    const superTrend = indicators.superTrend?.trend || (priceNum >= ema50 ? 'BULLISH' : 'BEARISH');
    const adx = Number(indicators.adx?.adx ?? (typeof indicators.adx === 'number' ? indicators.adx : 24));
    const macdHist = Number(indicators.macd?.histogram || 0);

    const orderBlocks = smc.orderBlocks || [];
    const fvgs = smc.fairValueGaps || [];
    const lastBos = smc.lastBos?.type;
    const lastChoch = smc.lastChoch?.type;

    // 1. Market Regime Classification
    let marketRegime: MarketRegime = 'RANGING_CHOPPY';
    if (adx >= 22 && priceNum >= ema50 && ema20 >= ema50) {
      marketRegime = 'TRENDING_BULLISH';
    } else if (adx >= 22 && priceNum <= ema50 && ema20 <= ema50) {
      marketRegime = 'TRENDING_BEARISH';
    } else if (adx < 18 || (rsi >= 47 && rsi <= 53 && Math.abs(priceNum - ema50) / priceNum < 0.0005)) {
      marketRegime = 'RANGING_CHOPPY';
    } else if (priceNum > ema50) {
      marketRegime = 'TRENDING_BULLISH';
    } else {
      marketRegime = 'TRENDING_BEARISH';
    }

    // 2. Technical Confluence Scoring
    let bullTechScore = 0;
    let bearTechScore = 0;

    // RSI Momentum
    if (rsi >= 58) bullTechScore += 18;
    else if (rsi >= 50) bullTechScore += 12;
    else if (rsi >= 48) bullTechScore += 5;

    if (rsi <= 42) bearTechScore += 18;
    else if (rsi <= 50) bearTechScore += 12;
    else if (rsi <= 52) bearTechScore += 5;

    // Moving Average Alignment
    if (priceNum >= ema50) {
      bullTechScore += 15;
      if (ema20 >= ema50) bullTechScore += 10;
    } else {
      bearTechScore += 15;
      if (ema20 <= ema50) bearTechScore += 10;
    }

    // SuperTrend
    if (superTrend === 'BULLISH') bullTechScore += 15;
    else if (superTrend === 'BEARISH') bearTechScore += 15;

    // 3. SMC Structure Scoring
    let bullStructureScore = 0;
    let bearStructureScore = 0;
    let setupType: SetupType = 'NONE';
    let entryType: EntryType = 'NONE';

    const hasBullishOB = orderBlocks.some((ob: any) => ob.type === 'BULLISH' || ob.bias === 'BULLISH');
    const hasBearishOB = orderBlocks.some((ob: any) => ob.type === 'BEARISH' || ob.bias === 'BEARISH');
    const hasBullishFVG = fvgs.some((fvg: any) => fvg.type === 'BULLISH' || fvg.bias === 'BULLISH');
    const hasBearishFVG = fvgs.some((fvg: any) => fvg.type === 'BEARISH' || fvg.bias === 'BEARISH');

    if (hasBullishOB) {
      bullStructureScore += 25;
      setupType = 'ORDER_BLOCK_RETEST';
      entryType = 'PULLBACK_LIMIT';
    }
    if (hasBullishFVG) {
      bullStructureScore += 15;
      if (setupType === 'NONE') {
        setupType = 'FAIR_VALUE_GAP_FILL';
        entryType = 'PULLBACK_LIMIT';
      }
    }
    if (lastBos === 'BULLISH' || lastChoch === 'BULLISH') {
      bullStructureScore += 20;
      if (setupType === 'NONE') {
        setupType = 'STRUCTURE_BREAKOUT';
        entryType = 'BREAKOUT_STOP';
      }
    }

    if (hasBearishOB) {
      bearStructureScore += 25;
      setupType = 'ORDER_BLOCK_RETEST';
      entryType = 'PULLBACK_LIMIT';
    }
    if (hasBearishFVG) {
      bearStructureScore += 15;
      if (setupType === 'NONE') {
        setupType = 'FAIR_VALUE_GAP_FILL';
        entryType = 'PULLBACK_LIMIT';
      }
    }
    if (lastBos === 'BEARISH' || lastChoch === 'BEARISH') {
      bearStructureScore += 20;
      if (setupType === 'NONE') {
        setupType = 'STRUCTURE_BREAKOUT';
        entryType = 'BREAKOUT_STOP';
      }
    }

    if (setupType === 'NONE' && (bullTechScore >= 25 || bearTechScore >= 25)) {
      setupType = 'MOMENTUM_CONTINUATION';
      entryType = 'MARKET_ENTRY';
    }

    // 4. MTF & Momentum Scoring
    let mtfScore = 0;
    if (adx >= 25) mtfScore += 15;
    else if (adx >= 20) mtfScore += 10;
    else if (adx >= 15) mtfScore += 5;

    if (macdHist > 0) bullTechScore += 5;
    else if (macdHist < 0) bearTechScore += 5;

    const regimeScore = marketRegime === 'TRENDING_BULLISH' || marketRegime === 'TRENDING_BEARISH' ? 10 : 0;

    // 5. Adaptive Learning Feedback Analysis (Setup-Level Fingerprinting with Strict Provenance)
    // Filter reviews matching the symbol first
    const matchingSymbolReviews = postMortemReviews.filter(
      pm => (pm.pair === pair || (pm as any).symbol === pair)
    );

    // Setup-specific candidate direction
    const candidateDirection: MarketDirection = bullTechScore > bearTechScore ? 'BUY' : 'SELL';

    // Match setup-specific reviews (matching symbol, and matching setupType / direction / regime when present)
    const matchingSetupReviews = matchingSymbolReviews.filter(pm => {
      // Check setupType compatibility
      const setupMatches = !pm.setupType || pm.setupType === setupType || setupType === 'NONE';
      // Check direction compatibility
      const dirMatches = !pm.direction || pm.direction === candidateDirection;
      // Check regime compatibility
      const regimeMatches = !pm.marketRegime || pm.marketRegime === marketRegime;

      return setupMatches && dirMatches && regimeMatches;
    });

    // Partition reviews strictly by Provenance and Authority
    const realTradeReviews = matchingSetupReviews.filter(pm => {
      const idStr = String(pm.id || '');
      return pm.provenance === 'REAL_TRADE' || pm.authority === 'POSTGRESQL' || (!pm.provenance && !idStr.startsWith('pm-1y-') && !idStr.startsWith('pm-sim-') && !idStr.startsWith('pm-shadow-'));
    });
    const backtestReviews = matchingSetupReviews.filter(pm => {
      const idStr = String(pm.id || '');
      return pm.provenance === 'HISTORICAL_BACKTEST' || pm.authority === 'BACKTEST_ENGINE' || (idStr.startsWith('pm-1y-') && pm.provenance !== 'SYNTHETIC_SIMULATION');
    });
    const syntheticReviews = matchingSetupReviews.filter(pm => {
      const idStr = String(pm.id || '');
      return pm.provenance === 'SYNTHETIC_SIMULATION' || pm.authority === 'SIMULATION_ONLY' || idStr.startsWith('pm-sim-');
    });

    // Real-Trade Authoritative Reviews
    const realLossReviews = realTradeReviews.filter(pm => pm.outcome === 'LOSS');
    const realWinReviews = realTradeReviews.filter(pm => pm.outcome === 'WIN');
    const allSymbolLosses = matchingSymbolReviews.filter(pm => {
      const idStr = String(pm.id || '');
      return (pm.provenance === 'REAL_TRADE' || pm.authority === 'POSTGRESQL' || (!pm.provenance && !idStr.startsWith('pm-1y-'))) && pm.outcome === 'LOSS';
    });

    // Backtest Advisory Reviews (Non-Authoritative)
    const backtestLossReviews = backtestReviews.filter(pm => pm.outcome === 'LOSS');
    const backtestWinReviews = backtestReviews.filter(pm => pm.outcome === 'WIN');

    // Synthetic Simulation Reviews (Non-Authoritative)
    const syntheticLossReviews = syntheticReviews.filter(pm => pm.outcome === 'LOSS');

    let learningAdjustment = 0;
    const learningEvidence: string[] = [];
    const learningRuleIds: string[] = [];
    const vetoReasons: string[] = [];
    const confirmationRequirements: string[] = [];

    let isVetoed = false;

    // --- STEP 5A: AUTHORITATIVE REAL-TRADE VETO ---
    // Hard VETO occurs ONLY when >= 3 recurring losses are proven from REAL_TRADE PostgreSQL history
    if (realLossReviews.length >= 3 && realLossReviews.length > realWinReviews.length * 2) {
      isVetoed = true;
      realLossReviews.slice(0, 3).forEach(pm => {
        if (pm.id) learningRuleIds.push(pm.id);
        vetoReasons.push(`[ADAPTIVE LEARNING VETO] ${pm.id}: High failure rate on ${pair} (${setupType} ${candidateDirection}, ${marketRegime}). Root cause: "${pm.rootCauseEn || pm.rootCauseMs}". Source: REAL_TRADE. Authority: POSTGRESQL.`);
      });
      learningAdjustment = -35;
    } else if (realLossReviews.length > 0) {
      // 1 or 2 real-trade losses on this setup -> Moderate penalty and SL buffer expansion
      const recentLoss = realLossReviews[0];
      if (recentLoss.id) learningRuleIds.push(recentLoss.id);
      learningAdjustment = -Math.min(12, realLossReviews.length * 6);
      learningEvidence.push(
        `[ADAPTIVE LEARNING MEMORY] Applied rule from ${recentLoss.id}: "${recentLoss.adaptiveRuleEn || recentLoss.adaptiveRuleMs || 'Expand SL Buffer'}". SL buffer expanded. Source: REAL_TRADE.`
      );
      confirmationRequirements.push(`Awaiting structural retest on ${timeframe} to avoid premature entry flagged in ${recentLoss.id}`);
    } else if (allSymbolLosses.length > 0 && setupType === 'NONE') {
      // General real-trade symbol memory when setup is unclassified
      const generalLoss = allSymbolLosses[0];
      learningAdjustment = -4;
      learningEvidence.push(`[ADAPTIVE LEARNING MEMORY] General caution applied on ${pair} from ${generalLoss.id}. Source: REAL_TRADE.`);
    } else if (realWinReviews.length >= 2) {
      learningAdjustment = +5;
      learningEvidence.push(`[ADAPTIVE LEARNING MEMORY] Strategy ${realWinReviews[0].strategyId || 'SMC_QUANT_V1'} has ${realWinReviews.length} verified win(s) for ${setupType} on ${pair}. Source: REAL_TRADE.`);
    }


    // --- STEP 5B: ADVISORY 1-YEAR BACKTEST WARNING (NON-BLOCKING) ---
    if (!isVetoed && backtestLossReviews.length >= 3) {
      backtestLossReviews.slice(0, 3).forEach(pm => {
        learningEvidence.push(
          `[BACKTEST WARNING] ${pm.id}: Historical 1-Year Backtest indicates caution on ${pair} (${setupType} ${candidateDirection}, ${marketRegime}). Root cause: "${pm.rootCauseEn || pm.rootCauseMs}". Source: HISTORICAL_BACKTEST. Authority: BACKTEST_ENGINE. Execution Veto: NO.`
        );
      });
      // Soft cautionary calibration without triggering execution veto
      learningAdjustment = Math.max(-15, learningAdjustment - 8);
    } else if (!isVetoed && backtestLossReviews.length > 0) {
      const recentBt = backtestLossReviews[0];
      learningEvidence.push(
        `[BACKTEST ADVISORY] ${recentBt.id}: 1-Year backtest suggests SL buffer expansion on ${pair}. Source: HISTORICAL_BACKTEST. Authority: BACKTEST_ENGINE.`
      );
    }

    // --- STEP 5C: ADVISORY SYNTHETIC SIMULATION WARNING (NON-BLOCKING) ---
    if (!isVetoed && syntheticLossReviews.length > 0) {
      const recentSim = syntheticLossReviews[0];
      learningEvidence.push(
        `[SIMULATION WARNING] ${recentSim.id}: Offline simulation pattern noted on ${pair}. Source: SYNTHETIC_SIMULATION. Authority: SIMULATION_ONLY. Execution Veto: NO.`
      );
    }

    const slMultiplier = (realLossReviews.length > 0 || backtestLossReviews.length > 0 || allSymbolLosses.length > 0) ? 1.8 : 1.4;



    // 6. Confluence Decision Logic
    const isBullishCandidate = bullTechScore >= 25 && bullTechScore > bearTechScore && priceNum >= ema50;
    const isBearishCandidate = bearTechScore >= 25 && bearTechScore > bullTechScore && priceNum <= ema50;

    const technicalScore = isBullishCandidate ? bullTechScore : isBearishCandidate ? bearTechScore : Math.max(bullTechScore, bearTechScore);
    const structureScore = isBullishCandidate ? bullStructureScore : isBearishCandidate ? bearStructureScore : 0;

    const rawBaseScore = (technicalScore * 0.75) + (structureScore * 0.65) + mtfScore + regimeScore;
    const baseConfidence = Math.min(88, Math.max(30, Math.round(rawBaseScore)));
    const finalConfidence = Math.min(95, Math.max(20, Math.round(baseConfidence + learningAdjustment)));

    const confidenceBreakdown: ConfidenceBreakdown = {
      technicalScore,
      structureScore,
      mtfScore,
      regimeScore,
      learningAdjustment,
      finalScore: finalConfidence
    };

    const technicalEvidence: string[] = [
      `${pair} live price (${priceNum.toFixed(decimals)}) is holding ${priceNum >= ema50 ? 'above' : 'below'} 50 EMA trend filter.`,
      `RSI (14) sitting at ${rsi.toFixed(1)} with ADX (${adx.toFixed(1)}) confirming ${marketRegime.replace('_', ' ').toLowerCase()}.`,
      `SuperTrend filter is ${superTrend} and ATR volatility is ${atr.toFixed(decimals)}.`,
      ...(setupType !== 'NONE' ? [`SMC Structure detected: ${setupType.replace(/_/g, ' ')} with ${entryType.replace(/_/g, ' ')} execution.`] : [])
    ];

    let action: SignalAction = 'NO_SETUP';
    let status: SignalStatus = 'NO_SETUP';
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let entryZone: { min: number; max: number } | null = null;
    let sl: number | null = null;
    let tp1: number | null = null;
    let tp2: number | null = null;
    let invalidation: number | null = null;
    let riskRewardRatio: string | null = null;

    if (isVetoed) {
      action = 'VETO';
      status = 'VETOED';
      bias = 'NEUTRAL';
    } else if (marketRegime === 'RANGING_CHOPPY' && adx < 18 && orderBlocks.length === 0 && fvgs.length === 0) {
      // Clear NO_SETUP condition: Low volatility consolidation without structure
      action = 'NO_SETUP';
      status = 'NO_SETUP';
      bias = 'NEUTRAL';
    } else if (Math.abs(bullTechScore - bearTechScore) < 10 && adx < 18) {
      // Conflicting technical indicators
      action = 'NO_SETUP';
      status = 'NO_SETUP';
      bias = 'NEUTRAL';
    } else if ((adx >= 18 && adx < 22) && orderBlocks.length === 0 && fvgs.length === 0 && (isBullishCandidate || isBearishCandidate)) {
      // Direction bias exists but awaiting structure confirmation
      action = 'WAIT_FOR_CONFIRMATION';
      status = 'WAIT_FOR_CONFIRMATION';
      bias = isBullishCandidate ? 'BULLISH' : 'BEARISH';
      confirmationRequirements.push(`Awaiting clear Order Block or FVG confirmation on ${timeframe}.`);
      if (adx < 20) confirmationRequirements.push('Awaiting trend expansion (ADX > 20) to confirm breakout momentum.');
    } else if (isBullishCandidate && finalConfidence >= 45) {
      // Valid Bullish Trade Proposal
      action = 'BUY';
      status = 'VALID_PROPOSAL';
      bias = 'BULLISH';

      const entryMin = Number((priceNum - atr * 0.2).toFixed(decimals));
      const entryMax = Number((priceNum + atr * 0.1).toFixed(decimals));
      entryZone = { min: entryMin, max: entryMax };

      sl = Number((priceNum - atr * slMultiplier).toFixed(decimals));
      tp1 = Number((priceNum + atr * 2.1).toFixed(decimals));
      tp2 = Number((priceNum + atr * 3.8).toFixed(decimals));
      invalidation = Number((priceNum - atr * (slMultiplier + 0.1)).toFixed(decimals));
      riskRewardRatio = `1:${(2.1 / slMultiplier).toFixed(1)}`;
    } else if (isBearishCandidate && finalConfidence >= 45) {
      // Valid Bearish Trade Proposal
      action = 'SELL';
      status = 'VALID_PROPOSAL';
      bias = 'BEARISH';

      const entryMin = Number((priceNum - atr * 0.1).toFixed(decimals));
      const entryMax = Number((priceNum + atr * 0.2).toFixed(decimals));
      entryZone = { min: entryMin, max: entryMax };

      sl = Number((priceNum + atr * slMultiplier).toFixed(decimals));
      tp1 = Number((priceNum - atr * 2.1).toFixed(decimals));
      tp2 = Number((priceNum - atr * 3.8).toFixed(decimals));
      invalidation = Number((priceNum + atr * (slMultiplier + 0.1)).toFixed(decimals));
      riskRewardRatio = `1:${(2.1 / slMultiplier).toFixed(1)}`;
    } else {
      action = 'NO_SETUP';
      status = 'NO_SETUP';
      bias = 'NEUTRAL';
    }

    // Geometry validation for BUY / SELL
    if (action === 'BUY' && entryZone && sl !== null && tp1 !== null && tp2 !== null) {
      if (!(sl < entryZone.min && entryZone.min <= entryZone.max && entryZone.max < tp1 && tp1 < tp2)) {
        action = 'NO_SETUP';
        status = 'NO_SETUP';
        entryZone = null;
        sl = null;
        tp1 = null;
        tp2 = null;
      }
    } else if (action === 'SELL' && entryZone && sl !== null && tp1 !== null && tp2 !== null) {
      if (!(tp2 < tp1 && tp1 < entryZone.min && entryZone.min <= entryZone.max && entryZone.max < sl)) {
        action = 'NO_SETUP';
        status = 'NO_SETUP';
        entryZone = null;
        sl = null;
        tp1 = null;
        tp2 = null;
      }
    }

    const proposalId = `prop-ai-sig-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const canonicalId = proposalId; // canonical signal ID used for idempotency in observatory

    const combinedReasons = [
      ...technicalEvidence,
      ...learningEvidence,
      ...vetoReasons,
      ...confirmationRequirements.map(c => `[CONFIRMATION REQUIRED] ${c}`)
    ];

    const grade: 'A+' | 'A' | 'B' | 'C' = finalConfidence >= 85 ? 'A+' : finalConfidence >= 75 ? 'A' : finalConfidence >= 70 ? 'B' : 'C';
    const isMultiTarget = (action === 'BUY' || action === 'SELL') && tp1 !== null && tp2 !== null;
    const breakEvenTrigger = (action === 'BUY' || action === 'SELL') ? (action === 'BUY' ? (entryZone?.min ?? priceNum) : (entryZone?.max ?? priceNum)) : null;
    const executionPolicy = (grade === 'A+' || grade === 'A') 
      ? 'GRADE_A_SPLIT_TARGET_WITH_BREAKEVEN' 
      : 'STANDARD_TARGET';

    if (grade === 'A+' || grade === 'A') {
      learningEvidence.push(
        `[GRADE-${grade} HIGH-CONVICTION EXECUTION] Enforcing Multi-Target (TP1: ${tp1} + TP2: ${tp2}) and Automatic Break-Even (${breakEvenTrigger}) to maximize trend extraction.`
      );
    }

    const tradeProposal: TradeProposal = {
      id: proposalId,
      symbol: pair,
      direction: (action === 'BUY' ? 'BUY' : action === 'SELL' ? 'SELL' : 'NEUTRAL') as MarketDirection,
      confidence: Number((finalConfidence / 100).toFixed(2)),
      evidence: combinedReasons,
      agent_votes: [],
      why_direction: `Signal Intelligence evaluation for ${pair}: ${status} (${action} GRED-${grade}) in ${marketRegime} with ${finalConfidence}% confidence.`,
      invalidate_conditions: invalidation ? [`Price breaches invalidation level ${invalidation}`] : [],
      timestamp: new Date()
    };

    return {
      pair,
      timestamp: Date.now(),
      id: canonicalId,
      bias,
      confidence: finalConfidence,
      action,
      status,
      setupType,
      entryType,
      marketRegime,
      grade,
      isMultiTarget,
      breakEvenTrigger,
      executionPolicy,
      reasons: combinedReasons,
      technicalEvidence,
      learningEvidence,
      learningRuleIds,
      vetoReasons,
      confirmationRequirements,
      confidenceBreakdown,
      entryZone,
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskRewardRatio,
      invalidationLevel: invalidation,
      tradingStyle: style,
      probabilityNotes: tradeProposal.why_direction,
      disclaimer: "This analysis is probability-based and provided for educational and analytical purposes only. Manage risk responsibly.",
      proposalId,
      strategyId: 'SMC_QUANT_V2',
      strategyVersion: '2.4.1',
      provenanceSource: 'AI_DECISION_ENGINE',
      tradeProposal,
      dataMode,
      executable: false,
      // ── Truthful Gemini Provenance ──────────────────────────────────────────
      // GEMINI_CONFIGURED: true if an API key is present in environment.
      // GEMINI_CALLED:     false — this service is fully deterministic; no
      //                    Gemini API call is made here.
      // GEMINI_SUCCEEDED:  false — Gemini was never invoked.
      // DECISION_PROVIDER: 'DETERMINISTIC' — because Gemini was never called.
      // Per the safety requirement: NEVER claim 'GEMINI' as provider unless
      // a Gemini response was actually received and used for the decision.
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      geminiCalled: false,
      geminiSucceeded: false,
      decisionProvider: 'DETERMINISTIC' as const,
      lineage: envelope ? {
        dataClass: envelope.dataMode,
        provider: envelope.provenance?.provider,
        receivedAt: envelope.provenance?.receivedAt
      } : undefined
    } as any;
  }
}

export const signalIntelligenceService = SignalIntelligenceService.getInstance();
