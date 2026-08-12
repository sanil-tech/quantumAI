import { RiskProfile, DrawdownAction } from '@iati/core-types';
import { DrawdownStatus } from '../types';

export class DrawdownProtection {
  private currentDrawdown: number = 0.0; // percentage e.g. 0.03 = 3%
  private dailyLoss: number = 0.0;
  private weeklyLoss: number = 0.0;
  private maxHistoricalDrawdown: number = 0.05;
  private manualEmergencyStopActive: boolean = false;
  private manualEmergencyStopReason: string = '';

  public activateEmergencyStop(reason: string = 'Manual Operator Kill Switch Activated'): void {
    this.manualEmergencyStopActive = true;
    this.manualEmergencyStopReason = reason;
  }

  public deactivateEmergencyStop(): void {
    this.manualEmergencyStopActive = false;
    this.manualEmergencyStopReason = '';
  }

  public isEmergencyStopActive(): boolean {
    return this.manualEmergencyStopActive;
  }

  setAccountMetrics(drawdown: number, dailyLossPct: number, weeklyLossPct: number): void {
    this.currentDrawdown = drawdown;
    this.dailyLoss = dailyLossPct;
    this.weeklyLoss = weeklyLossPct;
    if (drawdown > this.maxHistoricalDrawdown) {
      this.maxHistoricalDrawdown = drawdown;
    }
  }

  evaluateDrawdown(profile: RiskProfile): DrawdownStatus {
    if (this.manualEmergencyStopActive) {
      return {
        currentDrawdown: this.currentDrawdown,
        dailyLoss: this.dailyLoss,
        weeklyLoss: this.weeklyLoss,
        maxHistoricalDrawdown: this.maxHistoricalDrawdown,
        action: 'EMERGENCY_STOP',
        reason: `Emergency Stop: ${this.manualEmergencyStopReason || 'Manual Operator Kill Switch Activated'}`
      };
    }

    // Check against profile thresholds
    if (this.currentDrawdown >= profile.max_drawdown || this.dailyLoss >= profile.max_daily_loss * 1.5) {
      return {
        currentDrawdown: this.currentDrawdown,
        dailyLoss: this.dailyLoss,
        weeklyLoss: this.weeklyLoss,
        maxHistoricalDrawdown: this.maxHistoricalDrawdown,
        action: 'EMERGENCY_STOP',
        reason: `Emergency Stop: Max drawdown (${(this.currentDrawdown * 100).toFixed(1)}%) or daily loss breached profile limits.`
      };
    }

    if (this.dailyLoss >= profile.max_daily_loss) {
      return {
        currentDrawdown: this.currentDrawdown,
        dailyLoss: this.dailyLoss,
        weeklyLoss: this.weeklyLoss,
        maxHistoricalDrawdown: this.maxHistoricalDrawdown,
        action: 'PAUSE_TRADING',
        reason: `Trading Paused: Daily loss (${(this.dailyLoss * 100).toFixed(1)}%) reached maximum allowed limit (${(profile.max_daily_loss * 100).toFixed(1)}%).`
      };
    }

    if (this.currentDrawdown >= profile.max_drawdown * 0.7) {
      return {
        currentDrawdown: this.currentDrawdown,
        dailyLoss: this.dailyLoss,
        weeklyLoss: this.weeklyLoss,
        maxHistoricalDrawdown: this.maxHistoricalDrawdown,
        action: 'REDUCE_RISK',
        reason: `Reduce Risk: Current drawdown (${(this.currentDrawdown * 100).toFixed(1)}%) approaching threshold.`
      };
    }

    if (this.dailyLoss >= profile.max_daily_loss * 0.6) {
      return {
        currentDrawdown: this.currentDrawdown,
        dailyLoss: this.dailyLoss,
        weeklyLoss: this.weeklyLoss,
        maxHistoricalDrawdown: this.maxHistoricalDrawdown,
        action: 'WARNING',
        reason: `Warning: Daily loss (${(this.dailyLoss * 100).toFixed(1)}%) elevated.`
      };
    }

    return {
      currentDrawdown: this.currentDrawdown,
      dailyLoss: this.dailyLoss,
      weeklyLoss: this.weeklyLoss,
      maxHistoricalDrawdown: this.maxHistoricalDrawdown,
      action: 'WARNING', // Normal operational status
      reason: 'Drawdown within healthy boundaries.'
    };
  }
}
