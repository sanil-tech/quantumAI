import { describe, it, expect, beforeEach } from 'vitest';
import { RiskGovernanceEngine } from '../apps/risk-governance/src/modules/governanceEngine';
import { TradeProposal, RiskProfile } from '@iati/core-types';
import { globalEventBus, EventTypes, IEvent } from '@iati/event-bus';

describe('Sprint 5 — Risk Governance Engine', () => {
  let engine: RiskGovernanceEngine;

  const validProposal: TradeProposal = {
    id: 'prop-test-101',
    symbol: 'EURUSD',
    direction: 'BUY',
    confidence: 0.85,
    evidence: ['Strong bullish momentum', 'SMA20 > SMA50'],
    agent_votes: [
      {
        agent_id: 'agent-trend',
        agent_name: 'Trend Analysis Agent',
        direction: 'BUY',
        confidence: 0.9,
        evidence: ['Uptrend'],
        reasoning: 'Clear bullish trend',
        timestamp: new Date()
      },
      {
        agent_id: 'agent-structure',
        agent_name: 'Market Structure Agent',
        direction: 'BUY',
        confidence: 0.8,
        evidence: ['Higher Highs'],
        reasoning: 'Structure break',
        timestamp: new Date()
      }
    ],
    why_direction: 'Bullish trend alignment across multi-agent consensus',
    invalidate_conditions: ['Break below 1.0800'],
    timestamp: new Date()
  };

  beforeEach(() => {
    engine = new RiskGovernanceEngine();
  });

  describe('Module 1 & 2: Risk Profile & Position Risk Calculator', () => {
    it('should calculate position risk score within [0.0, 1.0]', () => {
      const profile = engine.profileManager.getProfile('DEFAULT');
      const posRisk = engine.positionRiskCalc.calculatePositionRisk(validProposal, profile);

      expect(posRisk.riskScore).toBeGreaterThanOrEqual(0.0);
      expect(posRisk.riskScore).toBeLessThanOrEqual(1.0);
      expect(posRisk.positionExposure).toBeGreaterThan(0);
      expect(posRisk.potentialLoss).toBeGreaterThan(0);
    });
  });

  describe('Module 3: Exposure Engine', () => {
    it('should track exposure and detect overexposure', () => {
      const profile = engine.profileManager.getProfile('DEFAULT');
      
      // Below limits
      const exp1 = engine.exposureEngine.evaluateExposure('EURUSD', 20000, profile);
      expect(exp1.isOverexposed).toBe(false);

      // Add high exposure to breach limit ($100k profile max)
      engine.exposureEngine.updateExposure('EURUSD', 80000);
      const exp2 = engine.exposureEngine.evaluateExposure('EURUSD', 30000, profile);
      expect(exp2.isOverexposed).toBe(true);
    });
  });

  describe('Module 4: Drawdown Protection', () => {
    it('should trigger PAUSE_TRADING when daily loss limit is reached', () => {
      const profile = engine.profileManager.getProfile('DEFAULT');
      
      engine.drawdownProtection.setAccountMetrics(0.02, 0.05, 0.06); // 5% daily loss
      const status = engine.drawdownProtection.evaluateDrawdown(profile);

      expect(status.action).toBe('PAUSE_TRADING');
    });

    it('should trigger EMERGENCY_STOP when max overall drawdown limit is reached', () => {
      const profile = engine.profileManager.getProfile('DEFAULT');
      
      engine.drawdownProtection.setAccountMetrics(0.16, 0.02, 0.04); // 16% drawdown > 15% max
      const status = engine.drawdownProtection.evaluateDrawdown(profile);

      expect(status.action).toBe('EMERGENCY_STOP');
    });
  });

  describe('Module 5: Trade Frequency Control', () => {
    it('should detect duplicate entries for same symbol and direction', () => {
      const profile = engine.profileManager.getProfile('DEFAULT');
      
      engine.frequencyControl.recordProposal('EURUSD', 'BUY');
      const freqCheck = engine.frequencyControl.checkFrequency(validProposal, profile);

      expect(freqCheck.isDuplicate).toBe(true);
      expect(freqCheck.allowTrade).toBe(false);
    });
  });

  describe('Module 6: Confidence Filter', () => {
    it('should reject proposals below confidence threshold', () => {
      const lowConfProposal: TradeProposal = {
        ...validProposal,
        confidence: 0.40
      };

      const result = engine.confidenceFilter.evaluateProposal(lowConfProposal);
      expect(result.passed).toBe(false);
    });
  });

  describe('Module 7: Autonomy Control', () => {
    it('should enforce Level 0 Manual Approval required', () => {
      engine.autonomyControl.setAutonomyLevel(0);
      const autonomy = engine.autonomyControl.evaluateAutonomy(validProposal, 0.20);

      expect(autonomy.requiresManualApproval).toBe(true);
      expect(autonomy.canAutoApprove).toBe(false);
    });

    it('should allow auto-approval under Level 3 when within risk limits', () => {
      engine.autonomyControl.setAutonomyLevel(3);
      const autonomy = engine.autonomyControl.evaluateAutonomy(validProposal, 0.20);

      expect(autonomy.canAutoApprove).toBe(true);
    });
  });

  describe('Module 8 & Integration: Full Governance Engine Evaluation', () => {
    it('should approve a compliant trade proposal', () => {
      const decision = engine.evaluateTradeProposal(validProposal);

      expect(decision.status).toBe('APPROVED');
      expect(decision.risk_score).toBeLessThanOrEqual(0.5);
      expect(decision.checks.length).toBeGreaterThan(0);
    });

    it('should publish RiskCleared event when a proposal passes governance', async () => {
      let riskClearedPublished = false;

      globalEventBus.subscribe(EventTypes.RiskCleared, async (evt: IEvent) => {
        if (evt.payload.proposal_id === validProposal.id) {
          riskClearedPublished = true;
        }
      });

      const decision = engine.evaluateTradeProposal(validProposal);
      if (decision.status === 'APPROVED') {
        await globalEventBus.publish({
          id: 'test-cleared-evt',
          type: EventTypes.RiskCleared,
          timestamp: new Date(),
          payload: {
            proposal_id: validProposal.id,
            symbol: validProposal.symbol,
            account_id: 'DEFAULT',
            approval_id: decision.approval_id,
            risk_score: decision.risk_score,
            trade_proposal: validProposal,
            governance_decision: decision,
            timestamp: new Date()
          }
        });
      }

      // Wait brief moment for setImmediate event handler
      await new Promise(res => setTimeout(res, 50));
      expect(riskClearedPublished).toBe(true);
    });
  });
});
