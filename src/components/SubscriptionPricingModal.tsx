import React, { useState } from 'react';
import { 
  Check, Zap, Sparkles, ShieldCheck, DollarSign, ArrowRight,
  HelpCircle, CheckCircle, Flame, Star, X, Lock, Calculator, TrendingUp
} from 'lucide-react';
import { tradeAudio } from '../utils/tradeAudio';

interface SubscriptionPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCapital?: number;
  onSelectPlan: (planName: string, price: number) => void;
}

export const SubscriptionPricingModal: React.FC<SubscriptionPricingModalProps> = ({
  isOpen,
  onClose,
  currentCapital = 2500,
  onSelectPlan
}) => {
  const [sliderCapital, setSliderCapital] = useState<number>(currentCapital > 0 ? currentCapital : 2500);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>('PRO');

  if (!isOpen) return null;

  // Realistic conservative monthly return estimation based on verified SMC edge (8% - 14% / mo)
  const estMinMonthlyReturn = Number((sliderCapital * 0.08).toFixed(0));
  const estMaxMonthlyReturn = Number((sliderCapital * 0.14).toFixed(0));
  const proMonthlyCost = billingCycle === 'ANNUAL' ? 55 : 69;
  const netMonthlyProfit = Math.max(0, estMinMonthlyReturn - proMonthlyCost);

  const handleChoosePlan = (planName: string, price: number) => {
    tradeAudio.play('TP_HIT');
    onSelectPlan(planName, price);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-indigo-950/50 my-8 overflow-hidden">
        
        {/* Top Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border-b border-slate-800/80 flex items-start justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pakej Langganan Autopilot Rasmi</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              Pilih Pelan &amp; Gandakan Modal Anda Secara Automatik
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Model 100% Non-Custodial. Dana kekal di akaun cTrader anda — AI hanya menguruskan eksekusi gred institusi.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 1. INTERACTIVE CAPITAL ROI CALCULATOR */}
          <div className="p-5 bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950 border border-indigo-500/30 rounded-2xl shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Simulasi Pulangan Modal (ROI Simulator)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Berapa modal dagangan anda di cTrader?
                  </span>
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-xs text-slate-400">Modal Semasa:</div>
                <div className="text-lg font-black text-cyan-400">
                  ${sliderCapital.toLocaleString()} USD
                </div>
              </div>
            </div>

            {/* Slider */}
            <div className="space-y-1">
              <input
                type="range"
                min="500"
                max="25000"
                step="500"
                value={sliderCapital}
                onChange={e => setSliderCapital(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>$500 USD</span>
                <span>$5,000 USD</span>
                <span>$10,000 USD</span>
                <span>$25,000 USD</span>
              </div>
            </div>

            {/* Simulation Impact Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl text-center">
                <div className="text-[11px] text-slate-400">Anggaran Hasil Bulanan (8-14%):</div>
                <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                  +${estMinMonthlyReturn} - ${estMaxMonthlyReturn} / bln
                </div>
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl text-center">
                <div className="text-[11px] text-slate-400">Yuran Langganan Pro:</div>
                <div className="text-base font-black text-slate-300 font-mono mt-0.5">
                  ${proMonthlyCost} / bln
                </div>
              </div>

              <div className="p-3 bg-cyan-950/40 border border-cyan-500/40 rounded-xl text-center">
                <div className="text-[11px] text-cyan-300 font-semibold">Baki Keuntungan Bersih:</div>
                <div className="text-base font-black text-cyan-400 font-mono mt-0.5">
                  +${netMonthlyProfit} USD / bln
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                <strong>Langganan Terbayar Sendiri:</strong> Hasil keuntungan di cTrader jauh melebihi yuran bulanan.
              </span>
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="flex items-center justify-center gap-3">
            <div className="p-1 bg-slate-950 border border-slate-800 rounded-xl inline-flex items-center">
              <button
                onClick={() => setBillingCycle('MONTHLY')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  billingCycle === 'MONTHLY'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bulanan
              </button>
              <button
                onClick={() => setBillingCycle('ANNUAL')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  billingCycle === 'ANNUAL'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Tahunan</span>
                <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 rounded text-[9px] font-black">
                  JIMAT 20%
                </span>
              </button>
            </div>
          </div>

          {/* 2. 3 TIERED PRICING CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. STARTER */}
            <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-black text-white">Starter Trader</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Sesuai untuk modal permulaan ($500 - $1,500)</p>
                </div>
                <div className="font-mono">
                  <span className="text-2xl font-black text-white">
                    {billingCycle === 'ANNUAL' ? '$31' : '$39'}
                  </span>
                  <span className="text-xs text-slate-400"> / bulan</span>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                    (~RM{billingCycle === 'ANNUAL' ? '139' : '169'}/bln)
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>3 Pasangan Forex Utama (EUR, GBP, JPY)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Autopilot 1-Akaun cTrader</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Mod Konservatif (0.5% - 1.0% Risiko)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Perlindungan Breakeven Automatik</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleChoosePlan('Starter', billingCycle === 'ANNUAL' ? 31 : 39)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer border border-slate-700"
              >
                Pilih Pelan Starter
              </button>
            </div>

            {/* 2. PRO TRADER (BEST SELLER) */}
            <div className="p-5 bg-gradient-to-b from-indigo-950/60 via-slate-900 to-slate-950 border-2 border-cyan-500/80 rounded-2xl flex flex-col justify-between space-y-4 shadow-xl shadow-cyan-950/40 relative">
              {/* Highlight Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-full shadow-md flex items-center gap-1">
                <Flame className="w-3 h-3 fill-slate-950" />
                <span>Paling Popular (Disyorkan)</span>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <h4 className="text-sm font-black text-cyan-300 flex items-center gap-1.5">
                    <span>Pro Trader Autopilot</span>
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">Untuk modal $1,500 - $10,000</p>
                </div>
                <div className="font-mono">
                  <span className="text-3xl font-black text-white">
                    {billingCycle === 'ANNUAL' ? '$55' : '$69'}
                  </span>
                  <span className="text-xs text-slate-400"> / bulan</span>
                  <div className="text-[11px] text-cyan-400 font-sans mt-0.5">
                    (~RM{billingCycle === 'ANNUAL' ? '249' : '299'}/bln)
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-200 pt-2 border-t border-cyan-900/50">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>Semua 12 Pasangan Aset</strong> (Termasuk Emas &amp; NASDAQ)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Imbasan SMC Multi-Timeframe (M15 - H4)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>24/7 Autonomous Radar Scanner</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Trailing Stop Dinamik Bertaraf Institusi</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Notifikasi Isyarat Telegram / WhatsApp Segera</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleChoosePlan('Pro Trader', billingCycle === 'ANNUAL' ? 55 : 69)}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Langgan Pelan Pro Sekarang</span>
              </button>
            </div>

            {/* 3. VIP INSTITUTION */}
            <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-black text-purple-300">VIP Institution</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Untuk Fund Managers ($10,000+)</p>
                </div>
                <div className="font-mono">
                  <span className="text-2xl font-black text-white">
                    {billingCycle === 'ANNUAL' ? '$119' : '$149'}
                  </span>
                  <span className="text-xs text-slate-400"> / bulan</span>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                    (~RM{billingCycle === 'ANNUAL' ? '529' : '649'}/bln)
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Pelbagai Akaun Broker Serentak (Multi-Binding)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Custom Risk Gate &amp; Max Daily Loss Limits</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Priority Sub-Millisecond Execution</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Bimbingan Setup 1-on-1 &amp; Khidmat VIP</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleChoosePlan('VIP Institution', billingCycle === 'ANNUAL' ? 119 : 149)}
                className="w-full py-2.5 bg-purple-900/40 hover:bg-purple-800/50 text-purple-200 font-bold text-xs rounded-xl transition cursor-pointer border border-purple-500/40"
              >
                Pilih Pelan VIP
              </button>
            </div>
          </div>

          {/* Trust Guarantees */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span><strong>Jaminan Wang Dikembalikan 30-Hari</strong> jika tidak berpuas hati.</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Pembayaran Selamat &amp; Boleh Batalkan Langganan Bila-Bila Masa.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
