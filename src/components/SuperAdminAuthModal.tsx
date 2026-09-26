import React, { useState } from 'react';
import { ShieldCheck, Lock, Key, AlertCircle, X, CheckCircle, Mail } from 'lucide-react';

interface SuperAdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isMalay?: boolean;
}

export const SuperAdminAuthModal: React.FC<SuperAdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isMalay = true
}) => {
  const [email, setEmail] = useState('sanilbans88@gmail.com');
  const [adminKey, setAdminKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanKey = adminKey.trim();

    if (cleanEmail !== 'sanilbans88@gmail.com') {
      setError(isMalay 
        ? 'Akses Ditolak: Hanya emel Super Admin (sanilbans88@gmail.com) dibenarkan.' 
        : 'Access Denied: Only Super Admin email (sanilbans88@gmail.com) is authorized.');
      setIsLoading(false);
      return;
    }

    if (!cleanKey) {
      setError(isMalay ? 'Sila masukkan Kunci Rahsia Admin.' : 'Please enter Admin Secret Key.');
      setIsLoading(false);
      return;
    }

    // Save authorized credentials in localStorage
    try {
      localStorage.setItem('super_admin_email', 'sanilbans88@gmail.com');
      localStorage.setItem('admin_api_key', cleanKey);
      localStorage.setItem('admin_authenticated', 'true');
    } catch {}

    setTimeout(() => {
      setIsLoading(false);
      onSuccess();
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-purple-500/40 rounded-3xl shadow-2xl shadow-purple-950/50 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border-b border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShieldCheck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                <span>Super Admin Gate</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  RBAC PROTECTED
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Pusat Kawalan Master & Multi-Tenant Fleet
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-purple-400" />
              <span>Emel Super Admin:</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-purple-400" />
              <span>Kunci Rahsia Pentadbir (Admin Secret Key):</span>
            </label>
            <input
              type="password"
              placeholder="Masukkan Admin Secret Key..."
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none transition"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>{isLoading ? 'Mengesahkan Hak Akses...' : 'Buka Pusat Kawalan Admin'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Penyewa dan pelanggan biasa tidak mempunyai kebenaran untuk mengakses ruangan ini.
          </p>
        </form>

      </div>
    </div>
  );
};
