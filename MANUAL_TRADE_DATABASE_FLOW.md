# How Manual Trades Flow to PostgreSQL for AI Learning

## Problem
When you execute a BUY/SELL trade from ChartWidget, it's currently **only saved to localStorage** (virtual), not to PostgreSQL. The AI cannot learn from these trades because they're not in the database.

---

## Solution: 3-Step Process

### Step 1: Execute Trade from Chart UI
**File:** `src/components/ChartWidget.tsx` (line ~200-300)

When user clicks **BUY** or **SELL**:
```typescript
const handleChartDirectExecute = (direction: 'BUY' | 'SELL') => {
  // ... trade parameters calculated ...
  
  // CURRENTLY: Only saves to localStorage
  localStorage.setItem('quantum_open_trades', JSON.stringify([...parsed1, newTrade]));
  
  // TO MAKE IT PERSISTENT: Also call new API endpoint
  fetch('/api/forex/manual-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: pair,
      direction,
      plannedEntry: aiOpportunity?.entryZone?.min || currentPrice,
      plannedStopLoss: customSlPriceVal,
      plannedTakeProfit1: customTpPriceVal,
      actualEntry: currentPrice,
      positionSize: customLot,
      enteredAt: new Date().toISOString(),
      notes: 'Manual chart execution',
      aiConfidence: aiOpportunity?.confidence || 0,
      reasons: aiOpportunity?.reasons || []
    })
  }).then(res => res.json())
    .then(data => {
      console.log('Trade recorded to PostgreSQL:', data.trade.manualTradeId);
    });
};
```

### Step 2: API Endpoint Records Trade to Database
**File:** `src/server/routes/manualTrades.ts` (NEWLY CREATED)

The new endpoint `POST /api/forex/manual-entry` does this:

```typescript
manualTradesRouter.post('/forex/manual-entry', async (req, res) => {
  // 1. Extract trade parameters from frontend
  const { symbol, direction, actualEntry, positionSize, ...details } = req.body;
  
  // 2. Create position record
  const position: PositionRecord = {
    positionId: `trade_${Date.now()}_${random}`,
    symbol,
    direction,
    quantity: positionSize,
    entryPrice: actualEntry,
    status: 'ACTIVE', // ← Trade is now ACTIVE in database
    openedAt: new Date()
  };
  
  // 3. Save to PostgreSQL
  const savedPosition = await repo.savePosition(position);
  
  // 4. Save audit event
  await repo.saveTradeEvent({
    id: `evt_manual_${Date.now()}`,
    tradeId: savedPosition.positionId,
    eventType: 'POSITION_OPENED',
    details: { source: 'ChartWidget', ...details }
  });
  
  return savedPosition; // ← Return to frontend
});
```

### Step 3: Close Trade & Trigger AI Learning
**File:** `src/components/UserDashboard.tsx` → Trade Close Modal

When user closes a position:

```typescript
const handleConfirmCloseTrade = async () => {
  // Close in localStorage first
  localStorage.setItem('quantum_open_trades', 
    JSON.stringify(remaining_trades));
  
  // ALSO close in PostgreSQL
  fetch('/api/forex/manual-entry/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manualTradeId: trade.manualTradeId,  // ← From Step 2 response
      exitPrice: exitPriceInput,
      exitReason: 'MANUAL_EXIT',
      notes: userNotes
    })
  }).then(res => res.json())
    .then(data => {
      // AI Learning triggered automatically!
      console.log('AI Learning started:', data.trade);
    });
};
```

---

## Database Flow Diagram

```
ChartWidget (User clicks BUY)
    ↓
[Manual Trade Entry API]
    POST /api/forex/manual-entry
    ↓
[PostgreSQL: manual_trades table]
    positionId: trade_1728000000_abc123
    symbol: BTC/USD
    direction: BUY
    actualEntry: 79958.51
    status: ACTIVE
    ↓
[When user closes trade]
    ↓
[Manual Trade Close API]
    POST /api/forex/manual-entry/close
    ↓
[PostgreSQL: Position marked CLOSED]
    realizedProfit: +307.27
    closedAt: 2026-08-24T15:15:00Z
    ↓
[TradeClosed Event Published]
    ↓
[LearningService.processClosedTrade()]
    ↓
[AI Learns from trade outcome]
```

---

## How AI Accesses the Trade Records

### For Learning (Post-Trade Analysis)
```typescript
// LearningService queries closed trades
const closedTrades = await tradingRepo.getClosedPositions(
  accountId, 
  limit=50
);

// Each trade includes:
// - entryPrice, exitPrice, stopLoss, takeProfit
// - pnlDollars, pnlPips, outcome (WIN/LOSS)
// - reason it closed (TP_HIT, SL_HIT, MANUAL_EXIT)
// - notes from trader
// - AI confidence at time of entry
// - reasons the AI recommended this trade

// AI analyzes patterns:
// "Of the 10 BTC/USD BUY trades:"
// - 7 won (70% win rate)
// - Avg profit: +45 pips
// - Best entry: when RSI > 60 AND price > EMA200
// - Worst entry: when breaking support levels
```

### For Live Decision-Making
```typescript
// When AI considers a new trade proposal
const historicalPerformance = await repo.getAdminPerformance('DEFAULT');

// Results like:
{
  "totalTrades": 47,
  "winCount": 33,
  "winRatePercent": 70.2,
  "totalPnlDollars": 1247.50,
  "profitFactor": 2.15,
  "pairPerformance": {
    "BTC/USD": { wins: 8, losses: 2, winRate: 80% },
    "EUR/USD": { wins: 15, losses: 12, winRate: 56% }
  }
}

// AI uses this for:
// "BTC has 80% win rate → confidence += 20%"
// "EUR has 56% win rate → be cautious"
```

---

## Integration Checklist

- [ ] **Step 1:** Add API call to `/api/forex/manual-entry` in `ChartWidget.tsx` (in `handleChartDirectExecute`)
- [ ] **Step 2:** Import and register `manualTradesRouter` in `server.ts`
- [ ] **Step 3:** Add API call to `/api/forex/manual-entry/close` in trade close modal
- [ ] **Step 4:** Build and test
- [ ] **Step 5:** Execute a manual BTC/USD trade and verify it appears in PostgreSQL

---

## Verification

### Check if Trade Was Recorded
```sql
-- SSH into PostgreSQL and run:
SELECT * FROM trading.positions 
WHERE symbol = 'BTC/USD' 
  AND status = 'ACTIVE' 
ORDER BY opened_at DESC LIMIT 1;

-- Should return your trade
```

### Check Learning Service Processed It
```sql
-- After you close the trade:
SELECT * FROM trading.trade_events 
WHERE trade_id = 'trade_1728000000_abc123' 
ORDER BY created_at DESC;

-- Should show:
-- - POSITION_OPENED
-- - POSITION_CLOSED
-- - TRADE_LEARNING_CREATED  ← AI learned from it!
```

---

## Next: Enable Automatic AI Learning Cycle

Once trades are in PostgreSQL:
1. ✅ AI queries historical performance
2. ✅ AI identifies winning patterns
3. ✅ AI refines future entry criteria
4. ✅ Loop repeats with each closed trade

This is the **autonomous adaptive learning** system.
