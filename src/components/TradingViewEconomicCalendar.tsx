import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Globe } from 'lucide-react';

interface TradingViewEconomicCalendarProps {
  height?: number | string;
  importanceFilter?: string; // "-1,0,1" for all, "0,1" for med/high, "1" for high
  countryFilter?: string; // "us,eu,gb,jp,au,ca,ch,nz"
}

export const TradingViewEconomicCalendar: React.FC<TradingViewEconomicCalendarProps> = ({
  height = '620px',
  importanceFilter = '0,1',
  countryFilter = 'us,eu,gb,jp,au,ca,ch,nz'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.width = '100%';
    widgetDiv.style.height = '100%';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: '100%',
      locale: 'en',
      importanceFilter: importanceFilter,
      countryFilter: countryFilter
    });

    script.onload = () => {
      setIsLoaded(true);
    };

    script.onerror = () => {
      setLoadError(true);
    };

    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [importanceFilter, countryFilter]);

  return (
    <div className="w-full relative bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex flex-col" style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}>
      {/* Widget Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <Globe className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white">TradingView Global Macroeconomic Live Stream</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            STREAMING LIVE
          </span>
          <a
            href="https://www.tradingview.com/economic-calendar/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-cyan-400 transition flex items-center gap-1 text-[11px]"
          >
            <span>Buka di TradingView</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Embedded Widget Body */}
      <div className="relative flex-1 w-full" style={{ height: 'calc(100% - 40px)', minHeight: '560px' }}>
        <div ref={containerRef} className="tradingview-widget-container w-full h-full" />
        
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-slate-400 p-6 text-center text-xs">
            <p className="text-rose-400 font-bold mb-2">Gagal memuatkan strim TradingView secara langsung.</p>
            <p>Sila pastikan sambungan internet aktif atau beralih ke mod Jadual Institusi QuantumAI.</p>
          </div>
        )}
      </div>
    </div>
  );
};
