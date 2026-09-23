import React, { useState } from 'react';
import { 
  ShieldCheck, Zap, Bot, ArrowRight, CheckCircle, Check, 
  Sparkles, Lock, Sliders, Smartphone, User, Mail, DollarSign, X
} from 'lucide-react';
import { SubscriberRiskMode } from './SubscriberTrustCockpit';
import { tradeAudio } from '../utils/tradeAudio';

interface NewUserOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleteOnboarding: (userData: {
    fullName: string;
    email: string;
    phone: string;
    riskMode: SubscriberRiskMode;
    initialBalance: number;
  }) => void;
}

export const NewUserOnboardingModal: React.FC<NewUserOnboardingModalProps> = ({
  isOpen,
  onClose,
  onCompleteOnboarding
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [riskMode, setRiskMode] = useState<SubscriberRiskMode>('BALANCED');
  const [cTraderDemoOption, setCTraderDemoOption] = useState<'AUTO' | 'CUSTOM'>('AUTO');
  const [customAccountId, setCustomAccountId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    tradeAudio.play('OPEN');
    setStep(2);
  };

  const handleNextStep2 = () => {
    tradeAudio.play('OPEN');
    setStep(3);
  };

  const handleFinalize = () => {
    setIsSubmitting(true);
    tradeAudio.play('TP_HIT');
    
    // Persist trial status in localStorage
    try {
      const trialInfo = {
        fullName,
        email,
        phone,
        riskMode,
        startedAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        isTrialActive: true,
        accountId: cTraderDemoOption === 'CUSTOM' && customAccountId ? customAccountId : '5881460'
      };
      localStorage.setItem('quantum_subscriber_trial', JSON.stringify(trialInfo));
    } catch {}

    setTimeout(() => {
      setIsSubmitting(false);
      onCompleteOnboarding({
        fullName,
        email,
        phone,
        riskMode,
        initialBalance: 10000
      });
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-cyan-950/40 overflow-hidden">
        
        {/* Top Header Banner */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                <span>Pendaftaran Percubaan Percuma 7 Hari</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  DEMO AKTIF
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Saksikan AI Autopilot bertaraf institusi menjana trade secara langsung
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Pills */}
        <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-2 border-b border-slate-800/50">
          {[
            { num: 1, label: 'Maklumat Diri' },
            { num: 2, label: 'Sambung Broker' },
            { num: 3, label: 'Profil Risiko' }
          ].map(s => {
            const isDone = step > s.num;
            const isCur = step === s.num;
            return (
              <div key={s.num} className="flex-1 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isDone ? 'bg-emerald-500 text-slate-950' : isCur ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/30' : 'bg-slate-800 text-slate-400'
                }`}>
                  {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.num}
                </div>
                <span className={`text-xs hidden sm:inline ${isCur ? 'text-cyan-300 font-bold' : isDone ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="p-6">
          {/* STEP 1: Personal Info */}
          {step === 1 && (
            <form onSubmit={handleNextStep1} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Nama Penuh / Nama Panggilan:</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ahmad Razali"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Alamat Emel:</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="nama@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>No. WhatsApp / Telegram (Untuk Isyarat Trade Segera):</span>
                </label>
                <input
                  type="tel"
                  placeholder="+60123456789"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition"
                />
                <p className="text-[11px] text-slate-400">
                  🔒 Data anda 100% selamat &amp; tidak dikongsi dengan pihak ketiga.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Seterusnya: Sambung Akaun Demo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Broker Connection Selection */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300 leading-relaxed">
                Pilih kaedah sambungan akaun demo anda untuk memulakan dagangan autopilot:
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* Auto Provisioned Demo Account */}
                <div
                  onClick={() => setCTraderDemoOption('AUTO')}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    cTraderDemoOption === 'AUTO'
                      ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-950/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">⚡ Akaun Demo cTrader Segera (Disyorkan)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        1-KLIK
                      </span>
                    </div>
                    {cTraderDemoOption === 'AUTO' && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <p className="text-xs text-slate-400">
                    Sistem mengaktifkan akaun Spotware cTrader Open API sedia ada (#{customAccountId || '5881460'}) dengan baki demo $10,000 serta-merta tanpa perlu mengisi borang broker.
                  </p>
                </div>

                {/* Custom cTrader Account */}
                <div
                  onClick={() => setCTraderDemoOption('CUSTOM')}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    cTraderDemoOption === 'CUSTOM'
                      ? 'bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-950/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">🔗 Sambung Akaun cTrader Sendiri</span>
                    </div>
                    {cTraderDemoOption === 'CUSTOM' && <CheckCircle className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <p className="text-xs text-slate-400">
                    Gunakan akaun cTrader anda sendiri (IC Markets, Pepperstone, TopFX, dll).
                  </p>

                  {cTraderDemoOption === 'CUSTOM' && (
                    <div className="mt-3 pt-3 border-t border-indigo-900/50">
                      <label className="text-[11px] font-mono text-indigo-300 block mb-1">
                        Nombor Akaun cTrader Demo:
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: 5881460"
                        value={customAccountId}
                        onChange={e => setCustomAccountId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Non Custodial Trust Badge */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-[11px] text-slate-400">
                  <strong className="text-slate-200">100% Non-Custodial:</strong> Kami tidak pernah memegang modal anda. Anda mempunyai kawalan penuh untuk menjeda atau menutup posisi pada bila-bila masa.
                </span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="py-3.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  onClick={handleNextStep2}
                  className="flex-1 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Seterusnya: Tetapkan Profil Risiko</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Risk Profile Selector & Finish */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300 leading-relaxed">
                Pilih profil pengurusan risiko yang paling sesuai dengan matlamat anda:
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* Conservative */}
                <div
                  onClick={() => setRiskMode('CONSERVATIVE')}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    riskMode === 'CONSERVATIVE'
                      ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-black ${riskMode === 'CONSERVATIVE' ? 'text-emerald-400' : 'text-slate-300'}`}>
                      🛡️ Konservatif (0.5% Risiko per Trade)
                    </span>
                    {riskMode === 'CONSERVATIVE' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Fokus modal selamat pada pasangan Major (EUR/USD, GBP/USD). Perlindungan drawdown maksima &lt; 3.5%.
                  </p>
                </div>

                {/* Balanced */}
                <div
                  onClick={() => setRiskMode('BALANCED')}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    riskMode === 'BALANCED'
                      ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-black ${riskMode === 'BALANCED' ? 'text-cyan-400' : 'text-slate-300'}`}>
                      ⚖️ Seimbang (1.0% Risiko per Trade) — Paling Disyorkan
                    </span>
                    {riskMode === 'BALANCED' && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Pertumbuhan konsisten merangkumi Major &amp; JPY crosses dengan breakeven automatik 1:1.5 RR.
                  </p>
                </div>

                {/* Pro Dynamic */}
                <div
                  onClick={() => setRiskMode('PRO')}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    riskMode === 'PRO'
                      ? 'bg-purple-950/40 border-purple-500/60 shadow-md shadow-purple-950/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-black ${riskMode === 'PRO' ? 'text-purple-400' : 'text-slate-300'}`}>
                      ⚡ Pro Dinamik (2.0% Risiko per Trade)
                    </span>
                    {riskMode === 'PRO' && <CheckCircle className="w-4 h-4 text-purple-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Akses penuh imbasan 28 pasangan Forex &amp; aset termasuk Emas (XAU/USD) &amp; NASDAQ dengan SMC order block.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="py-3.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={handleFinalize}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-4 h-4" />
                  <span>{isSubmitting ? 'Mengaktifkan Autopilot...' : '🚀 Mulakan Percubaan Demo 7 Hari'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
