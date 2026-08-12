import { TradeProposal, RiskProfile } from '@iati/core-types';
import { FrequencyCheck } from '../types';

export class TradeFrequencyControl {
  private proposalTimestamps: Array<{ symbol: string; timestamp: number; direction: string }> = [];

  recordProposal(symbol: string, direction: string): void {
    this.proposalTimestamps.push({ symbol, timestamp: Date.now(), direction });
    // Keep last 100 entries
    if (this.proposalTimestamps.length > 100) {
      this.proposalTimestamps.shift();
    }
  }

  checkFrequency(proposal: TradeProposal, profile: RiskProfile): FrequencyCheck {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const tenMinMs = 10 * 60 * 1000;

    // Filter trades in last 24h
    const recent24h = this.proposalTimestamps.filter(t => now - t.timestamp < oneDayMs);
    const recentTradeCount = recent24h.length;

    const isOvertrading = recentTradeCount >= profile.max_frequency;

    // Check duplicate entry: same symbol and direction within last 10 minutes
    const isDuplicate = this.proposalTimestamps.some(
      t => t.symbol === proposal.symbol && t.direction === proposal.direction && (now - t.timestamp < tenMinMs)
    );

    // Check revenge trading pattern: > 3 opposing trades on same symbol within 30 minutes
    const thirtyMinMs = 30 * 60 * 1000;
    const recentOpposing = this.proposalTimestamps.filter(
      t => t.symbol === proposal.symbol && t.direction !== proposal.direction && (now - t.timestamp < thirtyMinMs)
    );
    const isRevengePattern = recentOpposing.length >= 3;

    let allowTrade = true;
    let reason = 'Frequency checks passed.';

    if (isDuplicate) {
      allowTrade = false;
      reason = `Duplicate proposal detected for ${proposal.symbol} within 10-minute window.`;
    } else if (isOvertrading) {
      allowTrade = false;
      reason = `Max daily trade frequency limit (${profile.max_frequency}) exceeded.`;
    } else if (isRevengePattern) {
      allowTrade = false;
      reason = `Revenge trading pattern detected for ${proposal.symbol} (rapid directional switches).`;
    }

    return {
      recentTradeCount,
      isOvertrading,
      isDuplicate,
      isRevengePattern,
      allowTrade,
      reason
    };
  }

  clearHistory(): void {
    this.proposalTimestamps = [];
  }
}
