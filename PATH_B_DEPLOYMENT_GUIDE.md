# 🚀 PATH B SHADOW TEST - DEPLOYMENT GUIDE

**Status:** Ready for immediate deployment  
**Risk Level:** 🟢 LOW (read-only, no execution)  
**Deployment Time:** 5 minutes  

---

## PHASE B.1: Activate Shadow Mode (5 minutes)

### Step 1: Import Shadow Router (30 seconds)

Edit `server.ts` and add after other route imports:

```typescript
import shadowTestRouter from './routes/shadowTest';
```

### Step 2: Register Shadow Routes (30 seconds)

Add after other `app.use()` calls in `server.ts`:

```typescript
app.use('/api/shadow', shadowTestRouter);
```

### Step 3: Build & Start (2 minutes)

```bash
npm run build
npm start
```

### Step 4: Verify Shadow Service (2 minutes)

```bash
curl http://localhost:3000/api/shadow/health
```

Expected response:
```json
{
  "success": true,
  "shadowMode": true,
  "healthy": true,
  "status": "OPERATIONAL",
  "metrics": { ... }
}
```

✅ **Shadow mode is now active**

---

## PHASE B.2: Collect Shadow Data (24-48 hours)

### Automatic Collection

Once shadow routes are active:
- 🟢 Every signal generated = shadow analysis runs
- 🟢 Decision comparison logged automatically
- 🟢 Zero impact on production trading
- 🟢 Production trades continue as normal

### Monitor Progress

Check agreement rate every 6 hours:

```bash
curl http://localhost:3000/api/shadow/metrics | jq '.metrics'
```

Shows:
- Total signals analyzed
- Agreement rate (target: >90%)
- Error rates (target: <2%)

### View Shadow Log

See individual analyses:

```bash
curl http://localhost:3000/api/shadow/log?limit=20
```

Returns recent 20 shadow analyses with full decision details.

---

## PHASE B.3: Analyze Results (After 24-48 hours)

### Generate Report

```bash
curl http://localhost:3000/api/shadow/report
```

Report includes:
```json
{
  "testPeriod": { ... },
  "decisions": {
    "currentEngineAllows": N,
    "enhancedAllows": M,
    "enhancedVetoes": K,
    "enhancedCautions": J
  },
  "comparison": {
    "agreements": A,
    "disagreements": D,
    "agreementRate": "X%"
  },
  "recommendation": "SHADOW_READY" or "CONDITIONAL" or "BLOCKED"
}
```

### Interpretation Guide

| Agreement Rate | Status | Next Action |
|---|---|---|
| >95% | SHADOW_READY | Proceed to enhanced deployment |
| 80-95% | CONDITIONAL | Review disagreements, then proceed |
| <80% | BLOCKED | Investigate failures, don't proceed |

### Review Disagreements

Query shadow log for non-agreements:

```bash
curl http://localhost:3000/api/shadow/log | jq '.records[] | select(.decisionComparison.classification != "AGREEMENT")'
```

This shows:
- When enhanced veto differs from current engine
- Why it differs
- Market conditions at the time
- Confidence levels

---

## PHASE B.4: Decision Matrix

### If Agreement Rate >90%

✅ **Recommendation: PROCEED TO ENHANCED DEPLOYMENT**

Next steps:
1. Stop shadow mode (optional, can keep running)
2. Deploy enhanced executor on NEW demo account
3. Run 100+ real trades with enhanced veto
4. Compare P&L against current system
5. If P&L is better: promote to production

### If Agreement Rate 80-90%

⚠️ **Recommendation: CONDITIONAL PROCEED**

Before deploying enhanced:
1. Manually review all disagreements (usually 10-20 records)
2. Verify disagreements are sensible/expected
3. Check for patterns in disagreement reasons
4. If patterns make sense: proceed
5. If patterns are suspicious: investigate further

### If Agreement Rate <80%

❌ **Recommendation: BLOCK DEPLOYMENT**

Issues to investigate:
1. Are historical patterns being miscategorized?
2. Is market data stale or missing?
3. Are thresholds for conditions incorrect?
4. Is there a bug in enhanced veto logic?

Do NOT proceed until agreement rate >90%.

### If Runtime Errors >2%

❌ **Recommendation: BLOCK DEPLOYMENT**

Issues to investigate:
1. Database connectivity issues?
2. Market data feed disconnections?
3. Exception handling not catching errors?
4. Data validation failing?

Fix errors first, then re-collect data.

---

## MONITORING DURING SHADOW TEST

### Health Check (run every hour)

```bash
curl http://localhost:3000/api/shadow/health
```

Watch for:
- ✅ healthy: true (expected)
- ✅ status: "OPERATIONAL" (expected)
- ⚠️ runtimeErrors trending up? (investigate)
- ⚠️ dataErrors increasing? (check market feed)

### Performance Impact Check

Shadow analysis should add <100ms overhead:

```bash
# Check a signal before/after shadow enabled
time curl http://localhost:3000/api/autonomous/status
```

Expected: <500ms total response time

### Database Growth

Shadow records should be modest:

```bash
# Estimate shadow records created
# With 1 signal per 2 seconds:
# 24 hours = ~43,200 shadow records
# Database size: ~20-30 MB per day

# Check database:
SELECT COUNT(*) FROM trade_events WHERE eventType = 'SHADOW_SIGNAL_ANALYSIS';
```

If database grows >1 GB:
```bash
# Clear old shadow records
curl -X POST http://localhost:3000/api/shadow/clear-log
```

---

## TROUBLESHOOTING

### Shadow Health Shows DEGRADED

```bash
curl http://localhost:3000/api/shadow/health
```

**Issue:** Status shows DEGRADED

**Cause:** Runtime errors >10%

**Fix:**
1. Check error logs in database
2. Look for patterns in error types
3. Is market data feed disconnected?
4. Is database having issues?

### Agreement Rate Stuck at 0%

**Issue:** Report shows 0 signals analyzed

**Cause:** Shadow routes not actually being called

**Fix:**
1. Verify routes are imported in server.ts
2. Verify server restarted after changes
3. Verify signals are being generated (check logs)
4. Try manually triggering shadow analysis:

```bash
curl -X POST http://localhost:3000/api/shadow/analyze-signal \
  -H "Content-Type: application/json" \
  -d '{
    "pair": "EUR/USD",
    "timeframe": "M1",
    "signalDirection": "BUY",
    "signalConfidence": 75,
    "signalReasons": ["RSI > 50", "EMA cross"],
    "currentPrice": 1.08500,
    "accountId": "demo"
  }'
```

### Database Errors When Persisting

**Issue:** Shadow records not saving

**Cause:** Database permission issues

**Fix:**
1. Check database connectivity
2. Verify trade_events table exists
3. Check for disk space issues
4. Review database logs

### Market Data Stale

**Issue:** dataFreshness shows "STALE" for many records

**Cause:** cTrader feed lag or disconnection

**Fix:**
1. Check cTrader market data service status
2. Verify WebSocket connection is live
3. Check cTrader API for service incidents
4. Restart market data service if needed

---

## QUICK REFERENCE COMMANDS

```bash
# Start shadow collection
curl http://localhost:3000/api/shadow/health

# Check agreement rate
curl http://localhost:3000/api/shadow/metrics | jq '.metrics'

# Get last 10 analyses
curl "http://localhost:3000/api/shadow/log?limit=10"

# Generate full report
curl http://localhost:3000/api/shadow/report | jq '.report'

# View specific analysis
curl http://localhost:3000/api/shadow/log | jq '.records[0]'

# Clear old data (admin)
curl -X POST http://localhost:3000/api/shadow/clear-log

# Trigger manual analysis
curl -X POST http://localhost:3000/api/shadow/analyze-signal \
  -H "Content-Type: application/json" \
  -d '{ "pair": "EUR/USD", "timeframe": "M1", ... }'
```

---

## SUCCESS CRITERIA

Shadow test is successful if:

- ✅ Agreement rate >90%
- ✅ Runtime errors <2%
- ✅ Data freshness >90% FRESH
- ✅ No cascading failures
- ✅ No performance impact
- ✅ All decisions properly logged
- ✅ Recommendations are sensible

---

## NEXT STEPS AFTER SHADOW TEST

### If Successful (Agreement >90%)

1. ✅ Document findings
2. ✅ Deploy enhanced executor on NEW demo account
3. ✅ Run 100+ real trades with enhanced veto
4. ✅ Compare P&L metrics
5. ✅ Make deployment decision

### If Needs Review (Agreement 80-90%)

1. ✅ Manually review 20-30 disagreement cases
2. ✅ Document reasons for each disagreement
3. ✅ Verify disagreements are sensible
4. ✅ If acceptable: proceed
5. ✅ If suspicious: investigate and fix

### If Failed (Agreement <80%)

1. ✅ Investigate root causes
2. ✅ Fix identified issues
3. ✅ Re-collect shadow data
4. ✅ Verify fixes before proceeding

---

**Shadow Test Deployment Guide Complete**

Ready to activate Phase B.1 → Phase B.4

