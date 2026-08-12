import { RiskProfile } from '@iati/core-types';

export class RiskProfileManager {
  private profiles: Map<string, RiskProfile> = new Map();

  constructor() {
    // Default account profile
    this.profiles.set('DEFAULT', {
      account_id: 'DEFAULT',
      max_risk_per_trade: 0.02, // 2% per trade
      max_daily_loss: 0.05, // 5% max daily loss
      max_drawdown: 0.15, // 15% max overall drawdown
      max_open_positions: 5,
      max_exposure: 100000, // $100,000 USD
      max_frequency: 10, // Max 10 trades per day
      risk_level: 'MODERATE'
    });
  }

  getProfile(accountId: string = 'DEFAULT'): RiskProfile {
    return this.profiles.get(accountId) || this.profiles.get('DEFAULT')!;
  }

  setProfile(profile: RiskProfile): void {
    this.profiles.set(profile.account_id, profile);
  }

  getAllProfiles(): RiskProfile[] {
    return Array.from(this.profiles.values());
  }
}
