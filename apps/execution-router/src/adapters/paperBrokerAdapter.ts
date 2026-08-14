import { Order, ExecutionReport, Position } from '@iati/core-types';
import { BrokerAdapter, AccountStatus } from './brokerAdapter';
import { SimulationEngine } from '../engine/simulationEngine';
import { PositionManager } from '../oms/positionManager';

export class PaperBrokerAdapter implements BrokerAdapter {
  public id = 'paper-broker-01';
  public name = 'IATI Paper Broker Simulation';

  private connected: boolean = true;
  private balance: number = 100000;
  public simulationEngine = new SimulationEngine();
  public positionManager = new PositionManager();

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<boolean> {
    this.connected = false;
    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async placeOrder(order: Order): Promise<ExecutionReport> {
    if (!this.connected) {
      throw new Error('Broker is disconnected.');
    }

    // Default reference price for symbol if not supplied
    const referencePrice = order.price || (order.symbol === 'EURUSD' ? 1.0850 : 1.2500);

    // Explicit SL / TP preservation
    const stopLoss = order.stop_loss ?? order.stopLoss;
    const takeProfit = order.take_profit ?? order.takeProfit;

    // Simulate execution
    const report = await this.simulationEngine.simulateExecution(order, referencePrice);
    report.broker_id = this.id;
    report.brokerId = this.id;

    if (report.status === 'FILLED') {
      // Update positions with explicit SL/TP
      this.positionManager.updatePositionOnFill(
        order.account_id || order.accountId || 'DEFAULT',
        order.symbol,
        order.direction,
        order.quantity,
        report.filled_price,
        stopLoss,
        takeProfit
      );
    }

    return report;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    return true;
  }

  async getPosition(symbol: string, accountId?: string): Promise<Position | undefined> {
    if (accountId) {
      const pos = this.positionManager.getPosition(accountId, symbol);
      if (pos) return pos;
    }
    const openPositions = this.positionManager.getOpenPositions();
    return openPositions.find(p => p.symbol === symbol);
  }

  async getPositions(): Promise<Position[]> {
    return this.positionManager.getAllPositions();
  }

  async getAccountStatus(): Promise<AccountStatus> {
    const openPositions = this.positionManager.getOpenPositions();
    const unrealizedPnL = openPositions.reduce((acc, p) => acc + p.unrealized_profit, 0);

    return {
      accountId: 'DEFAULT',
      brokerId: this.id,
      balance: this.balance,
      equity: Number((this.balance + unrealizedPnL).toFixed(2)),
      currency: 'USD',
      connected: this.connected
    };
  }
}
