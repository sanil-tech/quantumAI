import { v4 as uuidv4 } from 'uuid';
import { CurrencyPair } from '../../types';

export interface SignalLog {
  id: string;
  timestamp: Date;
  pair: CurrencyPair;
  signal: 'BUY' | 'SELL' | 'NONE';
  confidence: number;
  indicators: {
    rsi: number;
    ema200: number;
    superTrend: string;
    smcSignal: string;
  };
  technicalReasons: string[];
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  status: 'GENERATED' | 'VALIDATED' | 'EXECUTED' | 'REJECTED' | 'TIMEOUT';
  rejectionReason?: string;
  executionResult?: {
    tradeId: string;
    executedAt: Date;
    actualEntry: number;
    slippage: number;
  };
}

/**
 * Signal Logging Service
 * Maintains complete audit trail of all signals for research and debugging
 */
export class SignalLoggingService {
  private signalLogs: Map<string, SignalLog> = new Map();
  private maxLogs = 10000; // Keep last 10k signals in memory
  private logFile = '/tmp/signal_logs.jsonl'; // Optional: stream to file

  /**
   * Log a new signal
   */
  logSignal(
    pair: CurrencyPair,
    signal: 'BUY' | 'SELL' | 'NONE',
    confidence: number,
    indicators: any,
    reasons: string[],
    entryPrice: number,
    stopLoss: number,
    takeProfit: number
  ): string {
    const id = uuidv4();

    const log: SignalLog = {
      id,
      timestamp: new Date(),
      pair,
      signal,
      confidence,
      indicators: {
        rsi: indicators.rsi || 0,
        ema200: indicators.ema200 || 0,
        superTrend: indicators.superTrend?.trend || 'UNKNOWN',
        smcSignal: indicators.smcSignal || 'NEUTRAL'
      },
      technicalReasons: reasons,
      entryPrice,
      stopLoss,
      takeProfit,
      status: 'GENERATED'
    };

    this.signalLogs.set(id, log);

    // Cleanup if too many logs
    if (this.signalLogs.size > this.maxLogs) {
      const firstKey = this.signalLogs.keys().next().value;
      this.signalLogs.delete(firstKey);
    }

    console.log(`📝 [SIGNAL LOG] ${id} - ${pair} ${signal} @ ${confidence}%`);
    return id;
  }

  /**
   * Update signal status
   */
  updateSignalStatus(
    signalId: string,
    status: SignalLog['status'],
    rejectionReason?: string,
    executionResult?: SignalLog['executionResult']
  ) {
    const log = this.signalLogs.get(signalId);
    if (!log) return;

    log.status = status;
    if (rejectionReason) log.rejectionReason = rejectionReason;
    if (executionResult) log.executionResult = executionResult;

    console.log(`📝 [SIGNAL UPDATE] ${signalId} - Status: ${status}`);
  }

  /**
   * Get signal log
   */
  getSignalLog(signalId: string): SignalLog | undefined {
    return this.signalLogs.get(signalId);
  }

  /**
   * Get all signals for a pair
   */
  getSignalsByPair(pair: CurrencyPair, limit: number = 100): SignalLog[] {
    return Array.from(this.signalLogs.values())
      .filter(log => log.pair === pair)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get signal statistics
   */
  getSignalStats(): {
    totalSignals: number;
    buySignals: number;
    sellSignals: number;
    avgConfidence: number;
    executedCount: number;
    rejectedCount: number;
    executionRate: number;
  } {
    const logs = Array.from(this.signalLogs.values());

    const buyCount = logs.filter(l => l.signal === 'BUY').length;
    const sellCount = logs.filter(l => l.signal === 'SELL').length;
    const executedCount = logs.filter(l => l.status === 'EXECUTED').length;
    const rejectedCount = logs.filter(l => l.status === 'REJECTED').length;
    const avgConfidence = logs.length > 0
      ? logs.reduce((sum, l) => sum + l.confidence, 0) / logs.length
      : 0;

    return {
      totalSignals: logs.length,
      buySignals: buyCount,
      sellSignals: sellCount,
      avgConfidence: parseFloat(avgConfidence.toFixed(2)),
      executedCount,
      rejectedCount,
      executionRate: logs.length > 0 ? (executedCount / logs.length) * 100 : 0
    };
  }

  /**
   * Get rejection analysis
   */
  getRejectionAnalysis(): {
    totalRejections: number;
    rejectionReasons: Record<string, number>;
    mostCommonReason: string;
  } {
    const logs = Array.from(this.signalLogs.values())
      .filter(l => l.status === 'REJECTED' && l.rejectionReason);

    const reasonMap: Record<string, number> = {};
    logs.forEach(log => {
      const reason = log.rejectionReason || 'UNKNOWN';
      reasonMap[reason] = (reasonMap[reason] || 0) + 1;
    });

    const mostCommon = Object.entries(reasonMap)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE';

    return {
      totalRejections: logs.length,
      rejectionReasons: reasonMap,
      mostCommonReason: mostCommon
    };
  }

  /**
   * Generate signal audit report
   */
  generateAuditReport(pair?: CurrencyPair): string {
    const logs = pair
      ? Array.from(this.signalLogs.values()).filter(l => l.pair === pair)
      : Array.from(this.signalLogs.values());

    const stats = this.getSignalStats();
    const rejections = this.getRejectionAnalysis();

    let report = `
SIGNAL AUDIT REPORT
Generated: ${new Date().toISOString()}
${pair ? `Pair: ${pair}` : 'All Pairs'}

═══════════════════════════════════════════════════════════════════

SIGNAL STATISTICS
───────────────────────────────────────────────────────────────────
Total Signals:             ${stats.totalSignals}
Buy Signals:               ${stats.buySignals}
Sell Signals:              ${stats.sellSignals}
Average Confidence:        ${stats.avgConfidence}%

Executed:                  ${stats.executedCount}
Rejected:                  ${stats.rejectedCount}
Execution Rate:            ${stats.executionRate.toFixed(2)}%

═══════════════════════════════════════════════════════════════════

REJECTION ANALYSIS
───────────────────────────────────────────────────────────────────
Total Rejections:          ${rejections.totalRejections}
Most Common Reason:        ${rejections.mostCommonReason}

Rejection Breakdown:`;

    Object.entries(rejections.rejectionReasons).forEach(([reason, count]) => {
      report += `\n  ${reason}: ${count}`;
    });

    report += `

═══════════════════════════════════════════════════════════════════

RECENT SIGNALS (Last 10)
───────────────────────────────────────────────────────────────────`;

    logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)
      .forEach(log => {
        report += `
${log.timestamp.toISOString()} | ${log.pair} | ${log.signal} @ ${log.confidence}%
  Status: ${log.status}
  Reasons: ${log.technicalReasons.join(', ')}`;
        if (log.rejectionReason) {
          report += `\n  Rejection: ${log.rejectionReason}`;
        }
      });

    report += `

═══════════════════════════════════════════════════════════════════`;

    return report;
  }

  /**
   * Clear old logs
   */
  clearOldLogs(olderThanHours: number = 24) {
    const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);
    let count = 0;

    for (const [id, log] of this.signalLogs) {
      if (log.timestamp.getTime() < cutoff) {
        this.signalLogs.delete(id);
        count++;
      }
    }

    console.log(`🗑️ [SIGNAL LOGS] Cleared ${count} old logs`);
  }
}

// Export singleton instance
export const signalLoggingService = new SignalLoggingService();
