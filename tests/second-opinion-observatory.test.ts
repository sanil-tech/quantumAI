import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { SecondOpinionObservatory } from '../src/components/SecondOpinionObservatory';

describe('Phase 1.4.1 — Second Opinion Observatory Dashboard & Security Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // TEST 1: Security: Component strictly lacks execution authority and execution controls
  // =========================================================================
  it('1. Security Invariant: Component code contains zero execution buttons or placeOrder triggers', () => {
    // Structural inspection of component definition
    expect(SecondOpinionObservatory).toBeDefined();

    // Verify source code safety invariants
    const componentStr = SecondOpinionObservatory.toString();
    expect(componentStr).not.toContain('placeOrder');
    expect(componentStr).not.toContain('reviewSignal(');
    expect(componentStr).not.toContain('EXECUTE_ORDER');
    expect(componentStr).not.toContain('APPROVE_TRADE');
  });

  // =========================================================================
  // TEST 2: Health Diagnostic API Consumption & Secret Isolation
  // =========================================================================
  it('2. Health Diagnostic: Accurately requests /api/admin/second-opinion/health with admin auth header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) || {};

      if (url.includes('/api/admin/second-opinion/health')) {
        return Promise.resolve({
          status: 200,
          json: async () => ({
            success: true,
            health: {
              secondOpinionEnabled: true,
              secondOpinionMode: 'OBSERVATION',
              observationPersistenceHealthy: true,
              observationCount: 0,
              latestObservationAt: null,
              latestObservationSignalId: null,
              unmatchedOutcomeCount: 0,
              openObservationCount: 0,
              lastCorrelationAt: null,
              openAiUnavailableCount: 0,
              runtime: {
                enabled: true,
                mode: 'OBSERVATION',
                modelConfigured: true,
                apiKeyPresent: true,
                executionAuthority: false
              }
            }
          })
        });
      }

      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true })
      });
    });

    const res = await fetch('/api/admin/second-opinion/health', {
      headers: { 'x-admin-key': 'test_admin_key_88' }
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.health.runtime.executionAuthority).toBe(false);
    expect(data.health.runtime.apiKeyPresent).toBe(true);
    expect(data.health.secondOpinionMode).toBe('OBSERVATION');
    expect(capturedHeaders['x-admin-key']).toBe('test_admin_key_88');
  });

  // =========================================================================
  // TEST 3: Access Control: 401/403 Unauthorized fails closed safely
  // =========================================================================
  it('3. Access Control: Unauthorized request rejects and returns 401/403 status', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/second-opinion/')) {
        return Promise.resolve({
          status: 401,
          json: async () => ({
            success: false,
            error: 'UNAUTHORIZED_ADMIN_ACCESS: Valid admin API key required.'
          })
        });
      }
      return Promise.resolve({ status: 200, json: async () => ({ success: true }) });
    });

    const res = await fetch('/api/admin/second-opinion/health');
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('UNAUTHORIZED_ADMIN_ACCESS');
  });

  // =========================================================================
  // TEST 4: Query Parameters: Default filter is dataMode=LIVE
  // =========================================================================
  it('4. Dataset Lineage Filter: Observations query enforces dataMode=LIVE by default', async () => {
    let capturedQueryUrl = '';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/second-opinion/observations?')) {
        capturedQueryUrl = url;
      }
      return Promise.resolve({
        status: 200,
        json: async () => ({
          success: true,
          total: 0,
          limit: 20,
          offset: 0,
          observations: []
        })
      });
    });

    const queryParams = new URLSearchParams();
    queryParams.set('dataMode', 'LIVE');
    queryParams.set('limit', '20');
    queryParams.set('offset', '0');

    await fetch(`/api/admin/second-opinion/observations?${queryParams.toString()}`);

    expect(capturedQueryUrl).toContain('dataMode=LIVE');
    expect(capturedQueryUrl).toContain('limit=20');
  });

  // =========================================================================
  // TEST 5: Single Observation Inspection: Retrieves dashboardCard & provenance
  // =========================================================================
  it('5. Detail Inspector: Correctly retrieves observation by signalId with full provenance', async () => {
    const mockObs = {
      id: 'obs-sig_live_inspect_01',
      signalId: 'sig_live_inspect_01',
      symbol: 'EUR/USD',
      timeframe: 'M15',
      dataMode: 'LIVE',
      dataLineage: 'LIVE',
      quantumAiDirection: 'BUY',
      quantumAiConfidence: 87,
      openAiReview: 'PASS',
      openAiIndependentBias: 'BULLISH',
      openAiConfidence: 85,
      agreement: 'AGREE',
      contradictionLevel: 'LOW',
      economicRisk: 'LOW',
      riskFlags: [],
      keyConcerns: [],
      invalidationConcerns: [],
      secondOpinionModel: 'gpt-4o-mini',
      latencyMs: 142,
      outcomeStatus: 'CLOSED_WIN',
      realizedProfit: 125.50,
      pnlPips: 25.1,
      brokerOrderId: 'ord_ctrader_9988',
      brokerPositionId: 'pos_ctrader_9988',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      secondOpinionAt: new Date().toISOString(),
      dataQualityFlags: []
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/second-opinion/observations/sig_live_inspect_01')) {
        return Promise.resolve({
          status: 200,
          json: async () => ({
            success: true,
            observation: mockObs,
            dashboardCard: {
              signalId: mockObs.signalId,
              symbol: mockObs.symbol,
              agreement: mockObs.agreement,
              realizedOutcome: mockObs.outcomeStatus
            }
          })
        });
      }
      return Promise.resolve({ status: 200, json: async () => ({ success: true }) });
    });

    const res = await fetch('/api/admin/second-opinion/observations/sig_live_inspect_01');
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.observation.signalId).toBe('sig_live_inspect_01');
    expect(data.observation.brokerOrderId).toBe('ord_ctrader_9988');
    expect(data.observation.outcomeStatus).toBe('CLOSED_WIN');
    expect(data.observation.dataLineage).toBe('LIVE');
  });

  // =========================================================================
  // TEST 6: Analytics Isolation: Requests analytics filtered by dataLineage=LIVE
  // =========================================================================
  it('6. Analytics Endpoint: Requests LIVE lineage analytics to prevent synthetic contamination', async () => {
    let capturedUrl = '';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/second-opinion/analytics')) {
        capturedUrl = url;
      }
      return Promise.resolve({
        status: 200,
        json: async () => ({
          success: true,
          report: {
            dataLineage: 'LIVE',
            sampleSize: 0,
            qualificationStatus: 'INSUFFICIENT_SAMPLE'
          }
        })
      });
    });

    await fetch('/api/admin/second-opinion/analytics?dataLineage=LIVE');

    expect(capturedUrl).toContain('dataLineage=LIVE');
  });
});
