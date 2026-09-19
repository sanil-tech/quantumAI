
export type PortfolioDecisionState =
  | 'PORTFOLIO_RISK_ACCEPTED'
  | 'PORTFOLIO_RISK_REJECTED'
  | 'PORTFOLIO_RISK_LOCKED'
  | 'DAILY_LOSS_LOCK'
  | 'DRAWDOWN_LOCK'
  | 'CONCENTRATION_REJECTED'
  | 'CORRELATION_REJECTED'
  | 'DIRECTIONAL_EXPOSURE_REJECTED'
  | 'STRATEGY_BUDGET_REJECTED'
  | 'MAX_OPEN_RISK_REJECTED'
  | 'INVALID_RISK_DATA'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'RECONCILIATION_REQUIRED'
  | 'NO_TRADE';

export interface PortfolioRiskLimits {
  maxSingleTradeRiskPercent: number; // 2.0%
  maxPortfolioOpenRiskPercent: number; // 5.0%
  maxDailyLossPercent: number; // 3.0%
  maxPortfolioDrawdownPercent: number; // 6.0%
  maxAssetConcentrationPercent: number; // 2.5%
  maxDirectionalExposurePercent: number; // 3.5%
  maxStrategyExposurePercent: number; // 3.0%
  maxCorrelatedExposurePercent: number; // 3.5%
  maxOpenPositions: number; // 5
}

export interface ProposedTradeRisk {
  requestId: string;
  idempotencyKey: string;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  proposedRiskDollars: number;
  proposedRiskPercent: number;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
}

export interface ActiveShadowPosition {
  positionId: string;
  reservationId: string;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  slPrice: number;
  tpPrice: number;
  riskDollars: number;
  riskPercent: number;
  unrealizedPnLDollars: number;
  realizedPnLDollars: number;
  status: 'OPEN' | 'CLOSED_SL' | 'CLOSED_TP' | 'CLOSED_MANUAL';
  openedAtUtc: string;
}

export interface RiskReservationRecord {
  reservationId: string;
  idempotencyKey: string;
  requestId: string;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  reservedRiskDollars: number;
  reservedRiskPercent: number;
  status: 'RESERVED' | 'ACTIVE' | 'RELEASED';
  createdAtUtc: string;
}

export interface PortfolioStateSnapshot {
  accountEquity: number;
  accountBalance: number;
  peakEquity: number;
  currentDrawdownPercent: number;
  dailyStartEquity: number;
  realizedDailyPnLDollars: number;
  totalReservedRiskDollars: number;
  totalActiveRiskDollars: number;
  totalPortfolioOpenRiskPercent: number;
  status: 'HEALTHY' | 'DAILY_LOSS_LOCK' | 'DRAWDOWN_LOCK' | 'RECONCILIATION_REQUIRED';
}

export class PortfolioRiskEngine {
  private limits: PortfolioRiskLimits = {
    maxSingleTradeRiskPercent: 2.0,
    maxPortfolioOpenRiskPercent: 5.0,
    maxDailyLossPercent: 3.0,
    maxPortfolioDrawdownPercent: 6.0,
    maxAssetConcentrationPercent: 2.5,
    maxDirectionalExposurePercent: 3.5,
    maxStrategyExposurePercent: 3.0,
    maxCorrelatedExposurePercent: 3.5,
    maxOpenPositions: 8
  };

  private accountBalance = 1000.0;
  private accountEquity = 1000.0;
  private peakEquity = 1000.0;
  private dailyStartEquity = 1000.0;
  private realizedDailyPnLDollars = 0.0;

  private reservations: Map<string, RiskReservationRecord> = new Map();
  private idempotencyRegistry: Map<string, { payloadHash: string; reservationId: string; decision: PortfolioDecisionState }> = new Map();
  private shadowPositions: Map<string, ActiveShadowPosition> = new Map();

  constructor(initialBalance: number = 1000.0) {
    this.accountBalance = initialBalance;
    this.accountEquity = initialBalance;
    this.peakEquity = initialBalance;
    this.dailyStartEquity = initialBalance;
  }

  public getPortfolioSnapshot(): PortfolioStateSnapshot {
    let totalReserved = 0;
    let totalActive = 0;

    for (const r of this.reservations.values()) {
      if (r.status === 'RESERVED') totalReserved += r.reservedRiskDollars;
      if (r.status === 'ACTIVE') totalActive += r.reservedRiskDollars;
    }

    const currentDrawdown = this.peakEquity > 0 ? ((this.peakEquity - this.accountEquity) / this.peakEquity) * 100 : 0;
    const totalOpenRiskPercent = ((totalReserved + totalActive) / this.accountEquity) * 100;

    let status: 'HEALTHY' | 'DAILY_LOSS_LOCK' | 'DRAWDOWN_LOCK' | 'RECONCILIATION_REQUIRED' = 'HEALTHY';
    if (currentDrawdown >= this.limits.maxPortfolioDrawdownPercent) {
      status = 'DRAWDOWN_LOCK';
    } else if (this.realizedDailyPnLDollars <= -(this.dailyStartEquity * (this.limits.maxDailyLossPercent / 100))) {
      status = 'DAILY_LOSS_LOCK';
    }

    return {
      accountEquity: this.accountEquity,
      accountBalance: this.accountBalance,
      peakEquity: this.peakEquity,
      currentDrawdownPercent: currentDrawdown,
      dailyStartEquity: this.dailyStartEquity,
      realizedDailyPnLDollars: this.realizedDailyPnLDollars,
      totalReservedRiskDollars: totalReserved,
      totalActiveRiskDollars: totalActive,
      totalPortfolioOpenRiskPercent: totalOpenRiskPercent,
      status
    };
  }

  public evaluateAndReserveRisk(proposal: ProposedTradeRisk): {
    decision: PortfolioDecisionState;
    reservationId?: string;
    reason: string;
    portfolioOpenRiskPercentAfter?: number;
  } {
    // 1. Fail-Closed Input Validation
    if (!proposal || !proposal.symbol || proposal.proposedRiskDollars <= 0 || proposal.proposedRiskPercent <= 0 || this.accountEquity <= 0) {
      return { decision: 'INVALID_RISK_DATA', reason: 'Invalid proposal or non-positive equity' };
    }

    // 2. Idempotency Check
    const payloadHash = `${proposal.strategyId}_${proposal.symbol}_${proposal.direction}_${proposal.proposedRiskDollars}`;
    const cached = this.idempotencyRegistry.get(proposal.idempotencyKey);
    if (cached) {
      if (cached.payloadHash === payloadHash) {
        return {
          decision: cached.decision,
          reservationId: cached.reservationId,
          reason: 'IDEMPOTENT_REPLAY_OF_PRIOR_DECISION'
        };
      } else {
        return { decision: 'IDEMPOTENCY_KEY_CONFLICT', reason: 'Same key reused with differing payload' };
      }
    }

    const snapshot = this.getPortfolioSnapshot();

    // 3. Lock State Governance
    if (snapshot.status === 'DRAWDOWN_LOCK') {
      return { decision: 'DRAWDOWN_LOCK', reason: 'Portfolio is in DRAWDOWN_LOCK state' };
    }
    if (snapshot.status === 'DAILY_LOSS_LOCK') {
      return { decision: 'DAILY_LOSS_LOCK', reason: 'Portfolio is in DAILY_LOSS_LOCK state' };
    }

    // 4. Max Single Trade Risk Cap (2.0%)
    if (proposal.proposedRiskPercent > this.limits.maxSingleTradeRiskPercent) {
      return {
        decision: 'PORTFOLIO_RISK_REJECTED',
        reason: `Proposed trade risk ${proposal.proposedRiskPercent}% exceeds max single trade cap ${this.limits.maxSingleTradeRiskPercent}%`
      };
    }

    // 5. Max Open Positions Cap
    const openPositionsCount = Array.from(this.shadowPositions.values()).filter((p) => p.status === 'OPEN').length;
    if (openPositionsCount >= this.limits.maxOpenPositions) {
      return { decision: 'PORTFOLIO_RISK_REJECTED', reason: `Open positions count ${openPositionsCount} >= max allowed ${this.limits.maxOpenPositions}` };
    }

    // 6. Max Portfolio Aggregate Open Risk (5.0%)
    const projectedTotalRiskPercent = snapshot.totalPortfolioOpenRiskPercent + proposal.proposedRiskPercent;
    if (projectedTotalRiskPercent > this.limits.maxPortfolioOpenRiskPercent) {
      return {
        decision: 'MAX_OPEN_RISK_REJECTED',
        reason: `Projected total portfolio open risk ${projectedTotalRiskPercent.toFixed(2)}% exceeds max cap ${this.limits.maxPortfolioOpenRiskPercent}%`
      };
    }

    // 7. Asset Concentration Limit (2.5%)
    let currentAssetRiskPercent = 0;
    for (const r of this.reservations.values()) {
      if (r.symbol === proposal.symbol && (r.status === 'RESERVED' || r.status === 'ACTIVE')) {
        currentAssetRiskPercent += r.reservedRiskPercent;
      }
    }
    if (currentAssetRiskPercent + proposal.proposedRiskPercent > this.limits.maxAssetConcentrationPercent) {
      return {
        decision: 'CONCENTRATION_REJECTED',
        reason: `Asset ${proposal.symbol} risk ${(currentAssetRiskPercent + proposal.proposedRiskPercent).toFixed(2)}% exceeds concentration limit ${this.limits.maxAssetConcentrationPercent}%`
      };
    }

    // 8. Correlated Exposure Control (EURUSD + GBPUSD max 3.5%)
    if (['EURUSD', 'GBPUSD'].includes(proposal.symbol)) {
      let correlatedRisk = 0;
      for (const r of this.reservations.values()) {
        if (['EURUSD', 'GBPUSD'].includes(r.symbol) && (r.status === 'RESERVED' || r.status === 'ACTIVE') && r.direction === proposal.direction) {
          correlatedRisk += r.reservedRiskPercent;
        }
      }
      if (correlatedRisk + proposal.proposedRiskPercent > this.limits.maxCorrelatedExposurePercent) {
        return {
          decision: 'CORRELATION_REJECTED',
          reason: `Correlated USD-pair exposure ${(correlatedRisk + proposal.proposedRiskPercent).toFixed(2)}% exceeds limit ${this.limits.maxCorrelatedExposurePercent}%`
        };
      }
    }

    // 9. Directional Exposure Limit (3.5%)
    let currentDirectionalRisk = 0;
    for (const r of this.reservations.values()) {
      if (r.direction === proposal.direction && (r.status === 'RESERVED' || r.status === 'ACTIVE')) {
        currentDirectionalRisk += r.reservedRiskPercent;
      }
    }
    if (currentDirectionalRisk + proposal.proposedRiskPercent > this.limits.maxDirectionalExposurePercent) {
      return {
        decision: 'DIRECTIONAL_EXPOSURE_REJECTED',
        reason: `Directional ${proposal.direction} exposure ${(currentDirectionalRisk + proposal.proposedRiskPercent).toFixed(2)}% exceeds limit ${this.limits.maxDirectionalExposurePercent}%`
      };
    }

    // 10. Atomic Reservation
    const reservationId = `RES-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record: RiskReservationRecord = {
      reservationId,
      idempotencyKey: proposal.idempotencyKey,
      requestId: proposal.requestId,
      strategyId: proposal.strategyId,
      strategyVersion: proposal.strategyVersion,
      symbol: proposal.symbol,
      direction: proposal.direction,
      reservedRiskDollars: proposal.proposedRiskDollars,
      reservedRiskPercent: proposal.proposedRiskPercent,
      status: 'RESERVED',
      createdAtUtc: new Date().toISOString()
    };

    this.reservations.set(reservationId, record);
    this.idempotencyRegistry.set(proposal.idempotencyKey, {
      payloadHash,
      reservationId,
      decision: 'PORTFOLIO_RISK_ACCEPTED'
    });

    return {
      decision: 'PORTFOLIO_RISK_ACCEPTED',
      reservationId,
      reason: 'Portfolio risk constraints satisfied',
      portfolioOpenRiskPercentAfter: projectedTotalRiskPercent
    };
  }

  public activateShadowPosition(reservationId: string, positionId: string, entryPrice: number): boolean {
    const res = this.reservations.get(reservationId);
    if (!res || res.status !== 'RESERVED') return false;

    res.status = 'ACTIVE';

    const shadowPos: ActiveShadowPosition = {
      positionId,
      reservationId,
      strategyId: res.strategyId,
      strategyVersion: res.strategyVersion,
      symbol: res.symbol,
      direction: res.direction,
      entryPrice,
      currentPrice: entryPrice,
      slPrice: 0,
      tpPrice: 0,
      riskDollars: res.reservedRiskDollars,
      riskPercent: res.reservedRiskPercent,
      unrealizedPnLDollars: 0,
      realizedPnLDollars: 0,
      status: 'OPEN',
      openedAtUtc: new Date().toISOString()
    };

    this.shadowPositions.set(positionId, shadowPos);
    return true;
  }

  public closeShadowPosition(positionId: string, realizedPnLDollars: number, closeReason: 'CLOSED_SL' | 'CLOSED_TP' | 'CLOSED_MANUAL'): boolean {
    const pos = this.shadowPositions.get(positionId);
    if (!pos || pos.status !== 'OPEN') return false;

    pos.status = closeReason;
    pos.realizedPnLDollars = realizedPnLDollars;

    // Release risk reservation
    const res = this.reservations.get(pos.reservationId);
    if (res) {
      res.status = 'RELEASED';
    }

    // Update account financial state
    this.accountEquity += realizedPnLDollars;
    this.accountBalance += realizedPnLDollars;
    this.realizedDailyPnLDollars += realizedPnLDollars;
    if (this.accountEquity > this.peakEquity) {
      this.peakEquity = this.accountEquity;
    }

    return true;
  }

  public reconcilePortfolio(): { reconciled: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for orphaned active reservations
    for (const [resId, res] of this.reservations.entries()) {
      if (res.status === 'ACTIVE') {
        const hasPos = Array.from(this.shadowPositions.values()).some((p) => p.reservationId === resId && p.status === 'OPEN');
        if (!hasPos) {
          issues.push(`Orphaned ACTIVE reservation ${resId} with no open shadow position`);
        }
      }
    }

    return {
      reconciled: issues.length === 0,
      issues
    };
  }

  public rehydrateState(savedState: {
    balance: number;
    equity: number;
    peakEquity: number;
    dailyStartEquity: number;
    realizedDailyPnL: number;
    reservations: RiskReservationRecord[];
    positions: ActiveShadowPosition[];
  }): void {
    this.accountBalance = savedState.balance;
    this.accountEquity = savedState.equity;
    this.peakEquity = savedState.peakEquity;
    this.dailyStartEquity = savedState.dailyStartEquity;
    this.realizedDailyPnLDollars = savedState.realizedDailyPnL;

    this.reservations.clear();
    for (const r of savedState.reservations) {
      this.reservations.set(r.reservationId, r);
      this.idempotencyRegistry.set(r.idempotencyKey, {
        payloadHash: `${r.strategyId}_${r.symbol}_${r.direction}_${r.reservedRiskDollars}`,
        reservationId: r.reservationId,
        decision: 'PORTFOLIO_RISK_ACCEPTED'
      });
    }

    this.shadowPositions.clear();
    for (const p of savedState.positions) {
      this.shadowPositions.set(p.positionId, p);
    }
  }
}
