#!/usr/bin/env node

/**
 * Test Telegram notification directly
 * Usage: node test-telegram-manual.cjs
 */

require('dotenv').config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_VIP_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID;

if (!botToken || !channelId) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID in .env');
  process.exit(1);
}

async function testTelegramConnection() {
  console.log('🧪 Testing Telegram Connection...');
  console.log(`   Bot Token: ${botToken.substring(0, 10)}...`);
  console.log(`   Channel ID: ${channelId}`);
  
  try {
    // Test 1: Get bot info
    console.log('\n1️⃣ Fetching bot info...');
    const botInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const botInfo = await botInfoRes.json();
    
    if (!botInfo.ok) {
      console.error('❌ Bot verification failed:', botInfo.description);
      return false;
    }
    console.log(`✅ Bot OK: @${botInfo.result.username} (${botInfo.result.first_name})`);
    
    // Test 2: Send message to channel
    console.log('\n2️⃣ Sending test message to channel...');
    const messageRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: `🧪 **[QUANTUMAI TEST MESSAGE - SYSTEM CHECK]**\n\n✅ Telegram Integration is WORKING!\n\n📝 Test Time: ${new Date().toISOString()}\n\n_This is an automated test from QuantumAI system. If you see this, notifications are now ENABLED._`,
        parse_mode: 'Markdown'
      })
    });
    
    const messageData = await messageRes.json();
    
    if (!messageData.ok) {
      console.error('❌ Message send failed:', messageData.description);
      return false;
    }
    console.log(`✅ Test message sent! Message ID: ${messageData.result.message_id}`);
    
    // Test 3: Try sending to channel again with trade alert example
    console.log('\n3️⃣ Sending sample trade alert...');
    const tradeAlertRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: `📈 **[QUANTUMAI - TRADE EXECUTION ALERT]**\n\n🔔 *NEW ORDER OPENED*\n├─ Symbol: **EURUSD**\n├─ Direction: **BUY**\n├─ Entry Price: 1.14784\n├─ Stop Loss: 1.15084\n├─ Take Profit: 1.14184\n├─ Lot Size: 0.01\n└─ Time: ${new Date().toLocaleString()}\n\n✅ Order successfully opened on cTrader Demo Account\n\n_This is a sample trade alert._`,
        parse_mode: 'Markdown'
      })
    });
    
    const tradeData = await tradeAlertRes.json();
    
    if (!tradeData.ok) {
      console.error('⚠️ Trade alert send failed:', tradeData.description);
      return false;
    }
    console.log(`✅ Trade alert sent! Message ID: ${tradeData.result.message_id}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  }
}

testTelegramConnection().then(success => {
  if (success) {
    console.log('\n✅ **TELEGRAM INTEGRATION IS WORKING!**');
    console.log('📢 Trade notifications will now be sent to your channel.');
    process.exit(0);
  } else {
    console.log('\n❌ Telegram integration test FAILED.');
    console.log('📝 Check your bot token and channel ID configuration.');
    process.exit(1);
  }
});
