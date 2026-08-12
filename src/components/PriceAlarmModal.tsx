import React, { useState } from 'react';
import { CurrencyPair, PriceAlarm } from '../types';
import { PAIR_CONFIGS } from '../lib/marketDataGenerator';
import { Bell, BellRing, Plus, Trash2, X, Check, Volume2, AlertCircle, ArrowUpRight, ArrowDownRight, ShieldCheck } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface PriceAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePair: CurrencyPair;
  currentPrice: number;
  alarms: PriceAlarm[];
  onAddAlarm: (alarm: Omit<PriceAlarm, 'id' | 'createdAt' | 'triggered'>) => void;
  onDeleteAlarm: (id: string) => void;
  onClearTriggered: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  playAlarmChime: () => void;
  language?: Language;
}

export const PriceAlarmModal: React.FC<PriceAlarmModalProps> = ({
  isOpen,
  onClose,
  activePair,
  currentPrice,
  alarms,
  onAddAlarm,
  onDeleteAlarm,
  onClearTriggered,
  soundEnabled,
  setSoundEnabled,
  playAlarmChime,
  language = 'ms',
}) => {
  const t = translations[language] || translations.ms;
  const [selectedPair, setSelectedPair] = useState<CurrencyPair>(activePair);
  const [targetPriceInput, setTargetPriceInput] = useState<string>(currentPrice.toString());
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [noteInput, setNoteInput] = useState<string>('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  if (!isOpen) return null;

  const decimals = PAIR_CONFIGS[selectedPair]?.decimals || 5;
  const pipMultiplier = PAIR_CONFIGS[selectedPair]?.pipMultiplier || 10000;

  const handleQuickAdjustPips = (pips: number) => {
    const numericTarget = parseFloat(targetPriceInput) || currentPrice;
    const adjusted = numericTarget + pips / pipMultiplier;
    setTargetPriceInput(adjusted.toFixed(decimals));
    if (adjusted > currentPrice) {
      setCondition('ABOVE');
    } else {
      setCondition('BELOW');
    }
  };

  const handleSetCurrentPrice = () => {
    setTargetPriceInput(currentPrice.toFixed(decimals));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(targetPriceInput);
    if (isNaN(price) || price <= 0) return;

    onAddAlarm({
      pair: selectedPair,
      targetPrice: price,
      condition,
      note: noteInput.trim() || undefined,
    });

    setNoteInput('');
  };

  const requestBrowserNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    }
  };

  const pendingAlarms = alarms.filter((a) => !a.triggered);
  const triggeredAlarms = alarms.filter((a) => a.triggered);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Price Level Alarms
                <span className="text-xs font-mono font-normal bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50">
                  {pendingAlarms.length} Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">Set alerts when market price crosses target key levels</p>
            </div>
          </div>

          <button
            id="close-price-alarm-modal"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Audio & Notification Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Sound Toggle */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Volume2 className={`w-4 h-4 ${soundEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Audio Chime</div>
                  <div className="text-[11px] text-slate-400">Play sound on price hit</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={playAlarmChime}
                  className="text-[11px] px-2 py-1 bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded border border-slate-600/50 transition"
                  title="Test Sound Chime"
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                    soundEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
                </button>
              </div>
            </div>

            {/* Browser Push Permission */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className={`w-4 h-4 ${notificationPermission === 'granted' ? 'text-blue-400' : 'text-amber-400'}`} />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Browser Alerts</div>
                  <div className="text-[11px] text-slate-400">
                    {notificationPermission === 'granted' ? 'Notifications active' : 'Enable system alerts'}
                  </div>
                </div>
              </div>

              {notificationPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={requestBrowserNotification}
                  className="text-xs font-medium px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition shadow-sm"
                >
                  Enable
                </button>
              ) : (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60">
                  <Check className="w-3 h-3" /> Granted
                </span>
              )}
            </div>
          </div>

          {/* Form to Set New Alarm */}
          <form onSubmit={handleSubmit} className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-4 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" /> Create Price Alarm
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Select Pair */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Currency Pair</label>
                <select
                  value={selectedPair}
                  onChange={(e) => {
                    const p = e.target.value as CurrencyPair;
                    setSelectedPair(p);
                    const baseP = PAIR_CONFIGS[p]?.basePrice || 1.0;
                    setTargetPriceInput(baseP.toString());
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  {Object.keys(PAIR_CONFIGS).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Trigger Condition</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCondition('ABOVE')}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition border ${
                      condition === 'ABOVE'
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/60 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" /> Rises Above
                  </button>
                  <button
                    type="button"
                    onClick={() => setCondition('BELOW')}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition border ${
                      condition === 'BELOW'
                        ? 'bg-rose-600/20 text-rose-300 border-rose-500/60 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" /> Falls Below
                  </button>
                </div>
              </div>
            </div>

            {/* Target Price & Quick Adjust Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-400">Target Price Level</label>
                {selectedPair === activePair && (
                  <button
                    type="button"
                    onClick={handleSetCurrentPrice}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-mono underline"
                  >
                    Use Live Rate ({currentPrice.toFixed(decimals)})
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={targetPriceInput}
                  onChange={(e) => setTargetPriceInput(e.target.value)}
                  placeholder="e.g. 1.08500"
                  required
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 font-bold focus:outline-none focus:border-blue-500"
                />

                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg shadow transition flex items-center gap-1.5 shrink-0"
                >
                  <Bell className="w-4 h-4" /> Save Alarm
                </button>
              </div>

              {/* Quick Pip Presets */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
                <span className="text-[11px] text-slate-400 font-medium">Quick Offset:</span>
                {[-50, -20, -10, 10, 20, 50].map((pips) => (
                  <button
                    key={pips}
                    type="button"
                    onClick={() => handleQuickAdjustPips(pips)}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono border border-slate-700/80 transition"
                  >
                    {pips > 0 ? `+${pips} pips` : `${pips} pips`}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Optional Note / Strategy Setup</label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="e.g. Check H4 Order Block rejection or Breakout retest"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </form>

          {/* Active Pending Alarms List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Active Pending Alarms ({pendingAlarms.length})</span>
            </h3>

            {pendingAlarms.length === 0 ? (
              <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-500 text-xs">
                No active price alarms set. Enter a price target above to get notified live.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pendingAlarms.map((alarm) => {
                  const dec = PAIR_CONFIGS[alarm.pair]?.decimals || 5;
                  const isCurPair = alarm.pair === activePair;
                  return (
                    <div
                      key={alarm.id}
                      className={`p-3 rounded-lg border flex items-center justify-between transition ${
                        isCurPair
                          ? 'bg-slate-800/80 border-blue-500/40 shadow-sm'
                          : 'bg-slate-800/40 border-slate-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-100">{alarm.pair}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                              alarm.condition === 'ABOVE'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                                : 'bg-rose-950 text-rose-300 border border-rose-800/50'
                            }`}
                          >
                            {alarm.condition === 'ABOVE' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {alarm.condition === 'ABOVE' ? 'Rises >' : 'Falls <'}
                          </span>
                        </div>
                        <div className="text-sm font-mono font-bold text-white">
                          {alarm.targetPrice.toFixed(dec)}
                        </div>
                        {alarm.note && (
                          <div className="text-[11px] text-slate-400 italic line-clamp-1">"{alarm.note}"</div>
                        )}
                      </div>

                      <button
                        onClick={() => onDeleteAlarm(alarm.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-700/50 rounded transition"
                        title="Delete Alarm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Triggered History */}
          {triggeredAlarms.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Triggered History ({triggeredAlarms.length})
                </h3>
                <button
                  onClick={onClearTriggered}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  Clear History
                </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {triggeredAlarms.map((alarm) => {
                  const dec = PAIR_CONFIGS[alarm.pair]?.decimals || 5;
                  return (
                    <div
                      key={alarm.id}
                      className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-mono font-bold text-slate-200 mr-2">{alarm.pair}</span>
                          <span className="font-mono text-emerald-300 font-semibold">{alarm.targetPrice.toFixed(dec)}</span>
                          <span className="text-[11px] text-slate-400 ml-2">
                            ({alarm.condition === 'ABOVE' ? 'Crossed Above' : 'Crossed Below'})
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-500 font-mono">
                        {alarm.triggeredAt ? new Date(alarm.triggeredAt).toLocaleTimeString() : 'Triggered'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
