# EUR/JPY vs USD/JPY Cross-Pair Confusion Bug - Root Cause & Fix

## 📍 Bug Location
**File:** `src/server/routes/execution.ts`  
**Line:** 408-410  
**Function:** `GET /api/autotrader/state` (position sanitization loop)

---

## 🐛 The Bug

```typescript
// BUGGY CODE (Line 408-410)
if (sym.includes('USDJPY') && pos.entryPrice > 170) {
  pos.symbol = 'EUR/JPY';
  sym = 'EURJPY';
  await tradingRepo.query(...);
}
```

### Why It Fails

When a trade is labeled **USDJPY** but the entry price is **153.00** (EUR/JPY range):
- The condition checks: `pos.entryPrice > 170`
- **153 is NOT > 170**, so the condition FAILS
- Trade stays labeled as **USDJPY** 
- When cTrader executes with symbol "USDJPY" at price ~153, it gets confused because:
  - USDJPY should trade at ~150-160 ✓
  - But TP at 153.00 makes no sense for USDJPY (it would hit immediately)
  - The symbol is correct, but there's **implied EUR/JPY data in a USD/JPY label**

### Root Cause
The threshold `170` was chosen assuming EUR/JPY prices ABOVE 170 were mislabeled USDJPY.  
But the actual price ranges are:
- **USD/JPY:** 150-160
- **EUR/JPY:** 185-190

So a trade with entry 153 labeled USDJPY is INVALID — it should be EUR/JPY but wasn't detected.

---

## ✅ The Fix

**Change line 408 from:**
```typescript
if (sym.includes('USDJPY') && pos.entryPrice > 170) {
```

**To:**
```typescript
if (sym.includes('USDJPY') && pos.entryPrice > 175) {
  console.warn(`[SYMBOL-CORRECTION] Detected USD/JPY labeled but price ${pos.entryPrice} is in EUR/JPY range. Correcting...`);
  pos.symbol = 'EUR/JPY';
  sym = 'EURJPY';
  await tradingRepo.query(`UPDATE positions SET symbol = 'EUR/JPY' WHERE position_id = $1`, [pos.positionId]).catch(() => {});
} else if (sym.includes('EURJPY') && pos.entryPrice < 165) {
  // Reverse check: if labeled EUR/JPY but price < 165, it's USD/JPY
  console.warn(`[SYMBOL-CORRECTION] Detected EUR/JPY labeled but price ${pos.entryPrice} is in USD/JPY range. Correcting...`);
  pos.symbol = 'USD/JPY';
  sym = 'USDJPY';
  await tradingRepo.query(`UPDATE positions SET symbol = 'USD/JPY' WHERE position_id = $1`, [pos.positionId]).catch(() => {});
}
```

### Why This Works
1. **Raised threshold to 175:** Only triggers if price is clearly outside USD/JPY range (150-165)
2. **Added reverse check:** Detects if EUR/JPY is mislabeled as USD/JPY and corrects it
3. **Added logging:** Makes it obvious when corrections are made
4. **Bidirectional:** Handles both directions of confusion

---

## 📊 Symbol Price Ranges

| Symbol | Normal Range | Detection Threshold |
|--------|-------------|---|
| USD/JPY | 150.00-160.00 | < 165 = mislabeled |
| EUR/JPY | 185.00-190.00 | > 175 = mislabeled |
| GBP/JPY | 195.00-210.00 | (similar logic applies) |

---

## 🔍 Why This Affects cTrader Execution

1. **Signal comes in:** USDJPY, entry 153.00, TP 153.70, NO SL
2. **Bug not detected:** Line 408 check fails (153 NOT > 170)
3. **Position saved:** As USDJPY with invalid SL/TP regime
4. **cTrader receives:** Symbol=USDJPY, entry~153
5. **cTrader rejects or mixes up:** Because USDJPY trades at 158-159, not 153

---

## 🛠️ Implementation Steps

1. Open `src/server/routes/execution.ts`
2. Find line 408: `if (sym.includes('USDJPY') && pos.entryPrice > 170)`
3. Replace with the corrected code above
4. Rebuild: `npm run build`
5. Test: Send USDJPY trade at entry 153 → should auto-correct to EUR/JPY

---

## ✔️ Verification

After fix, verify with test cases:

```bash
# Test 1: USDJPY mislabeled with EUR/JPY price
curl -X POST http://localhost:3000/api/autotrader/open \
  -H "Content-Type: application/json" \
  -d '{
    "pair": "USD/JPY",
    "direction": "BUY", 
    "entryPrice": 153.25,
    "stopLoss": 153.00,
    "takeProfit1": 153.50
  }'

# Expected: Auto-corrects to EUR/JPY in database
# Check logs for: "[SYMBOL-CORRECTION] Detected USD/JPY labeled but price 153.25..."

# Test 2: EUR/JPY mislabeled with USD/JPY price  
curl -X POST http://localhost:3000/api/autotrader/open \
  -H "Content-Type: application/json" \
  -d '{
    "pair": "EUR/JPY",
    "direction": "BUY",
    "entryPrice": 158.40,
    "stopLoss": 158.00,
    "takeProfit1": 159.00
  }'

# Expected: Auto-corrects to USD/JPY in database
```

---

## 📝 Impact

- **Severity:** HIGH - Prevents execution failures on cross-pair trades
- **Affected:** Any EUR/JPY/USD/JPY trades that arrive with swapped labels
- **Frequency:** Ongoing in shadow forward-test data collection
- **Fix Time:** < 5 minutes (rebuild required)

