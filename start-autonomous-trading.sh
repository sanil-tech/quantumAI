#!/bin/bash

# Autonomous AI Trading Loop - Quick Start Script

echo "🚀 QuantumAI Autonomous Trading System - Quick Start"
echo "=================================================="
echo ""

# Check if server is running
echo "1. Starting server on port 3000..."
npm start &
SERVER_PID=$!
sleep 5

# Check server health
echo ""
echo "2. Checking server health..."
curl -s http://localhost:3000/api/broker/ping | jq . || echo "⚠️ Server not responding yet, waiting..."
sleep 3

# Get status before starting
echo ""
echo "3. Current autonomous trading status:"
curl -s http://localhost:3000/api/autonomous/status | jq .

# Start autonomous trading
echo ""
echo "4. Starting autonomous AI trading loop..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/autonomous/start)
echo "$RESPONSE" | jq .
echo ""

# Monitor status
echo "5. Monitoring autonomous trading..."
echo "   - Watch this loop for 60 seconds"
echo "   - AI will continuously:"
echo "     • Read market price"
echo "     • Calculate indicators"
echo "     • Generate trading signals"
echo "     • Execute trades when confident"
echo "     • Record outcomes to PostgreSQL"
echo ""

for i in {1..12}; do
  echo "   [$((i*5)) sec] Status:"
  curl -s http://localhost:3000/api/autonomous/status | jq '.status'
  sleep 5
done

echo ""
echo "6. Check PostgreSQL for recorded trades:"
echo "   psql -U postgres -d quantumAI -c 'SELECT * FROM trading.positions ORDER BY opened_at DESC LIMIT 5;'"
echo ""

echo "7. To stop autonomous trading:"
echo "   curl -X POST http://localhost:3000/api/autonomous/stop"
echo ""

# Keep running
wait $SERVER_PID
