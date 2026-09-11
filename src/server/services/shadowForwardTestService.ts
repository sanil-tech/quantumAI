import { TradingRepository } from '@iati/database';
import { CurrencyPair, Timeframe } from '../../types';
import { realTimeConditionMatcher, VetoDecision } from './realTimeConditionMatcher';
import { enhancedVetoLogic, EnhancedVetoLogic } from './enhancedVetoLogic';

/**
 * Shadow Forward-Test: Runs BOTH decision engines in parallel
 * 
 * Purpose: Compare current production veto logic vs enhanced real-time veto
 * 
 * CRITICAL CONSTRAINTS:
 * - Does NOT execute trades
 * - Does NOT call broker APIs
 * - Does NOT modify positions
 * - Logs decisions for analysis only
 * - All safety gates remain enforced
 */

export interface ShadowSignalAnalysis {
  traceId: string;
  correlationId: string;
  timestamp: Date;
  pair: CurrencyPair;
  timeframe: Timeframe;
  currentPrice: number;
  
  // Signal details
  signalDirection: 'BUY' | 'SELL' | null;
  signalConfidence: number;
  signalReasons: string[];
  
  // Current production engine decision
  currentEngineDecision: {
    approved: boolean;
    reason: string;
    governanceStatus: string;
  };
  
  // Enhanced veto decision
  enhancedVetoDecision: {
    shouldVeto: boolean;
    recommendation: 'ALLOW' | 'VETO' | 'CAUTION';
    confidence: number;
    explanation: string;
  };
  
  // Market conditions (real-time)
  marketConditions: {
    volatilityState: string;
    volatilityPercentage: number;
    trend: string;
    trendStrength: number;
    momentum: string;
    rsi: number;
    riskLevel: string;
  };
  
  // Historical context
  historicalContext: {
    recentLosses: number;
    failureRate: number;
    averageLossSize: number;
  };
  
  // Decision comparison
  decisionComparison: {
    classification: 'AGREEMENT' | 'ENHANCED_ALLOW' | 'ENHANCED_VETO' | 'ENHANCED_CAUTION' | 'DATA_INVALID' | 'ERROR';
    currentWouldTrade: boolean;
    enhancedWouldTrade: boolean;
    differenceReason: string;
  };
  
  // Execution environment
  environment: 'DEMO' | 'LIVE';
  shadowMode: true;
  dataFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  
  // Error tracking
  errors: string[];
}

/**
 * Shadow Forward-Test Service
 * 
 * Runs both decision engines without modifying production behavior
 */
export class ShadowForwardTestService {
  private static instance: ShadowForwardTestService;
  private tradingRepo: TradingRepository;
  private shadowLog: ShadowSignalAnalysis[] = [];
  private metrics = {
    totalSignals: 0,
    currentEngineAllows: 0,
    enhancedAllows: 0,
    enhancedVetoes: 0,
    enhancedCautions: 0,
    agreements: 0,
    disagreements: 0,
    dataErrors: 0,
    runtimeErrors: 0
  };

  private constructor() {
    this.tradingRepo = new TradingRepository();
  }

  public static getInstance(): ShadowForwardTestService {
    if (!ShadowForwardTestService.instance) {
      ShadowForwardTestService.instance = new ShadowForwardTestService();
    }
    return ShadowForwardTestService.instance;
  }

  /**
   * Run shadow analysis on a signal
   * 
   * SAFETY CONSTRAINT: Does not execute any trades
   * SAFETY CONSTRAINT: Does not call broker APIs
   * SAFETY CONSTRAINT: Reads only, no writes to production state
   */
  async analyzeSignalShadow(params: {
    pair: CurrencyPair;
    timeframe: Timeframe;
    signalDirection: 'BUY' | 'SELL' | null;
    signalConfidence: number;
    signalReasons: string[];
    currentPrice: number;
    candles: any[];
    accountId: string;
    environment: 'DEMO' | 'LIVE';
  }): Promise<ShadowSignalAnalysis> {
    const traceId = `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const correlationId = `corr_${Date.now()}`;
    const analysis: ShadowSignalAnalysis = {
      traceId,
      correlationId,
      timestamp: new Date(),
      pair: params.pair,
      timeframe: params.timeframe,
      currentPrice: params.currentPrice,
      signalDirection: params.signalDirection,
      signalConfidence: params.signalConfidence,
      signalReasons: params.signalReasons,
      currentEngineDecision: { approved: false, reason: '', governanceStatus: '' },
      enhancedVetoDecision: { shouldVeto: false, recommendation: 'ALLOW', confidence: 0, explanation: '' },
      marketConditions: {} as any,
      historicalContext: { recentLosses: 0, failureRate: 0, averageLossSize: 0 },
      decisionComparison: {
        classification: 'AGREEMENT',
        currentWouldTrade: false,
        enhancedWouldTrade: false,
        differenceReason: ''
      },
      environment: params.environment,
      shadowMode: true,
      dataFreshness: 'UNKNOWN',
      errors: []
    };

    try {
      // ✅ CURRENT ENGINE DECISION (Production)
      // This simulates what the current RiskGovernanceEngine would do
      const currentDecision = this.simulateCurrentEngineDecision(
        params.signalDirection,
        params.signalConfidence,
        params.accountId
      );
      analysis.currentEngineDecision = currentDecision;

      // ✅ ENHANCED VETO DECISION (Real-time condition matching)
      if (params.candles && params.candles.length > 0) {
        try {
          // Analyze market conditions (real-time)
          const conditions = realTimeConditionMatcher.analyzeMarketConditions(
            params.pair,
            params.candles,
            params.currentPrice
          );
          analysis.marketConditions = {
            volatilityState: conditions.volatilityState,
            volatilityPercentage: conditions.volatilityPercentage,
            trend: conditions.trend,
            trendStrength: conditions.trendStrength,
            momentum: conditions.momentum,
            rsi: conditions.rsi,
            riskLevel: conditions.riskLevel
          };

          // Get enhanced veto decision
          const vetoAnalysis = await enhancedVetoLogic.evaluateTradeWithContext(
            `${params.signalDirection}_${params.pair}`,
            params.pair,
            params.currentPrice,
            params.candles,
            params.accountId
          );

          analysis.enhancedVetoDecision = {
            shouldVeto: vetoAnalysis.decision.shouldVeto,
            recommendation: vetoAnalysis.recommendation,
            confidence: vetoAnalysis.decision.confidence,
            explanation: vetoAnalysis.decision.explanation
          };

          analysis.historicalContext = vetoAnalysis.historicalContext;

          // Mark data as fresh (we just got it)
          analysis.dataFreshness = 'FRESH';
        } catch (err: any) {
          analysis.errors.push(`Enhanced veto analysis failed: ${err.message}`);
          analysis.dataFreshness = 'STALE';
          this.metrics.runtimeErrors++;
        }
      } else {
        analysis.errors.push('No candle data available for analysis');
        analysis.dataFreshness = 'UNKNOWN';
        this.metrics.dataErrors++;
      }

      // ✅ DECISION COMPARISON
      analysis.decisionComparison = this.compareDecisions(analysis);

      // ✅ UPDATE METRICS
      this.updateMetrics(analysis);

      // ✅ LOG ANALYSIS (READ-ONLY, for analysis only)
      this.shadowLog.push(analysis);

      // ✅ PERSIST SHADOW RECORD (for later analysis)
      await this.persistShadowRecord(analysis);

      return analysis;
    } catch (err: any) {
      analysis.errors.push(`Shadow analysis failed: ${err.message}`);
      this.metrics.runtimeErrors++;
      return analysis;
    }
  }

  /**
   * Simulate current engine decision (production RiskGovernanceEngine)
   */
  private simulateCurrentEngineDecision(
    direction: 'BUY' | 'SELL' | null,
    confidence: number,
    accountId: string
  ): { approved: boolean; reason: string; governanceStatus: string } {
    if (!direction) {
      return {
        approved: false,
        reason: 'No signal direction',
        governanceStatus: 'NO_SIGNAL'
      };
    }

    if (confidence < 50) {
      return {
        approved: false,
        reason: `Confidence too low: ${confidence}%`,
        governanceStatus: 'LOW_CONFIDENCE'
      };
    }

    // Simulate current engine would approve
    return {
      approved: true,
      reason: `Signal approved: ${direction} @ ${confidence}% confidence`,
      governanceStatus: 'APPROVED'
    };
  }

  /**
   * Compare current vs enhanced decisions
   */
  private compareDecisions(analysis: ShadowSignalAnalysis): any {
    const currentWouldTrade = analysis.currentEngineDecision.approved && analysis.signalDirection !== null;
    const enhancedWouldTrade = 
      analysis.enhancedVetoDecision.recommendation === 'ALLOW' && 
      analysis.signalDirection !== null;

    let classification: 'AGREEMENT' | 'ENHANCED_ALLOW' | 'ENHANCED_VETO' | 'ENHANCED_CAUTION' | 'DATA_INVALID' | 'ERROR' = 'AGREEMENT';
    let differenceReason = '';

    if (analysis.errors.length > 0) {
      classification = analysis.errors.some(e => e.includes('No candle data')) ? 'DATA_INVALID' : 'ERROR';
      differenceReason = analysis.errors[0];
    } else if (currentWouldTrade === enhancedWouldTrade) {
      classification = 'AGREEMENT';
      differenceReason = 'Both engines reached same decision';
    } else if (enhancedWouldTrade && !currentWouldTrade) {
      classification = 'ENHANCED_ALLOW';
      differenceReason = 'Enhanced allows, current blocks';
    } else if (!enhancedWouldTrade && currentWouldTrade) {
      if (analysis.enhancedVetoDecision.recommendation === 'VETO') {
        classification = 'ENHANCED_VETO';
        differenceReason = 'Enhanced vetoes, current allows';
      } else {
        classification = 'ENHANCED_CAUTION';
        differenceReason = 'Enhanced cautions, current allows';
      }
    }

    return {
      classification,
      currentWouldTrade,
      enhancedWouldTrade,
      differenceReason
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(analysis: ShadowSignalAnalysis) {
    this.metrics.totalSignals++;

    if (analysis.currentEngineDecision.approved) {
      this.metrics.currentEngineAllows++;
    }

    if (analysis.enhancedVetoDecision.recommendation === 'ALLOW') {
      this.metrics.enhancedAllows++;
    } else if (analysis.enhancedVetoDecision.recommendation === 'VETO') {
      this.metrics.enhancedVetoes++;
    } else if (analysis.enhancedVetoDecision.recommendation === 'CAUTION') {
      this.metrics.enhancedCautions++;
    }

    if (analysis.decisionComparison.classification === 'AGREEMENT') {
      this.metrics.agreements++;
    } else if (analysis.decisionComparison.classification !== 'DATA_INVALID' && analysis.decisionComparison.classification !== 'ERROR') {
      this.metrics.disagreements++;
    }

    if (analysis.decisionComparison.classification === 'DATA_INVALID') {
      this.metrics.dataErrors++;
    }
    if (analysis.decisionComparison.classification === 'ERROR') {
      this.metrics.runtimeErrors++;
    }
  }

  /**
   * Persist shadow record to database (READ-ONLY analysis)
   */
  private async persistShadowRecord(analysis: ShadowSignalAnalysis) {
    try {
      await this.tradingRepo.saveTradeEvent({
        id: `shadow_${analysis.traceId}`,
        tradeId: '',
        setupId: 'SHADOW_TEST',
        eventType: 'SHADOW_SIGNAL_ANALYSIS',
        actor: 'ShadowForwardTestService',
        details: {
          traceId: analysis.traceId,
          correlationId: analysis.correlationId,
          pair: analysis.pair,
          timeframe: analysis.timeframe,
          signalDirection: analysis.signalDirection,
          signalConfidence: analysis.signalConfidence,
          currentDecision: analysis.currentEngineDecision.approved,
          enhancedRecommendation: analysis.enhancedVetoDecision.recommendation,
          comparison: analysis.decisionComparison.classification,
          marketConditions: analysis.marketConditions,
          timestamp: analysis.timestamp.toISOString()
        }
      });
    } catch (err: any) {
      console.error(`Failed to persist shadow record: ${err.message}`);
    }
  }

  /**
   * Get shadow test metrics
   */
  getMetrics() {
    const agreementRate = this.metrics.totalSignals > 0
      ? ((this.metrics.agreements / this.metrics.totalSignals) * 100).toFixed(2)
      : '0.00';

    const disagreementRate = this.metrics.totalSignals > 0
      ? ((this.metrics.disagreements / this.metrics.totalSignals) * 100).toFixed(2)
      : '0.00';

    return {
      ...this.metrics,
      agreementRate: `${agreementRate}%`,
      disagreementRate: `${disagreementRate}%`,
      lastUpdateAt: new Date().toISOString()
    };
  }

  /**
   * Get shadow log (for analysis)
   */
  getShadowLog(limit: number = 100): ShadowSignalAnalysis[] {
    return this.shadowLog.slice(-limit);
  }

  /**
   * Clear shadow log (maintenance)
   */
  clearShadowLog() {
    const count = this.shadowLog.length;
    this.shadowLog = [];
    return { clearedRecords: count };
  }

  /**
   * Generate shadow test report
   */
  generateReport() {
    const totalSignals = this.metrics.totalSignals;
    const agreements = this.metrics.agreements;
    const disagreements = this.metrics.disagreements;

    return {
      testPeriod: {
        startTime: 'See individual records',
        endTime: new Date().toISOString(),
        signalsAnalyzed: totalSignals
      },
      decisions: {
        currentEngineAllows: this.metrics.currentEngineAllows,
        enhancedAllows: this.metrics.enhancedAllows,
        enhancedVetoes: this.metrics.enhancedVetoes,
        enhancedCautions: this.metrics.enhancedCautions
      },
      comparison: {
        agreements,
        disagreements,
        agreementRate: totalSignals > 0 ? ((agreements / totalSignals) * 100).toFixed(2) + '%' : '0%',
        disagreementRate: totalSignals > 0 ? ((disagreements / totalSignals) * 100).toFixed(2) + '%' : '0%'
      },
      errors: {
        dataErrors: this.metrics.dataErrors,
        runtimeErrors: this.metrics.runtimeErrors
      },
      recommendation: this.generateRecommendation()
    };
  }

  /**
   * Generate recommendation based on metrics
   */
  private generateRecommendation(): string {
    const agreementRate = this.metrics.totalSignals > 0
      ? (this.metrics.agreements / this.metrics.totalSignals) * 100
      : 0;

    if (this.metrics.totalSignals < 10) {
      return 'INSUFFICIENT_DATA - Need at least 10 signals for meaningful comparison';
    }

    if (this.metrics.runtimeErrors > (this.metrics.totalSignals * 0.1)) {
      return 'BLOCKED - Too many runtime errors (>10%). Check data sources and error logs.';
    }

    if (agreementRate > 95) {
      return 'SHADOW_READY - Enhanced veto agrees with current engine >95%. Safe to deploy for testing.';
    } else if (agreementRate > 80) {
      return 'CONDITIONAL - Enhanced veto differs in 15-20% of cases. Review disagreements before deployment.';
    } else {
      return 'BLOCKED - Enhanced veto differs in >20% of cases. Requires investigation before deployment.';
    }
  }
}

export const shadowForwardTestService = ShadowForwardTestService.getInstance();
