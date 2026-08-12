import React, { useState, useEffect } from 'react';
import { User, ShieldCheck, CreditCard, Key, CheckCircle, AlertCircle, Zap, Building2, Sliders, X } from 'lucide-react';
import { TraderProfile } from '../types';
import { Language } from '../lib/translations';

interface TraderAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onProfileUpdated?: (profile: TraderProfile) => void;
}

export const TraderAccountModal: React.FC<TraderAccountModalProps> = ({
  isOpen,
  onClose,
  language,
  onProfileUpdated
}) => {
  const isMalay = language === 'ms';

  const [profile, setProfile] = useState<TraderProfile>({
    id: 'trader-882910',
    fullName: 'Pedagang Forex Pro',
    email: 'trader@quantumfx.ai',
    accountType: 'DEMO',
    accountNumber: 'ACC-882910',
    currency: 'USD',
    leverage: '1:500',
    riskTolerance: 'MODERATE',
    kycVerified: true,
    registeredAt: Date.now() - 86400000 * 30
  });

  const [fullName, setFullName] = useState(profile.fullName);
  const [email, setEmail] = useState(profile.email);
  const [accountType, setAccountType] = useState<'DEMO' | 'REAL_MONEY'>(profile.accountType);
  const [currency, setCurrency] = useState(profile.currency);
  const [leverage, setLeverage] = useState(profile.leverage);
  const [riskTolerance, setRiskTolerance] = useState<'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'>(profile.riskTolerance);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load profile from server
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/trader/profile')
      .then(res => res.json())
      .then(data => {
        if (data && data.profile) {
          setProfile(data.profile);
          setFullName(data.profile.fullName);
          setEmail(data.profile.email);
          setAccountType(data.profile.accountType);
          setCurrency(data.profile.currency);
          setLeverage(data.profile.leverage);
          setRiskTolerance(data.profile.riskTolerance);
        }
      })
      .catch(err => console.error('Failed to load profile:', err));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/trader/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          accountType,
          currency,
          leverage,
          riskTolerance
        })
      });

      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
        setSaveSuccess(true);
        if (onProfileUpdated) onProfileUpdated(data.profile);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900/60 via-slate-900 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {isMalay ? 'Profil & Akaun Pedagang' : 'Trader Account & Profile'}
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono uppercase">
                  Standard FX Trader
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isMalay ? 'Urus maklumat akaun, jenis dagangan & tahap risiko' : 'Manage account details, trading mode & risk level'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Trader ID Card Banner */}
        <div className="p-6 space-y-6">
          <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden shadow-inner">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-white">{profile.fullName}</span>
                  {profile.kycVerified && (
                    <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                      <ShieldCheck className="w-3 h-3" /> KYC Verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-mono">{profile.email}</p>
                <p className="text-xs text-slate-500 font-mono">Trader ID: {profile.accountNumber}</p>
              </div>

              <div className="text-right">
                <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-lg border ${
                  accountType === 'REAL_MONEY'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {accountType === 'REAL_MONEY' ? '🔥 REAL MONEY ACCOUNT' : '🧪 DEMO SIMULATION'}
                </span>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">Leverage {profile.leverage}</p>
              </div>
            </div>
          </div>

          {/* Registration / Account Edit Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isMalay ? 'Nama Penuh Pedagang' : 'Full Trader Name'}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isMalay ? 'E-mel Pengguna' : 'User Email'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isMalay ? 'Mod Dagangan' : 'Trading Mode'}
                </label>
                <select
                  value={accountType}
                  onChange={e => setAccountType(e.target.value as 'DEMO' | 'REAL_MONEY')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="DEMO">Demo Account ($100 - $10,000)</option>
                  <option value="REAL_MONEY">Real Money Broker Account</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isMalay ? 'Mata Wang Utama' : 'Account Currency'}
                </label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="USD">USD ($)</option>
                  <option value="MYR">MYR (RM)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isMalay ? 'Nisbah Nisbah Nisbah' : 'Account Leverage'}
                </label>
                <select
                  value={leverage}
                  onChange={e => setLeverage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="1:100">1:100</option>
                  <option value="1:200">1:200</option>
                  <option value="1:500">1:500 (Standard)</option>
                  <option value="1:1000">1:1000 (High Risk)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isMalay ? 'Profil Toleransi Risiko' : 'Risk Tolerance Profile'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CONSERVATIVE', label: isMalay ? 'Konservatif (0.5% Lot)' : 'Conservative (0.5%)', color: 'border-emerald-500/40 text-emerald-400' },
                  { id: 'MODERATE', label: isMalay ? 'Sederhana (1-2% Lot)' : 'Moderate (1-2%)', color: 'border-blue-500/40 text-blue-400' },
                  { id: 'AGGRESSIVE', label: isMalay ? 'Agresif (3%+ Lot)' : 'Aggressive (3%+)', color: 'border-amber-500/40 text-amber-400' }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRiskTolerance(r.id as any)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold text-center transition ${
                      riskTolerance === r.id
                        ? `${r.color} bg-slate-800 ring-2 ring-blue-500/30`
                        : 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-900'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {saveSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{isMalay ? 'Profil akaun pedagang berjaya dikemaskini!' : 'Trader profile successfully updated!'}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
              >
                {isMalay ? 'Batal' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
              >
                {isSaving ? (isMalay ? 'Menyimpan...' : 'Saving...') : (isMalay ? 'Simpan Profil Akaun' : 'Save Account Profile')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
