import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-core';
import { CandleData } from '../types';

export interface ChartOverlayConfig {
  pair: string;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  keyLevel?: { label: string; price: number };
  patternName?: string;
}

export class ChartSnapshotService {
  private static instance: ChartSnapshotService;
  private browserExecutable: string | null = null;

  private constructor() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    if (fs.existsSync(chromePath)) {
      this.browserExecutable = chromePath;
    } else if (fs.existsSync(edgePath)) {
      this.browserExecutable = edgePath;
    }
  }

  public static getInstance(): ChartSnapshotService {
    if (!ChartSnapshotService.instance) {
      ChartSnapshotService.instance = new ChartSnapshotService();
    }
    return ChartSnapshotService.instance;
  }

  public generateHtml(config: ChartOverlayConfig, candles: CandleData[]): string {
    const width = 1000;
    const height = 540;
    const isGold = config.pair.includes('XAU') || config.pair.includes('GOLD');
    const isJpy = config.pair.includes('JPY');
    const decimals = isGold ? 2 : (isJpy ? 3 : 5);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d1117;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #header {
      height: 48px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      color: #ffffff;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.5px;
      color: #58a6ff;
    }
    .badge {
      background: ${config.direction === 'BUY' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(248, 81, 73, 0.15)'};
      color: ${config.direction === 'BUY' ? '#3fb950' : '#ff7b72'};
      border: 1px solid ${config.direction === 'BUY' ? 'rgba(46, 160, 67, 0.4)' : 'rgba(248, 81, 73, 0.4)'};
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .symbol-info {
      font-size: 14px;
      color: #8b949e;
      font-weight: 600;
    }
    #canvas-container {
      width: ${width}px;
      height: ${height - 48}px;
      background: #0d1117;
      position: relative;
    }
    canvas {
      display: block;
      width: ${width}px;
      height: ${height - 48}px;
    }
  </style>
</head>
<body>
  <div id="header">
    <div class="brand">
      <span>🔮 QUANTUM AI ANALYTICS</span>
      <span class="symbol-info">• ${config.pair} (${config.timeframe})</span>
    </div>
    <div class="badge">${config.direction} SETUP — ${config.patternName || 'SMC ORDER BLOCK'}</div>
  </div>
  <div id="canvas-container">
    <canvas id="chartCanvas" width="${width * 2}" height="${(height - 48) * 2}"></canvas>
  </div>

  <script>
    window.onload = function() {
      const canvas = document.getElementById('chartCanvas');
      const ctx = canvas.getContext('2d');
      const dpr = 2;
      ctx.scale(dpr, dpr);

      const w = ${width};
      const h = ${height - 48};
      const decimals = ${decimals};

      const candles = ${JSON.stringify(candles)};
      const entryPrice = ${config.entryPrice};
      const stopLoss = ${config.stopLoss};
      const takeProfit1 = ${config.takeProfit1};
      const takeProfit2 = ${config.takeProfit2};
      const keyLevel = ${JSON.stringify(config.keyLevel || null)};

      const padTop = 35;
      const padBottom = 40;
      const padRight = 110;
      const padLeft = 25;

      const chartW = w - padLeft - padRight;
      const chartH = h - padTop - padBottom;

      let minPrice = Infinity;
      let maxPrice = -Infinity;

      candles.forEach(c => {
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
      });

      minPrice = Math.min(minPrice, entryPrice, stopLoss, takeProfit1, takeProfit2);
      maxPrice = Math.max(maxPrice, entryPrice, stopLoss, takeProfit1, takeProfit2);
      if (keyLevel) {
        minPrice = Math.min(minPrice, keyLevel.price);
        maxPrice = Math.max(maxPrice, keyLevel.price);
      }

      const priceMargin = (maxPrice - minPrice) * 0.15 || 1.0;
      minPrice -= priceMargin;
      maxPrice += priceMargin;
      const priceRange = maxPrice - minPrice;

      function getY(p) {
        return padTop + chartH - ((p - minPrice) / priceRange) * chartH;
      }

      function getX(i) {
        const spacing = chartW / candles.length;
        return padLeft + i * spacing + spacing / 2;
      }

      // Background
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);

      // Horizontal Grid Lines
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 1;

      for (let i = 0; i <= 6; i++) {
        const p = minPrice + (priceRange / 6) * i;
        const y = getY(p);
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();

        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.toFixed(decimals), w - padRight + 12, y);
      }

      // Vertical Time Grid Lines
      const timeStep = Math.max(1, Math.floor(candles.length / 6));
      for (let i = 0; i < candles.length; i += timeStep) {
        const x = getX(i);
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, h - padBottom);
        ctx.stroke();

        const c = candles[i];
        const d = new Date(c.time * 1000);
        const timeStr = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, h - padBottom + 16);
      }

      // 1. Shaded Stop Loss Area (Red)
      const entryY = getY(entryPrice);
      const slY = getY(stopLoss);
      const slTop = Math.min(entryY, slY);
      const slH = Math.abs(entryY - slY);

      ctx.fillStyle = 'rgba(248, 81, 73, 0.16)';
      ctx.fillRect(w - padRight - 320, slTop, 320, slH);

      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, slY);
      ctx.lineTo(w - padRight, slY);
      ctx.stroke();

      // 2. Shaded Take Profit 1 Area (Green)
      const tp1Y = getY(takeProfit1);
      const tp1Top = Math.min(entryY, tp1Y);
      const tp1H = Math.abs(entryY - tp1Y);

      ctx.fillStyle = 'rgba(46, 160, 67, 0.16)';
      ctx.fillRect(w - padRight - 320, tp1Top, 320, tp1H);

      ctx.strokeStyle = '#3fb950';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, tp1Y);
      ctx.lineTo(w - padRight, tp1Y);
      ctx.stroke();

      // 3. Take Profit 2 Line (Runner)
      const tp2Y = getY(takeProfit2);
      ctx.strokeStyle = '#2ea043';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(padLeft, tp2Y);
      ctx.lineTo(w - padRight, tp2Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. White Entry Line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padLeft, entryY);
      ctx.lineTo(w - padRight, entryY);
      ctx.stroke();

      // 5. Key Level / Resistance Line
      if (keyLevel) {
        const keyY = getY(keyLevel.price);
        ctx.strokeStyle = '#e3b341';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padLeft, keyY);
        ctx.lineTo(w - padRight, keyY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#e3b341';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('⚡ ' + keyLevel.label + ' ' + keyLevel.price.toFixed(decimals), padLeft + 15, keyY - 8);
      }

      // --- DRAW CANDLESTICKS ---
      const candleW = Math.max(3, (chartW / candles.length) * 0.65);
      candles.forEach((c, i) => {
        const x = getX(i);
        const openY = getY(c.open);
        const closeY = getY(c.close);
        const highY = getY(c.high);
        const lowY = getY(c.low);

        const isBull = c.close >= c.open;
        const color = isBull ? '#3fb950' : '#f85149';

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        ctx.fillStyle = color;
        const top = Math.min(openY, closeY);
        const bh = Math.max(1.5, Math.abs(closeY - openY));
        ctx.fillRect(x - candleW / 2, top, candleW, bh);
      });

      // Price Badges
      function drawBadge(text, y, bg, fg) {
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(text).width;
        const bw = tw + 18;
        const bh = 24;
        const bx = w - padRight - bw - 10;
        const by = y - bh / 2;

        ctx.fillStyle = bg;
        ctx.fillRect(bx, by, bw, bh);

        ctx.fillStyle = fg;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + 9, y);
      }

      drawBadge('Stop Loss ' + stopLoss.toFixed(decimals), slY, '#b91c1c', '#ffffff');
      drawBadge('Entry Point ' + entryPrice.toFixed(decimals), entryY, '#21262d', '#ffffff');
      drawBadge('Take Profit 1 (50% Bank) ' + takeProfit1.toFixed(decimals), tp1Y, '#15803d', '#ffffff');
      drawBadge('Take Profit 2 (Runner) ' + takeProfit2.toFixed(decimals), tp2Y, '#166534', '#ffffff');

      window.__CHART_READY__ = true;
    };
  </script>
</body>
</html>`;
  }

  public async captureChart(config: ChartOverlayConfig, candles: CandleData[]): Promise<string> {
    const html = this.generateHtml(config, candles);
    const outDir = path.resolve(process.cwd(), 'data', 'charts');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const htmlPath = path.resolve(outDir, `chart_${Date.now()}.html`);
    const pngPath = path.resolve(outDir, `signal_chart_${Date.now()}.png`);
    fs.writeFileSync(htmlPath, html, 'utf-8');

    if (!this.browserExecutable) {
      throw new Error('No compatible browser executable found for chart rendering.');
    }

    const browser = await chromium.launch({
      executablePath: this.browserExecutable,
      headless: true
    });

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1000, height: 540 });
      await page.goto('file://' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
      await page.waitForFunction(() => (window as any).__CHART_READY__ === true, { timeout: 3000 }).catch(() => {});
      await page.screenshot({ path: pngPath });
      return pngPath;
    } finally {
      await browser.close().catch(() => {});
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
  }

  public async sendPhotoToTelegram(photoPath: string, caption: string, chatId: string, botToken: string): Promise<boolean> {
    const fileBuffer = fs.readFileSync(photoPath);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    const prePayload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="signal_chart.png"\r\nContent-Type: image/png\r\n\r\n`)
    ]);

    const postPayload = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([prePayload, fileBuffer, postPayload]);

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: fullBody
    });

    const resJson = await response.json();
    console.log('Telegram sendPhoto response:', resJson);
    return resJson.ok === true;
  }
}

export const chartSnapshotService = ChartSnapshotService.getInstance();
