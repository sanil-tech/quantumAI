import { RiskProfile, AutonomyLevel, DrawdownAction, GovernanceDecision, TradeProposal } from '@iati/core-types';

export interface PositionRisk {
  expectedRisk: number;
  positionExposure: number;
  potentialLoss: number;
  rewardRiskRatio: number;
  portfolioImpact: number;
  riskScore: number;
}

export interface ExposureMetrics {
  symbolExposure: number;
  currencyExposure: number;
  assetExposure: number;
  portfolioExposure: number;
  hasConcentrationRisk: boolean;
  hasCorrelationRisk: boolean;
  isOverexposed: boolean;
}

export interface DrawdownStatus {
  currentDrawdown: number;
  dailyLoss: number;
  weeklyLoss: number;
  maxHistoricalDrawdown: number;
  action: DrawdownAction;
  reason?: string;
}

export interface FrequencyCheck {
  recentTradeCount: number;
  isOvertrading: boolean;
  isDuplicate: boolean;
  isRevengePattern: boolean;
  allowTrade: boolean;
  reason?: string;
}

export interface ConfidenceEvaluation {
  passed: boolean;
  confidenceScore: number;
  agentAgreementRatio: number;
  regimeSuitable: boolean;
  reason?: string;
}

export interface AutonomyCheck {
  level: AutonomyLevel;
  canAutoApprove: boolean;
  requiresManualApproval: boolean;
  reason: string;
}

export interface AuditRecord {
  id: string;
  proposal_id: string;
  account_id: string;
  symbol: string;
  proposal: TradeProposal;
  risk_score: number;
  rules_evaluated: string[];
  final_decision: 'APPROVED' | 'REJECTED' | 'MANUAL_REQUIRED';
  reason: string;
  timestamp: Date;
}
