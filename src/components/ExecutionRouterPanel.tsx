import React, { useState, useEffect } from 'react';
import { Cpu, ShieldCheck, Zap, Activity, ArrowRight, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw, BarChart2 } from 'lucide-react';
import { Language } from '../lib/translations';

interface OrderItem {
  order_id: string;
  proposal_id: string;
  approval_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  order_type: string;
  status: string;
  created_at: string;
  broker_id: string;
}

interface PositionItem {
  position_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_profit: number;
  realized_profit: number;
  status: string;
  updated_at: string;
}

interface ExecutionPerformance {
  account_status?: {
    accountId: string;
    brokerId: string;
    balance: number;
    equity: number;
    currency: string;
    connected: boolean;
  };
  metrics?: {
    total_orders: number;
    filled_orders: number;
    rejected_orders: number;
    average_slippage_pips: number;
  };
}

interface ExecutionRouterPanelProps {
  currentPrice: number;
  activePair: string;
  language?: Language;
}

export const ExecutionRouterPanel: React.FC<ExecutionRouterPanelProps> = ({
  currentPrice,
  activePair,
  language = 'ms'
}) => {
  const isMalay = language === 'ms';

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [performance, setPerformance] = useState<ExecutionPerformance | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [executingSim, setExecutingSim] = useState<boolean>(false);
  const [lastExecutionLog, setLastExecutionLog] = useState<string | null>(null);

  const fetchExecutionData = async () => {
    setLoading(true);
    try {
      const [ordRes, posRes, perfRes] = await Promise.all([
        fetch('/api/execution/orders'),
        fetch('/api/execution/positions'),
        fetch('/api/execution/performance')
      ]);

      if (ordRes.ok) {
        const data = await ordRes.json();
        setOrders(data.orders || []);
      }
      if (posRes.ok) {
        const data = await posRes.json();
        setPositions(data.positions || []);
      }
      if (perfRes.ok) {
        const data = await perfRes.json();
        setPerformance(data);
      }
    } catch (e) {
      console.error('Failed to fetch execution data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutionData();
    const interval = setInterval(fetchExecutionData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulateFullGovernanceAndExecution = async () => {
    setExecutingSim(true);
    setLastExecutionLog(null);
    try {
      const simSymbol = activePair.replace('/', '');
      const mockProposal = {
        id: `prop-sim-${Date.now().toString().slice(-4)}`,
        symbol: simSymbol,
        direction: Math.random() > 0.5 ? 'BUY' : 'SELL',
        confidence: 0.89,
        evidence: ['SMC Liquidity Sweep', 'EMA200 Confluence', 'RSI Bullish Momentum'],
        agent_votes: [
          { agent_id: 'SMC_Agent', direction: 'BUY', weight: 0.9, rationale: 'Order block test' },
          { agent_id: 'Risk_Agent', direction: 'BUY', weight: 0.85, rationale: 'Low exposure' }
        ],
        why_direction: 'Multi-agent consensus with low drawdown risk',
        invalidate_conditions: ['Price breach below SL'],
        timestamp: new Date().toISOString()
      };

      const res = await fetch('/api/risk/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal: mockProposal, accountId: 'DEFAULT' })
      });

      const data = await res.json();
      if (res.ok && data.decision?.status === 'APPROVED') {
        setLastExecutionLog(
          `✅ TradeProposal [${mockProposal.id}] -> Risk Approval [${data.decision.approval_id}] -> Executed Order [${data.execution?.order?.order_id}] (Filled @ ${data.execution?.report?.filled_price}, Latency: ${data.execution?.report?.latency_ms}ms)`
        );
        fetchExecutionData();
      } else {
        setLastExecutionLog(`❌ Trade Rejected by Governance Engine: ${data.decision?.rejection_reasons?.join(', ') || 'Risk limits exceeded'}`);
      }
    } catch (err: any) {
      setLastExecutionLog(`⚠️ Execution Error: ${err.message}`);
    } finally {
      setExecutingSim(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-slate-100">
              {isMalay ? 'Enjin Laluan Pelaksanaan & Broker Kertas (Sprint 6)' : 'Execution Router & Paper Trading Engine (Sprint 6)'}
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              STRICT EXECUTION ONLY
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isMalay
              ? 'Menterjemah keputusan TradeProposal + Kelulusan Risiko secara terkawal tanpa mengubah strategi.'
              : 'Converts TradeProposal + Risk Approval into controlled simulated broker orders without strategy overrides.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchExecutionData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs flex items-center gap-1.5"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isMalay ? 'Kemas Kini' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleSimulateFullGovernanceAndExecution}
            disabled={executingSim}
            className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-blue-900/30 disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${executingSim ? 'animate-pulse' : ''}`} />
            <span>{isMalay ? 'Uji Laluan Pelaksanaan Risiko' : 'Simulate Risk Execution Pipeline'}</span>
          </button>
        </div>
      </div>

      {/* Execution Pipeline Diagram */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5">
        <div className="text-[11px] font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span>{isMalay ? 'Aliran Paip Pelaksanaan Terjamin' : 'Enforced Execution Pipeline'}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-slate-900 border border-blue-500/30 rounded p-2 text-blue-300 font-medium flex flex-col items-center">
            <span className="text-[10px] text-slate-400">Step 1</span>
            <span>RiskCleared Event</span>
          </div>
          <div className="bg-slate-900 border border-indigo-500/30 rounded p-2 text-indigo-300 font-medium flex flex-col items-center">
            <span className="text-[10px] text-slate-400">Step 2</span>
            <span>Execution Router</span>
          </div>
          <div className="bg-slate-900 border border-purple-500/30 rounded p-2 text-purple-300 font-medium flex flex-col items-center">
            <span className="text-[10px] text-slate-400">Step 3</span>
            <span>Broker Adapter</span>
          </div>
          <div className="bg-slate-900 border border-emerald-500/30 rounded p-2 text-emerald-300 font-medium flex flex-col items-center">
            <span className="text-[10px] text-slate-400">Step 4</span>
            <span>Paper Broker Fill</span>
          </div>
          <div className="bg-slate-900 border border-cyan-500/30 rounded p-2 text-cyan-300 font-medium flex flex-col items-center col-span-2 md:col-span-1">
            <span className="text-[10px] text-slate-400">Step 5</span>
            <span>Position Updated</span>
          </div>
        </div>
      </div>

      {lastExecutionLog && (
        <div className="p-3 bg-slate-950 border border-blue-500/30 rounded-lg text-xs font-mono text-blue-300">
          {lastExecutionLog}
        </div>
      )}

      {/* Account Performance Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block">{isMalay ? 'Akaun Broker Kertas' : 'Paper Account Equity'}</span>
          <span className="text-base font-bold text-emerald-400 font-mono mt-0.5 block">
            ${performance?.account_status?.equity.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '100,000.00'} USD
          </span>
          <span className="text-[10px] text-slate-500">Broker: {performance?.account_status?.brokerId || 'paper-broker-01'}</span>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block">{isMalay ? 'Jumlah Pesanan' : 'Total Orders Executed'}</span>
          <span className="text-base font-bold text-slate-200 font-mono mt-0.5 block">
            {performance?.metrics?.total_orders || orders.length || 0}
          </span>
          <span className="text-[10px] text-emerald-400">{performance?.metrics?.filled_orders || 0} Filled</span>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block">{isMalay ? 'Purata Gelinciran (Slippage)' : 'Avg Slippage'}</span>
          <span className="text-base font-bold text-amber-400 font-mono mt-0.5 block">
            {performance?.metrics?.average_slippage_pips ? performance.metrics.average_slippage_pips.toFixed(4) : '0.0000'} pips
          </span>
          <span className="text-[10px] text-slate-500">Latency ~15ms</span>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 block">{isMalay ? 'Posisi Terbuka' : 'Open Positions'}</span>
          <span className="text-base font-bold text-cyan-400 font-mono mt-0.5 block">
            {positions.length}
          </span>
          <span className="text-[10px] text-slate-500">Live Tracked</span>
        </div>
      </div>

      {/* Orders Audit Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isMalay ? 'Jadual Audit Pesanan & Kelulusan Risiko' : 'Order & Risk Approval Audit Table'}</span>
          </h3>
          <span className="text-[10px] text-slate-500">{orders.length} Records</span>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
              <tr>
                <th className="p-2.5">Order ID</th>
                <th className="p-2.5">Risk Approval ID</th>
                <th className="p-2.5">Symbol</th>
                <th className="p-2.5">Type & Dir</th>
                <th className="p-2.5">Qty</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500 italic font-sans">
                    {isMalay ? 'Tiada pesanan lagi. Klik "Uji Laluan Pelaksanaan Risiko" di atas.' : 'No execution orders yet. Click "Simulate Risk Execution Pipeline" above.'}
                  </td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord.order_id} className="hover:bg-slate-900/60 transition">
                    <td className="p-2.5 text-blue-400 font-bold">{ord.order_id}</td>
                    <td className="p-2.5 text-emerald-400">{ord.approval_id}</td>
                    <td className="p-2.5 font-sans font-semibold text-slate-200">{ord.symbol}</td>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ord.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {ord.direction} ({ord.order_type})
                      </span>
                    </td>
                    <td className="p-2.5">{ord.quantity}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${ord.status === 'FILLED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {ord.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-400 text-[10px] font-sans">
                      {new Date(ord.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
