import { TradingRepository, PositionRecord } from '@iati/database';
import { CurrencyPair } from '../../types';

export interface PerformanceMetrics {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  totalPnlDollars: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  largestWin: number;
  largestLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  drawdownPercent: number;
  expectancy: number;
  riskRewardRatio: number;
}

export interface PairPerformance {
  pair: CurrencyPair;
  trades: number;
  winRate: number;
  pnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export interface DailyPerformance {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number;
}

export class TradingAnalyticsService {
  private tradingRepo: TradingRepository;

  constructor() {
    this.tradingRepo = new TradingRepository();
  }

  /**
   * Calculate comprehensive performance metrics
   */
  async calculateMetrics(accountId: string): Promise<PerformanceMetrics> {
    const positions = await this.tradingRepo.getClosedPositions(accountId, 10000);

    if (positions.length === 0) {
      return this.getEmptyMetrics();
    }

    const pnls = positions.map(p => p.realizedProfit || 0);
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);

    const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + p, 0) / losses.length : 0;
    const profitFactor = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : (avgWin > 0 ? 999 : 0);

    // Consecutive wins/losses
    let consWins = 0, consLosses = 0, maxConsWins = 0, maxConsLosses = 0;
    for (const p of positions) {
      if ((p.realizedProfit || 0) > 0) {
        consWins++;
        maxConsWins = Math.max(maxConsWins, consWins);
        consLosses = 0;
      } else {
        consLosses++;
        maxConsLosses = Math.max(maxConsLosses, consLosses);
        consWins = 0;
      }
    }

    // Sharpe Ratio (simplified: assuming 0% risk-free rate)
    const returns = pnls.map(p => p / 1000); // Normalize to % of $1000
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Max Drawdown
    let peak = 0;
    let maxDD = 0;
    let runningPnl = 0;
    for (const p of pnls) {
      runningPnl += p;
      peak = Math.max(peak, runningPnl);
      maxDD = Math.max(maxDD, peak - runningPnl);
    }
    const drawdownPercent = peak > 0 ? (maxDD / peak) * 100 : 0;

    // Expectancy
    const expectancy = (wins.length / positions.length) * avgWin + (losses.length / positions.length) * avgLoss;

    // Risk/Reward Ratio
    const riskRewardRatio = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 0;

    return {
      totalTrades: positions.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRatePercent: (wins.length / positions.length) * 100,
      totalPnlDollars: totalPnl,
      averageWin: avgWin,
      averageLoss: avgLoss,
      profitFactor,
      consecutiveWins: maxConsWins,
      consecutiveLosses: maxConsLosses,
      largestWin: Math.max(...pnls, 0),
      largestLoss: Math.min(...pnls, 0),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      maxDrawdown: maxDD,
      drawdownPercent: parseFloat(drawdownPercent.toFixed(2)),
      expectancy: parseFloat(expectancy.toFixed(2)),
      riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2))
    };
  }

  /**
   * Performance by pair
   */
  async getPerformanceByPair(accountId: string): Promise<PairPerformance[]> {
    const positions = await this.tradingRepo.getClosedPositions(accountId, 10000);

    const pairMap = new Map<CurrencyPair, PositionRecord[]>();
    positions.forEach(p => {
      const pair = p.symbol as CurrencyPair;
      if (!pairMap.has(pair)) pairMap.set(pair, []);
      pairMap.get(pair)!.push(p);
    });

    const results: PairPerformance[] = [];
    for (const [pair, trades] of pairMap) {
      const pnls = trades.map(t => t.realizedProfit || 0);
      const wins = pnls.filter(p => p > 0);
      const losses = pnls.filter(p => p < 0);
      const totalPnl = pnls.reduce((s, p) => s + p, 0);
      const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + p, 0) / losses.length : 0;

      results.push({
        pair,
        trades: trades.length,
        winRate: (wins.length / trades.length) * 100,
        pnl: totalPnl,
        avgWin,
        avgLoss,
        profitFactor: Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : (avgWin > 0 ? 999 : 0)
      });
    }

    return results.sort((a, b) => b.pnl - a.pnl);
  }

  /**
   * Daily performance breakdown
   */
  async getDailyPerformance(accountId: string, days: number = 30): Promise<DailyPerformance[]> {
    const positions = await this.tradingRepo.getClosedPositions(accountId, 10000);

    const dailyMap = new Map<string, PositionRecord[]>();
    positions.forEach(p => {
      const date = new Date(p.closedAt || p.openedAt || new Date());
      const dateStr = date.toISOString().split('T')[0];
      if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, []);
      dailyMap.get(dateStr)!.push(p);
    });

    const results: DailyPerformance[] = [];
    for (const [date, trades] of dailyMap) {
      const pnls = trades.map(t => t.realizedProfit || 0);
      const wins = pnls.filter(p => p > 0).length;
      const losses = pnls.filter(p => p < 0).length;
      const totalPnl = pnls.reduce((s, p) => s + p, 0);

      results.push({
        date,
        trades: trades.length,
        wins,
        losses,
        pnl: totalPnl,
        winRate: (wins / trades.length) * 100
      });
    }

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, days);
  }

  /**
   * Export trades as CSV
   */
  async exportAsCSV(accountId: string): Promise<string> {
    const positions = await this.tradingRepo.getClosedPositions(accountId, 10000);

    const headers = ['Symbol', 'Direction', 'Entry Price', 'Exit Price', 'P&L', 'Pips', 'Opened At', 'Closed At', 'Close Reason'];
    const rows = positions.map(p => [
      p.symbol,
      p.direction,
      p.entryPrice.toFixed(5),
      (p.closePrice || p.currentPrice).toFixed(5),
      (p.realizedProfit || 0).toFixed(2),
      (p.pnlPips || 0).toFixed(0),
      new Date(p.openedAt || new Date()).toISOString(),
      new Date(p.closedAt || new Date()).toISOString(),
      p.closeReason || 'UNKNOWN'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    return csv;
  }

  /**
   * Generate performance report
   */
  async generateReport(accountId: string): Promise<string> {
    const metrics = await this.calculateMetrics(accountId);
    const pairPerf = await this.getPerformanceByPair(accountId);
    const dailyPerf = await this.getDailyPerformance(accountId, 7);

    let report = `
TRADING PERFORMANCE REPORT
Generated: ${new Date().toISOString()}

═══════════════════════════════════════════════════════════════════

OVERALL METRICS
───────────────────────────────────────────────────────────────────
Total Trades:              ${metrics.totalTrades}
Wins:                      ${metrics.winCount}
Losses:                    ${metrics.lossCount}
Win Rate:                  ${metrics.winRatePercent.toFixed(2)}%

P&L:                       $${metrics.totalPnlDollars.toFixed(2)}
Average Win:               $${metrics.averageWin.toFixed(2)}
Average Loss:              $${metrics.averageLoss.toFixed(2)}
Largest Win:               $${metrics.largestWin.toFixed(2)}
Largest Loss:              $${metrics.largestLoss.toFixed(2)}

Profit Factor:             ${metrics.profitFactor.toFixed(2)}
Risk/Reward Ratio:         ${metrics.riskRewardRatio.toFixed(2)}
Expectancy:                $${metrics.expectancy.toFixed(2)}

Consecutive Wins:          ${metrics.consecutiveWins}
Consecutive Losses:        ${metrics.consecutiveLosses}

Sharpe Ratio:              ${metrics.sharpeRatio.toFixed(2)}
Max Drawdown:              $${metrics.maxDrawdown.toFixed(2)} (${metrics.drawdownPercent.toFixed(2)}%)

═══════════════════════════════════════════════════════════════════

PERFORMANCE BY PAIR
───────────────────────────────────────────────────────────────────`;

    pairPerf.forEach(p => {
      report += `
${p.pair}
  Trades:                 ${p.trades}
  Win Rate:               ${p.winRate.toFixed(2)}%
  P&L:                    $${p.pnl.toFixed(2)}
  Avg Win:                $${p.avgWin.toFixed(2)}
  Avg Loss:               $${p.avgLoss.toFixed(2)}
  Profit Factor:          ${p.profitFactor.toFixed(2)}`;
    });

    report += `

═══════════════════════════════════════════════════════════════════

LAST 7 DAYS
───────────────────────────────────────────────────────────────────`;

    dailyPerf.forEach(d => {
      report += `
${d.date}
  Trades: ${d.trades} (${d.wins}W/${d.losses}L)
  P&L: $${d.pnl.toFixed(2)} | Win Rate: ${d.winRate.toFixed(2)}%`;
    });

    report += `

═══════════════════════════════════════════════════════════════════`;

    return report;
  }

  /**
   * Empty metrics template
   */
  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRatePercent: 0,
      totalPnlDollars: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      largestWin: 0,
      largestLoss: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      drawdownPercent: 0,
      expectancy: 0,
      riskRewardRatio: 0
    };
  }
}
