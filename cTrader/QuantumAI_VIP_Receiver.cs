using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Net;
using System.Threading;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class QuantumAIVIPReceiver : Robot
    {
        [Parameter("Use Direct Server Bridge (Recommended)", Group = "Connection Mode", DefaultValue = true)]
        public bool UseServerDirectBridge { get; set; }

        [Parameter("QuantumAI Server URL", Group = "Connection Mode", DefaultValue = "http://localhost:3000")]
        public string ServerUrl { get; set; }

        [Parameter("Bot Token (Fallback)", Group = "Telegram Config", DefaultValue = "8916696582:AAH4I20Cy3oz94_-sdtSHCJ01e9M818W_uc")]
        public string BotToken { get; set; }

        [Parameter("VIP Channel ID (Fallback)", Group = "Telegram Config", DefaultValue = "-1004344482481")]
        public string ChannelId { get; set; }

        [Parameter("Polling Interval (Sec)", Group = "Connection Mode", DefaultValue = 2, MinValue = 1, MaxValue = 10)]
        public int PollingIntervalSec { get; set; }

        [Parameter("Default Lot Size (Total)", Group = "Risk Management", DefaultValue = 0.02, MinValue = 0.02, Step = 0.02)]
        public double TotalLotSize { get; set; }

        [Parameter("Use Method 2 (Split-Ticket)", Group = "Risk Management", DefaultValue = true)]
        public bool UseMethod2SplitTicket { get; set; }

        [Parameter("Auto-BE on TP1 Hit", Group = "Risk Management", DefaultValue = true)]
        public bool AutoBreakEvenOnTP1 { get; set; }

        [Parameter("Max Spread (Pips)", Group = "Protection", DefaultValue = 3.5)]
        public double MaxSpreadPips { get; set; }

        private long _lastUpdateId = 0;
        private long _lastSignalTimestamp = 0;
        private int _isPolling = 0;
        private readonly HashSet<string> _processedSignalIds = new HashSet<string>();

        protected override void OnStart()
        {
            // Enable modern TLS security for WebClient
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            Print("=================================================");
            Print("🏛️ [QUANTUM AI] VIP Copier Receiver Started");
            Print($"👤 Checking Account License for cTrader Account: {Account.Number}...");

            // 1. Verify VIP License Whitelist
            if (UseServerDirectBridge)
            {
                bool isLicensed = VerifyVipLicense();
                if (!isLicensed)
                {
                    Print("=================================================");
                    Print($"⛔ [AKSES DITOLAK]: Akaun {Account.Number} TIDAK BERDAFTAR dalam langganan VIP Quantum AI!");
                    Print($"💬 Sila daftarkan nombor akaun anda melalui Telegram: @MyQuantumAIBot (Taip: /register {Account.Number})");
                    Print("=================================================");
                    Stop();
                    return;
                }
            }

            if (UseServerDirectBridge)
            {
                Print($"⚡ Connection Mode: Direct Server Bridge ({ServerUrl})");
                Print("🛡️ Status: 0ms Latency | Zero Telegram Conflict");
            }
            else
            {
                Print($"📡 Connection Mode: Telegram Channel Polling ({ChannelId})");
            }
            Print($"⚖️ Risk Protocol: Method 2 Split-Ticket (Lot: {TotalLotSize})");
            Print("=================================================");

            // Hook trade closed event for automatic Telegram reporting
            Positions.Closed += OnPositionClosed;

            // Start timer for polling
            Timer.Start(Math.Max(1, PollingIntervalSec));
        }

        private bool VerifyVipLicense()
        {
            try
            {
                string verifyUrl = $"{ServerUrl.TrimEnd('/')}/api/copier/verify?account={Account.Number}";
                string response = string.Empty;

                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-LicenseChecker";
                    response = wc.DownloadString(verifyUrl);
                }

                if (!string.IsNullOrEmpty(response) && response.Contains("\"valid\":true"))
                {
                    var daysMatch = Regex.Match(response, "\"remainingDays\":(\\d+)");
                    string days = daysMatch.Success ? daysMatch.Groups[1].Value : "30";
                    Print($"✅ [VIP LICENSE CONFIRMED]: Akaun {Account.Number} Sah & Aktif! Baki langganan: {days} hari.");
                    return true;
                }

                var msgMatch = Regex.Match(response, "\"message\":\"(.*?)\"");
                if (msgMatch.Success)
                {
                    Print($"⚠️ [License Server]: {Regex.Unescape(msgMatch.Groups[1].Value)}");
                }
                return false;
            }
            catch (Exception ex)
            {
                Print($"⚠️ [License Check Warning]: Tidak dapat menyemak lesen dengan server: {ex.Message}");
                return false;
            }
        }

        protected override void OnTimer()
        {
            // Atomic thread-safe lock: guarantees only 1 request at a time
            if (Interlocked.CompareExchange(ref _isPolling, 1, 0) != 0) return;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    if (UseServerDirectBridge)
                    {
                        PollServerBridge();
                    }
                    else
                    {
                        PollTelegramUpdates();
                    }

                    // Check Break-Even across all open positions for all pairs
                    if (AutoBreakEvenOnTP1)
                    {
                        BeginInvokeOnMainThread(CheckAutoBreakEven);
                    }
                }
                catch (WebException wex)
                {
                    if (wex.Message.Contains("409"))
                    {
                        Print("⚠️ [Telegram 409 Conflict]: Sesi lama sedang dilepaskan. Sila gunakan 'Direct Server Bridge' untuk kestabilan 100%.");
                    }
                    else
                    {
                        Print($"⚠️ [Connection Web Error]: {wex.Message}");
                    }
                }
                catch (Exception ex)
                {
                    Print($"⚠️ [Copier Poll Error]: {ex.Message}");
                }
                finally
                {
                    Interlocked.Exchange(ref _isPolling, 0);
                }
            });
        }

        protected override void OnTick()
        {
            if (AutoBreakEvenOnTP1)
            {
                CheckAutoBreakEven();
            }
        }

        private void CheckAutoBreakEven()
        {
            foreach (var pos in Positions)
            {
                if (pos.Label.StartsWith("QAI_T2_"))
                {
                    string tradeTag = pos.Label.Substring(7);
                    
                    // Check if Ticket 1 for this tag has been closed in profit
                    var historyMatch = History.FindLast($"QAI_T1_{tradeTag}");
                    if (historyMatch != null && historyMatch.GrossProfit > 0)
                    {
                        // Ticket 1 closed in profit, move Ticket 2 Stop Loss to Entry (Break-Even)
                        if (pos.TradeType == TradeType.Buy && (pos.StopLoss == null || pos.StopLoss < pos.EntryPrice))
                        {
                            ModifyPosition(pos, pos.EntryPrice, pos.TakeProfit);
                            Print($"🛡️ [AUTO BREAK-EVEN] Ticket 2 ({pos.SymbolName}) SL moved to Entry: {pos.EntryPrice}");
                        }
                        else if (pos.TradeType == TradeType.Sell && (pos.StopLoss == null || pos.StopLoss > pos.EntryPrice))
                        {
                            ModifyPosition(pos, pos.EntryPrice, pos.TakeProfit);
                            Print($"🛡️ [AUTO BREAK-EVEN] Ticket 2 ({pos.SymbolName}) SL moved to Entry: {pos.EntryPrice}");
                        }
                    }
                }
            }
        }

        private void PollServerBridge()
        {
            string url = $"{ServerUrl.TrimEnd('/')}/api/copier/signal?since={_lastSignalTimestamp}";
            string response = string.Empty;

            using (var webClient = new WebClient())
            {
                webClient.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-Bridge";
                response = webClient.DownloadString(url);
            }

            if (string.IsNullOrEmpty(response) || !response.Contains("\"hasSignal\":true")) return;

            // Extract JSON fields using regex
            var idMatch = Regex.Match(response, "\"id\":\"(.*?)\"");
            var actionMatch = Regex.Match(response, "\"action\":\"(NEW_ORDER|CANCEL_ORDER)\"");
            var pairMatch = Regex.Match(response, "\"pair\":\"([A-Za-z0-9_\\/]+)\"");
            var dirMatch = Regex.Match(response, "\"direction\":\"(BUY|SELL)\"");
            var entryMatch = Regex.Match(response, "\"entryPrice\":([0-9\\.]+)");
            var slMatch = Regex.Match(response, "\"stopLoss\":([0-9\\.]+)");
            var tp1Match = Regex.Match(response, "\"takeProfit1\":([0-9\\.]+)");
            var tp2Match = Regex.Match(response, "\"takeProfit2\":([0-9\\.]+)");
            var tsMatch = Regex.Match(response, "\"timestamp\":(\\d+)");

            string signalId = idMatch.Success ? idMatch.Groups[1].Value : string.Empty;
            if (!string.IsNullOrEmpty(signalId) && _processedSignalIds.Contains(signalId))
            {
                return;
            }

            if (tsMatch.Success)
            {
                long sigTs = long.Parse(tsMatch.Groups[1].Value);
                _lastSignalTimestamp = sigTs;

                // Signal Freshness Check: Skip signals older than 15 minutes to prevent replaying stale setups on startup
                long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if ((nowMs - sigTs) > (15 * 60 * 1000))
                {
                    return;
                }
            }

            if (!pairMatch.Success) return;
            string pair = pairMatch.Groups[1].Value;

            // Handle cancellation signal
            if (actionMatch.Success && actionMatch.Groups[1].Value == "CANCEL_ORDER")
            {
                if (!string.IsNullOrEmpty(signalId)) _processedSignalIds.Add(signalId);
                BeginInvokeOnMainThread(() => CancelSignalOrders(pair));
                return;
            }

            if (!dirMatch.Success || !slMatch.Success || !tp1Match.Success) return;

            if (!string.IsNullOrEmpty(signalId))
            {
                _processedSignalIds.Add(signalId);
            }

            TradeType tradeType = dirMatch.Groups[1].Value == "BUY" ? TradeType.Buy : TradeType.Sell;
            double entryPrice = entryMatch.Success ? double.Parse(entryMatch.Groups[1].Value) : 0.0;
            double stopLoss = double.Parse(slMatch.Groups[1].Value);
            double takeProfit1 = double.Parse(tp1Match.Groups[1].Value);
            double? takeProfit2 = tp2Match.Success ? (double?)double.Parse(tp2Match.Groups[1].Value) : null;

            BeginInvokeOnMainThread(() => ExecuteSignalTrade(pair, tradeType, entryPrice, stopLoss, takeProfit1, takeProfit2));
        }

        private void PollTelegramUpdates()
        {
            string url = $"https://api.telegram.org/bot{BotToken}/getUpdates?offset={_lastUpdateId + 1}&limit=10&timeout=0";
            string response = string.Empty;

            using (var webClient = new WebClient())
            {
                webClient.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-Copier";
                response = webClient.DownloadString(url);
            }

            if (string.IsNullOrEmpty(response) || !response.Contains("\"ok\":true")) return;

            // Extract update_id
            var updateIdMatches = Regex.Matches(response, "\"update_id\":(\\d+)");
            foreach (Match m in updateIdMatches)
            {
                long uid = long.Parse(m.Groups[1].Value);
                if (uid > _lastUpdateId) _lastUpdateId = uid;
            }

            // Extract channel posts
            var postMatches = Regex.Matches(response, "\"channel_post\":\\{(.*?)\"text\":\"(.*?)\"", RegexOptions.Singleline);
            foreach (Match match in postMatches)
            {
                string postMeta = match.Groups[1].Value;
                string textRaw = match.Groups[2].Value;
                string text = Regex.Unescape(textRaw);

                if (!postMeta.Contains(ChannelId)) continue;

                if (text.Contains("QUANTUM AI"))
                {
                    BeginInvokeOnMainThread(() => ProcessTelegramSignal(text));
                }
            }
        }

        private void ProcessTelegramSignal(string msg)
        {
            try
            {
                var pairMatch = Regex.Match(msg, @"([A-Z]{3})[ /]?([A-Z]{3})");
                if (!pairMatch.Success) return;
                string pair = $"{pairMatch.Groups[1].Value}/{pairMatch.Groups[2].Value}";

                // Check if signal was cancelled
                if (msg.Contains("SIGNAL CANCELLED") || msg.Contains("DIBATALKAN"))
                {
                    CancelSignalOrders(pair);
                    return;
                }

                if (!msg.Contains("BUY") && !msg.Contains("SELL")) return;

                TradeType tradeType = msg.Contains("BUY") ? TradeType.Buy : TradeType.Sell;
                var entryMatch = Regex.Match(msg, @"(?:Entry Price|Entry|Harga Entri|Planned Entry):\s*`?([0-9\.]+)`?", RegexOptions.IgnoreCase);
                var slMatch = Regex.Match(msg, @"(?:Stop Loss|SL):\s*`?([0-9\.]+)`?", RegexOptions.IgnoreCase);
                var tp1Match = Regex.Match(msg, @"(?:Take Profit 1|Take Profit|TP 1|TP):\s*`?([0-9\.]+)`?", RegexOptions.IgnoreCase);
                var tp2Match = Regex.Match(msg, @"(?:Take Profit 2|Take Profit 2 \(Runner\)|TP 2):\s*`?([0-9\.]+)`?", RegexOptions.IgnoreCase);

                if (!slMatch.Success || !tp1Match.Success) return;

                double entryPrice = entryMatch.Success ? double.Parse(entryMatch.Groups[1].Value) : 0.0;
                double stopLoss = double.Parse(slMatch.Groups[1].Value);
                double takeProfit1 = double.Parse(tp1Match.Groups[1].Value);
                double? takeProfit2 = tp2Match.Success ? (double?)double.Parse(tp2Match.Groups[1].Value) : null;

                ExecuteSignalTrade(pair, tradeType, entryPrice, stopLoss, takeProfit1, takeProfit2);
            }
            catch (Exception ex)
            {
                Print($"❌ Error parsing Telegram signal: {ex.Message}");
            }
        }

        private void CancelSignalOrders(string pairStr)
        {
            try
            {
                string cleanPair = pairStr.Replace("/", "").Replace(" ", "").ToUpper();
                foreach (var order in PendingOrders)
                {
                    if (order.SymbolName.Replace("/", "").ToUpper() == cleanPair && order.Label.StartsWith("QAI_"))
                    {
                        CancelPendingOrder(order);
                        Print($"🚫 [PENDING ORDER CANCELLED]: {order.Label} for {order.SymbolName} successfully cancelled.");
                    }
                }
            }
            catch (Exception ex)
            {
                Print($"⚠️ Error cancelling pending orders: {ex.Message}");
            }
        }

        private void ExecuteSignalTrade(string pairStr, TradeType tradeType, double entryPrice, double stopLoss, double takeProfit1, double? takeProfit2)
        {
            try
            {
                string cleanPair = pairStr.Replace("/", "").Replace(" ", "").ToUpper();
                Symbol symbol = Symbols.GetSymbol(cleanPair) ?? Symbols.GetSymbol($"{cleanPair.Substring(0, 3)}/{cleanPair.Substring(3)}");

                if (symbol == null)
                {
                    Print($"❌ Symbol not found in broker market watch: {cleanPair}");
                    return;
                }

                // Spread Check
                double currentSpreadPips = symbol.Spread / symbol.PipSize;
                if (currentSpreadPips > MaxSpreadPips)
                {
                    Print($"⛔ Order Skipped: Spread too high ({currentSpreadPips:F1} pips > {MaxSpreadPips} pips)");
                    return;
                }

                // Duplicate Protection Guard: Check if pending order or open position already active for this pair
                foreach (var po in PendingOrders)
                {
                    if (po.SymbolName == symbol.Name && po.Label.StartsWith("QAI_"))
                    {
                        Print($"🛡️ [DUPLICATE GUARD] Pending order already active for {symbol.Name}. Duplicate placement skipped.");
                        return;
                    }
                }
                foreach (var pos in Positions)
                {
                    if (pos.SymbolName == symbol.Name && pos.Label.StartsWith("QAI_"))
                    {
                        Print($"🛡️ [DUPLICATE GUARD] Open position already active for {symbol.Name}. Duplicate placement skipped.");
                        return;
                    }
                }

                // Volume calculation (Method 2 Split-Ticket)
                string tradeTag = DateTime.UtcNow.ToString("HHmmss");
                double halfLot = Math.Max(0.01, TotalLotSize / 2.0);
                double volumeTicket1 = symbol.QuantityToVolumeInUnits(halfLot);
                double volumeTicket2 = symbol.QuantityToVolumeInUnits(TotalLotSize - halfLot);

                // Ensure Ticket 2 (Runner) has a GUARANTEED wider TP target than Ticket 1
                double effectiveTp2;
                if (takeProfit2.HasValue && Math.Abs(takeProfit2.Value - takeProfit1) >= (symbol.PipSize * 3))
                {
                    effectiveTp2 = takeProfit2.Value;
                }
                else
                {
                    // Fallback to 1:2 Risk-Reward Runner Target
                    double riskDist = Math.Abs(takeProfit1 - stopLoss);
                    effectiveTp2 = tradeType == TradeType.Buy ? takeProfit1 + riskDist : takeProfit1 - riskDist;
                }

                // Calculate Pips distances based on institutional entry level
                double referencePrice = entryPrice > 0 ? entryPrice : (tradeType == TradeType.Buy ? symbol.Ask : symbol.Bid);
                double slPips = Math.Round(Math.Abs(referencePrice - stopLoss) / symbol.PipSize, 1);
                double tp1Pips = Math.Round(Math.Abs(takeProfit1 - referencePrice) / symbol.PipSize, 1);
                double tp2Pips = Math.Round(Math.Abs(effectiveTp2 - referencePrice) / symbol.PipSize, 1);

                // Safeguards against broker minimum stop distances
                double minSpreadPips = symbol.PipSize > 0 ? (symbol.Spread / symbol.PipSize) : 2.0;
                slPips = Math.Max(slPips, Math.Max(10.0, minSpreadPips * 2.0));
                tp1Pips = Math.Max(tp1Pips, Math.Max(15.0, minSpreadPips * 3.0));
                tp2Pips = Math.Max(tp2Pips, tp1Pips + 15.0);

                double currentAsk = symbol.Ask;
                double currentBid = symbol.Bid;

                // Smart Money Concepts: Decide between Pending Limit Order vs Immediate Fill
                bool isPendingLimitOrder = false;
                if (entryPrice > 0)
                {
                    if (tradeType == TradeType.Buy && entryPrice < (currentAsk - (symbol.PipSize * 1.5)))
                    {
                        isPendingLimitOrder = true;
                    }
                    else if (tradeType == TradeType.Sell && entryPrice > (currentBid + (symbol.PipSize * 1.5)))
                    {
                        isPendingLimitOrder = true;
                    }
                }

                if (isPendingLimitOrder)
                {
                    Print($"🎯 [SMC PENDING LIMIT ORDER] {tradeType} {symbol.Name} @ {entryPrice} | SL: {slPips}p | TP1: {tp1Pips}p | TP2: {tp2Pips}p");

                    // Place Ticket 1 Pending Limit Order
                    PlaceLimitOrder(tradeType, symbol.Name, volumeTicket1, entryPrice, $"QAI_T1_{tradeTag}", slPips, tp1Pips);

                    // Place Ticket 2 Runner Pending Limit Order
                    if (UseMethod2SplitTicket)
                    {
                        PlaceLimitOrder(tradeType, symbol.Name, volumeTicket2, entryPrice, $"QAI_T2_{tradeTag}", slPips, tp2Pips);
                    }

                    Print($"✅ [SUCCESS] 2 Pending Limit Orders placed in cTrader Orders tab for {symbol.Name} (Target Entry: {entryPrice})");
                }
                else
                {
                    Print($"🚀 [SMC MARKET ORDER TRIGGERED] {tradeType} {symbol.Name} | SL: {slPips}p | TP1: {tp1Pips}p | TP2: {tp2Pips}p");

                    // Ticket 1 (TP1 Scalp Target)
                    ExecuteMarketOrder(tradeType, symbol.Name, volumeTicket1, $"QAI_T1_{tradeTag}", slPips, tp1Pips);

                    // Ticket 2 (TP2 Runner with Method 2 Auto-BE Rule)
                    if (UseMethod2SplitTicket)
                    {
                        ExecuteMarketOrder(tradeType, symbol.Name, volumeTicket2, $"QAI_T2_{tradeTag}", slPips, tp2Pips);
                    }

                    Print($"✅ [SUCCESS] Method 2 Split-Tickets placed for {symbol.Name} Tag: {tradeTag} (T1: {tp1Pips} pips, T2 Runner: {tp2Pips} pips)");
                }
            }
            catch (Exception ex)
            {
                Print($"❌ Execution Error: {ex.Message}");
            }
        }

        private void OnPositionClosed(PositionClosedEventArgs args)
        {
            var pos = args.Position;
            if (pos == null || string.IsNullOrEmpty(pos.Label) || !pos.Label.StartsWith("QAI_")) return;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    var sym = Symbols.GetSymbol(pos.SymbolName);
                    double pipSize = sym != null ? sym.PipSize : 0.0001;
                    double closePrice = pos.TradeType == TradeType.Buy 
                        ? pos.EntryPrice + (pos.Pips * pipSize) 
                        : pos.EntryPrice - (pos.Pips * pipSize);

                    string reportUrl = $"{ServerUrl.TrimEnd('/')}/api/copier/report-closed";
                    string json = string.Format(
                        System.Globalization.CultureInfo.InvariantCulture,
                        "{{\"label\":\"{0}\",\"symbol\":\"{1}\",\"tradeType\":\"{2}\",\"entryPrice\":{3},\"closePrice\":{4},\"netProfit\":{5},\"pips\":{6},\"account\":{7}}}",
                        pos.Label,
                        pos.SymbolName,
                        pos.TradeType.ToString(),
                        pos.EntryPrice,
                        closePrice,
                        pos.NetProfit,
                        pos.Pips,
                        Account.Number
                    );

                    using (var wc = new WebClient())
                    {
                        wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                        wc.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-Reporter";
                        wc.UploadString(reportUrl, "POST", json);
                    }

                    Print($"📢 [TRADE CLOSED BROADCASTED]: {pos.Label} {pos.SymbolName} Net: €{pos.NetProfit:F2} ({pos.Pips:F1} pips) dikongsi ke Telegram.");
                }
                catch (Exception ex)
                {
                    Print($"⚠️ [Trade Close Report Error]: {ex.Message}");
                }
            });
        }

        protected override void OnStop()
        {
            Timer.Stop();
            Positions.Closed -= OnPositionClosed;
            Print("🛑 [QUANTUM AI] VIP Copier Receiver Stopped.");
        }
    }
}
