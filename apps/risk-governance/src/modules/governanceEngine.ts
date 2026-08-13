import { TradeProposal, GovernanceDecision, GovernanceDecisionStatus, RiskApprovalToken } from '@iati/core-types';
import { RiskProfileManager } from './riskProfileManager';
import { PositionRiskCalculator } from './positionRiskCalculator';
import { ExposureEngine } from './exposureEngine';
import { DrawdownProtection } from './drawdownProtection';
import { TradeFrequencyControl } from './tradeFrequencyControl';
import { ConfidenceFilter } from './confidenceFilter';
import { AutonomyControl } from './autonomyControl';
import { AuditLogger } from './auditLogger';
import { createRiskApprovalToken } from './riskTokenService';

export class RiskGovernanceEngine {
  public profileManager = new RiskProfileManager();
  public positionRiskCalc = new PositionRiskCalculator();
  public exposureEngine = new ExposureEngine();
  public drawdownProtection = new DrawdownProtection();
  public frequencyControl = new TradeFrequencyControl();
  public confidenceFilter = new ConfidenceFilter();
  public autonomyControl = new AutonomyControl();
  public auditLogger = new AuditLogger();

  public evaluateTradeProposal(proposal: TradeProposal, accountId: string = 'DEFAULT', requestedLotSize?: number): GovernanceDecision {
    const profile = this.profileManager.getProfile(accountId);
    const checks: string[] = [];
    const rejectionReasons: string[] = [];

    // 1. Position Risk Calculation
    const posRisk = this.positionRiskCalc.calculatePositionRisk(proposal, profile);

    // 2. Exposure Engine Check
    const exposure = this.exposureEngine.evaluateExposure(proposal.symbol, posRisk.positionExposure, profile);
    if (exposure.isOverexposed) {
      rejectionReasons.push(`Exposure limit breached for ${proposal.symbol}.`);
    } else {
      checks.push('Exposure OK');
    }

    // 3. Drawdown Protection Check
    const drawdownStatus = this.drawdownProtection.evaluateDrawdown(profile);
    if (drawdownStatus.action === 'EMERGENCY_STOP' || drawdownStatus.action === 'PAUSE_TRADING') {
      rejectionReasons.push(`Drawdown Protection Triggered: ${drawdownStatus.reason}`);
    } else {
      checks.push('Drawdown OK');
    }

    // 4. Trade Frequency & Duplicate Control
    const freqCheck = this.frequencyControl.checkFrequency(proposal, profile);
    if (!freqCheck.allowTrade) {
      rejectionReasons.push(`Frequency Control Failure: ${freqCheck.reason}`);
    } else {
      checks.push('Frequency OK');
    }

    // 5. Confidence Filter Check
    const confEval = this.confidenceFilter.evaluateProposal(proposal);
    if (!confEval.passed) {
      rejectionReasons.push(`Confidence Filter Failure: ${confEval.reason}`);
    } else {
      checks.push('Confidence OK');
    }

    // Determine preliminary status
    let status: GovernanceDecisionStatus = rejectionReasons.length === 0 ? 'APPROVED' : 'REJECTED';

    // 6. Autonomy Control Check
    const autonomyCheck = this.autonomyControl.evaluateAutonomy(proposal, posRisk.riskScore);
    if (status === 'APPROVED') {
      if (autonomyCheck.requiresManualApproval) {
        status = 'MANUAL_REQUIRED';
        checks.push(`Autonomy Check: Manual approval required (${autonomyCheck.reason})`);
      } else {
        checks.push(`Autonomy Check: Level ${autonomyCheck.level} Auto-Cleared`);
      }
    }

    // Check requested lot size against limits
    const maxLot = 10.0;
    const reqLot = requestedLotSize || 0.1;
    if (reqLot > maxLot) {
      status = 'REJECTED';
      rejectionReasons.push(`Requested lot size ${reqLot} exceeds maximum allowable lot size ${maxLot}`);
    }

    const approvalId = `gov-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const approvedLotSize = status === 'APPROVED' ? reqLot : 0;

    const token: RiskApprovalToken = createRiskApprovalToken({
      approvalId,
      signalId: proposal.id || `sig-${Date.now()}`,
      symbol: proposal.symbol,
      direction: proposal.direction,
      approvedLotSize,
      maxAllowedDrawdown: profile.max_drawdown,
      calculatedRiskAmount: posRisk.expectedRisk,
      status,
      rejectionReason: rejectionReasons.length > 0 ? rejectionReasons.join(' | ') : undefined,
      strategyId: (proposal as any).strategyId || proposal.strategy_id,
      strategyVersion: (proposal as any).strategyVersion || proposal.strategy_version,
      stopLoss: proposal.stopLoss ?? proposal.stop_loss,
      takeProfit: proposal.takeProfit ?? proposal.take_profit,
      riskPercent: proposal.riskPercent ?? proposal.risk_percent
    });

    const decision: GovernanceDecision = {
      approval_id: approvalId,
      status,
      risk_score: posRisk.riskScore,
      checks,
      timestamp: new Date(),
      decision_authority: `RiskGovernanceEngine-Level${autonomyCheck.level}`,
      rejection_reasons: rejectionReasons.length > 0 ? rejectionReasons : undefined,
      token
    };

    // Record for frequency tracking if approved or pending manual
    if (status !== 'REJECTED') {
      this.frequencyControl.recordProposal(proposal.symbol, proposal.direction);
    }

    // Audit Logging
    this.auditLogger.logDecision({
      id: approvalId,
      proposal_id: proposal.id,
      account_id: accountId,
      symbol: proposal.symbol,
      proposal,
      risk_score: posRisk.riskScore,
      rules_evaluated: checks,
      final_decision: status,
      reason: rejectionReasons.length > 0 ? rejectionReasons.join(' | ') : 'All risk governance checks passed.',
      timestamp: new Date()
    });

    return decision;
  }
}
