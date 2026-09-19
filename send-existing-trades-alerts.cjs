#!/usr/bin/env node

/**
 * Send Telegram alerts for existing open trades
 * This script fetches the 4 open positions and sends alerts for them
 */

require('dotenv').config();

const http = require('http');

async function fetchOpenTrades() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000/api/positions/open', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.positions || parsed.data || []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000);
  });
}

async function sendTelegramAlert(trade) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID;

  const direction = (trade.direction || '').toUpperCase();
  const pips = direction === 'BUY'
    ? Math.round((trade.currentPrice - trade.entryPrice) * (trade.symbol.includes('JPY') ? 100 : 10000) * 100) / 100
    : Math.round((trade.entryPrice - trade.currentPrice) * (trade.symbol.includes('JPY') ? 100 : 10000) * 100) / 100;

  const status = pips >= 0 ? '✅ WINNING' : '❌ LOSING';
  const color = pips >= 0 ? '📈' : '📉';

  const message = `${color} **[EXISTING TRADE ALERT - RE-BROADCAST]**\n\n*${trade.symbol}* - ${direction}\n├─ Entry: ${trade.entryPrice}\n├─ Current: ${trade.currentPrice}\n├─ P&L: ${pips >= 0 ? '+' : ''}${pips} pips\n├─ Status: ${status}\n└─ Opened: ${new Date(trade.openedAt).toLocaleString()}\n\n_Trade was already open. This is a catch-up notification._`;

  console.log(`📤 Sending Telegram alert for ${trade.symbol}...`);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`✅ Alert sent for ${trade.symbol} (Message ID: ${data.result.message_id})`);
      return true;
    } else {
      console.error(`❌ Failed to send alert for ${trade.symbol}: ${data.description}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending alert for ${trade.symbol}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Fetching open trades from server...\n');

  try {
    const trades = await fetchOpenTrades();
    console.log(`Found ${trades.length} open trade(s).\n`);

    if (trades.length === 0) {
      console.log('ℹ️  No open trades found.');
      return;
    }

    console.log('📤 Sending Telegram alerts for each trade...\n');
    let sent = 0;

    for (const trade of trades) {
      const success = await sendTelegramAlert(trade);
      if (success) sent++;
      await new Promise(r => setTimeout(r, 500)); // Telegram rate limit
    }

    console.log(`\n✅ **COMPLETE!** Sent ${sent}/${trades.length} alerts.\n`);
    console.log('Open trades are now notified in Telegram channel.');
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();
