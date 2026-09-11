import { AutonomousTradeExecutor } from './autonomousTradeExecutor';
import { CurrencyPair, Timeframe } from '../../types';

export interface MultiPairConfig {
  pairs: Array<{
    pair: CurrencyPair;
    timeframe: Timeframe;
    maxOpenTrades: number;
    riskPercent: number;
    minConfidence: number;
  }>;
  accountId: string;
  enabled: boolean;
}

/**
 * Multi-pair executor manages multiple autonomous traders
 * Each pair runs independently with its own executor instance
 */
export class MultiPairAutonomousExecutor {
  private executors = new Map<string, AutonomousTradeExecutor>();
  private config: MultiPairConfig;
  private isRunning = false;

  constructor(config: MultiPairConfig) {
    this.config = config;
    this.initializeExecutors();
  }

  /**
   * Initialize executor for each pair
   */
  private initializeExecutors() {
    this.config.pairs.forEach(pairConfig => {
      const key = `${pairConfig.pair}_${pairConfig.timeframe}`;
      
      const executor = new AutonomousTradeExecutor({
        enabled: true,
        pair: pairConfig.pair,
        timeframe: pairConfig.timeframe,
        maxOpenTrades: pairConfig.maxOpenTrades,
        riskPercent: pairConfig.riskPercent,
        minConfidence: pairConfig.minConfidence,
        accountId: this.config.accountId
      });

      this.executors.set(key, executor);
      console.log(`📊 [MULTI-PAIR] Initialized executor for ${key}`);
    });
  }

  /**
   * Start all pair executors
   */
  async startAll() {
    if (this.isRunning) {
      console.log('🤖 [MULTI-PAIR] Already running');
      return;
    }

    this.isRunning = true;
    const promises: Promise<void>[] = [];

    for (const [key, executor] of this.executors) {
      console.log(`🚀 [MULTI-PAIR] Starting ${key}`);
      promises.push(executor.start());
    }

    await Promise.all(promises);
    console.log(`✅ [MULTI-PAIR] All ${this.executors.size} pairs trading`);
  }

  /**
   * Stop all pair executors
   */
  async stopAll() {
    const promises: Promise<void>[] = [];

    for (const [key, executor] of this.executors) {
      console.log(`🛑 [MULTI-PAIR] Stopping ${key}`);
      promises.push(executor.stop());
    }

    await Promise.all(promises);
    this.isRunning = false;
    console.log(`✅ [MULTI-PAIR] All pairs stopped`);
  }

  /**
   * Start specific pair
   */
  async startPair(pair: CurrencyPair, timeframe: Timeframe) {
    const key = `${pair}_${timeframe}`;
    const executor = this.executors.get(key);

    if (!executor) {
      throw new Error(`Executor not found for ${key}`);
    }

    await executor.start();
    console.log(`✅ [MULTI-PAIR] Started ${key}`);
  }

  /**
   * Stop specific pair
   */
  async stopPair(pair: CurrencyPair, timeframe: Timeframe) {
    const key = `${pair}_${timeframe}`;
    const executor = this.executors.get(key);

    if (!executor) {
      throw new Error(`Executor not found for ${key}`);
    }

    await executor.stop();
    console.log(`✅ [MULTI-PAIR] Stopped ${key}`);
  }

  /**
   * Get status of all pairs
   */
  getStatusAll() {
    const statuses: Record<string, any> = {
      isRunning: this.isRunning,
      totalPairs: this.executors.size,
      pairs: {}
    };

    for (const [key, executor] of this.executors) {
      statuses.pairs[key] = executor.getStatus();
    }

    return statuses;
  }

  /**
   * Get status of specific pair
   */
  getStatusPair(pair: CurrencyPair, timeframe: Timeframe) {
    const key = `${pair}_${timeframe}`;
    const executor = this.executors.get(key);

    if (!executor) {
      throw new Error(`Executor not found for ${key}`);
    }

    return executor.getStatus();
  }

  /**
   * Emergency stop all trading (circuit breaker)
   */
  async emergencyStop() {
    console.log(`🚨 [EMERGENCY STOP] Halting all trading immediately`);
    await this.stopAll();
    console.log(`🛑 [EMERGENCY STOP] All trading halted`);
  }
}
