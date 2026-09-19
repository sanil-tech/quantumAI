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
    public class QuantumAIVIPV30 : Robot
    {
        [Parameter("QuantumAI Server URL", Group = "Connection Mode", DefaultValue = "http://localhost:3000")]
        public string ServerUrl { get; set; }

        [Parameter("VIP Auth Token", Group = "VIP Licensing", DefaultValue = "")]
        public string VipAuthToken { get; set; }

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

        private string _accountNumber = string.Empty;
        private long _lastSignalTimestamp = 0;
        private int _isPolling = 0;
        private int _revalidationCounter = 0;
        private readonly HashSet<string> _processedSignalIds = new HashSet<string>();
        private readonly object _syncLock = new object();

        protected override void OnStart()
        {
            // Cache account number on main thread to avoid non-main thread API violations
            _accountNumber = Account.Number.ToString();

            // Enable modern TLS security for WebClient
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            // Production Transport Security: Enforce HTTPS for non-local environments
            if (!ServerUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
                !ServerUrl.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase) &&
                !ServerUrl.StartsWith("http://127.0.0.1", StringComparison.OrdinalIgnoreCase))
            {
                Print("⛔ [SECURITY VIOLATION]: Production connection must use HTTPS! Plain HTTP is disabled in production.");
                Stop();
                return;
            }

            Print("=================================================");
            Print("🏛️ [QUANTUM AI] VIP Copier V3.0 — Institutional Bridge Started");
            Print($"👤 Checking Account License for cTrader Account: {_accountNumber}...");

            // 1. Verify VIP License Whitelist & Cryptographic Token
            bool isLicensed = VerifyVipLicense();
            if (!isLicensed)
            {
                Print("=================================================");
                Print($"⛔ [AKSES DITOLAK]: Akaun {_accountNumber} TIDAK BERDAFTAR, token tidak sah, atau belum diaktifkan dalam langganan VIP Quantum AI!");
                Print($"💬 Sila daftarkan nombor akaun anda melalui Telegram: @MyQuantumAIBot (Taip: /register {_accountNumber})");
                Print("=================================================");
                Stop();
                return;
            }

            Print($"⚡ Connection Mode: Authorized Direct Server Bridge ({ServerUrl})");
            Print("🛡️ Status: Direct Backend Bridge | Zero Third-Party Conflict");
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
                if (string.IsNullOrWhiteSpace(VipAuthToken))
                {
                    Print("⛔ [AKSES DITOLAK]: 'VIP Auth Token' kosong! Sila masukkan token kriptografik VIP anda.");
                    return false;
                }

                string acc = string.IsNullOrEmpty(_accountNumber) ? Account.Number.ToString() : _accountNumber;
                string verifyUrl = $"{ServerUrl.TrimEnd('/')}/api/copier/verify?account={acc}&token={Uri.EscapeDataString(VipAuthToken)}";
                string response = string.Empty;

                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-LicenseChecker";
                    wc.Headers[HttpRequestHeader.Authorization] = $"Bearer {VipAuthToken}";
                    response = wc.DownloadString(verifyUrl);
                }

                if (!string.IsNullOrEmpty(response) && response.Contains("\"valid\":true"))
                {
                    var daysMatch = Regex.Match(response, "\"remainingDays\":(\\d+)");
                    string days = daysMatch.Success ? daysMatch.Groups[1].Value : "30";
                    Print($"✅ [VIP LICENSE CONFIRMED]: Akaun {acc} Sah & Aktif! Baki langganan: {days} hari.");
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
            // Periodic License Re-validation: every 150 poll cycles (~5 minutes at 2s)
            Interlocked.Increment(ref _revalidationCounter);
            if (_revalidationCounter >= 150)
            {
                _revalidationCounter = 0;
                if (!VerifyVipLicense())
                {
                    Print("⛔ [AKSES DITOLAK]: Langganan VIP telah tamat tempoh atau digantung. cBot dihentikan serta-merta.");
                    Stop();
                    return;
                }
            }

            // Atomic thread-safe lock: guarantees only 1 request at a time
            if (Interlocked.CompareExchange(ref _isPolling, 1, 0) != 0) return;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    PollServerBridge();

                    // Check Break-Even on main thread
                    if (AutoBreakEvenOnTP1)
                    {
                        BeginInvokeOnMainThread(CheckAutoBreakEven);
                    }
                }
                catch (WebException wex)
                {
                    Print($"⚠️ [Connection Web Error]: {wex.Message}");
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
            try
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
            catch (Exception ex)
            {
                Print($"⚠️ [Auto-BE Error]: {ex.Message}");
            }
        }

        private void PollServerBridge()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(VipAuthToken)) return;

                string url = $"{ServerUrl.TrimEnd('/')}/api/copier/signal?account={_accountNumber}&token={Uri.EscapeDataString(VipAuthToken)}&since={_lastSignalTimestamp}";
                string response = string.Empty;

                using (var webClient = new WebClient())
                {
                    webClient.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-Bridge";
                    webClient.Headers[HttpRequestHeader.Authorization] = $"Bearer {VipAuthToken}";
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
                lock (_syncLock)
                {
                    if (!string.IsNullOrEmpty(signalId) && _processedSignalIds.Contains(signalId))
                    {
                        return;
                    }
                }

                if (tsMatch.Success)
                {
                    long sigTs = long.Parse(tsMatch.Groups[1].Value);
                    _lastSignalTimestamp = sigTs;

                    // Signal Freshness Check: Accept valid setups within 2-hour Time-To-Live (TTL) window
                    long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    if ((nowMs - sigTs) > (2 * 60 * 60 * 1000))
                    {
                        return;
                    }
                }

                if (!pairMatch.Success) return;
                string pair = pairMatch.Groups[1].Value;

                // Handle cancellation signal
                if (actionMatch.Success && actionMatch.Groups[1].Value == "CANCEL_ORDER")
                {
                    lock (_syncLock)
                    {
                        if (!string.IsNullOrEmpty(signalId)) _processedSignalIds.Add(signalId);
                    }
                    BeginInvokeOnMainThread(() => CancelSignalOrders(pair));
                    return;
                }

                if (!dirMatch.Success || !slMatch.Success || !tp1Match.Success) return;

                lock (_syncLock)
                {
                    if (!string.IsNullOrEmpty(signalId))
                    {
                        _processedSignalIds.Add(signalId);
                    }
                }

                TradeType tradeType = dirMatch.Groups[1].Value == "BUY" ? TradeType.Buy : TradeType.Sell;
                double entryPrice = entryMatch.Success ? double.Parse(entryMatch.Groups[1].Value) : 0.0;
                double stopLoss = double.Parse(slMatch.Groups[1].Value);
                double takeProfit1 = double.Parse(tp1Match.Groups[1].Value);
                double? takeProfit2 = tp2Match.Success ? (double?)double.Parse(tp2Match.Groups[1].Value) : null;

                BeginInvokeOnMainThread(() => ExecuteSignalTrade(pair, tradeType, entryPrice, stopLoss, takeProfit1, takeProfit2));
            }
            catch (Exception ex)
            {
                Print($"⚠️ [PollServerBridge Error]: {ex.Message}");
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

            // Extract all cTrader properties on main thread before queuing background worker
            string label = pos.Label;
            string symName = pos.SymbolName;
            string tradeTypeStr = pos.TradeType.ToString();
            double entryPrice = pos.EntryPrice;
            double netProfit = pos.NetProfit;
            double pips = pos.Pips;
            var sym = Symbols.GetSymbol(pos.SymbolName);
            double pipSize = sym != null ? sym.PipSize : 0.0001;
            double closePrice = pos.TradeType == TradeType.Buy 
                ? entryPrice + (pips * pipSize) 
                : entryPrice - (pips * pipSize);
            string accountNum = _accountNumber;
            string srvUrl = ServerUrl;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    string reportUrl = $"{srvUrl.TrimEnd('/')}/api/copier/report-closed";
                    string json = string.Format(
                        System.Globalization.CultureInfo.InvariantCulture,
                        "{{\"label\":\"{0}\",\"symbol\":\"{1}\",\"tradeType\":\"{2}\",\"entryPrice\":{3},\"closePrice\":{4},\"netProfit\":{5},\"pips\":{6},\"account\":{7}}}",
                        label,
                        symName,
                        tradeTypeStr,
                        entryPrice,
                        closePrice,
                        netProfit,
                        pips,
                        accountNum
                    );

                    using (var wc = new WebClient())
                    {
                        wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                        wc.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-Reporter";
                        wc.UploadString(reportUrl, "POST", json);
                    }

                    Print($"📢 [TRADE CLOSED BROADCASTED]: {label} {symName} Net: €{netProfit:F2} ({pips:F1} pips) dikongsi ke Telegram.");
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
