#!/usr/bin/env node

/**
 * Quick test - verify Telegram messages were sent
 */

require('dotenv').config();

async function testMessages() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_VIP_CHAT_ID;

  console.log('📨 Fetching latest messages from channel...\n');

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?allowed_updates=["message"]`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const data = await response.json();
    
    if (data.ok && data.result && data.result.length > 0) {
      const lastMessages = data.result.slice(-10);
      console.log(`Found ${lastMessages.length} recent updates:\n`);
      
      for (const update of lastMessages) {
        const msg = update.message || update.channel_post;
        if (msg && msg.text && msg.text.includes('POSITION') || msg.text.includes('Trade')) {
          console.log(`✅ Message ID: ${msg.message_id}`);
          console.log(`   From: ${msg.from?.first_name || 'Channel'}`);
          console.log(`   Text (first 100 chars): ${msg.text.substring(0, 100)}...\n`);
        }
      }
    } else {
      console.log('No messages found or API error.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testMessages();
