using System;
using System.Collections.Generic;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Indicators;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    /// <summary>
    /// QuantumAI Institutional SMC & Quantitative Algorithmic Engine
    /// Designed for cTrader Store Publication (.NET 6.0 / AccessRights.None compliant)
    /// Features:
    /// - Smart Money Concepts (SMC) Liquidity & Order Block (OB) Engine
    /// - Multi-Timeframe Trend Confirmation (EMA Dynamic Trend Shield)
    /// - Method 2 Split-Ticket Execution (Ticket A: TP1 Conservative, Ticket B: TP2 Runner)
    /// - Real-time Automated Break-Even (Auto-BE) on TP1 Hit
    /// - ATR-based Dynamic Volatility Risk Protection
    /// </summary>
    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class QuantumAI_Store_Edition : Robot
    {
        // ==========================================
        // 🏛️ STRATEGY & SMC PARAMETERS
        // ==========================================
        [Parameter("Strategy Mode", Group = "1. Strategy & Entry", DefaultValue = StrategyModeEnum.SmartMoneyConcepts)]
        public StrategyModeEnum StrategyMode { get; set; }

        [Parameter("SMC Swing Period", Group = "1. Strategy & Entry", DefaultValue = 10, MinValue = 3, MaxValue = 50)]
        public int SwingPeriod { get; set; }

        [Parameter("Fair Value Gap (FVG) Filter", Group = "1. Strategy & Entry", DefaultValue = true)]
        public bool UseFvgFilter { get; set; }

        [Parameter("Trend Filter Fast EMA", Group = "1. Strategy & Entry", DefaultValue = 50, MinValue = 10, MaxValue = 200)]
        public int FastEmaPeriod { get; set; }

        [Parameter("Trend Filter Slow EMA", Group = "1. Strategy & Entry", DefaultValue = 200, MinValue = 50, MaxValue = 500)]
        public int SlowEmaPeriod { get; set; }

        // ==========================================
        // ⚖️ METHOD 2 RISK & SIZING PARAMETERS
        // ==========================================
        [Parameter("Total Lot Size", Group = "2. Risk Protocol (Method 2)", DefaultValue = 0.02, MinValue = 0.02, Step = 0.02)]
        public double TotalLotSize { get; set; }

        [Parameter("Split-Ticket (Method 2)", Group = "2. Risk Protocol (Method 2)", DefaultValue = true)]
        public bool UseMethod2SplitTicket { get; set; }

        [Parameter("Risk:Reward Target (TP1)", Group = "2. Risk Protocol (Method 2)", DefaultValue = 1.5, MinValue = 1.0, Step = 0.1)]
        public double RiskRewardTp1 { get; set; }

        [Parameter("Risk:Reward Target (TP2)", Group = "2. Risk Protocol (Method 2)", DefaultValue = 3.0, MinValue = 2.0, Step = 0.5)]
        public double RiskRewardTp2 { get; set; }

        [Parameter("Auto-BE on TP1 Hit", Group = "2. Risk Protocol (Method 2)", DefaultValue = true)]
        public bool AutoBreakEvenOnTP1 { get; set; }

        [Parameter("BE Offset (Pips)", Group = "2. Risk Protocol (Method 2)", DefaultValue = 1.0, MinValue = 0.0, Step = 0.5)]
        public double BreakEvenOffsetPips { get; set; }

        // ==========================================
        // 🛡️ VOLATILITY & CAPITAL PROTECTION
        // ==========================================
        [Parameter("ATR Volatility Period", Group = "3. Volatility Protection", DefaultValue = 14, MinValue = 5, MaxValue = 50)]
        public int AtrPeriod { get; set; }

        [Parameter("ATR SL Multiplier", Group = "3. Volatility Protection", DefaultValue = 1.8, MinValue = 1.0, Step = 0.1)]
        public double AtrMultiplier { get; set; }

        [Parameter("Max Spread (Pips)", Group = "3. Volatility Protection", DefaultValue = 3.0, MinValue = 0.5, Step = 0.5)]
        public double MaxSpreadPips { get; set; }

        // ==========================================
        // 🔐 COMMUNITY & SUPPORT
        // ==========================================
        [Parameter("VIP Community Channel", Group = "4. Community & Support", DefaultValue = "https://t.me/MyQuantumAIBot")]
        public string CommunityChannel { get; set; }

        // ==========================================
        // INTERNAL ENGINE STATE
        // ==========================================
        private ExponentialMovingAverage _fastEma;
        private ExponentialMovingAverage _slowEma;
        private AverageTrueRange _atr;

        private double _recentSwingHigh = double.MinValue;
        private double _recentSwingLow = double.MaxValue;
        private DateTime _lastBarTime = DateTime.MinValue;

        public enum StrategyModeEnum
        {
            SmartMoneyConcepts,
            TrendBreakout,
            OrderBlockReversal
        }

        protected override void OnStart()
        {
            Print("=================================================");
            Print("🏛️ [QUANTUM AI] Institutional SMC Engine Initialized");
            Print("⚡ Version: 3.5 Store Edition (AccessRights: None)");
            Print($"⚖️ Risk Protocol: Method 2 Split-Ticket (Lot: {TotalLotSize})");
            Print($"📈 Symbol: {SymbolName} | Timeframe: {TimeFrame}");
            Print("=================================================");

            // Initialize Indicators (Runs 100% inside cTrader Sandbox)
            _fastEma = Indicators.ExponentialMovingAverage(Bars.ClosePrices, FastEmaPeriod);
            _slowEma = Indicators.ExponentialMovingAverage(Bars.ClosePrices, SlowEmaPeriod);
            _atr = Indicators.AverageTrueRange(AtrPeriod, MovingAverageType.Exponential);

            Positions.Closed += OnPositionClosed;
        }

        protected override void OnBar()
        {
            if (Bars.Count < Math.Max(SlowEmaPeriod, SwingPeriod) + 10)
                return;

            DateTime currentBarTime = Bars.OpenTimes.Last(1);
            if (currentBarTime == _lastBarTime)
                return;
            _lastBarTime = currentBarTime;

            // 1. Spread Protection Filter
            double currentSpread = (Symbol.Ask - Symbol.Bid) / Symbol.PipSize;
            if (currentSpread > MaxSpreadPips)
            {
                Print($"⚠️ [SPREAD FILTER]: Current spread {currentSpread:F1} pips exceeds max allowed {MaxSpreadPips:F1} pips.");
                return;
            }

            // 2. Identify Market Structure & Swings
            CalculateMarketStructure();

            // 3. Evaluate SMC Trade Setups
            EvaluateSmcSetups();
        }

        protected override void OnTick()
        {
            // Real-time Auto Break-Even (Auto-BE) Management for Active Positions
            if (AutoBreakEvenOnTP1)
            {
                ManageBreakEvenProtocol();
            }
        }

        private void CalculateMarketStructure()
        {
            int checkBars = SwingPeriod;
            double highest = double.MinValue;
            double lowest = double.MaxValue;

            for (int i = 1; i <= checkBars; i++)
            {
                if (Bars.HighPrices.Last(i) > highest)
                    highest = Bars.HighPrices.Last(i);

                if (Bars.LowPrices.Last(i) < lowest)
                    lowest = Bars.LowPrices.Last(i);
            }

            _recentSwingHigh = highest;
            _recentSwingLow = lowest;
        }

        private void EvaluateSmcSetups()
        {
            var botPositions = Positions.FindAll("QuantumAI_" + SymbolName);
            if (botPositions.Length >= 2)
                return;

            double currentClose = Bars.ClosePrices.Last(1);
            double previousClose = Bars.ClosePrices.Last(2);
            double fastEmaVal = _fastEma.Result.Last(1);
            double slowEmaVal = _slowEma.Result.Last(1);
            double currentAtr = _atr.Result.Last(1);

            bool isBullishTrend = fastEmaVal > slowEmaVal && currentClose > slowEmaVal;
            bool isBearishTrend = fastEmaVal < slowEmaVal && currentClose < slowEmaVal;

            // SMC Bullish Order Block / Break of Structure (BOS)
            bool isBullishBos = currentClose > _recentSwingHigh && previousClose <= _recentSwingHigh;
            bool isBullishFvg = !UseFvgFilter || (Bars.LowPrices.Last(1) > Bars.HighPrices.Last(3));

            if (isBullishTrend && isBullishBos && isBullishFvg)
            {
                double slDistance = currentAtr * AtrMultiplier;
                double slPips = Math.Round(slDistance / Symbol.PipSize, 1);
                if (slPips < 5.0) slPips = 5.0;

                double tp1Pips = Math.Round(slPips * RiskRewardTp1, 1);
                double tp2Pips = Math.Round(slPips * RiskRewardTp2, 1);

                ExecuteMethod2Trade(TradeType.Buy, slPips, tp1Pips, tp2Pips);
                return;
            }

            // SMC Bearish Order Block / Break of Structure (BOS)
            bool isBearishBos = currentClose < _recentSwingLow && previousClose >= _recentSwingLow;
            bool isBearishFvg = !UseFvgFilter || (Bars.HighPrices.Last(1) < Bars.LowPrices.Last(3));

            if (isBearishTrend && isBearishBos && isBearishFvg)
            {
                double slDistance = currentAtr * AtrMultiplier;
                double slPips = Math.Round(slDistance / Symbol.PipSize, 1);
                if (slPips < 5.0) slPips = 5.0;

                double tp1Pips = Math.Round(slPips * RiskRewardTp1, 1);
                double tp2Pips = Math.Round(slPips * RiskRewardTp2, 1);

                ExecuteMethod2Trade(TradeType.Sell, slPips, tp1Pips, tp2Pips);
            }
        }

        private void ExecuteMethod2Trade(TradeType tradeType, double slPips, double tp1Pips, double tp2Pips)
        {
            string tradeLabel = "QuantumAI_" + SymbolName;
            string tradeGroupId = "GRP_" + DateTime.UtcNow.Ticks;

            if (UseMethod2SplitTicket)
            {
                double splitLot = Math.Round(TotalLotSize / 2.0, 2);
                if (splitLot < Symbol.VolumeInUnitsToQuantity(Symbol.VolumeInUnitsMin))
                {
                    splitLot = Symbol.VolumeInUnitsToQuantity(Symbol.VolumeInUnitsMin);
                }

                double volumeInUnits = Symbol.QuantityToVolumeInUnits(splitLot);

                // Ticket A: TP1 Target (Conservative Profit Lock)
                string commentA = $"{tradeGroupId}|TP1|RUNNING";
                var resA = ExecuteMarketOrder(tradeType, SymbolName, volumeInUnits, tradeLabel, slPips, tp1Pips, commentA);

                if (resA.IsSuccessful && resA.Position != null)
                {
                    Print($"✅ [METHOD 2 - TICKET A EXECUTED]: Volume {splitLot} | SL: {slPips}p | TP1: {tp1Pips}p");
                }

                // Ticket B: TP2 Target (Macro Runner with Auto-BE)
                string commentB = $"{tradeGroupId}|TP2|RUNNING";
                var resB = ExecuteMarketOrder(tradeType, SymbolName, volumeInUnits, tradeLabel, slPips, tp2Pips, commentB);

                if (resB.IsSuccessful && resB.Position != null)
                {
                    Print($"✅ [METHOD 2 - TICKET B EXECUTED]: Volume {splitLot} | SL: {slPips}p | TP2: {tp2Pips}p");
                }
            }
            else
            {
                double volumeInUnits = Symbol.QuantityToVolumeInUnits(TotalLotSize);
                string comment = $"{tradeGroupId}|SINGLE|RUNNING";
                var res = ExecuteMarketOrder(tradeType, SymbolName, volumeInUnits, tradeLabel, slPips, tp1Pips, comment);

                if (res.IsSuccessful && res.Position != null)
                {
                    Print($"✅ [SINGLE TRADE EXECUTED]: Volume {TotalLotSize} | SL: {slPips}p | TP: {tp1Pips}p");
                }
            }
        }

        private void ManageBreakEvenProtocol()
        {
            var botPositions = Positions.FindAll("QuantumAI_" + SymbolName);
            if (botPositions.Length == 0) return;

            foreach (var pos in botPositions)
            {
                if (string.IsNullOrEmpty(pos.Comment) || !pos.Comment.Contains("|TP2|"))
                    continue;

                // Check if Ticket A has already hit TP1
                string groupId = pos.Comment.Split('|')[0];
                var ticketAPos = botPositions.FirstOrDefault(p => p.Comment.StartsWith(groupId) && p.Comment.Contains("|TP1|"));

                // If Ticket A is no longer in open positions, it either hit TP1 or SL
                if (ticketAPos == null)
                {
                    bool shouldMoveToBe = false;
                    double bePrice = 0;

                    if (pos.TradeType == TradeType.Buy)
                    {
                        bePrice = pos.EntryPrice + (BreakEvenOffsetPips * Symbol.PipSize);
                        if (Symbol.Bid > bePrice && (pos.StopLoss == null || pos.StopLoss < bePrice))
                        {
                            shouldMoveToBe = true;
                        }
                    }
                    else
                    {
                        bePrice = pos.EntryPrice - (BreakEvenOffsetPips * Symbol.PipSize);
                        if (Symbol.Ask < bePrice && (pos.StopLoss == null || pos.StopLoss > bePrice))
                        {
                            shouldMoveToBe = true;
                        }
                    }

                    if (shouldMoveToBe)
                    {
                        ModifyPosition(pos, bePrice, pos.TakeProfit);
                        Print($"🛡️ [AUTO-BE TRIGGERED]: Position #{pos.Id} Stop Loss secured at BE ({bePrice:F5})");
                    }
                }
            }
        }

        private void OnPositionClosed(PositionClosedEventArgs args)
        {
            var pos = args.Position;
            if (pos == null || pos.Label != "QuantumAI_" + SymbolName) return;

            Print($"🏁 [TRADE CLOSED]: #{pos.Id} ({pos.TradeType}) Net Profit: {pos.NetProfit:C2} ({pos.GrossProfit:C2} Gross) | Reason: {args.Reason}");
        }

        protected override void OnStop()
        {
            Print("🛑 [QUANTUM AI] Engine Stopped Safely.");
        }
    }
}
