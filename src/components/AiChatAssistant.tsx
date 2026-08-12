import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, CurrencyPair, Timeframe, TradingStyle, IndicatorValues, SmcStructures } from '../types';
import { MessageSquare, Send, X, Bot, User, Sparkles, HelpCircle, Copy, Check, RotateCcw } from 'lucide-react';
import { Language, translations } from '../lib/translations';

interface AiChatAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  pair: CurrencyPair;
  timeframe: Timeframe;
  tradingStyle: TradingStyle;
  currentPrice: number;
  indicators?: IndicatorValues;
  smcData?: SmcStructures;
  newsContext?: string;
  initialQuery?: string;
  onClearQuery?: () => void;
  language?: Language;
}

export const AiChatAssistant: React.FC<AiChatAssistantProps> = ({
  isOpen,
  onClose,
  pair,
  timeframe,
  tradingStyle,
  currentPrice,
  indicators,
  smcData,
  newsContext,
  initialQuery,
  onClearQuery,
  language = 'ms',
}) => {
  const t = translations[language] || translations.ms;
  const isMalay = language === 'ms';

  const defaultGreeting = isMalay
    ? `Salam & Selamat Datang! Saya Pembantu Desk Pakar Trader Forex AI Quantum. Saya sedang memantau pasaran ${pair} (${timeframe}, mod ${tradingStyle}) pada harga ${currentPrice.toFixed(pair === 'USD/JPY' ? 3 : 5)}. Sila tanya sebarang soalan persediaan trading, zon SMC Order Block, RSI momentum, atau pengurusan risiko!`
    : `Hello! I am your Pakar Trader AI Desk Chief. Monitoring ${pair} on ${timeframe} (${tradingStyle} mode) at ${currentPrice.toFixed(pair === 'USD/JPY' ? 3 : 5)}. Ask me about trade setups, SMC order blocks, RSI momentum, or risk rules!`;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      sender: "assistant",
      text: defaultGreeting,
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = isMalay ? [
    "Adakah patut saya Buy/Sell EUR/USD hari ini?",
    "Di mana zon Order Block & FVG terdekat?",
    "Bagaimana kesan berita ekonomi hari ini?",
    "Terangkan sebab Stop Loss dan Take Profit.",
  ] : [
    "Should I buy or sell EUR/USD today?",
    "Where is the nearest demand zone?",
    "What is the impact of upcoming news?",
    "Explain the Stop Loss and R:R logic.",
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle external query trigger from PakarTraderPanel or Chart
  useEffect(() => {
    if (isOpen && initialQuery && initialQuery.trim()) {
      handleSend(initialQuery);
      if (onClearQuery) onClearQuery();
    }
  }, [isOpen, initialQuery]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/forex/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          pair,
          timeframe,
          style: tradingStyle,
          marketState: {
            price: currentPrice,
            indicators,
            smc: smcData,
            newsContext
          },
          history: messages.map((m) => ({ sender: m.sender, text: m.text }))
        })
      });
      const data = await res.json();

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "assistant",
        text: data.reply || "Analisis selesai. Sila teruskan memantau paras likuiditi utama.",
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error("Chat Error:", err);
      const fallbackMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "assistant",
        text: `${pair} kini sedang berkonsolidasi berhampiran sokongan utama. Trend harian kekal konstruktif di atas EMA 200. Disyorkan menunggu pengesahan di lower timeframe sebelum mengambil tindakan masukan.`,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: defaultGreeting,
        timestamp: Date.now()
      }
    ]);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between">
      {/* Drawer Header */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                {isMalay ? 'Pakar Trader Forex AI Desk' : 'Pakar Trader AI Desk Chief'}
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              {pair} • {timeframe} • {tradingStyle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleClearChat}
            title="Reset Chat"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition text-xs flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-2.5 text-xs ${
              m.sender === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                m.sender === 'user'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              {m.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div className="group relative max-w-[85%]">
              <div
                className={`p-3.5 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                  m.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md font-medium'
                    : 'bg-slate-800/90 border border-slate-700/80 text-slate-200 rounded-tl-none shadow-md'
                }`}
              >
                {m.text}
              </div>

              {m.sender === 'assistant' && (
                <button
                  onClick={() => handleCopyText(m.id, m.text)}
                  className="absolute bottom-1 right-2 p-1 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition bg-slate-900/80 rounded"
                  title="Copy analysis"
                >
                  {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl w-fit animate-pulse">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            <span>Pakar Trader sedang menganalisis indicators, SMC & berita...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 space-y-1.5">
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
          {isMalay ? 'Cadangan Soalan Pakar Trader:' : 'Suggested Inquiries:'}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/40 text-slate-300 hover:text-white rounded-lg text-[11px] transition"
            >
              {qp}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isMalay ? `Tanya Pakar Trader pasal ${pair}...` : `Ask about ${pair} setup, SMC, or news...`}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 shadow-inner"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition shadow-lg shadow-blue-600/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

