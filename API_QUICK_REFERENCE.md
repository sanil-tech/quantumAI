# 🚀 QUICK REFERENCE - ALL ENDPOINTS

## 🎯 Core Trading (Single Pair - BTC/USD M15)

```bash
# START
curl -X POST http://localhost:3000/api/autonomous/start

# STOP
curl -X POST http://localhost:3000/api/autonomous/stop

# STATUS
curl http://localhost:3000/api/autonomous/status
```

---

## 📊 Multi-Pair Trading (EUR/USD, GBP/USD, BTC/USD)

```bash
# START ALL PAIRS
curl -X POST http://localhost:3000/api/autonomous/multi-pair/start

# STOP ALL PAIRS
curl -X POST http://localhost:3000/api/autonomous/multi-pair/stop

# GET STATUS ALL PAIRS
curl http://localhost:3000/api/autonomous/multi-pair/status
```

---

## 🚨 EMERGENCY STOP (All Trading Halted)

```bash
curl -X POST http://localhost:3000/api/autonomous/emergency-stop
```

---

## 📈 ANALYTICS DASHBOARD

```bash
# COMPLETE DASHBOARD (all metrics at once)
curl http://localhost:3000/api/analytics/dashboard | jq

# OVERALL PERFORMANCE METRICS
curl http://localhost:3000/api/analytics/metrics | jq

# PERFORMANCE BY PAIR
curl http://localhost:3000/api/analytics/by-pair | jq

# DAILY BREAKDOWN (last 30 days)
curl http://localhost:3000/api/analytics/daily | jq

# TIME-BASED HEATMAP (best/worst hours)
curl http://localhost:3000/api/analytics/heatmap | jq

# TRADE HISTORY (paginated, last 50 trades)
curl http://localhost:3000/api/analytics/positions?limit=50 | jq

# EXPORT AS CSV
curl http://localhost:3000/api/analytics/export/csv > trades.csv

# TEXT REPORT
curl http://localhost:3000/api/analytics/report
```

---

## 🔐 SAFETY & CIRCUIT BREAKER

```bash
# CIRCUIT BREAKER STATUS
curl http://localhost:3000/api/circuit-breaker/status | jq

# CIRCUIT BREAKER REPORT (text)
curl http://localhost:3000/api/circuit-breaker/report
```

---

## 📝 SIGNAL AUDIT TRAIL

```bash
# GET SIGNALS FOR SPECIFIC PAIR
curl http://localhost:3000/api/signal-logs?pair=EUR/USD | jq

# GET SIGNAL STATISTICS
curl http://localhost:3000/api/signal-logs | jq '.stats'

# SIGNAL AUDIT REPORT (text)
curl http://localhost:3000/api/signal-logs/report
```

---

## 🔔 NOTIFICATIONS & WEBHOOKS

```bash
# REGISTER SLACK WEBHOOK
curl -X POST http://localhost:3000/api/notifications/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "slack-alerts",
    "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "events": ["TRADE_WIN", "TRADE_LOSS", "CIRCUIT_BREAKER_TRIPPED"],
    "enabled": true
  }'

# REGISTER DISCORD WEBHOOK
curl -X POST http://localhost:3000/api/notifications/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "discord-alerts",
    "url": "https://discord.com/api/webhooks/YOUR/WEBHOOK/URL",
    "events": ["TRADE_OPENED", "TRADE_CLOSED"],
    "enabled": true
  }'

# LIST ALL WEBHOOKS
curl http://localhost:3000/api/notifications/webhooks | jq

# REMOVE WEBHOOK
curl -X DELETE http://localhost:3000/api/notifications/webhook/slack-alerts
```

---

## 💾 DATABASE QUERIES (PostgreSQL)

```sql
-- Active trades
SELECT * FROM trading.positions WHERE status='ACTIVE' ORDER BY opened_at DESC;

-- Recent closed trades
SELECT symbol, direction, entryPrice, realizedProfit, closedAt 
FROM trading.positions WHERE status='CLOSED' ORDER BY closedAt DESC LIMIT 20;

-- Win rate calculation
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN realizedProfit > 0 THEN 1 ELSE 0 END) as wins,
  ROUND(100.0 * SUM(CASE WHEN realizedProfit > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate
FROM trading.positions WHERE status='CLOSED';

-- P&L summary
SELECT 
  SUM(realizedProfit) as total_pnl,
  AVG(realizedProfit) as avg_pnl,
  MAX(realizedProfit) as largest_win,
  MIN(realizedProfit) as largest_loss
FROM trading.positions WHERE status='CLOSED';

-- Per-pair performance
SELECT 
  symbol,
  COUNT(*) as trades,
  SUM(CASE WHEN realizedProfit > 0 THEN 1 ELSE 0 END) as wins,
  SUM(realizedProfit) as total_pnl,
  ROUND(100.0 * SUM(CASE WHEN realizedProfit > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate
FROM trading.positions WHERE status='CLOSED'
GROUP BY symbol ORDER BY total_pnl DESC;

-- Daily breakdown
SELECT 
  DATE(closedAt) as date,
  COUNT(*) as trades,
  SUM(CASE WHEN realizedProfit > 0 THEN 1 ELSE 0 END) as wins,
  SUM(realizedProfit) as pnl
FROM trading.positions WHERE status='CLOSED'
GROUP BY DATE(closedAt) ORDER BY date DESC;

-- Learning records (AI improvement)
SELECT setupId, symbol, outcome, confidenceAdjustment, createdAt
FROM trading.learning_records ORDER BY createdAt DESC LIMIT 10;
```

---

## 🎯 Common Workflows

### 1. Start Single-Pair Trading
```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start trading
curl -X POST http://localhost:3000/api/autonomous/start

# Monitor
curl http://localhost:3000/api/autonomous/status
```

### 2. Start Multi-Pair Trading
```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start all pairs
curl -X POST http://localhost:3000/api/autonomous/multi-pair/start

# Monitor status
curl http://localhost:3000/api/autonomous/multi-pair/status
```

### 3. Setup Full Monitoring
```bash
# Register Slack webhook
curl -X POST http://localhost:3000/api/notifications/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "slack",
    "url": "YOUR_SLACK_WEBHOOK_URL",
    "events": ["TRADE_WIN", "TRADE_LOSS", "CIRCUIT_BREAKER_TRIPPED"],
    "enabled": true
  }'

# Start trading
curl -X POST http://localhost:3000/api/autonomous/multi-pair/start

# Check dashboard every minute
watch -n 60 'curl -s http://localhost:3000/api/analytics/dashboard | jq ".data.summary"'
```

### 4. Daily Report
```bash
# Get text report
curl http://localhost:3000/api/analytics/report | tee daily_report.txt

# Export trades
curl http://localhost:3000/api/analytics/export/csv > trades_$(date +%Y-%m-%d).csv
```

### 5. Safety Check
```bash
# Check if circuit breaker is tripped
STATUS=$(curl -s http://localhost:3000/api/circuit-breaker/status | jq -r '.data.state')
if [ "$STATUS" = "OPEN" ]; then
  echo "WARNING: Circuit breaker is TRIPPED!"
  curl http://localhost:3000/api/circuit-breaker/report
fi
```

---

## 📱 Real-Time Monitoring

### Windows PowerShell (Auto-refresh dashboard every 30 sec)
```powershell
while($true) {
  Clear-Host
  Write-Host "📊 Trading Dashboard - $(Get-Date)" -ForegroundColor Cyan
  curl -s http://localhost:3000/api/analytics/dashboard | jq '.data.summary'
  Start-Sleep -Seconds 30
}
```

### Linux/Mac (Auto-refresh dashboard every 30 sec)
```bash
watch -n 30 'curl -s http://localhost:3000/api/analytics/dashboard | jq ".data.summary"'
```

---

## 🚨 Alerts & Responses

### When Circuit Breaker Trips
```bash
# Check status
curl http://localhost:3000/api/circuit-breaker/status

# Get detailed report
curl http://localhost:3000/api/circuit-breaker/report

# Recovery time and reason will be shown
```

### When Win Rate Drops Below 50%
```bash
# Check metrics
curl http://localhost:3000/api/analytics/metrics | jq '.data | {totalTrades, winRate}'

# Check by pair
curl http://localhost:3000/api/analytics/by-pair | jq

# Stop trading if needed
curl -X POST http://localhost:3000/api/autonomous/emergency-stop
```

### When Signal Confidence Low
```bash
# Check signal stats
curl http://localhost:3000/api/signal-logs | jq '.stats'

# Get rejection analysis
curl http://localhost:3000/api/signal-logs/report
```

---

## 💡 Tips

1. **Always check status before starting**
   ```bash
   curl http://localhost:3000/api/autonomous/status
   ```

2. **Monitor circuit breaker continuously**
   ```bash
   curl http://localhost:3000/api/circuit-breaker/status
   ```

3. **Export trades daily for backup**
   ```bash
   curl http://localhost:3000/api/analytics/export/csv > backup_$(date +%Y-%m-%d).csv
   ```

4. **Check dashboard every hour**
   ```bash
   curl http://localhost:3000/api/analytics/dashboard | jq '.data.summary'
   ```

5. **Set up webhook alerts on Slack**
   - Get instant notifications for wins/losses
   - Automatically alerted if circuit breaker trips

---

## 🆘 Emergency Commands

```bash
# IMMEDIATE STOP (all trading halted)
curl -X POST http://localhost:3000/api/autonomous/emergency-stop

# Check why trading stopped
curl http://localhost:3000/api/circuit-breaker/status

# Get safety report
curl http://localhost:3000/api/circuit-breaker/report

# Reset if needed (after manual intervention)
# This requires code change - contact developer
```

---

**Save this file for quick reference during trading!**
