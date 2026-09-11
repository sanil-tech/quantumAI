
import crypto from 'crypto';

export type EconomicImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type EconomicEventStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'STALE' | 'UNKNOWN';

export interface NormalizedEconomicEvent {
  eventId: string;
  source: string;
  timestampUtc: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF' | 'NZD' | 'XAU';
  country: string;
  title: string;
  impact: EconomicImpact;
  forecast?: number;
  previous?: number;
  actual?: number;
  revision?: number;
  sourceTimestamp: string;
  retrievedAt: string;
  status: EconomicEventStatus;
}

export interface EconomicContextEvaluation {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  hasHighImpactEventActive: boolean;
  activeEvents: NormalizedEconomicEvent[];
  decisionAllowed: boolean;
  reason: string;
  evidenceHash: string;
}

export class EconomicContextService {
  private static cachedEvents: NormalizedEconomicEvent[] = [];

  public static setEvents(events: NormalizedEconomicEvent[]): void {
    this.cachedEvents = events;
  }

  public static clearEvents(): void {
    this.cachedEvents = [];
  }

  public static getEvents(): NormalizedEconomicEvent[] {
    return [...this.cachedEvents];
  }

  public static evaluateEconomicContext(params: {
    symbol: 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD';
    currentTimeUtc?: string;
    windowMinutes?: number;
    allowStale?: boolean;
  }): EconomicContextEvaluation {
    const now = params.currentTimeUtc ? new Date(params.currentTimeUtc).getTime() : Date.now();
    const windowMs = (params.windowMinutes || 30) * 60 * 1000;

    let baseCurrency = 'EUR';
    let quoteCurrency = 'USD';
    if (params.symbol === 'GBPUSD') { baseCurrency = 'GBP'; quoteCurrency = 'USD'; }
    if (params.symbol === 'USDJPY') { baseCurrency = 'USD'; quoteCurrency = 'JPY'; }
    if (params.symbol === 'XAUUSD') { baseCurrency = 'XAU'; quoteCurrency = 'USD'; }

    const relevantCurrencies = [baseCurrency, quoteCurrency];
    const activeEvents: NormalizedEconomicEvent[] = [];
    let hasHighImpactEventActive = false;

    for (const ev of this.cachedEvents) {
      if (!relevantCurrencies.includes(ev.currency)) continue;

      const evTime = new Date(ev.timestampUtc).getTime();
      const timeDiff = Math.abs(now - evTime);

      if (timeDiff <= windowMs) {
        if (ev.status === 'STALE' && !params.allowStale) {
          return {
            symbol: params.symbol,
            baseCurrency,
            quoteCurrency,
            hasHighImpactEventActive: true,
            activeEvents: [ev],
            decisionAllowed: false,
            reason: 'ECONOMIC_DATA_STALE_FAIL_CLOSED_NO_TRADE',
            evidenceHash: crypto.createHash('sha256').update(JSON.stringify(ev)).digest('hex')
          };
        }

        if (ev.impact === 'HIGH') {
          hasHighImpactEventActive = true;
          activeEvents.push(ev);
        }
      }
    }

    const decisionAllowed = !hasHighImpactEventActive;
    const reason = hasHighImpactEventActive
      ? 'HIGH_IMPACT_ECONOMIC_EVENT_ACTIVE_NO_TRADE'
      : 'ECONOMIC_CONTEXT_CLEAR_TRADE_PERMITTED';

    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify({
      symbol: params.symbol,
      now,
      hasHighImpactEventActive,
      activeEventsCount: activeEvents.length,
      decisionAllowed
    })).digest('hex');

    return {
      symbol: params.symbol,
      baseCurrency,
      quoteCurrency,
      hasHighImpactEventActive,
      activeEvents,
      decisionAllowed,
      reason,
      evidenceHash
    };
  }
}
