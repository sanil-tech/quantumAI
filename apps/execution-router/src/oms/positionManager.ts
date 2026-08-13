import { Position, MarketDirection, Order } from '@iati/core-types';

export class PositionManager {
  private positions: Map<string, Position> = new Map(); // position_id -> Position

  updatePositionOnFill(
    accountId: string,
    symbol: string,
    direction: MarketDirection,
    quantity: number,
    filledPrice: number,
    stopLoss?: number,
    takeProfit?: number
  ): Position {
    const existingPositionKey = `${accountId}:${symbol}`;
    let position = this.positions.get(existingPositionKey);

    if (!position || position.status === 'CLOSED') {
      // Create new position
      position = {
        position_id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        account_id: accountId,
        symbol,
        direction,
        quantity,
        entry_price: filledPrice,
        current_price: filledPrice,
        unrealized_profit: 0,
        realized_profit: 0,
        status: 'OPEN',
        opened_at: new Date(),
        updated_at: new Date(),
        stop_loss: stopLoss,
        take_profit: takeProfit
      };
    } else {
      // Position exists: check if adding to position or closing/reversing
      if (position.direction === direction) {
        // Average entry price calculation
        const totalQty = position.quantity + quantity;
        const totalCost = (position.quantity * position.entry_price) + (quantity * filledPrice);
        position.entry_price = Number((totalCost / totalQty).toFixed(5));
        position.quantity = totalQty;
        if (stopLoss !== undefined) position.stop_loss = stopLoss;
        if (takeProfit !== undefined) position.take_profit = takeProfit;
      } else {
        // Closing or partial closing
        const closedQty = Math.min(position.quantity, quantity);
        const pnlMultiplier = position.direction === 'BUY' ? 1 : -1;
        const realizedPnl = closedQty * (filledPrice - position.entry_price) * pnlMultiplier * 100000;

        position.realized_profit += Number(realizedPnl.toFixed(2));
        position.quantity -= closedQty;

        if (position.quantity === 0) {
          position.status = 'CLOSED';
        }
      }
      position.current_price = filledPrice;
      position.updated_at = new Date();
    }

    this.positions.set(existingPositionKey, position);
    return position;
  }

  updateMarketPrice(symbol: string, currentPrice: number): void {
    for (const pos of this.positions.values()) {
      if (pos.symbol === symbol && pos.status === 'OPEN') {
        pos.current_price = currentPrice;
        const pnlMultiplier = pos.direction === 'BUY' ? 1 : -1;
        const unrealizedPnl = pos.quantity * (currentPrice - pos.entry_price) * pnlMultiplier * 100000;
        pos.unrealized_profit = Number(unrealizedPnl.toFixed(2));
        pos.updated_at = new Date();
      }
    }
  }

  getPosition(accountId: string, symbol: string): Position | undefined {
    return this.positions.get(`${accountId}:${symbol}`);
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }
}
