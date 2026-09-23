using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Net;
using System.Threading;
using System.IO;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using cAlgo.API;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    public enum RiskCalculationMode
    {
        FixedLot,
        PercentageEquity
    }

    public enum RiskProfileType
    {
        Conservative, // 0.25%
        Standard,     // 0.50% (Default)
        Growth,       // 1.00%
        Aggressive,   // 1.50%
        HighRisk,     // 2.00%
        Custom        // Custom percentage > 0 and <= 2.00%
    }

    /// <summary>
    /// Cryptographically verified persistent risk state for institutional daily loss and drawdown tracking.
    /// </summary>
    public class QuantumAIRiskState
    {
        public string IdentityKey { get; set; } // Broker_Account_Type (e.g. ICMarkets_123456_DEMO)
        public string BrokerName { get; set; }
        public string AccountNumber { get; set; }
        public string AccountType { get; set; }
        public double DailyBaselineEquity { get; set; }
        public double HighWaterMark { get; set; }
        public string LastResetDateUtc { get; set; } // YYYY-MM-DD
        public string LastUpdatedUtc { get; set; }
        public string Checksum { get; set; }
        public bool IsCorrupted { get; set; }
        public bool IsFirstRun { get; set; }

        public QuantumAIRiskState()
        {
            IdentityKey = string.Empty;
            BrokerName = string.Empty;
            AccountNumber = string.Empty;
            AccountType = string.Empty;
            DailyBaselineEquity = 0.0;
            HighWaterMark = 0.0;
            LastResetDateUtc = string.Empty;
            LastUpdatedUtc = string.Empty;
            Checksum = string.Empty;
            IsCorrupted = false;
            IsFirstRun = false;
        }

        public string ComputeChecksum()
        {
            string raw = string.Format(
                CultureInfo.InvariantCulture, 
                "{0}|{1}|{2}|{3:F4}|{4:F4}|{5}", 
                IdentityKey, 
                BrokerName, 
                AccountNumber, 
                DailyBaselineEquity, 
                HighWaterMark, 
                LastResetDateUtc
            );
            using (var sha = SHA256.Create())
            {
                byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                var sb = new StringBuilder();
                for (int i = 0; i < bytes.Length; i++)
                {
                    sb.Append(bytes[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }
    }

    /// <summary>
    /// Position risk data structure for pure guard evaluation in cBot and unit tests.
    /// </summary>
    public class PositionRiskData
    {
        public long Id { get; set; }
        public string SymbolName { get; set; }
        public double EntryPrice { get; set; }
        public double? StopLoss { get; set; }
        public double VolumeInUnits { get; set; }
        public double PipSize { get; set; }
        public double PipValue { get; set; }
        public bool SymbolFound { get; set; }

        public PositionRiskData()
        {
            PipSize = 0.0001;
            PipValue = 0.0001;
            SymbolFound = true;
        }
    }

    /// <summary>
    /// Disk persistence engine for institutional risk state across restarts and rollover.
    /// Utilizes composite account identity, in-process mutex locking, and atomic file replacement.
    /// </summary>
    public static class QuantumAIRiskStorage
    {
        private static readonly object _fileLock = new object();

        public static string SanitizeIdentifier(string input)
        {
            if (string.IsNullOrEmpty(input)) return "UNKNOWN";
            var sb = new StringBuilder();
            for (int i = 0; i < input.Length; i++)
            {
                char c = input[i];
                if (char.IsLetterOrDigit(c) || c == '_' || c == '-') sb.Append(c);
                else sb.Append('_');
            }
            return sb.ToString();
        }

        public static string BuildIdentityKey(string brokerName, string accountNumber, string accountType)
        {
            string cleanBroker = SanitizeIdentifier(brokerName);
            string cleanAcc = SanitizeIdentifier(accountNumber);
            string cleanType = SanitizeIdentifier(accountType);
            return string.Format(CultureInfo.InvariantCulture, "{0}_{1}_{2}", cleanBroker, cleanAcc, cleanType);
        }

        public static string GetStorageDirectory()
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string dir = System.IO.Path.Combine(appData, "QuantumAI");
            if (!System.IO.Directory.Exists(dir))
            {
                System.IO.Directory.CreateDirectory(dir);
            }
            return dir;
        }

        public static string GetFilePath(string identityKey)
        {
            return System.IO.Path.Combine(GetStorageDirectory(), string.Format("risk_state_{0}.json", SanitizeIdentifier(identityKey)));
        }

        public static QuantumAIRiskState LoadState(string identityKey, string brokerName, string accountNumber, string accountType, double currentEquity, double currentBalance, DateTime utcNow)
        {
            lock (_fileLock)
            {
                string filePath = GetFilePath(identityKey);
                string todayStr = utcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

                if (!System.IO.File.Exists(filePath))
                {
                    // First run: Initialize new persistent state
                    var newState = new QuantumAIRiskState
                    {
                        IdentityKey = identityKey,
                        BrokerName = brokerName,
                        AccountNumber = accountNumber,
                        AccountType = accountType,
                        DailyBaselineEquity = currentEquity,
                        HighWaterMark = Math.Max(currentEquity, currentBalance),
                        LastResetDateUtc = todayStr,
                        LastUpdatedUtc = utcNow.ToString("o", CultureInfo.InvariantCulture),
                        IsFirstRun = true
                    };
                    newState.Checksum = newState.ComputeChecksum();
                    if (!SaveState(newState))
                    {
                        newState.IsCorrupted = true;
                    }
                    return newState;
                }

                try
                {
                    string json = System.IO.File.ReadAllText(filePath, Encoding.UTF8);
                    var state = ParseStateJson(json);
                    if (state == null || string.IsNullOrEmpty(state.IdentityKey))
                    {
                        return new QuantumAIRiskState { IdentityKey = identityKey, IsCorrupted = true };
                    }

                    // Verify Cryptographic Integrity Checksum
                    string expectedChecksum = state.ComputeChecksum();
                    if (!string.Equals(state.Checksum, expectedChecksum, StringComparison.OrdinalIgnoreCase))
                    {
                        state.IsCorrupted = true;
                        return state;
                    }

                    // Identity sanity check
                    if (state.IdentityKey != identityKey)
                    {
                        state.IsCorrupted = true;
                        return state;
                    }

                    // Handle UTC Day Rollover
                    if (string.Compare(state.LastResetDateUtc, todayStr, StringComparison.Ordinal) < 0)
                    {
                        // New Day: Baseline resets to current equity, High-Water Mark is preserved
                        state.DailyBaselineEquity = currentEquity;
                        state.LastResetDateUtc = todayStr;
                        state.HighWaterMark = Math.Max(state.HighWaterMark, Math.Max(currentEquity, currentBalance));
                        state.LastUpdatedUtc = utcNow.ToString("o", CultureInfo.InvariantCulture);
                        state.Checksum = state.ComputeChecksum();
                        if (!SaveState(state))
                        {
                            state.IsCorrupted = true;
                        }
                    }
                    else
                    {
                        // Same Day Restart: Preserve existing baseline, update HWM if higher
                        if (currentEquity > state.HighWaterMark)
                        {
                            state.HighWaterMark = currentEquity;
                            state.LastUpdatedUtc = utcNow.ToString("o", CultureInfo.InvariantCulture);
                            state.Checksum = state.ComputeChecksum();
                            if (!SaveState(state))
                            {
                                state.IsCorrupted = true;
                            }
                        }
                    }

                    return state;
                }
                catch (Exception)
                {
                    return new QuantumAIRiskState { IdentityKey = identityKey, IsCorrupted = true };
                }
            }
        }

        public static bool SaveState(QuantumAIRiskState state)
        {
            if (state == null || state.IsCorrupted || string.IsNullOrEmpty(state.IdentityKey))
            {
                return false;
            }

            lock (_fileLock)
            {
                try
                {
                    state.LastUpdatedUtc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
                    state.Checksum = state.ComputeChecksum();

                    string json = string.Format(
                        CultureInfo.InvariantCulture,
                        "{{\n  \"IdentityKey\": \"{0}\",\n  \"BrokerName\": \"{1}\",\n  \"AccountNumber\": \"{2}\",\n  \"AccountType\": \"{3}\",\n  \"DailyBaselineEquity\": {4:F4},\n  \"HighWaterMark\": {5:F4},\n  \"LastResetDateUtc\": \"{6}\",\n  \"LastUpdatedUtc\": \"{7}\",\n  \"Checksum\": \"{8}\"\n}}",
                        state.IdentityKey,
                        state.BrokerName,
                        state.AccountNumber,
                        state.AccountType,
                        state.DailyBaselineEquity,
                        state.HighWaterMark,
                        state.LastResetDateUtc,
                        state.LastUpdatedUtc,
                        state.Checksum
                    );

                    string dir = GetStorageDirectory();
                    string filePath = GetFilePath(state.IdentityKey);
                    string tempPath = System.IO.Path.Combine(dir, string.Format("risk_state_{0}_{1}.tmp", SanitizeIdentifier(state.IdentityKey), Guid.NewGuid().ToString("N")));

                    System.IO.File.WriteAllText(tempPath, json, Encoding.UTF8);

                    // Atomic File Replacement: If file already exists, use File.Replace to preserve original on write failure
                    if (System.IO.File.Exists(filePath))
                    {
                        string backupPath = System.IO.Path.Combine(dir, string.Format("risk_state_{0}.bak", SanitizeIdentifier(state.IdentityKey)));
                        System.IO.File.Replace(tempPath, filePath, backupPath, true);
                        if (System.IO.File.Exists(backupPath))
                        {
                            try { System.IO.File.Delete(backupPath); } catch { }
                        }
                    }
                    else
                    {
                        System.IO.File.Move(tempPath, filePath);
                    }
                    return true;
                }
                catch (Exception)
                {
                    return false;
                }
            }
        }

        private static QuantumAIRiskState ParseStateJson(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;

            var idMatch = Regex.Match(json, "\"IdentityKey\":\\s*\"([^\"]+)\"");
            var brokerMatch = Regex.Match(json, "\"BrokerName\":\\s*\"([^\"]+)\"");
            var accMatch = Regex.Match(json, "\"AccountNumber\":\\s*\"([^\"]+)\"");
            var typeMatch = Regex.Match(json, "\"AccountType\":\\s*\"([^\"]+)\"");
            var baseMatch = Regex.Match(json, "\"DailyBaselineEquity\":\\s*([0-9\\.\\-]+)");
            var hwmMatch = Regex.Match(json, "\"HighWaterMark\":\\s*([0-9\\.\\-]+)");
            var dateMatch = Regex.Match(json, "\"LastResetDateUtc\":\\s*\"([^\"]+)\"");
            var updateMatch = Regex.Match(json, "\"LastUpdatedUtc\":\\s*\"([^\"]+)\"");
            var checkMatch = Regex.Match(json, "\"Checksum\":\\s*\"([^\"]+)\"");

            if (!baseMatch.Success || !hwmMatch.Success || !dateMatch.Success)
            {
                return null;
            }

            string identityKey = idMatch.Success ? idMatch.Groups[1].Value : string.Empty;
            string accNum = accMatch.Success ? accMatch.Groups[1].Value : string.Empty;

            if (string.IsNullOrEmpty(identityKey) && string.IsNullOrEmpty(accNum))
            {
                return null;
            }

            return new QuantumAIRiskState
            {
                IdentityKey = !string.IsNullOrEmpty(identityKey) ? identityKey : accNum,
                BrokerName = brokerMatch.Success ? brokerMatch.Groups[1].Value : string.Empty,
                AccountNumber = accNum,
                AccountType = typeMatch.Success ? typeMatch.Groups[1].Value : string.Empty,
                DailyBaselineEquity = double.Parse(baseMatch.Groups[1].Value, CultureInfo.InvariantCulture),
                HighWaterMark = double.Parse(hwmMatch.Groups[1].Value, CultureInfo.InvariantCulture),
                LastResetDateUtc = dateMatch.Groups[1].Value,
                LastUpdatedUtc = updateMatch.Success ? updateMatch.Groups[1].Value : string.Empty,
                Checksum = checkMatch.Success ? checkMatch.Groups[1].Value : string.Empty
            };
        }
    }

    /// <summary>
    /// Pure institutional risk calculation and validation engine used by cBot and unit tests.
    /// </summary>
    public static class QuantumAIRiskEngine
    {
        public static double GetSubscriberSelectedRiskPct(RiskProfileType profile, double customRiskPct)
        {
            switch (profile)
            {
                case RiskProfileType.Conservative: return 0.25;
                case RiskProfileType.Standard: return 0.50;
                case RiskProfileType.Growth: return 1.00;
                case RiskProfileType.Aggressive: return 1.50;
                case RiskProfileType.HighRisk: return 2.00;
                case RiskProfileType.Custom:
                    if (double.IsNaN(customRiskPct) || double.IsInfinity(customRiskPct) || customRiskPct <= 0) return 0.50;
                    return Math.Min(2.00, Math.Max(0.01, customRiskPct));
                default: return 0.50;
            }
        }

        public static double NormalizeVolumeDown(double targetUnits, double minUnits, double stepUnits, double maxUnits)
        {
            if (double.IsNaN(targetUnits) || double.IsInfinity(targetUnits) || targetUnits <= 0) return 0;
            if (double.IsNaN(minUnits) || double.IsInfinity(minUnits) || minUnits <= 0) return 0;
            if (double.IsNaN(stepUnits) || double.IsInfinity(stepUnits) || stepUnits <= 0) return 0;
            if (double.IsNaN(maxUnits) || double.IsInfinity(maxUnits) || maxUnits <= 0) return 0;
            if (maxUnits < minUnits) return 0;

            double steps = Math.Floor((targetUnits - minUnits) / stepUnits);
            if (steps < 0) return 0; // Below broker minimum

            double normalized = minUnits + (steps * stepUnits);
            if (normalized > maxUnits) normalized = maxUnits;
            return normalized;
        }

        /// <summary>
        /// Strict JSON field token extractor. Distinguishes genuinely missing keys from keys with invalid/null/malformed values.
        /// </summary>
        public static bool TryExtractJsonToken(string json, string key, out bool keyExists, out string tokenValue)
        {
            keyExists = false;
            tokenValue = null;

            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key)) return false;

            var match = Regex.Match(json, string.Format("\"{0}\"\\s*:\\s*([^,\\}}\\]\\s]+|\"(?:[^\"\\\\]|\\\\.)*\")", Regex.Escape(key)));
            if (match.Success)
            {
                keyExists = true;
                tokenValue = match.Groups[1].Value.Trim();
            }
            return true;
        }

        /// <summary>
        /// Extracts and validates risk parameters from raw signal JSON payload.
        /// Missing optional fields return true with null (backward compatible with legacy signals).
        /// Present but invalid/null/negative/non-finite fields return false with clear error.
        /// Valid small values (e.g. 0.05%) are strictly preserved without artificial bumping.
        /// </summary>
        public static bool ExtractAndValidateRiskFromSignalJson(string json, out double? recommendedRisk, out double? maxRisk, out string error)
        {
            recommendedRisk = null;
            maxRisk = null;
            error = string.Empty;

            if (string.IsNullOrEmpty(json))
            {
                error = "EMPTY_PAYLOAD";
                return false;
            }

            bool hasRecKey;
            string recRaw;
            TryExtractJsonToken(json, "recommendedRiskPct", out hasRecKey, out recRaw);

            if (hasRecKey)
            {
                if (string.IsNullOrEmpty(recRaw) || recRaw == "null" || recRaw.StartsWith("\""))
                {
                    error = string.Format(CultureInfo.InvariantCulture, "MALFORMED_RECOMMENDED_RISK: Field present with invalid value '{0}'", recRaw);
                    return false;
                }
                double val;
                if (!double.TryParse(recRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out val) || double.IsNaN(val) || double.IsInfinity(val) || val <= 0 || val > 5.0)
                {
                    error = string.Format(CultureInfo.InvariantCulture, "MALFORMED_RECOMMENDED_RISK: Value '{0}' is invalid (must be a positive number <= 5.0%)", recRaw);
                    return false;
                }
                recommendedRisk = val;
            }

            bool hasMaxKey;
            string maxRaw;
            TryExtractJsonToken(json, "maxRiskPct", out hasMaxKey, out maxRaw);

            if (hasMaxKey)
            {
                if (string.IsNullOrEmpty(maxRaw) || maxRaw == "null" || maxRaw.StartsWith("\""))
                {
                    error = string.Format(CultureInfo.InvariantCulture, "MALFORMED_MAX_RISK: Field present with invalid value '{0}'", maxRaw);
                    return false;
                }
                double val;
                if (!double.TryParse(maxRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out val) || double.IsNaN(val) || double.IsInfinity(val) || val <= 0 || val > 5.0)
                {
                    error = string.Format(CultureInfo.InvariantCulture, "MALFORMED_MAX_RISK: Value '{0}' is invalid (must be a positive number <= 5.0%)", maxRaw);
                    return false;
                }
                maxRisk = val;
            }

            if (recommendedRisk.HasValue && maxRisk.HasValue && recommendedRisk.Value > maxRisk.Value)
            {
                error = string.Format(CultureInfo.InvariantCulture, "RECOMMENDED_RISK_EXCEEDS_MAX: recommendedRiskPct ({0:F2}%) > maxRiskPct ({1:F2}%)", recommendedRisk.Value, maxRisk.Value);
                return false;
            }

            return true;
        }

        /// <summary>
        /// Pure evaluation of open portfolio monetary risk with strict fail-closed enforcement on missing StopLoss or unknown symbol.
        /// </summary>
        public static bool EvaluateOpenRiskFromPositions(
            IEnumerable<PositionRiskData> positions, 
            IEnumerable<PositionRiskData> pendingOrders, 
            double equity, 
            double maxTotalOpenRiskPct, 
            out double currentOpenRiskPct, 
            out double remainingPortfolioRiskPct, 
            out string vetoReason)
        {
            currentOpenRiskPct = 0.0;
            remainingPortfolioRiskPct = maxTotalOpenRiskPct;
            vetoReason = string.Empty;

            double totalOpenRiskMonetary = 0.0;

            if (positions != null)
            {
                foreach (var pos in positions)
                {
                    if (!pos.SymbolFound)
                    {
                        vetoReason = string.Format("[GUARD VETO - UNKNOWN METADATA] Position #{0} on {1} symbol metadata lookup failed. Fail-closed active.", pos.Id, pos.SymbolName);
                        return false;
                    }
                    if (!pos.StopLoss.HasValue)
                    {
                        vetoReason = string.Format("[GUARD VETO - UNKNOWN RISK] Position #{0} on {1} has NO Stop Loss! Uncontrolled risk detected. Fail-closed active.", pos.Id, pos.SymbolName);
                        return false;
                    }
                    if (pos.PipSize <= 0)
                    {
                        vetoReason = string.Format("[GUARD VETO - INVALID PIP SIZE] Position #{0} on {1} has PipSize <= 0. Fail-closed active.", pos.Id, pos.SymbolName);
                        return false;
                    }
                    double slDistPips = Math.Abs(pos.EntryPrice - pos.StopLoss.Value) / pos.PipSize;
                    totalOpenRiskMonetary += slDistPips * pos.PipValue * pos.VolumeInUnits;
                }
            }

            if (pendingOrders != null)
            {
                foreach (var po in pendingOrders)
                {
                    if (!po.SymbolFound)
                    {
                        vetoReason = string.Format("[GUARD VETO - UNKNOWN METADATA] Pending Order #{0} on {1} symbol lookup failed. Fail-closed active.", po.Id, po.SymbolName);
                        return false;
                    }
                    if (!po.StopLoss.HasValue)
                    {
                        vetoReason = string.Format("[GUARD VETO - UNKNOWN RISK] Pending Order #{0} on {1} has NO Stop Loss! Uncontrolled risk detected. Fail-closed active.", po.Id, po.SymbolName);
                        return false;
                    }
                    if (po.PipSize <= 0)
                    {
                        vetoReason = string.Format("[GUARD VETO - INVALID PIP SIZE] Pending Order #{0} on {1} has PipSize <= 0. Fail-closed active.", po.Id, po.SymbolName);
                        return false;
                    }
                    double slDistPips = Math.Abs(po.EntryPrice - po.StopLoss.Value) / po.PipSize;
                    totalOpenRiskMonetary += slDistPips * po.PipValue * po.VolumeInUnits;
                }
            }

            currentOpenRiskPct = equity > 0 ? (totalOpenRiskMonetary / equity) * 100.0 : 0.0;
            if (currentOpenRiskPct >= maxTotalOpenRiskPct)
            {
                vetoReason = string.Format(CultureInfo.InvariantCulture, "[GUARD VETO - PORTFOLIO RISK CEILING] Current Open Risk: {0:F2}% >= Max: {1:F2}%. New trades blocked.", currentOpenRiskPct, maxTotalOpenRiskPct);
                return false;
            }

            remainingPortfolioRiskPct = Math.Max(0.0, maxTotalOpenRiskPct - currentOpenRiskPct);
            return true;
        }

        /// <summary>
        /// Pure evaluation of Fixed Lot risk against server ceiling and remaining portfolio budget.
        /// </summary>
        public static bool EvaluateFixedLotSizing(
            double lotSize, 
            double volumeInUnits, 
            double effectiveSlPips, 
            double pipValue, 
            double equity, 
            double serverMaxRiskPct, 
            double remainingPortfolioRiskPct, 
            out double fixedLotRiskMonetary, 
            out double fixedLotRiskPct, 
            out string vetoReason)
        {
            fixedLotRiskMonetary = volumeInUnits * effectiveSlPips * pipValue;
            fixedLotRiskPct = equity > 0 ? (fixedLotRiskMonetary / equity) * 100.0 : 0.0;
            vetoReason = string.Empty;

            double serverCap = serverMaxRiskPct > 0 ? serverMaxRiskPct : 2.00;

            if (fixedLotRiskPct > serverCap)
            {
                vetoReason = string.Format(CultureInfo.InvariantCulture, "[FIXED LOT VETO - SERVER RISK EXCEEDED] Fixed Lot {0:F2} requires {1:F2}% risk > server max cap ({2:F2}%). Trade skipped.", lotSize, fixedLotRiskPct, serverCap);
                return false;
            }

            if (fixedLotRiskPct > remainingPortfolioRiskPct)
            {
                vetoReason = string.Format(CultureInfo.InvariantCulture, "[FIXED LOT VETO - PORTFOLIO RISK EXCEEDED] Fixed Lot {0:F2} requires {1:F2}% risk > remaining portfolio budget ({2:F2}%). Trade skipped.", lotSize, fixedLotRiskPct, remainingPortfolioRiskPct);
                return false;
            }

            return true;
        }

        /// <summary>
        /// Final pre-flight verification before order execution.
        /// Strictly validates numeric validity (NaN/Infinity), positive pip/equity values, 
        /// broker minimum/step/maximum bounds on each ticket, monetary risk budget, total open portfolio risk, and max lot caps.
        /// </summary>
        public static bool ValidateFinalRiskPreFlight(
            double volumeTicket1, 
            double volumeTicket2, 
            double effectiveSlPips, 
            double pipValue, 
            double equity, 
            double monetaryRiskBudget, 
            double currentOpenRiskPct, 
            double maxTotalOpenRiskPct, 
            double maxLotCapUnits, 
            double brokerMinUnits, 
            double brokerStepUnits, 
            double brokerMaxUnits, 
            out double actualMonetaryRisk, 
            out double actualRiskPct, 
            out string rejectionReason)
        {
            actualMonetaryRisk = 0.0;
            actualRiskPct = 0.0;
            rejectionReason = string.Empty;

            // Check 0: Strict numeric sanity (NaN and Infinity rejection)
            if (double.IsNaN(volumeTicket1) || double.IsInfinity(volumeTicket1) ||
                double.IsNaN(volumeTicket2) || double.IsInfinity(volumeTicket2) ||
                double.IsNaN(effectiveSlPips) || double.IsInfinity(effectiveSlPips) ||
                double.IsNaN(pipValue) || double.IsInfinity(pipValue) ||
                double.IsNaN(equity) || double.IsInfinity(equity) ||
                double.IsNaN(monetaryRiskBudget) || double.IsInfinity(monetaryRiskBudget) ||
                double.IsNaN(currentOpenRiskPct) || double.IsInfinity(currentOpenRiskPct) ||
                double.IsNaN(maxTotalOpenRiskPct) || double.IsInfinity(maxTotalOpenRiskPct) ||
                double.IsNaN(maxLotCapUnits) || double.IsInfinity(maxLotCapUnits) ||
                double.IsNaN(brokerMinUnits) || double.IsInfinity(brokerMinUnits) ||
                double.IsNaN(brokerStepUnits) || double.IsInfinity(brokerStepUnits) ||
                double.IsNaN(brokerMaxUnits) || double.IsInfinity(brokerMaxUnits))
            {
                rejectionReason = "[FINAL PRE-FLIGHT REJECTION - INVALID NUMERIC] One or more risk, volume, or broker parameters contains NaN or Infinity.";
                return false;
            }

            // Check 0b: Broker metadata validity requirements (fail-closed on invalid broker metadata)
            if (brokerMinUnits <= 0 || brokerStepUnits <= 0 || brokerMaxUnits <= 0)
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - INVALID BROKER METADATA] Broker minimum ({0:F0}), step ({1:F0}), or maximum ({2:F0}) units <= 0. Fail-closed active.", brokerMinUnits, brokerStepUnits, brokerMaxUnits);
                return false;
            }

            if (brokerMaxUnits < brokerMinUnits)
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - INVALID BROKER METADATA] Broker maximum units ({0:F0}) < minimum units ({1:F0}). Fail-closed active.", brokerMaxUnits, brokerMinUnits);
                return false;
            }

            // Check 0c: Positive and non-negative boundary requirements
            if (pipValue <= 0 || effectiveSlPips <= 0 || equity <= 0 || monetaryRiskBudget < 0 || volumeTicket1 <= 0 || volumeTicket2 < 0)
            {
                rejectionReason = "[FINAL PRE-FLIGHT REJECTION - NON-POSITIVE PARAMETER] Pip value, SL pips, equity, budget, or ticket volume must be positive non-zero.";
                return false;
            }

            double actualTotalUnits = volumeTicket1 + volumeTicket2;
            actualMonetaryRisk = actualTotalUnits * effectiveSlPips * pipValue;
            actualRiskPct = (actualMonetaryRisk / equity) * 100.0;

            if (double.IsNaN(actualMonetaryRisk) || double.IsInfinity(actualMonetaryRisk) || double.IsNaN(actualRiskPct) || double.IsInfinity(actualRiskPct))
            {
                rejectionReason = "[FINAL PRE-FLIGHT REJECTION - COMPUTED RISK INVALID] Computed monetary risk or risk percentage is non-computable.";
                return false;
            }

            // Check 1: Actual monetary risk <= permitted monetary budget (+ small epsilon tolerance)
            if (actualMonetaryRisk > (monetaryRiskBudget + 0.01))
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - BUDGET OVERSHOOT] Actual monetary risk {0:F2} > budget {1:F2}. Order aborted.", actualMonetaryRisk, monetaryRiskBudget);
                return false;
            }

            // Check 2: Total open portfolio risk ceiling
            if ((currentOpenRiskPct + actualRiskPct) > (maxTotalOpenRiskPct + 0.01))
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - PORTFOLIO CEILING] New open risk {0:F2}% + existing {1:F2}% > max {2:F2}%. Order aborted.", actualRiskPct, currentOpenRiskPct, maxTotalOpenRiskPct);
                return false;
            }

            // Check 3: Max Lot cap
            if (maxLotCapUnits > 0 && actualTotalUnits > (maxLotCapUnits + 0.01))
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - MAX LOT CAP] Total units {0:F0} > cap {1:F0}. Order aborted.", actualTotalUnits, maxLotCapUnits);
                return false;
            }

            // Check 4: Broker step/min/max validity for Ticket 1
            if (volumeTicket1 < brokerMinUnits || volumeTicket1 > brokerMaxUnits)
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - TICKET 1 BOUNDS] Volume {0:F0} out of broker bounds [{1:F0}..{2:F0}]. Order aborted.", volumeTicket1, brokerMinUnits, brokerMaxUnits);
                return false;
            }

            double steps1 = (volumeTicket1 - brokerMinUnits) / brokerStepUnits;
            if (Math.Abs(steps1 - Math.Round(steps1)) > 0.0001)
            {
                rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - TICKET 1 STEP] Volume {0:F0} does not align with broker min {1:F0} and step {2:F0}.", volumeTicket1, brokerMinUnits, brokerStepUnits);
                return false;
            }

            // Check 5: Broker step/min/max validity for Ticket 2 (if present)
            if (volumeTicket2 > 0)
            {
                if (volumeTicket2 < brokerMinUnits || volumeTicket2 > brokerMaxUnits)
                {
                    rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - TICKET 2 BOUNDS] Volume {0:F0} out of broker bounds [{1:F0}..{2:F0}]. Order aborted.", volumeTicket2, brokerMinUnits, brokerMaxUnits);
                    return false;
                }

                double steps2 = (volumeTicket2 - brokerMinUnits) / brokerStepUnits;
                if (Math.Abs(steps2 - Math.Round(steps2)) > 0.0001)
                {
                    rejectionReason = string.Format(CultureInfo.InvariantCulture, "[FINAL PRE-FLIGHT REJECTION - TICKET 2 STEP] Volume {0:F0} does not align with broker min {1:F0} and step {2:F0}.", volumeTicket2, brokerMinUnits, brokerStepUnits);
                    return false;
                }
            }

            return true;
        }
    }

    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
    public class QuantumAIVIPV30 : Robot
    {
        [Parameter("QuantumAI Server URL", Group = "Connection Mode", DefaultValue = "http://localhost:3000")]
        public string ServerUrl { get; set; }

        [Parameter("VIP Auth Token", Group = "VIP Licensing", DefaultValue = "")]
        public string VipAuthToken { get; set; }

        [Parameter("Polling Interval (Sec)", Group = "Connection Mode", DefaultValue = 2, MinValue = 1, MaxValue = 10)]
        public int PollingIntervalSec { get; set; }

        [Parameter("Risk Calculation Mode", Group = "Risk Management", DefaultValue = RiskCalculationMode.FixedLot)]
        public RiskCalculationMode RiskMode { get; set; }

        [Parameter("Risk Profile (% Equity)", Group = "Risk Management", DefaultValue = RiskProfileType.Standard)]
        public RiskProfileType Profile { get; set; }

        [Parameter("Custom Risk % (if Custom Profile)", Group = "Risk Management", DefaultValue = 0.50, MinValue = 0.01, MaxValue = 2.00, Step = 0.05)]
        public double CustomRiskPct { get; set; }

        [Parameter("Default Lot Size (Fixed Lot Mode)", Group = "Risk Management", DefaultValue = 0.02, MinValue = 0.01, Step = 0.01)]
        public double TotalLotSize { get; set; }

        [Parameter("Maximum Lot Size (Total Trade Cap)", Group = "Safety Guards", DefaultValue = 5.0, MinValue = 0.01, Step = 0.01)]
        public double MaxLotSize { get; set; }

        [Parameter("Max Daily Loss (%)", Group = "Safety Guards", DefaultValue = 3.0, MinValue = 0.5, MaxValue = 20.0, Step = 0.5)]
        public double MaxDailyLossPct { get; set; }

        [Parameter("Max Account Drawdown (%)", Group = "Safety Guards", DefaultValue = 6.0, MinValue = 1.0, MaxValue = 50.0, Step = 0.5)]
        public double MaxAccountDrawdownPct { get; set; }

        [Parameter("Max Total Open Risk (%)", Group = "Safety Guards", DefaultValue = 4.0, MinValue = 0.5, MaxValue = 20.0, Step = 0.5)]
        public double MaxTotalOpenRiskPct { get; set; }

        [Parameter("Max Concurrent Setups", Group = "Safety Guards", DefaultValue = 3, MinValue = 1, MaxValue = 20)]
        public int MaxConcurrentTrades { get; set; }

        [Parameter("Max Spread (Pips)", Group = "Safety Guards", DefaultValue = 3.5, MinValue = 0.5, Step = 0.1)]
        public double MaxSpreadPips { get; set; }

        [Parameter("Use Method 2 (Split-Ticket)", Group = "Execution Mode", DefaultValue = true)]
        public bool UseMethod2SplitTicket { get; set; }

        [Parameter("Auto-BE on TP1 Hit", Group = "Execution Mode", DefaultValue = true)]
        public bool AutoBreakEvenOnTP1 { get; set; }

        private string _accountNumber = string.Empty;
        private string _brokerName = string.Empty;
        private string _accountType = string.Empty;
        private string _identityKey = string.Empty;
        private long _lastSignalTimestamp = 0;
        private int _isPolling = 0;
        private int _revalidationCounter = 0;
        private readonly HashSet<string> _processedSignalIds = new HashSet<string>();
        private readonly object _syncLock = new object();

        // High-water mark and daily loss tracking state persisted to disk
        private QuantumAIRiskState _riskState = null;
        private bool _isStorageFailed = false;
        private DateTime _lastDayTracked = DateTime.MinValue;

        protected override void OnStart()
        {
            _accountNumber = Account.Number.ToString();
            _brokerName = !string.IsNullOrEmpty(Account.BrokerName) ? Account.BrokerName : "cTrader";
            _accountType = Account.IsLive ? "LIVE" : "DEMO";
            _identityKey = QuantumAIRiskStorage.BuildIdentityKey(_brokerName, _accountNumber, _accountType);

            // 1. Validate configuration parameters
            if (!ValidateConfiguration())
            {
                Stop();
                return;
            }

            // 2. Load & Restore Persistent Risk State
            _riskState = QuantumAIRiskStorage.LoadState(_identityKey, _brokerName, _accountNumber, _accountType, Account.Equity, Account.Balance, Time.Date);
            if (_riskState == null || _riskState.IsCorrupted)
            {
                _isStorageFailed = true;
                Print(string.Format("⛔ [FATAL INTEGRITY ERROR]: Risk state file for identity '{0}' is corrupt, unreadable, or tampered! Trading blocked. Stop cBot immediately.", _identityKey));
                Stop();
                return;
            }

            _lastDayTracked = Time.Date;

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
            Print("🏛️ [QUANTUM AI] VIP Copier V3.0 (Phase 3A.1 Local Risk Engine)");
            Print(string.Format("👤 Checking Account License for Identity: {0}...", _identityKey));

            // 3. Verify VIP License Whitelist & Cryptographic Token
            bool isLicensed = VerifyVipLicense();
            if (!isLicensed)
            {
                Print("=================================================");
                Print(string.Format("⛔ [AKSES DITOLAK]: Akaun {0} TIDAK BERDAFTAR, token tidak sah, atau belum diaktifkan dalam langganan VIP Quantum AI!", _accountNumber));
                Print(string.Format("💬 Sila daftarkan nombor akaun anda melalui Telegram: @MyQuantumAIBot (Taip: /register {0})", _accountNumber));
                Print("=================================================");
                Stop();
                return;
            }

            double selectedRiskPct = QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(Profile, CustomRiskPct);
            Print(string.Format("⚡ Connection Mode: Authorized Direct Server Bridge ({0})", ServerUrl));
            Print(string.Format("🛡️ Risk Engine: Mode={0}, Profile={1} ({2:F2}%), MaxLotCap={3:F2}", RiskMode, Profile, selectedRiskPct, MaxLotSize));
            Print(string.Format("🛡️ Persistent State ({0}): DailyBaseline={1:F2}, PeakHWM={2:F2}, LastReset={3}", _riskState.IdentityKey, _riskState.DailyBaselineEquity, _riskState.HighWaterMark, _riskState.LastResetDateUtc));
            Print(string.Format("🛡️ Portfolio Guards: MaxDailyLoss={0:F1}%, MaxDrawdown={1:F1}%, MaxTotalOpenRisk={2:F1}%, MaxConcurrent={3}", MaxDailyLossPct, MaxAccountDrawdownPct, MaxTotalOpenRiskPct, MaxConcurrentTrades));
            Print(string.Format("⚖️ Execution Protocol: Method 2 (Strict 50:50)={0}, Auto-BE={1}", UseMethod2SplitTicket, AutoBreakEvenOnTP1));
            Print("=================================================");

            // Hook trade closed event for automatic reporting
            Positions.Closed += OnPositionClosed;

            // Start timer for polling
            Timer.Start(Math.Max(1, PollingIntervalSec));
        }

        private bool ValidateConfiguration()
        {
            if (double.IsNaN(TotalLotSize) || double.IsInfinity(TotalLotSize) || TotalLotSize <= 0)
            {
                Print("⛔ [CONFIG ERROR]: Invalid TotalLotSize. Must be a positive number.");
                return false;
            }
            if (double.IsNaN(MaxLotSize) || double.IsInfinity(MaxLotSize) || MaxLotSize <= 0)
            {
                Print("⛔ [CONFIG ERROR]: Invalid MaxLotSize. Must be a positive number.");
                return false;
            }
            if (double.IsNaN(MaxDailyLossPct) || double.IsInfinity(MaxDailyLossPct) || MaxDailyLossPct <= 0 || MaxDailyLossPct > 50)
            {
                Print("⛔ [CONFIG ERROR]: Invalid MaxDailyLossPct. Must be between 0.5% and 50%.");
                return false;
            }
            if (double.IsNaN(MaxAccountDrawdownPct) || double.IsInfinity(MaxAccountDrawdownPct) || MaxAccountDrawdownPct <= 0 || MaxAccountDrawdownPct > 75)
            {
                Print("⛔ [CONFIG ERROR]: Invalid MaxAccountDrawdownPct. Must be between 1.0% and 75%.");
                return false;
            }
            if (double.IsNaN(MaxTotalOpenRiskPct) || double.IsInfinity(MaxTotalOpenRiskPct) || MaxTotalOpenRiskPct <= 0 || MaxTotalOpenRiskPct > 50)
            {
                Print("⛔ [CONFIG ERROR]: Invalid MaxTotalOpenRiskPct. Must be between 0.5% and 50%.");
                return false;
            }
            if (MaxConcurrentTrades < 1 || MaxConcurrentTrades > 50)
            {
                Print("⛔ [CONFIG ERROR]: Invalid MaxConcurrentTrades. Must be between 1 and 50.");
                return false;
            }
            if (Profile == RiskProfileType.Custom)
            {
                if (double.IsNaN(CustomRiskPct) || double.IsInfinity(CustomRiskPct) || CustomRiskPct <= 0 || CustomRiskPct > 2.00)
                {
                    Print(string.Format("⛔ [CONFIG ERROR]: CustomRiskPct ({0}%) is invalid. Must be > 0.00% and <= 2.00%.", CustomRiskPct));
                    return false;
                }
            }
            return true;
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
                string verifyUrl = string.Format("{0}/api/copier/verify?account={1}&token={2}", ServerUrl.TrimEnd('/'), acc, Uri.EscapeDataString(VipAuthToken));
                string response = string.Empty;

                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-LicenseChecker";
                    wc.Headers[HttpRequestHeader.Authorization] = string.Format("Bearer {0}", VipAuthToken);
                    response = wc.DownloadString(verifyUrl);
                }

                if (!string.IsNullOrEmpty(response) && response.Contains("\"valid\":true"))
                {
                    var daysMatch = Regex.Match(response, "\"remainingDays\":(\\d+)");
                    string days = daysMatch.Success ? daysMatch.Groups[1].Value : "30";
                    Print(string.Format("✅ [VIP LICENSE CONFIRMED]: Akaun {0} Sah & Aktif! Baki langganan: {1} hari.", acc, days));
                    return true;
                }

                var msgMatch = Regex.Match(response, "\"message\":\"(.*?)\"");
                if (msgMatch.Success)
                {
                    Print(string.Format("⚠️ [License Server]: {0}", Regex.Unescape(msgMatch.Groups[1].Value)));
                }
                return false;
            }
            catch (Exception ex)
            {
                Print(string.Format("⚠️ [License Check Warning]: Tidak dapat menyemak lesen dengan server: {0}", ex.Message));
                return false;
            }
        }

        protected override void OnTimer()
        {
            // Daily reset at 00:00 UTC
            if (Time.Date != _lastDayTracked && _riskState != null)
            {
                _riskState.DailyBaselineEquity = Account.Equity;
                _riskState.LastResetDateUtc = Time.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                _riskState.HighWaterMark = Math.Max(_riskState.HighWaterMark, Account.Equity);
                _lastDayTracked = Time.Date;
                if (!QuantumAIRiskStorage.SaveState(_riskState))
                {
                    _isStorageFailed = true;
                    Print("⛔ [CRITICAL PERSISTENCE ERROR]: Failed to save daily rollover risk state to disk! Trading will be blocked.");
                }
                else
                {
                    Print(string.Format("🔄 [DAILY ROLLOVER] Daily baseline reset to {0:F2} at UTC 00:00 (HWM: {1:F2})", _riskState.DailyBaselineEquity, _riskState.HighWaterMark));
                }
            }

            // Update high water mark persistently
            if (_riskState != null && Account.Equity > _riskState.HighWaterMark)
            {
                _riskState.HighWaterMark = Account.Equity;
                if (!QuantumAIRiskStorage.SaveState(_riskState))
                {
                    _isStorageFailed = true;
                    Print("⛔ [CRITICAL PERSISTENCE ERROR]: Failed to save High-Water Mark to disk! Trading will be blocked.");
                }
            }

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
                    Print(string.Format("⚠️ [Connection Web Error]: {0}", wex.Message));
                }
                catch (Exception ex)
                {
                    Print(string.Format("⚠️ [Copier Poll Error]: {0}", ex.Message));
                }
                finally
                {
                    Interlocked.Exchange(ref _isPolling, 0);
                }
            });
        }

        protected override void OnTick()
        {
            if (_riskState != null && Account.Equity > _riskState.HighWaterMark)
            {
                _riskState.HighWaterMark = Account.Equity;
                if (!QuantumAIRiskStorage.SaveState(_riskState))
                {
                    _isStorageFailed = true;
                    Print("⛔ [CRITICAL PERSISTENCE ERROR]: Failed to save updated High-Water Mark on tick!");
                }
            }

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
                        var historyMatch = History.FindLast(string.Format("QAI_T1_{0}", tradeTag));
                        if (historyMatch != null && historyMatch.GrossProfit > 0)
                        {
                            // Ticket 1 closed in profit, move Ticket 2 Stop Loss to Entry (Break-Even)
                            if (pos.TradeType == TradeType.Buy && (pos.StopLoss == null || pos.StopLoss < pos.EntryPrice))
                            {
                                ModifyPosition(pos, pos.EntryPrice, pos.TakeProfit);
                                Print(string.Format("🛡️ [AUTO BREAK-EVEN] Ticket 2 ({0}) SL moved to Entry: {1}", pos.SymbolName, pos.EntryPrice));
                            }
                            else if (pos.TradeType == TradeType.Sell && (pos.StopLoss == null || pos.StopLoss > pos.EntryPrice))
                            {
                                ModifyPosition(pos, pos.EntryPrice, pos.TakeProfit);
                                Print(string.Format("🛡️ [AUTO BREAK-EVEN] Ticket 2 ({0}) SL moved to Entry: {1}", pos.SymbolName, pos.EntryPrice));
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Print(string.Format("⚠️ [Auto-BE Error]: {0}", ex.Message));
            }
        }

        private void PollServerBridge()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(VipAuthToken)) return;

                string url = string.Format("{0}/api/copier/signal?account={1}&token={2}&since={3}&protocol=master-v1", ServerUrl.TrimEnd('/'), _accountNumber, Uri.EscapeDataString(VipAuthToken), _lastSignalTimestamp);
                string response = string.Empty;

                using (var webClient = new WebClient())
                {
                    webClient.Headers[HttpRequestHeader.UserAgent] = "cTrader-QuantumAI-Bridge";
                    webClient.Headers[HttpRequestHeader.Authorization] = string.Format("Bearer {0}", VipAuthToken);
                    response = webClient.DownloadString(url);
                }

                if (string.IsNullOrEmpty(response) || !response.Contains("\"hasSignal\":true")) return;

                // Extract JSON fields using regex
                var idMatch = Regex.Match(response, "\"id\":\\s*\"(.*?)\"");
                var actionMatch = Regex.Match(response, "\"action\":\\s*\"(NEW_ORDER|CANCEL_ORDER)\"");
                var pairMatch = Regex.Match(response, "\"pair\":\\s*\"([A-Za-z0-9_\\/]+)\"");
                var dirMatch = Regex.Match(response, "\"direction\":\\s*\"(BUY|SELL)\"");
                var entryMatch = Regex.Match(response, "\"entryPrice\":\\s*([0-9\\.]+)");
                var slMatch = Regex.Match(response, "\"stopLoss\":\\s*([0-9\\.]+)");
                var tp1Match = Regex.Match(response, "\"takeProfit1\":\\s*([0-9\\.]+)");
                var tp2Match = Regex.Match(response, "\"takeProfit2\":\\s*([0-9\\.]+)");
                var tsMatch = Regex.Match(response, "\"timestamp\":\\s*(\\d+)");

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
                    long sigTs = long.Parse(tsMatch.Groups[1].Value, CultureInfo.InvariantCulture);
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
                var orderTypeMatch = Regex.Match(response, "\"orderType\":\\s*\"(LIMIT|MARKET)\"");
                var masterMatch = Regex.Match(response, "\"masterBrokerOrderId\":\\s*\"([0-9]+)\"");
                if (!orderTypeMatch.Success || !masterMatch.Success || !Regex.IsMatch(response, "\"masterConfirmed\":\\s*true"))
                {
                    Print("Master confirmation missing: order skipped.");
                    return;
                }
                bool masterLimit = orderTypeMatch.Groups[1].Value == "LIMIT";

                // Strict Server Risk Field Validation via JSON token parser (Issue 3 fix)
                double? serverRecommendedRisk = null;
                double? serverMaxRisk = null;
                string riskValidationErr;

                if (!QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(response, out serverRecommendedRisk, out serverMaxRisk, out riskValidationErr))
                {
                    Print(string.Format("⛔ [SIGNAL REJECTED - INVALID RISK CEILING]: Signal {0} rejected: {1}", signalId, riskValidationErr));
                    lock (_syncLock)
                    {
                        if (!string.IsNullOrEmpty(signalId)) _processedSignalIds.Add(signalId);
                    }
                    return;
                }

                lock (_syncLock)
                {
                    if (!string.IsNullOrEmpty(signalId))
                    {
                        _processedSignalIds.Add(signalId);
                    }
                }

                TradeType tradeType = dirMatch.Groups[1].Value == "BUY" ? TradeType.Buy : TradeType.Sell;
                double entryPrice = entryMatch.Success ? double.Parse(entryMatch.Groups[1].Value, CultureInfo.InvariantCulture) : 0.0;
                double stopLoss = double.Parse(slMatch.Groups[1].Value, CultureInfo.InvariantCulture);
                double takeProfit1 = double.Parse(tp1Match.Groups[1].Value, CultureInfo.InvariantCulture);
                double? takeProfit2 = tp2Match.Success ? (double?)double.Parse(tp2Match.Groups[1].Value, CultureInfo.InvariantCulture) : null;

                BeginInvokeOnMainThread(() => ExecuteSignalTrade(signalId, pair, tradeType, entryPrice, stopLoss, takeProfit1, takeProfit2, serverRecommendedRisk, serverMaxRisk, masterLimit, masterMatch.Groups[1].Value));
            }
            catch (Exception ex)
            {
                Print(string.Format("⚠️ [PollServerBridge Error]: {0}", ex.Message));
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
                        Print(string.Format("🚫 [PENDING ORDER CANCELLED]: {0} for {1} successfully cancelled.", order.Label, order.SymbolName));
                    }
                }
            }
            catch (Exception ex)
            {
                Print(string.Format("⚠️ Error cancelling pending orders: {0}", ex.Message));
            }
        }

        /// <summary>
        /// Evaluates institutional portfolio and account guards with strict FAIL-CLOSED policy on unknown risk.
        /// </summary>
        private bool EvaluateAccountAndPortfolioGuards(out double currentOpenRiskPct, out double remainingPortfolioRiskPct, out string vetoReason)
        {
            currentOpenRiskPct = 0.0;
            remainingPortfolioRiskPct = MaxTotalOpenRiskPct;
            vetoReason = string.Empty;

            if (_riskState == null || _riskState.IsCorrupted || _isStorageFailed)
            {
                vetoReason = "[GUARD VETO - RISK STATE CORRUPTED] Persistent risk state is unavailable, corrupted, or write failed. Fail-closed active.";
                Print(string.Format("⛔ {0}", vetoReason));
                return false;
            }

            // 1. Max Daily Loss Guard (Realized + Floating P&L against daily baseline)
            double dailyLoss = _riskState.DailyBaselineEquity - Account.Equity;
            double dailyLossPct = (_riskState.DailyBaselineEquity > 0 && dailyLoss > 0) ? (dailyLoss / _riskState.DailyBaselineEquity) * 100.0 : 0.0;
            if (dailyLossPct >= MaxDailyLossPct)
            {
                vetoReason = string.Format(CultureInfo.InvariantCulture, "[GUARD VETO - DAILY LOSS LIMIT] Realized+Floating Daily Loss: {0:F2}% >= Max: {1:F2}%. New trades blocked.", dailyLossPct, MaxDailyLossPct);
                Print(string.Format("⛔ {0}", vetoReason));
                return false;
            }

            // 2. Max Account Drawdown Guard (High-Water Mark)
            if (Account.Equity > _riskState.HighWaterMark)
            {
                _riskState.HighWaterMark = Account.Equity;
                if (!QuantumAIRiskStorage.SaveState(_riskState))
                {
                    _isStorageFailed = true;
                    vetoReason = "[GUARD VETO - STORAGE FAILURE] Failed to persist updated High-Water Mark equity state. Fail-closed active.";
                    Print(string.Format("⛔ {0}", vetoReason));
                    return false;
                }
            }
            double drawdown = _riskState.HighWaterMark - Account.Equity;
            double drawdownPct = (_riskState.HighWaterMark > 0 && drawdown > 0) ? (drawdown / _riskState.HighWaterMark) * 100.0 : 0.0;
            if (drawdownPct >= MaxAccountDrawdownPct)
            {
                vetoReason = string.Format(CultureInfo.InvariantCulture, "[GUARD VETO - MAX DRAWDOWN LIMIT] Peak: {0:F2}, Current: {1:F2}, Drawdown: {2:F2}% >= Max: {3:F2}%. New trades blocked.", _riskState.HighWaterMark, Account.Equity, drawdownPct, MaxAccountDrawdownPct);
                Print(string.Format("⛔ {0}", vetoReason));
                return false;
            }

            // 3. Map Open Positions & Pending Orders into PositionRiskData models for pure production risk evaluation
            var posRiskList = new List<PositionRiskData>();
            foreach (var pos in Positions)
            {
                var posSym = Symbols.GetSymbol(pos.SymbolName);
                posRiskList.Add(new PositionRiskData
                {
                    Id = pos.Id,
                    SymbolName = pos.SymbolName,
                    EntryPrice = pos.EntryPrice,
                    StopLoss = pos.StopLoss,
                    VolumeInUnits = pos.VolumeInUnits,
                    PipSize = posSym != null ? posSym.PipSize : 0.0001,
                    PipValue = posSym != null ? posSym.PipValue : 1.0,
                    SymbolFound = (posSym != null)
                });
            }

            var poRiskList = new List<PositionRiskData>();
            foreach (var po in PendingOrders)
            {
                var poSym = Symbols.GetSymbol(po.SymbolName);
                poRiskList.Add(new PositionRiskData
                {
                    Id = po.Id,
                    SymbolName = po.SymbolName,
                    EntryPrice = po.TargetPrice,
                    StopLoss = po.StopLoss,
                    VolumeInUnits = po.VolumeInUnits,
                    PipSize = poSym != null ? poSym.PipSize : 0.0001,
                    PipValue = poSym != null ? poSym.PipValue : 1.0,
                    SymbolFound = (poSym != null)
                });
            }

            // Delegate to pure risk engine
            if (!QuantumAIRiskEngine.EvaluateOpenRiskFromPositions(posRiskList, poRiskList, Account.Equity, MaxTotalOpenRiskPct, out currentOpenRiskPct, out remainingPortfolioRiskPct, out vetoReason))
            {
                Print(string.Format("⛔ {0}", vetoReason));
                return false;
            }

            // 4. Max Concurrent Trades Guard (Grouping split-tickets of same setup as 1 trade)
            var activeSetups = new HashSet<string>();
            foreach (var p in Positions)
            {
                if (p.Label.StartsWith("QAI_"))
                {
                    string tag = p.Label.Length > 7 ? p.Label.Substring(7) : p.Label;
                    activeSetups.Add(string.Format("{0}_{1}", p.SymbolName, tag));
                }
            }
            foreach (var po in PendingOrders)
            {
                if (po.Label.StartsWith("QAI_"))
                {
                    string tag = po.Label.Length > 7 ? po.Label.Substring(7) : po.Label;
                    activeSetups.Add(string.Format("{0}_{1}", po.SymbolName, tag));
                }
            }

            if (activeSetups.Count >= MaxConcurrentTrades)
            {
                vetoReason = string.Format(CultureInfo.InvariantCulture, "[GUARD VETO - CONCURRENT SETUPS] Active Setups: {0} >= Max: {1}. New trades blocked.", activeSetups.Count, MaxConcurrentTrades);
                Print(string.Format("⛔ {0}", vetoReason));
                return false;
            }

            return true;
        }

        private void ExecuteSignalTrade(string signalId, string pairStr, TradeType tradeType, double entryPrice, double stopLoss, double takeProfit1, double? takeProfit2, double? serverRecommendedRisk, double? serverMaxRisk, bool masterLimit, string masterOrderId)
        {
            try
            {
                string cleanPair = pairStr.Replace("/", "").Replace(" ", "").ToUpper();
                Symbol symbol = Symbols.GetSymbol(cleanPair) ?? Symbols.GetSymbol(string.Format("{0}/{1}", cleanPair.Substring(0, 3), cleanPair.Substring(3)));

                if (symbol == null)
                {
                    Print(string.Format("❌ Symbol not found in broker market watch: {0}", cleanPair));
                    return;
                }

                // 1. Spread Check
                double currentSpreadPips = symbol.PipSize > 0 ? (symbol.Spread / symbol.PipSize) : 2.0;
                if (currentSpreadPips > MaxSpreadPips)
                {
                    Print(string.Format(CultureInfo.InvariantCulture, "⛔ Order Skipped: Spread too high ({0:F1} pips > {1:F1} pips)", currentSpreadPips, MaxSpreadPips));
                    return;
                }

                // 2. Duplicate Protection Guard: Check if pending order or open position already active for this pair
                foreach (var po in PendingOrders)
                {
                    if (po.SymbolName == symbol.Name && po.Label.StartsWith("QAI_"))
                    {
                        Print(string.Format("🛡️ [DUPLICATE GUARD] Pending order already active for {0}. Duplicate placement skipped.", symbol.Name));
                        return;
                    }
                }
                foreach (var pos in Positions)
                {
                    if (pos.SymbolName == symbol.Name && pos.Label.StartsWith("QAI_"))
                    {
                        Print(string.Format("🛡️ [DUPLICATE GUARD] Open position already active for {0}. Duplicate placement skipped.", symbol.Name));
                        return;
                    }
                }

                // 3. Evaluate Institutional Account & Portfolio Guards (Fail-Closed)
                double currentOpenRiskPct;
                double remainingPortfolioRiskPct;
                string vetoReason;
                if (!EvaluateAccountAndPortfolioGuards(out currentOpenRiskPct, out remainingPortfolioRiskPct, out vetoReason))
                {
                    return;
                }

                // 4. Calculate Pips distances based on institutional entry level and apply minimum safeguards
                double referencePrice = entryPrice > 0 ? entryPrice : (tradeType == TradeType.Buy ? symbol.Ask : symbol.Bid);
                double rawSlPips = Math.Round(Math.Abs(referencePrice - stopLoss) / symbol.PipSize, 1);
                double tp1Pips = Math.Round(Math.Abs(takeProfit1 - referencePrice) / symbol.PipSize, 1);

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
                double tp2Pips = Math.Round(Math.Abs(effectiveTp2 - referencePrice) / symbol.PipSize, 1);

                // Safeguards against broker minimum stop distances (Effective SL distance)
                double effectiveSlPips = Math.Max(rawSlPips, Math.Max(10.0, currentSpreadPips * 2.0));
                tp1Pips = Math.Max(tp1Pips, Math.Max(15.0, currentSpreadPips * 3.0));
                tp2Pips = Math.Max(tp2Pips, tp1Pips + 15.0);

                // 5. Position Sizing & Safety Ceilings Enforcement
                double rawVolumeUnits;
                double effectiveRiskPct = 0.0;
                double monetaryRiskBudget = 0.0;
                double serverCap = serverMaxRisk.HasValue && serverMaxRisk.Value > 0 ? serverMaxRisk.Value : 2.00;

                if (RiskMode == RiskCalculationMode.PercentageEquity)
                {
                    double subscriberSelectedRisk = QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(Profile, CustomRiskPct);
                    effectiveRiskPct = Math.Min(subscriberSelectedRisk, Math.Min(serverCap, remainingPortfolioRiskPct));
                    if (effectiveRiskPct <= 0.001)
                    {
                        Print(string.Format(CultureInfo.InvariantCulture, "⛔ [SIZING VETO - ZERO BUDGET] Effective risk budget ({0:F3}%) is depleted. Trade skipped.", effectiveRiskPct));
                        return;
                    }

                    monetaryRiskBudget = Account.Equity * (effectiveRiskPct / 100.0);
                    double costPerUnitForSl = effectiveSlPips * symbol.PipValue;

                    if (costPerUnitForSl <= 0)
                    {
                        Print("⛔ [SIZING VETO - INVALID PIP VALUE] Pip value or SL distance invalid. Trade skipped.");
                        return;
                    }

                    rawVolumeUnits = monetaryRiskBudget / costPerUnitForSl;
                }
                else
                {
                    // Fixed Lot Mode: Must strictly respect Server Max Risk and Remaining Portfolio Budget via pure engine method
                    rawVolumeUnits = symbol.QuantityToVolumeInUnits(TotalLotSize);
                    double fixedLotRiskMonetary;
                    double fixedLotRiskPct;
                    string fixedLotVeto;

                    if (!QuantumAIRiskEngine.EvaluateFixedLotSizing(TotalLotSize, rawVolumeUnits, effectiveSlPips, symbol.PipValue, Account.Equity, serverCap, remainingPortfolioRiskPct, out fixedLotRiskMonetary, out fixedLotRiskPct, out fixedLotVeto))
                    {
                        Print(string.Format("⛔ {0}", fixedLotVeto));
                        return;
                    }

                    effectiveRiskPct = fixedLotRiskPct;
                    monetaryRiskBudget = fixedLotRiskMonetary;
                }

                // Apply Hard Maximum Lot Cap
                double maxCapUnits = symbol.QuantityToVolumeInUnits(MaxLotSize);
                if (rawVolumeUnits > maxCapUnits)
                {
                    Print(string.Format(CultureInfo.InvariantCulture, "⚠️ [SAFETY CAP] Calculated volume exceeds MaxLotSize cap ({0:F2} lots). Clamped to {1:F0} units.", MaxLotSize, maxCapUnits));
                    rawVolumeUnits = maxCapUnits;
                }

                // Normalize volume DOWN to broker step
                double normalizedTotalUnits = QuantumAIRiskEngine.NormalizeVolumeDown(rawVolumeUnits, symbol.VolumeInUnitsMin, symbol.VolumeInUnitsStep, symbol.VolumeInUnitsMax);

                // Strict Broker Minimum Guard: DO NOT BUMP UP!
                if (normalizedTotalUnits < symbol.VolumeInUnitsMin)
                {
                    Print(string.Format(CultureInfo.InvariantCulture, "⛔ [ORDER SKIPPED - RISK CEILING ENFORCED] Monetary budget {0:F2} ({1:F2}% risk) allows {2:F0} units, below Broker Min ({3:F0} units). Trade skipped to protect capital.", monetaryRiskBudget, effectiveRiskPct, rawVolumeUnits, symbol.VolumeInUnitsMin));
                    return;
                }

                // Method 2 Allocation: STRICT 50:50 EQUAL SPLIT
                double volumeTicket1;
                double volumeTicket2;

                if (UseMethod2SplitTicket)
                {
                    double halfUnits = QuantumAIRiskEngine.NormalizeVolumeDown(normalizedTotalUnits / 2.0, symbol.VolumeInUnitsMin, symbol.VolumeInUnitsStep, symbol.VolumeInUnitsMax);
                    
                    // Both tickets must be strictly equal and >= broker minimum
                    if (halfUnits < symbol.VolumeInUnitsMin || (halfUnits * 2.0) > normalizedTotalUnits)
                    {
                        Print(string.Format(CultureInfo.InvariantCulture, "⛔ [ORDER SKIPPED - METHOD 2 EQUAL SPLIT FAILED] Volume {0:F0} units cannot be split into two equal tickets >= broker min ({1:F0} units). Trade skipped.", normalizedTotalUnits, symbol.VolumeInUnitsMin));
                        return;
                    }

                    volumeTicket1 = halfUnits;
                    volumeTicket2 = halfUnits;
                }
                else
                {
                    volumeTicket1 = normalizedTotalUnits;
                    volumeTicket2 = 0;
                }

                // 6. FINAL PRE-FLIGHT RISK ENFORCEMENT VIA PURE PRODUCTION METHOD
                double actualMonetaryRisk;
                double actualRiskPct;
                string preFlightRejection;

                if (!QuantumAIRiskEngine.ValidateFinalRiskPreFlight(
                    volumeTicket1, 
                    volumeTicket2, 
                    effectiveSlPips, 
                    symbol.PipValue, 
                    Account.Equity, 
                    monetaryRiskBudget, 
                    currentOpenRiskPct, 
                    MaxTotalOpenRiskPct, 
                    maxCapUnits, 
                    symbol.VolumeInUnitsMin, 
                    symbol.VolumeInUnitsStep, 
                    symbol.VolumeInUnitsMax, 
                    out actualMonetaryRisk, 
                    out actualRiskPct, 
                    out preFlightRejection))
                {
                    Print(string.Format("⛔ {0}", preFlightRejection));
                    return;
                }

                double actualTotalUnits = volumeTicket1 + volumeTicket2;
                string tradeTag = masterOrderId;

                Print(string.Format("📊 [RISK ENGINE SIZING] Signal: {0} | Symbol: {1} | Equity: {2:F2} | Mode: {3}", signalId, symbol.Name, Account.Equity, RiskMode));
                Print(string.Format(CultureInfo.InvariantCulture, "💵 Budget: {0:F2} ({1:F2}% risk) | SL: {2:F1} pips (Raw: {3:F1}p) | Units: T1={4:F0}, T2={5:F0} (Total={6:F0}, Risk: {7:F2}%)", monetaryRiskBudget, effectiveRiskPct, effectiveSlPips, rawSlPips, volumeTicket1, volumeTicket2, actualTotalUnits, actualRiskPct));

                // Follow the confirmed master order type; never convert LIMIT into MARKET.
                bool isPendingLimitOrder = masterLimit;

                // 8. Order Execution & Result Verification
                if (isPendingLimitOrder)
                {
                    Print(string.Format(CultureInfo.InvariantCulture, "🎯 [SMC PENDING LIMIT ORDER] {0} {1} @ {2} | SL: {3:F1}p | TP1: {4:F1}p | TP2: {5:F1}p", tradeType, symbol.Name, entryPrice, effectiveSlPips, tp1Pips, tp2Pips));

                    var res1 = PlaceLimitOrder(tradeType, symbol.Name, volumeTicket1, entryPrice, string.Format("QAI_T1_{0}", tradeTag), effectiveSlPips, tp1Pips);
                    if (res1 == null || !res1.IsSuccessful)
                    {
                        Print(string.Format("❌ [BROKER ORDER REJECTED] Pending Limit Ticket 1 failed: {0}", res1 != null ? res1.Error.ToString() : "Unknown"));
                        return;
                    }

                    if (volumeTicket2 > 0)
                    {
                        var res2 = PlaceLimitOrder(tradeType, symbol.Name, volumeTicket2, entryPrice, string.Format("QAI_T2_{0}", tradeTag), effectiveSlPips, tp2Pips);
                        if (res2 == null || !res2.IsSuccessful)
                        {
                            Print(string.Format("⚠️ [PARTIAL EXECUTION] Ticket 1 placed, Ticket 2 failed ({0}). No retry to prevent duplicate exposure.", res2 != null ? res2.Error.ToString() : "Unknown"));
                        }
                    }

                    Print(string.Format("✅ [SUCCESS] Pending Limit Orders active for {0} (Target: {1}) Tag: {2}", symbol.Name, entryPrice, tradeTag));
                }
                else
                {
                    Print(string.Format(CultureInfo.InvariantCulture, "🚀 [SMC MARKET ORDER TRIGGERED] {0} {1} | SL: {2:F1}p | TP1: {3:F1}p | TP2: {4:F1}p", tradeType, symbol.Name, effectiveSlPips, tp1Pips, tp2Pips));

                    var res1 = ExecuteMarketOrder(tradeType, symbol.Name, volumeTicket1, string.Format("QAI_T1_{0}", tradeTag), effectiveSlPips, tp1Pips);
                    if (res1 == null || !res1.IsSuccessful)
                    {
                        Print(string.Format("❌ [BROKER ORDER REJECTED] Market Ticket 1 failed: {0}", res1 != null ? res1.Error.ToString() : "Unknown"));
                        return;
                    }

                    if (volumeTicket2 > 0)
                    {
                        var res2 = ExecuteMarketOrder(tradeType, symbol.Name, volumeTicket2, string.Format("QAI_T2_{0}", tradeTag), effectiveSlPips, tp2Pips);
                        if (res2 == null || !res2.IsSuccessful)
                        {
                            Print(string.Format("⚠️ [PARTIAL EXECUTION] Ticket 1 filled, Ticket 2 failed ({0}). No retry to prevent duplicate exposure.", res2 != null ? res2.Error.ToString() : "Unknown"));
                        }
                    }

                    Print(string.Format(CultureInfo.InvariantCulture, "✅ [SUCCESS] Method 2 Market Orders placed for {0} Tag: {1} (T1: {2:F1}p, T2: {3:F1}p)", symbol.Name, tradeTag, tp1Pips, tp2Pips));
                }
            }
            catch (Exception ex)
            {
                Print(string.Format("❌ Execution Error: {0}", ex.Message));
            }
        }

        private void OnPositionClosed(PositionClosedEventArgs args)
        {
            var pos = args.Position;
            if (pos == null || string.IsNullOrEmpty(pos.Label) || !pos.Label.StartsWith("QAI_")) return;

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
                    string reportUrl = string.Format("{0}/api/copier/report-closed", srvUrl.TrimEnd('/'));
                    string json = string.Format(
                        CultureInfo.InvariantCulture,
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

                    Print(string.Format(CultureInfo.InvariantCulture, "📢 [TRADE CLOSED REPORTED]: {0} {1} Net: {2:F2} ({3:F1} pips)", label, symName, netProfit, pips));
                }
                catch (Exception ex)
                {
                    Print(string.Format("⚠️ [Trade Close Report Error]: {0}", ex.Message));
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
