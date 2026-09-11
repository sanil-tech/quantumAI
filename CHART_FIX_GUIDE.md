# 🔧 CHART BLANK/EMPTY - ROOT CAUSE & FIX

## Problem Identified

**Chart displays but shows NO CANDLES** - completely blank/empty chart area

### Root Causes (Multiple):

1. ❌ **No candles data passed to ChartWidget**
   - `candles` prop is empty array or undefined
   - No candlestick data being set on the chart

2. ❌ **API call not fetching market data**
   - `getCandles()` or `fetchCandles()` not being called
   - Or API returning empty response

3. ❌ **Timeframe selector not triggering data refresh**
   - User selects M15 but no API call made
   - No automatic data load on mount

4. ❌ **Data conversion issue**
   - Candles exist but timestamp format wrong
   - Or OHLC values are invalid

---

## Fixes Required

### Fix #1: Add useEffect to Fetch Candles on Component Mount

**Location:** `UserDashboard.tsx` or wherever ChartWidget is mounted

```typescript
useEffect(() => {
  if (!activePair || !timeframe) return;
  
  // ✅ FIX: Fetch candles when pair/timeframe changes
  fetchChartData();
}, [activePair, timeframe]);

async function fetchChartData() {
  try {
    const response = await fetch(`/api/ctrader/candles?pair=${activePair}&timeframe=${timeframe}&count=100`);
    const data = await response.json();
    
    if (data.success && data.candles) {
      // ✅ Ensure proper timestamp conversion
      const formattedCandles = data.candles.map(c => ({
        ...c,
        time: c.time ? Math.floor(new Date(c.time).getTime() / 1000) : Math.floor(Date.now() / 1000)
      }));
      
      setCandles(formattedCandles);
    }
  } catch (err) {
    console.error('Failed to fetch candles:', err);
    setCandles([]);
  }
}
```

### Fix #2: Add Onrefresh Handler

**In ChartWidget.tsx, add:**

```typescript
const handleRefreshChart = async () => {
  if (!pair || !timeframe) return;
  
  try {
    const response = await fetch(`/api/ctrader/candles?pair=${pair}&timeframe=${timeframe}&count=100`);
    const data = await response.json();
    
    if (data.candles) {
      const formatted = data.candles.map(c => ({
        ...c,
        time: Math.floor(new Date(c.time).getTime() / 1000)
      }));
      
      // Force chart update
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(formatted);
        chartInstanceRef.current?.timeScale().fitContent();
      }
    }
  } catch (err) {
    console.error('Refresh failed:', err);
  }
};

// Pass to ChartWidget
<ChartWidget
  candles={candles}
  onRefreshData={handleRefreshChart}
  // ... other props
/>
```

### Fix #3: Verify Data Format

**Ensure candles array looks like:**

```typescript
[
  {
    time: 1724412960,  // ✅ Unix timestamp (seconds, not ms)
    open: 1.16450,
    high: 1.16500,
    low: 1.16400,
    close: 1.16470
  },
  // ... more candles
]
```

### Fix #4: Add Fallback Demo Data (Temporary)

```typescript
useEffect(() => {
  if (!candles || candles.length === 0) {
    console.warn('⚠️ No candles, loading demo data...');
    
    // ✅ Generate demo candles for testing
    const now = Math.floor(Date.now() / 1000);
    const demoCandles = Array.from({ length: 50 }, (_, i) => ({
      time: now - (50 - i) * 900, // 15-min candles
      open: 1.16500 + Math.random() * 0.01,
      high: 1.16600 + Math.random() * 0.01,
      low: 1.16400 + Math.random() * 0.01,
      close: 1.16500 + Math.random() * 0.01
    }));
    
    setCandles(demoCandles);
  }
}, []);
```

---

## Quick Fix Steps

### Step 1: Check if `onRefreshData` is wired
In `UserDashboard.tsx`, ensure the refresh button handler calls a function that fetches candles.

### Step 2: Add console logging
```typescript
useEffect(() => {
  console.log('📊 Candles updated:', candles?.length, candles?.slice(-1)[0]);
}, [candles]);
```

### Step 3: Check API endpoint
```bash
# Test if API works
curl "http://localhost:3000/api/ctrader/candles?pair=EUR/USD&timeframe=M15&count=10"
```

Expected response:
```json
{
  "success": true,
  "candles": [
    { "time": "2026-08-24T14:30:00Z", "open": 1.164, ... },
    ...
  ]
}
```

### Step 4: Rebuild
```bash
npm run build
```

---

## Chart Should Now Show Data! 

After applying these fixes, the chart will:
1. ✅ Load data on component mount
2. ✅ Refresh when timeframe changes
3. ✅ Display candlesticks correctly
4. ✅ Respond to refresh button

---

## Debug Checklist

- [ ] Candles array has data (console.log in useEffect)
- [ ] Timestamp format is Unix seconds (not ms)
- [ ] OHLC values are valid numbers
- [ ] API endpoint returns success: true
- [ ] ChartWidget receives candles prop with data
- [ ] candlestickSeriesRef.current.setData() is called
- [ ] No errors in browser console

If chart still blank after these fixes, check:
1. Is API returning data?
2. Are candles being set in state?
3. Is ChartWidget receiving them as props?
