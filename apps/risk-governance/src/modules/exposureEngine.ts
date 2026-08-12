import { RiskProfile } from '@iati/core-types';
import { ExposureMetrics } from '../types';

export class ExposureEngine {
  private activeExposures: Map<string, number> = new Map(); // symbol -> USD exposure

  updateExposure(symbol: string, usdAmount: number): void {
    this.activeExposures.set(symbol, usdAmount);
  }

  getSymbolExposure(symbol: string): number {
    return this.activeExposures.get(symbol) || 0;
  }

  getTotalPortfolioExposure(): number {
    let total = 0;
    for (const amt of this.activeExposures.values()) {
      total += amt;
    }
    return total;
  }

  evaluateExposure(symbol: string, proposedExposure: number, profile: RiskProfile): ExposureMetrics {
    const currentSymbolExp = this.getSymbolExposure(symbol);
    const newSymbolExp = currentSymbolExp + proposedExposure;
    const portfolioExp = this.getTotalPortfolioExposure() + proposedExposure;

    // Currency exposure extraction (e.g., EURUSD -> EUR, USD)
    const currencyExposure = newSymbolExp; 
    const assetExposure = newSymbolExp;

    const hasConcentrationRisk = newSymbolExp > (profile.max_exposure * 0.4); // >40% single symbol concentration
    const hasCorrelationRisk = portfolioExp > (profile.max_exposure * 0.8); // >80% portfolio utilization
    const isOverexposed = portfolioExp > profile.max_exposure || newSymbolExp > (profile.max_exposure * 0.5);

    return {
      symbolExposure: Number(newSymbolExp.toFixed(2)),
      currencyExposure: Number(currencyExposure.toFixed(2)),
      assetExposure: Number(assetExposure.toFixed(2)),
      portfolioExposure: Number(portfolioExp.toFixed(2)),
      hasConcentrationRisk,
      hasCorrelationRisk,
      isOverexposed
    };
  }

  clearExposures(): void {
    this.activeExposures.clear();
  }
}
