import { CurrencyPair, TradingSession, ObservationType, ResearchEvidenceTier } from '../../types';
import { shadowObservationRepository } from '@iati/database';

export type LearningJournalEventType =
  | 'OBSERVATION_RECORDED'
  | 'TRADE_CLOSED'
  | 'POST_MORTEM_CREATED'
  | 'LEARNING_EVALUATED'
  | 'LEARNING_APPLIED'
  | 'LEARNING_REJECTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'COUNTERFACTUAL_RECORDED'
  | 'SHADOW_RECORDED'
  | 'SAFETY_BLOCK'
  | 'CAMPAIGN_STARTED'
  | 'CAMPAIGN_PAUSED'
  | 'CAMPAIGN_RESUMED'
  | 'CAMPAIGN_STOPPED'
  | 'CAMPAIGN_COMPLETED';

export interface LearningJournalEvent {
  id: string;
  timestamp: number;
  eventType: LearningJournalEventType;
  observationId?: string;
  tradeId?: string;
  brokerOrderId?: string;
  brokerPositionId?: string;
  setupFingerprint: string;
  symbol: CurrencyPair;
  direction: 'BUY' | 'SELL';
  session: TradingSession;
  observationType: ObservationType;
  outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  realizedR?: number;
  mfePips?: number;
  maePips?: number;
  sampleCount: number; // Setup-specific N
  evidenceTier: ResearchEvidenceTier;
  previousLearningWeight: number;
  newLearningWeight: number;
  previousParameter?: string;
  proposedParameter?: string;
  appliedParameter?: string;
  boundedAdjustment?: string;
  reason: string;
  confidenceBasis?: string;
  affectedFutureSetupFingerprint: string;
  historicalSnapshotHash?: string;
}

export class LearningJournalService {
  private static instance: LearningJournalService;
  private events: LearningJournalEvent[] = [];
  private isHydrated: boolean = false;

  public static getInstance(): LearningJournalService {
    if (!LearningJournalService.instance) {
      LearningJournalService.instance = new LearningJournalService();
    }
    return LearningJournalService.instance;
  }

  /**
   * Hydrate events from PostgreSQL on startup
   */
  public async initPersistence(): Promise<void> {
    if (this.isHydrated) return;
    try {
      const persisted = await shadowObservationRepository.getJournalEvents({ limit: 500 });
      if (persisted && persisted.length > 0) {
        // Merge without duplicating existing IDs
        const existingIds = new Set(this.events.map(e => e.id));
        for (const evt of persisted) {
          if (!existingIds.has(evt.id)) {
            this.events.push(Object.freeze({ ...evt }));
            existingIds.add(evt.id);
          }
        }
        // Sort descending by timestamp
        this.events.sort((a, b) => b.timestamp - a.timestamp);
        if (this.events.length > 500) {
          this.events = this.events.slice(0, 500);
        }
      }
      this.isHydrated = true;
    } catch (err: any) {
      // Fail-soft: keep in-memory ledger
      this.isHydrated = false;
    }
  }

  public recordEvent(eventInput: Omit<LearningJournalEvent, 'id' | 'timestamp'> & { timestamp?: number }): LearningJournalEvent {
    const event: LearningJournalEvent = {
      id: `lje-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: eventInput.timestamp || Date.now(),
      ...eventInput
    };

    // Immutable append in memory
    this.events.unshift(Object.freeze({ ...event }));
    if (this.events.length > 500) {
      this.events.pop();
    }

    // Async durable persistence to PostgreSQL (non-blocking, fail-soft)
    shadowObservationRepository.saveJournalEvent(event).catch(() => {
      // Ignored: repository already tracks degraded persistence status
    });

    return event;
  }

  public getEvents(filter?: {
    setupFingerprint?: string;
    eventType?: LearningJournalEventType;
    observationType?: ObservationType;
    limit?: number;
  }): LearningJournalEvent[] {
    let result = [...this.events];

    if (filter?.setupFingerprint) {
      result = result.filter(e => e.setupFingerprint === filter.setupFingerprint);
    }
    if (filter?.eventType) {
      result = result.filter(e => e.eventType === filter.eventType);
    }
    if (filter?.observationType) {
      result = result.filter(e => e.observationType === filter.observationType);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  public clearJournal(): void {
    this.events = [];
    this.isHydrated = false;
  }

  public exportSnapshot(): LearningJournalEvent[] {
    return JSON.parse(JSON.stringify(this.events));
  }

  public restoreSnapshot(events: LearningJournalEvent[]): void {
    if (Array.isArray(events)) {
      this.events = events.map(e => Object.freeze({ ...e }));
    }
  }
}

export const learningJournalService = LearningJournalService.getInstance();

