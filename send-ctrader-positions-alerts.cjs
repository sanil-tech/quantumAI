#!/usr/bin/env node

/**
 * Fetch live open positions from cTrader and send Telegram alerts
 */

require('dotenv').config();

const { CTraderAdapter } = require('../apps/execution-router/src/adapters/ctraderAdapter');
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID;

async function main() {
  console.log('🔍 Connecting to cTrader to fetch live positions...\n');

  try {
    const ctrader = new CTraderAdapter({ accountId: '48282756' });
    await ctrader.connect();

    console.log('✅ Connected to cTrader API\n');

    const positions = await ctrader.getOpenPositions();
    console.log(`Found ${positions.length} open position(s)\n`);

    if (positions.length === 0) {
      console.log('ℹ️  No open positions found in cTrader.');
      process.exit(0);
    }

    console.log('📤 Sending Telegram alerts for each position...\n');

    for (const pos of positions) {
      const pips = pos.direction === 'BUY'
        ? Math.round((pos.currentPrice - pos.entryPrice) * (pos.symbol.includes('JPY') ? 100 : 10000) * 100) / 100
        : Math.round((pos.entryPrice - pos.currentPrice) * (pos.symbol.includes('JPY') ? 100 : 10000) * 100) / 100;

      const status = pips >= 0 ? '✅ WINNING' : '❌ LOSING';
      const color = pips >= 0 ? '📈' : '📉';

      const message = `${color} **[LIVE POSITION ALERT]**\n\n*${pos.symbol}* - ${pos.direction}\n├─ Entry: ${pos.entryPrice}\n├─ Current: ${pos.currentPrice}\n├─ Stop Loss: ${pos.stopLoss}\n├─ Take Profit: ${pos.takeProfit}\n├─ P&L: ${pips >= 0 ? '+' : ''}${pips} pips\n├─ Status: ${status}\n└─ Lot Size: ${pos.quantity}\n\n_Open position currently active in your cTrader account._`;

      console.log(`📤 Sending alert for ${pos.symbol} (${pos.direction})...`);

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
          console.log(`✅ Alert sent for ${pos.symbol} (Message ID: ${data.result.message_id})\n`);
        } else {
          console.error(`❌ Failed: ${data.description}\n`);
        }
      } catch (error) {
        console.error(`❌ Error:`, error.message + '\n');
      }

      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    console.log('✅ **COMPLETE!** All positions have been notified.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
