
import * as crypto from 'crypto';

export type EconomicImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type EconomicEventStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'STALE' | 'UNKNOWN';
export type CalendarState = 'CALENDAR_READY' | 'CALENDAR_STALE' | 'CALENDAR_UNAVAILABLE';

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
  private static calendarState: CalendarState = 'CALENDAR_READY';
  private static lastSynchronizedAt: number = Date.now();

  public static setEvents(events: NormalizedEconomicEvent[]): void {
    this.cachedEvents = events || [];
    this.calendarState = 'CALENDAR_READY';
    this.lastSynchronizedAt = Date.now();
  }

  public static setCalendarState(state: CalendarState): void {
    this.calendarState = state;
  }

  public static getCalendarState(): CalendarState {
    if (this.calendarState === 'CALENDAR_READY' && (Date.now() - this.lastSynchronizedAt) > 7 * 24 * 3600 * 1000) {
      return 'CALENDAR_STALE';
    }
    return this.calendarState;
  }

  public static clearEvents(): void {
    this.cachedEvents = [];
    this.calendarState = 'CALENDAR_READY';
    this.lastSynchronizedAt = Date.now();
  }

  public static getEvents(): NormalizedEconomicEvent[] {
    return [...this.cachedEvents];
  }

  public static evaluateEconomicContext(params: {
    symbol: string;
    currentTimeUtc?: string;
    windowMinutes?: number;
    allowStale?: boolean;
  }): EconomicContextEvaluation {
    const now = params.currentTimeUtc ? new Date(params.currentTimeUtc).getTime() : Date.now();
    const windowMs = (params.windowMinutes || 30) * 60 * 1000;

    const clean = (params.symbol || '').replace(/[\/\-_]/g, '').toUpperCase();
    let baseCurrency = clean.length >= 6 ? clean.substring(0, 3) : 'EUR';
    let quoteCurrency = clean.length >= 6 ? clean.substring(3, 6) : 'USD';
    if (clean.includes('XAU') || clean.includes('GOLD')) { baseCurrency = 'XAU'; quoteCurrency = 'USD'; }
    if (clean.includes('NAS') || clean.includes('TECH')) { baseCurrency = 'USD'; quoteCurrency = 'USD'; }
    if (clean.includes('BTC')) { baseCurrency = 'USD'; quoteCurrency = 'USD'; }

    // If calendar state is unavailable or stale, allow trade decisions unless an actual high impact event is active
    const state = this.getCalendarState();
    if (state === 'CALENDAR_UNAVAILABLE' && this.cachedEvents.length === 0) {
      return {
        symbol: params.symbol,
        baseCurrency,
        quoteCurrency,
        hasHighImpactEventActive: false,
        activeEvents: [],
        decisionAllowed: true,
        reason: 'ECONOMIC_CONTEXT_CLEAR_TRADE_PERMITTED',
        evidenceHash: crypto.createHash('sha256').update('CALENDAR_UNAVAILABLE_CLEAR').digest('hex')
      };
    }

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

export const economicContextService = EconomicContextService;

