
export type UserRole = 'VIEWER' | 'OPERATOR' | 'ADMIN';

export interface OperationalDashboardSnapshot {
  systemBanner: string;
  safetyState: {
    readOnlyModeEnforced: boolean;
    executionSafetyGate: 'BLOCKED';
    automatedExecution: boolean;
    brokerExecution: boolean;
    liveExecution: 'FORBIDDEN';
  };
  marketOverview: Array<{
    symbol: string;
    bid: number;
    ask: number;
    spreadPips: number;
    quality: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'INVALID';
    regime: string;
  }>;
  signalCenter: {
    activeSignals: Array<{
      signalId: string;
      symbol: string;
      direction: 'BUY' | 'SELL' | 'NO_TRADE';
      confidence: number;
      strategy: string;
      version: string;
      entryPrice: number;
      slPrice: number;
      tpPrice: number;
      riskDollars: number;
      riskPercent: number;
      state: string;
      whyReasons: string[];
      whyNotReasons: string[];
    }>;
  };
  cTraderStatus: {
    appAuth: 'AUTHENTICATED';
    accountAuth: 'AUTHORIZED';
    accountId: number;
    balance: number;
    equity: number;
    environment: 'DEMO';
    readOnly: true;
    lastReconciliation: number;
  };
  economicContext: {
    status: 'ECONOMIC_DATA_UNAVAILABLE' | 'AVAILABLE';
    events: any[];
  };
}

export class DashboardOperationsService {
  public static getDashboardSnapshot(): OperationalDashboardSnapshot {
    return {
      systemBanner: 'CONTROLLED DEMO / SHADOW MODE ? BROKER EXECUTION BLOCKED',
      safetyState: {
        readOnlyModeEnforced: true,
        executionSafetyGate: 'BLOCKED',
        automatedExecution: false,
        brokerExecution: false,
        liveExecution: 'FORBIDDEN'
      },
      marketOverview: [
        { symbol: 'EURUSD', bid: 1.15750, ask: 1.15758, spreadPips: 0.8, quality: 'HEALTHY', regime: 'TRENDING' },
        { symbol: 'GBPUSD', bid: 1.30210, ask: 1.30222, spreadPips: 1.2, quality: 'HEALTHY', regime: 'TRENDING' },
        { symbol: 'USDJPY', bid: 154.520, ask: 154.532, spreadPips: 1.2, quality: 'HEALTHY', regime: 'RANGING' },
        { symbol: 'XAUUSD', bid: 2415.20, ask: 2415.55, spreadPips: 3.5, quality: 'HEALTHY', regime: 'HIGH_VOLATILITY' }
      ],
      signalCenter: {
        activeSignals: [
          {
            signalId: 'SIG-EURUSD-LIVE-01',
            symbol: 'EURUSD',
            direction: 'BUY',
            confidence: 85,
            strategy: 'STRAT-AI-TREND-PULSE',
            version: 'v2.0.0',
            entryPrice: 1.15753,
            slPrice: 1.15553,
            tpPrice: 1.16153,
            riskDollars: 2.00,
            riskPercent: 0.20,
            state: 'USER_REVIEW',
            whyReasons: ['Bullish EMA crossover', 'RSI in optimal momentum band (58.5)', 'TRENDING regime'],
            whyNotReasons: []
          }
        ]
      },
      cTraderStatus: {
        appAuth: 'AUTHENTICATED',
        accountAuth: 'AUTHORIZED',
        accountId: 48282756,
        balance: 1000.0,
        equity: 1000.0,
        environment: 'DEMO',
        readOnly: true,
        lastReconciliation: Date.now()
      },
      economicContext: {
        status: 'ECONOMIC_DATA_UNAVAILABLE',
        events: []
      }
    };
  }

  public static handleManualAction(
    action: 'REVIEW' | 'APPROVE' | 'REJECT' | 'SIMULATE',
    signalId: string,
    role: UserRole
  ): {
    success: boolean;
    action: string;
    signalId: string;
    executionOutcome: string;
    brokerOrderSent: boolean;
  } {
    if (action === 'APPROVE' && role === 'VIEWER') {
      return {
        success: false,
        action,
        signalId,
        executionOutcome: 'UNAUTHORIZED_ROLE_VIEWER',
        brokerOrderSent: false
      };
    }

    if (action === 'APPROVE') {
      return {
        success: true,
        action: 'APPROVE',
        signalId,
        executionOutcome: 'APPROVED_BUT_EXECUTION_BLOCKED_BY_SAFETY_POLICY',
        brokerOrderSent: false
      };
    }

    if (action === 'SIMULATE') {
      return {
        success: true,
        action: 'SIMULATE',
        signalId,
        executionOutcome: 'SHADOW_SIMULATION_STARTED',
        brokerOrderSent: false
      };
    }

    return {
      success: true,
      action,
      signalId,
      executionOutcome: 'PROCESSED',
      brokerOrderSent: false
    };
  }
}
