/**
 * Circuit Breaker Pattern for Trading Safety
 * Protects against catastrophic losses and system failures
 */

export interface CircuitBreakerConfig {
  maxDailyDrawdownPercent: number;
  maxConsecutiveLosses: number;
  maxOpenTrades: number;
  maxDrawdownDollars: number;
  minAccountBalance: number;
  tradingHoursStart: number; // UTC hour (0-23)
  tradingHoursEnd: number;   // UTC hour (0-23)
  enableWeekendTrading: boolean;
}

export interface CircuitBreakerStatus {
  state: 'OPEN' | 'CLOSED' | 'HALF_OPEN';
  reason?: string;
  triggeredAt?: Date;
  recoveryTime?: Date;
  violations: string[];
}

export class TradingCircuitBreaker {
  private config: CircuitBreakerConfig;
  private status: CircuitBreakerStatus = {
    state: 'CLOSED',
    violations: []
  };
  private dailyLosses: number = 0;
  private consecutiveLosses: number = 0;
  private peakBalance: number = 0;
  private lastResetTime: Date = new Date();

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.resetDaily();
  }

  /**
   * Check if trading is allowed
   */
  isTradeAllowed(): boolean {
    return this.status.state === 'CLOSED';
  }

  /**
   * Check if breaker is tripped
   */
  isTripped(): boolean {
    return this.status.state === 'OPEN';
  }

  /**
   * Validate before execution
   */
  validateBeforeExecution(params: {
    accountBalance: number;
    currentDrawdown: number;
    openTradeCount: number;
    consecutiveLosses: number;
    dayOfWeek: number; // 0=Sunday, 6=Saturday
    utcHour: number;
  }): { allowed: boolean; reason?: string } {
    this.status.violations = [];

    // Check if breaker is already open
    if (this.status.state === 'OPEN') {
      return { allowed: false, reason: `Circuit breaker OPEN: ${this.status.reason}` };
    }

    // Check trading hours
    if (!this.isWithinTradingHours(params.utcHour, params.dayOfWeek)) {
      this.status.violations.push(`Outside trading hours (${params.utcHour}:00 UTC)`);
      return { 
        allowed: false, 
        reason: `Outside trading hours. Market open: ${this.config.tradingHoursStart}-${this.config.tradingHoursEnd} UTC` 
      };
    }

    // Check weekend trading
    if (!this.config.enableWeekendTrading && (params.dayOfWeek === 0 || params.dayOfWeek === 6)) {
      this.status.violations.push('Weekend trading disabled');
      return { allowed: false, reason: 'Weekend trading disabled' };
    }

    // Check daily drawdown
    if (params.currentDrawdown > this.config.maxDailyDrawdownPercent) {
      this.tripBreaker(
        `Daily drawdown exceeded: ${params.currentDrawdown.toFixed(2)}% > ${this.config.maxDailyDrawdownPercent}%`
      );
      return { allowed: false, reason: this.status.reason };
    }

    // Check consecutive losses
    if (params.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.tripBreaker(
        `Consecutive losses limit exceeded: ${params.consecutiveLosses} >= ${this.config.maxConsecutiveLosses}`
      );
      return { allowed: false, reason: this.status.reason };
    }

    // Check open trades limit
    if (params.openTradeCount >= this.config.maxOpenTrades) {
      this.status.violations.push(`Max open trades reached: ${params.openTradeCount}/${this.config.maxOpenTrades}`);
      return { allowed: false, reason: 'Max open trades exceeded' };
    }

    // Check minimum account balance
    if (params.accountBalance < this.config.minAccountBalance) {
      this.tripBreaker(
        `Account balance critically low: $${params.accountBalance.toFixed(2)} < $${this.config.minAccountBalance}`
      );
      return { allowed: false, reason: this.status.reason };
    }

    // Check max drawdown in dollars
    if (this.config.maxDrawdownDollars > 0) {
      const drawdownAmount = this.peakBalance - params.accountBalance;
      if (drawdownAmount > this.config.maxDrawdownDollars) {
        this.tripBreaker(
          `Max drawdown exceeded: $${drawdownAmount.toFixed(2)} > $${this.config.maxDrawdownDollars}`
        );
        return { allowed: false, reason: this.status.reason };
      }
    }

    return { allowed: true };
  }

  /**
   * Record trade result
   */
  recordTradeResult(pnl: number, balance: number) {
    if (pnl < 0) {
      this.dailyLosses += Math.abs(pnl);
      this.consecutiveLosses++;
    } else {
      this.consecutiveLosses = 0;
    }

    this.peakBalance = Math.max(this.peakBalance, balance);
  }

  /**
   * Trip the circuit breaker
   */
  private tripBreaker(reason: string) {
    if (this.status.state !== 'OPEN') {
      console.error(`🚨 [CIRCUIT BREAKER] TRIPPED: ${reason}`);
      this.status.state = 'OPEN';
      this.status.reason = reason;
      this.status.triggeredAt = new Date();
      this.status.recoveryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour recovery
    }
  }

  /**
   * Attempt recovery
   */
  attemptRecovery(): boolean {
    if (this.status.state !== 'OPEN') return true;

    if (this.status.recoveryTime && Date.now() >= this.status.recoveryTime.getTime()) {
      console.log('🔄 [CIRCUIT BREAKER] Attempting recovery...');
      this.status.state = 'HALF_OPEN';
      return false; // Still in half-open state
    }

    return false;
  }

  /**
   * Reset breaker to closed
   */
  reset() {
    console.log('✅ [CIRCUIT BREAKER] Reset to CLOSED');
    this.status.state = 'CLOSED';
    this.status.reason = undefined;
    this.status.triggeredAt = undefined;
    this.status.recoveryTime = undefined;
    this.resetDaily();
  }

  /**
   * Reset daily counters
   */
  private resetDaily() {
    const now = new Date();
    if (this.lastResetTime.toDateString() !== now.toDateString()) {
      console.log('📅 [CIRCUIT BREAKER] Daily reset');
      this.dailyLosses = 0;
      this.consecutiveLosses = 0;
      this.peakBalance = 0;
      this.lastResetTime = now;
    }
  }

  /**
   * Check if within trading hours
   */
  private isWithinTradingHours(utcHour: number, dayOfWeek: number): boolean {
    // If trading hours wrap around midnight
    if (this.config.tradingHoursStart > this.config.tradingHoursEnd) {
      return utcHour >= this.config.tradingHoursStart || utcHour < this.config.tradingHoursEnd;
    } else {
      return utcHour >= this.config.tradingHoursStart && utcHour < this.config.tradingHoursEnd;
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): CircuitBreakerStatus {
    return { ...this.status };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      state: this.status.state,
      dailyLosses: this.dailyLosses,
      consecutiveLosses: this.consecutiveLosses,
      peakBalance: this.peakBalance,
      violations: this.status.violations
    };
  }

  /**
   * Generate safety report
   */
  generateSafetyReport(): string {
    return `
TRADING CIRCUIT BREAKER REPORT
Generated: ${new Date().toISOString()}

═══════════════════════════════════════════════════════════════════

STATUS: ${this.status.state}
${this.status.reason ? `Reason: ${this.status.reason}` : ''}
${this.status.triggeredAt ? `Triggered: ${this.status.triggeredAt.toISOString()}` : ''}
${this.status.recoveryTime ? `Recovery Time: ${this.status.recoveryTime.toISOString()}` : ''}

═══════════════════════════════════════════════════════════════════

LIMITS CONFIGURED
───────────────────────────────────────────────────────────────────
Max Daily Drawdown:        ${this.config.maxDailyDrawdownPercent}%
Max Consecutive Losses:    ${this.config.maxConsecutiveLosses}
Max Open Trades:           ${this.config.maxOpenTrades}
Max Drawdown (Dollars):    $${this.config.maxDrawdownDollars}
Minimum Balance:           $${this.config.minAccountBalance}
Trading Hours (UTC):       ${this.config.tradingHoursStart}-${this.config.tradingHoursEnd}
Weekend Trading:           ${this.config.enableWeekendTrading ? 'Enabled' : 'Disabled'}

═══════════════════════════════════════════════════════════════════

CURRENT METRICS
───────────────────────────────────────────────────────────────────
Daily Losses:              $${this.dailyLosses.toFixed(2)}
Consecutive Losses:        ${this.consecutiveLosses}
Peak Balance:              $${this.peakBalance.toFixed(2)}

Violations:                ${this.status.violations.length > 0 ? this.status.violations.join(', ') : 'None'}

═══════════════════════════════════════════════════════════════════`;
  }
}
