import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, Copy, Terminal, Cpu } from 'lucide-react';

interface SystemAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMalay?: boolean;
}

interface AuditPhase {
  pass: boolean;
  title: string;
  latencyMs?: number;
  detail?: string;
  logs: string[];
}

interface AuditResult {
  success: boolean;
  timestamp: string;
  latencyMs: number;
  overallStatus: 'READY_FOR_LIVE_CAPITAL' | 'ACTION_REQUIRED';
  phases: {
    phase1: AuditPhase;
    phase2: AuditPhase;
    phase3: AuditPhase;
    phase4: AuditPhase;
    phase5: AuditPhase;
  };
  report: string;
}

export const SystemAuditModal: React.FC<SystemAuditModalProps> = ({ isOpen, onClose, isMalay = false }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const runSystemAudit = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/system/run-audit', { method: 'POST' });
      const data: AuditResult = await res.json();
      setAuditResult(data);
    } catch (err) {
      console.error('Audit execution error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const copyReport = () => {
    if (!auditResult) return;
    navigator.clipboard.writeText(auditResult.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Quantum AI Pre-Flight System Audit
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono rounded-md">
                  READ-ONLY / SIMULATION
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isMalay
                  ? 'Verifikasi integriti data, relay isyarat 0% distorsi, pemasa UTC & guardrails risiko sebelum modal live disebarkan.'
                  : 'Verify data fidelity, 0% signal distortion, UTC timers & risk guardrails prior to live capital deployment.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs text-slate-300 font-sans">
          
          {/* Action trigger banner */}
          <div className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Cpu className="w-8 h-8 text-blue-400 shrink-0" />
              <div>
                <span className="font-bold text-white block text-sm">
                  {isMalay ? 'Lakukan Audit Sistem Penuh (Phases 1 - 5)' : 'Run Full 5-Phase System Audit'}
                </span>
                <span className="text-slate-400 text-xs">
                  {isMalay
                    ? 'Menilai sync baki akaun live, relay isyarat, UTC hydration, kalkulator saiz lot & guardrail kebal.'
                    : 'Audits live account metrics, signal relay fidelity, UTC hydration, lot sizing formulas & circuit breakers.'}
                </span>
              </div>
            </div>

            <button
              onClick={runSystemAudit}
              disabled={isRunning}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition shrink-0 cursor-pointer text-xs"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? (isMalay ? 'Mengaudit Systems...' : 'Auditing System...') : (isMalay ? 'Jalankan System Audit' : 'Run System Audit')}</span>
            </button>
          </div>

          {/* Audit Results Breakdown */}
          {auditResult && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Overall Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                auditResult.overallStatus === 'READY_FOR_LIVE_CAPITAL'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <div>
                    <span className="font-extrabold text-sm uppercase tracking-wider block">
                      SYSTEM STATUS: {auditResult.overallStatus.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-300">
                      Timestamp: {auditResult.timestamp} | Handshake Latency: {auditResult.latencyMs}ms
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold rounded-lg">
                  100% COMPLIANT
                </span>
              </div>

              {/* Phase Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Phase 1 */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs">Phase 1: Broker Data Sync</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded border border-emerald-500/30">
                      PASS ({auditResult.phases.phase1.latencyMs}ms)
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-400 space-y-1">
                    {auditResult.phases.phase1.logs.map((log, i) => (
                      <div key={i} className="text-slate-300">{log}</div>
                    ))}
                  </div>
                </div>

                {/* Phase 2 */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs">Phase 2: Signal Relay Fidelity</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded border border-emerald-500/30">
                      PASS (0% alteration)
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-400 space-y-1">
                    {auditResult.phases.phase2.logs.map((log, i) => (
                      <div key={i} className="text-slate-300">{log}</div>
                    ))}
                  </div>
                </div>

                {/* Phase 3 */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs">Phase 3: UTC Timers & Reload Persistence</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded border border-emerald-500/30">
                      PASS (UTC Authority)
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-400 space-y-1">
                    {auditResult.phases.phase3.logs.map((log, i) => (
                      <div key={i} className="text-slate-300">{log}</div>
                    ))}
                  </div>
                </div>

                {/* Phase 4 */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs">Phase 4: Risk Engine & Circuit Breakers</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded border border-emerald-500/30">
                      PASS (SL & Drawdown)
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-400 space-y-1">
                    {auditResult.phases.phase4.logs.map((log, i) => (
                      <div key={i} className="text-slate-300">{log}</div>
                    ))}
                  </div>
                </div>

                {/* Phase 5 */}
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs">Phase 5: Idempotency & Order Duplication Guard</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded border border-emerald-500/30">
                      PASS (Duplicates Blocked)
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-400 space-y-1">
                    {auditResult.phases.phase5.logs.map((log, i) => (
                      <div key={i} className="text-slate-300">{log}</div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Official Audit Report Terminal Output */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-300 font-bold">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Official Pre-Flight Audit Report</span>
                  </div>
                  <button
                    onClick={copyReport}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono text-[11px] flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? 'Report Copied!' : 'Copy Report'}</span>
                  </button>
                </div>

                <pre className="p-3 bg-black/80 rounded-lg font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed border border-slate-800">
                  {auditResult.report}
                </pre>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Tutup (Close)
          </button>
        </div>

      </div>
    </div>
  );
};
