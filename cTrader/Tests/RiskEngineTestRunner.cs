using System;
using System.IO;
using System.Collections.Generic;
using System.Globalization;
using cAlgo.Robots;

namespace cAlgo.Tests
{
    public class RiskEngineTestRunner
    {
        private static int _passedCount = 0;
        private static int _failedCount = 0;

        private static void Assert(bool condition, string testName)
        {
            if (condition)
            {
                _passedCount++;
                Console.WriteLine(string.Format("  [PASS] {0}", testName));
            }
            else
            {
                _failedCount++;
                Console.WriteLine(string.Format("  [FAIL] {0}", testName));
            }
        }

        public static int Main(string[] args)
        {
            Console.WriteLine("===============================================================");
            Console.WriteLine("QUANTUMAI PHASE 3A.1 - C# PRODUCTION RISK ENGINE TEST HARNESS");
            Console.WriteLine("===============================================================");

            TestRiskProfileMappings();
            TestStrictRawJsonSignalParsingAndValidation();
            TestVolumeNormalization();
            TestMethod2EqualSplit();
            TestRiskStatePersistenceWithAtomicReplacementAndFailureHandling();
            TestProductionOpenPositionGuardsFailClosed();
            TestProductionFixedLotSizingGuards();
            TestProductionFinalPreFlightRiskEnforcement();

            Console.WriteLine("===============================================================");
            Console.WriteLine(string.Format("TOTAL: {0} | PASSED: {1} | FAILED: {2}", _passedCount + _failedCount, _passedCount, _failedCount));
            Console.WriteLine("===============================================================");

            return _failedCount == 0 ? 0 : 1;
        }

        private static void TestRiskProfileMappings()
        {
            Console.WriteLine("\n--- 1. Risk Profile Mapping & Validation ---");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Conservative, 0) == 0.25, "Conservative maps to 0.25%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Standard, 0) == 0.50, "Standard maps to 0.50%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Growth, 0) == 1.00, "Growth maps to 1.00%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Aggressive, 0) == 1.50, "Aggressive maps to 1.50%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.HighRisk, 0) == 2.00, "HighRisk maps to 2.00%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Custom, 0.75) == 0.75, "Custom 0.75% accepted");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Custom, 3.50) == 2.00, "Custom > 2.00% clamped to 2.00%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Custom, 0.0) == 0.50, "Custom 0.0% falls back to default 0.50%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Custom, double.NaN) == 0.50, "Custom NaN falls back to default 0.50%");
            Assert(QuantumAIRiskEngine.GetSubscriberSelectedRiskPct(RiskProfileType.Custom, double.PositiveInfinity) == 0.50, "Custom Infinity falls back to default 0.50%");
        }

        private static void TestStrictRawJsonSignalParsingAndValidation()
        {
            Console.WriteLine("\n--- 2. Strict Raw JSON Signal Parsing & Validation (Issue 3 Fix) ---");
            double? rec;
            double? max;
            string err;

            // 1. Missing optional fields (legacy signals without risk parameters) -> Must pass and return null
            string legacyJson = "{\"hasSignal\":true,\"id\":\"SIG-101\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910}";
            Assert(QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(legacyJson, out rec, out max, out err), "Legacy signal without risk fields parsed successfully");
            Assert(!rec.HasValue && !max.HasValue, "Missing optional risk fields return null for backward compatibility");

            // 2. Valid explicit risk values
            string validJson = "{\"hasSignal\":true,\"id\":\"SIG-102\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"recommendedRiskPct\":0.50,\"maxRiskPct\":2.00}";
            Assert(QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(validJson, out rec, out max, out err), "Valid explicit risk fields accepted");
            Assert(rec.HasValue && rec.Value == 0.50 && max.HasValue && max.Value == 2.00, "Values parsed accurately");

            // 3. Valid small ceiling (0.05%) must NOT be bumped to 0.10%
            string smallCeilingJson = "{\"hasSignal\":true,\"id\":\"SIG-103\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"recommendedRiskPct\":0.05,\"maxRiskPct\":0.08}";
            Assert(QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(smallCeilingJson, out rec, out max, out err), "Small valid ceiling (0.05%) accepted");
            Assert(rec.HasValue && Math.Abs(rec.Value - 0.05) < 0.001, "Small ceiling preserved without bumping");

            // 4. Present but NULL field (e.g. \"maxRiskPct\": null) -> Must REJECT as malformed, not ignore!
            string nullFieldJson = "{\"hasSignal\":true,\"id\":\"SIG-104\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"maxRiskPct\":null}";
            Assert(!QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(nullFieldJson, out rec, out max, out err), "Present 'maxRiskPct': null rejected as malformed");
            Assert(err.Contains("MALFORMED_MAX_RISK"), "Error specifies MALFORMED_MAX_RISK");

            // 5. Present but String/Non-Numeric field (e.g. \"maxRiskPct\": \"invalid\") -> Must REJECT!
            string stringFieldJson = "{\"hasSignal\":true,\"id\":\"SIG-105\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"maxRiskPct\":\"invalid\"}";
            Assert(!QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(stringFieldJson, out rec, out max, out err), "Present 'maxRiskPct': 'invalid' rejected as malformed");

            // 6. Negative risk value -> Must REJECT!
            string negativeRiskJson = "{\"hasSignal\":true,\"id\":\"SIG-106\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"recommendedRiskPct\":-0.50}";
            Assert(!QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(negativeRiskJson, out rec, out max, out err), "Negative risk value rejected");

            // 7. Value > 5.0% -> Must REJECT!
            string excessiveRiskJson = "{\"hasSignal\":true,\"id\":\"SIG-107\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"maxRiskPct\":15.00}";
            Assert(!QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(excessiveRiskJson, out rec, out max, out err), "Excessive risk > 5.0% rejected");

            // 8. Recommended Risk > Max Risk -> Must REJECT!
            string invertedRiskJson = "{\"hasSignal\":true,\"id\":\"SIG-108\",\"pair\":\"EURUSD\",\"direction\":\"BUY\",\"entryPrice\":1.0850,\"stopLoss\":1.0820,\"takeProfit1\":1.0910,\"recommendedRiskPct\":2.50,\"maxRiskPct\":1.00}";
            Assert(!QuantumAIRiskEngine.ExtractAndValidateRiskFromSignalJson(invertedRiskJson, out rec, out max, out err), "Recommended risk > Max risk rejected");
        }

        private static void TestVolumeNormalization()
        {
            Console.WriteLine("\n--- 3. Downward Step Normalization & Zero Bumping ---");
            // 15,400 units on min 1000, step 1000 -> 15,000 units
            double norm = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 1000, 1000, 500000);
            Assert(norm == 15000, "15,400 units normalized down to 15,000 units (no overshooting)");

            // 750 units on min 1000 -> 0 (must not bump up to 1000)
            double underMin = QuantumAIRiskEngine.NormalizeVolumeDown(750, 1000, 1000, 500000);
            Assert(underMin == 0, "750 units < min 1000 returns 0 (zero bumping protection)");

            // Upstream fail-closed: Invalid broker metadata must return 0 without replacing step with 1 or minUnits
            double invalidStepZero = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 1000, 0, 500000);
            Assert(invalidStepZero == 0, "NormalizeVolumeDown with step=0 returns 0 (no fallback to 1)");

            double invalidStepNeg = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 1000, -100, 500000);
            Assert(invalidStepNeg == 0, "NormalizeVolumeDown with negative step returns 0");

            double invalidMinZero = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 0, 1000, 500000);
            Assert(invalidMinZero == 0, "NormalizeVolumeDown with min=0 returns 0");

            double invalidMaxZero = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 1000, 1000, 0);
            Assert(invalidMaxZero == 0, "NormalizeVolumeDown with max=0 returns 0");

            double invalidMaxLessThanMin = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 1000, 1000, 500);
            Assert(invalidMaxLessThanMin == 0, "NormalizeVolumeDown with max < min returns 0");

            double nanStep = QuantumAIRiskEngine.NormalizeVolumeDown(15400, 1000, double.NaN, 500000);
            Assert(nanStep == 0, "NormalizeVolumeDown with NaN step returns 0");
        }

        private static void TestMethod2EqualSplit()
        {
            Console.WriteLine("\n--- 4. Method 2 Strict 50:50 Equal Split ---");
            double totalUnits = 20000;
            double minUnits = 1000;
            double stepUnits = 1000;
            double maxUnits = 500000;

            double halfUnits = QuantumAIRiskEngine.NormalizeVolumeDown(totalUnits / 2.0, minUnits, stepUnits, maxUnits);
            Assert(halfUnits == 10000, "20,000 units splits into exactly two 10,000 unit tickets");
            Assert(halfUnits * 2.0 == totalUnits, "T1 + T2 strictly equals total volume");

            // Odd volume test: 3000 units on step 1000 -> half is 1500, normalized down is 1000
            double oddTotal = 3000;
            double oddHalf = QuantumAIRiskEngine.NormalizeVolumeDown(oddTotal / 2.0, minUnits, stepUnits, maxUnits);
            Assert(oddHalf == 1000, "3000 units split yields 1000 units per ticket");
            Assert(oddHalf * 2.0 <= oddTotal, "Equal split volume never exceeds budget");

            // Under minimum test: 1000 units total -> half is 500 < min 1000 -> returns 0
            double smallTotal = 1000;
            double smallHalf = QuantumAIRiskEngine.NormalizeVolumeDown(smallTotal / 2.0, minUnits, stepUnits, maxUnits);
            Assert(smallHalf == 0, "1000 units total cannot be split into two tickets >= min 1000 (returns 0 to skip)");
        }

        private static void TestRiskStatePersistenceWithAtomicReplacementAndFailureHandling()
        {
            Console.WriteLine("\n--- 5. Persistent Risk State Storage & Atomic Recovery Lifecycle ---");
            string broker = "ICMarkets";
            string acc = "889977";
            string type = "DEMO";
            string identityKey = QuantumAIRiskStorage.BuildIdentityKey(broker, acc, type);
            string filePath = QuantumAIRiskStorage.GetFilePath(identityKey);

            try
            {
                if (File.Exists(filePath)) File.Delete(filePath);

                DateTime day1 = new DateTime(2026, 9, 19, 10, 0, 0, DateTimeKind.Utc);
                
                // 1. First Run: Create state with composite identity
                var s1 = QuantumAIRiskStorage.LoadState(identityKey, broker, acc, type, 10000.0, 10000.0, day1);
                Assert(s1.IsFirstRun, "First run recognized and initialized");
                Assert(s1.IdentityKey == "ICMarkets_889977_DEMO", "Composite identity key formatted accurately");
                Assert(s1.DailyBaselineEquity == 10000.0, "Baseline initialized to 10000.0");
                Assert(s1.HighWaterMark == 10000.0, "High-Water Mark initialized to 10000.0");
                Assert(File.Exists(filePath), "State file atomically persisted to disk");

                // 2. Same-Day Restart after profit: Equity = 10500.0
                var s2 = QuantumAIRiskStorage.LoadState(identityKey, broker, acc, type, 10500.0, 10500.0, day1);
                Assert(!s2.IsFirstRun, "Restart recognizes existing state");
                Assert(s2.DailyBaselineEquity == 10000.0, "Same-day baseline preserved at 10000.0");
                Assert(s2.HighWaterMark == 10500.0, "High-Water Mark updated to 10500.0");

                // 3. Same-Day Restart after drawdown: Equity = 9800.0
                var s3 = QuantumAIRiskStorage.LoadState(identityKey, broker, acc, type, 9800.0, 10500.0, day1);
                Assert(s3.DailyBaselineEquity == 10000.0, "Baseline still preserved at 10000.0 (prevents daily loss reset)");
                Assert(s3.HighWaterMark == 10500.0, "Peak High-Water Mark preserved at 10500.0 (prevents drawdown reset)");

                // 4. Next-Day UTC Rollover: Date = 2026-09-20
                DateTime day2 = new DateTime(2026, 9, 20, 0, 1, 0, DateTimeKind.Utc);
                var s4 = QuantumAIRiskStorage.LoadState(identityKey, broker, acc, type, 9800.0, 10500.0, day2);
                Assert(s4.DailyBaselineEquity == 9800.0, "Next-day UTC rollover resets daily baseline to 9800.0");
                Assert(s4.HighWaterMark == 10500.0, "Peak High-Water Mark retained across day rollover at 10500.0");
                Assert(s4.LastResetDateUtc == "2026-09-20", "Reset date updated to new UTC day");

                // 5. Tamper / Corrupt Detection
                File.WriteAllText(filePath, "{\"IdentityKey\": \"ICMarkets_889977_DEMO\", \"DailyBaselineEquity\": 999999.0, \"Checksum\": \"tampered_checksum\"}");
                var sCorrupt = QuantumAIRiskStorage.LoadState(identityKey, broker, acc, type, 10000.0, 10000.0, day2);
                Assert(sCorrupt.IsCorrupted, "Tampered / corrupt risk state detected and flagged fail-closed");

                // 6. Write Failure Detection on Invalid State
                var invalidState = new QuantumAIRiskState { IdentityKey = "", IsCorrupted = true };
                Assert(!QuantumAIRiskStorage.SaveState(invalidState), "SaveState returns false when state is invalid (caller catches failure)");
            }
            finally
            {
                if (File.Exists(filePath)) File.Delete(filePath);
            }
        }

        private static void TestProductionOpenPositionGuardsFailClosed()
        {
            Console.WriteLine("\n--- 6. Production Open Position Guards & Fail-Closed Policy (Issue 4 Fix) ---");
            double equity = 10000.0;
            double maxTotalOpenRiskPct = 4.0;
            double currentOpenRisk;
            double remainingBudget;
            string vetoReason;

            // 1. Position with MISSING StopLoss -> Must FAIL-CLOSED immediately!
            var badPositions = new List<PositionRiskData>
            {
                new PositionRiskData
                {
                    Id = 101,
                    SymbolName = "EURUSD",
                    EntryPrice = 1.0850,
                    StopLoss = null, // Missing SL!
                    VolumeInUnits = 10000,
                    PipSize = 0.0001,
                    PipValue = 1.0,
                    SymbolFound = true
                }
            };
            bool posResult = QuantumAIRiskEngine.EvaluateOpenRiskFromPositions(badPositions, null, equity, maxTotalOpenRiskPct, out currentOpenRisk, out remainingBudget, out vetoReason);
            Assert(!posResult, "Position with missing StopLoss triggers production guard veto");
            Assert(vetoReason.Contains("UNKNOWN RISK") && vetoReason.Contains("#101"), "Veto reason clearly identifies missing StopLoss on position #101");

            // 2. Position with UNKNOWN symbol metadata -> Must FAIL-CLOSED immediately!
            var unknownSymPositions = new List<PositionRiskData>
            {
                new PositionRiskData
                {
                    Id = 102,
                    SymbolName = "UNKNOWN_PAIR",
                    EntryPrice = 1.0850,
                    StopLoss = 1.0800,
                    VolumeInUnits = 10000,
                    SymbolFound = false // Broker lookup failed!
                }
            };
            bool symResult = QuantumAIRiskEngine.EvaluateOpenRiskFromPositions(unknownSymPositions, null, equity, maxTotalOpenRiskPct, out currentOpenRisk, out remainingBudget, out vetoReason);
            Assert(!symResult, "Position with unknown symbol triggers production guard veto");
            Assert(vetoReason.Contains("UNKNOWN METADATA"), "Veto reason clearly identifies unknown metadata");

            // 3. Pending order with MISSING StopLoss -> Must FAIL-CLOSED!
            var badPending = new List<PositionRiskData>
            {
                new PositionRiskData
                {
                    Id = 201,
                    SymbolName = "GBPUSD",
                    EntryPrice = 1.2500,
                    StopLoss = null, // Missing SL!
                    VolumeInUnits = 10000,
                    SymbolFound = true
                }
            };
            bool poResult = QuantumAIRiskEngine.EvaluateOpenRiskFromPositions(null, badPending, equity, maxTotalOpenRiskPct, out currentOpenRisk, out remainingBudget, out vetoReason);
            Assert(!poResult, "Pending order with missing StopLoss triggers production guard veto");

            // 4. Valid open positions within budget
            // Position: 20 pips SL on 10,000 units = $20.00 monetary risk = 0.20% of $10,000 equity
            var validPositions = new List<PositionRiskData>
            {
                new PositionRiskData
                {
                    Id = 301,
                    SymbolName = "EURUSD",
                    EntryPrice = 1.0850,
                    StopLoss = 1.0830, // 20 pips SL
                    VolumeInUnits = 10000,
                    PipSize = 0.0001,
                    PipValue = 0.0001,
                    SymbolFound = true
                }
            };
            bool validResult = QuantumAIRiskEngine.EvaluateOpenRiskFromPositions(validPositions, null, equity, maxTotalOpenRiskPct, out currentOpenRisk, out remainingBudget, out vetoReason);
            Assert(validResult, "Valid open positions pass production guard evaluation");
            Assert(Math.Abs(currentOpenRisk - 0.20) < 0.01, "Current open risk accurately calculated as 0.20%");
            Assert(Math.Abs(remainingBudget - 3.80) < 0.01, "Remaining portfolio budget accurately calculated as 3.80%");

            // 5. Positions exceeding maxTotalOpenRiskPct (e.g. 500 pips on 100,000 units = $500 risk = 5.0% > 4.0%)
            var heavyPositions = new List<PositionRiskData>
            {
                new PositionRiskData
                {
                    Id = 401,
                    SymbolName = "EURUSD",
                    EntryPrice = 1.0850,
                    StopLoss = 1.0350, // 500 pips SL
                    VolumeInUnits = 100000,
                    PipSize = 0.0001,
                    PipValue = 1.0,
                    SymbolFound = true
                }
            };
            bool heavyResult = QuantumAIRiskEngine.EvaluateOpenRiskFromPositions(heavyPositions, null, equity, maxTotalOpenRiskPct, out currentOpenRisk, out remainingBudget, out vetoReason);
            Assert(!heavyResult, "Portfolio risk ceiling breach blocked by production guard");
            Assert(vetoReason.Contains("PORTFOLIO RISK CEILING"), "Veto reason identifies portfolio ceiling breach");
        }

        private static void TestProductionFixedLotSizingGuards()
        {
            Console.WriteLine("\n--- 7. Production Fixed Lot Sizing Guards (Issue 4 Fix) ---");
            double equity = 10000.0;
            double slPips = 20.0;
            double pipValue = 1.0;
            double serverMaxRisk = 2.00; // $200 max
            double remainingBudget = 1.50; // $150 remaining
            double monetaryRisk;
            double riskPct;
            string veto;

            // 1. Safe fixed lot: 0.05 lot (5,000 units) -> Risk = 5000 * 20 * 0.0001 = $10.00 (0.10% equity)
            bool safe = QuantumAIRiskEngine.EvaluateFixedLotSizing(0.05, 5000, slPips, pipValue * 0.0001, equity, serverMaxRisk, remainingBudget, out monetaryRisk, out riskPct, out veto);
            Assert(safe, "Fixed lot 0.05 within all ceilings passes production evaluation");
            Assert(Math.Abs(riskPct - 0.10) < 0.01, "Fixed lot risk percentage accurately calculated as 0.10%");

            // 2. Fixed lot exceeding remaining budget: 1.00 lot (100,000 units) -> Risk = $200 (2.00%) > remaining budget 1.50% ($150)
            bool budgetExceeded = QuantumAIRiskEngine.EvaluateFixedLotSizing(1.00, 100000, slPips, pipValue * 0.0001, equity, serverMaxRisk, remainingBudget, out monetaryRisk, out riskPct, out veto);
            Assert(!budgetExceeded, "Fixed lot exceeding remaining portfolio budget is vetoed");
            Assert(veto.Contains("PORTFOLIO RISK EXCEEDED"), "Veto specifies PORTFOLIO RISK EXCEEDED");

            // 3. Fixed lot exceeding server cap: 2.00 lots (200,000 units) -> Risk = $400 (4.00%) > server cap 2.00%
            bool serverCapExceeded = QuantumAIRiskEngine.EvaluateFixedLotSizing(2.00, 200000, slPips, pipValue * 0.0001, equity, serverMaxRisk, 5.0, out monetaryRisk, out riskPct, out veto);
            Assert(!serverCapExceeded, "Fixed lot exceeding server max risk ceiling is vetoed");
            Assert(veto.Contains("SERVER RISK EXCEEDED"), "Veto specifies SERVER RISK EXCEEDED");
        }

        private static void TestProductionFinalPreFlightRiskEnforcement()
        {
            Console.WriteLine("\n--- 8. Production Final Pre-Flight Risk Enforcement (Issue 4 Fix) ---");
            double equity = 10000.0;
            double slPips = 20.0;
            double pipValue = 0.0001; // $1/pip on 10,000 units
            double budget = 50.0; // $50 monetary budget (0.50% risk)
            double currentOpenRisk = 1.0; // 1% open
            double maxTotalRisk = 4.0; // 4% max
            double maxLotCapUnits = 500000;
            double minUnits = 1000;
            double stepUnits = 1000;
            double maxUnits = 500000;
            double actualMonetaryRisk;
            double actualRiskPct;
            string rejection;

            // 1. Valid execution: T1 = 12,000, T2 = 12,000 (Total 24,000 units). Risk = 24,000 * 20 * 0.0001 = $48.00 <= $50.00 budget
            bool valid = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(12000, 12000, slPips, pipValue, equity, budget, currentOpenRisk, maxTotalRisk, maxLotCapUnits, minUnits, stepUnits, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(valid, "Valid split tickets pass production pre-flight validation");
            Assert(Math.Abs(actualMonetaryRisk - 48.0) < 0.01, "Actual monetary risk accurately computed as $48.00");

            // 2. Budget overshoot: T1 = 15,000, T2 = 15,000 (Total 30,000 units). Risk = 30,000 * 20 * 0.0001 = $60.00 > $50.00 budget
            bool overshoot = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(15000, 15000, slPips, pipValue, equity, budget, currentOpenRisk, maxTotalRisk, maxLotCapUnits, minUnits, stepUnits, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!overshoot, "Budget overshoot blocked by production pre-flight enforcement");
            Assert(rejection.Contains("BUDGET OVERSHOOT"), "Rejection reason identifies BUDGET OVERSHOOT");

            // 3. Portfolio ceiling breach: New risk 3.5% + existing 1.0% = 4.5% > 4.0%
            bool ceilingBreach = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(80000, 80000, slPips, pipValue, equity, 500.0, 1.0, 4.0, maxLotCapUnits, minUnits, stepUnits, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!ceilingBreach, "Portfolio ceiling breach blocked by production pre-flight enforcement");
            Assert(rejection.Contains("PORTFOLIO CEILING"), "Rejection reason identifies PORTFOLIO CEILING");

            // 4. Ticket volume below broker minimum
            bool underMin = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(500, 500, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, minUnits, stepUnits, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!underMin, "Ticket volume below broker minimum blocked by production pre-flight enforcement");
            Assert(rejection.Contains("TICKET 1 BOUNDS"), "Rejection reason identifies TICKET 1 BOUNDS");

            // 5. PipValue = double.NaN (IEEE 754 non-computable risk trap)
            bool nanPipValue = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(12000, 12000, slPips, double.NaN, equity, budget, currentOpenRisk, maxTotalRisk, maxLotCapUnits, minUnits, stepUnits, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!nanPipValue, "PipValue = NaN is strictly rejected (cannot bypass numeric checks)");
            Assert(rejection.Contains("INVALID NUMERIC"), "Rejection reason identifies INVALID NUMERIC for NaN PipValue");

            // 6. Equity = double.NaN
            bool nanEquity = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(12000, 12000, slPips, pipValue, double.NaN, budget, currentOpenRisk, maxTotalRisk, maxLotCapUnits, minUnits, stepUnits, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!nanEquity, "Equity = NaN is strictly rejected");
            Assert(rejection.Contains("INVALID NUMERIC"), "Rejection reason identifies INVALID NUMERIC for NaN Equity");

            // 7. Broker Step Units Mismatch (1,500 units on min 1,000 and step 1,000)
            bool stepMismatch = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(1500, 1000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!stepMismatch, "Volume 1,500 with step 1,000 is rejected by pre-flight step validation");
            Assert(rejection.Contains("TICKET 1 STEP"), "Rejection reason identifies TICKET 1 STEP mismatch");

            // 8. Broker Step Units Match (2,000 units on min 1,000 and step 1,000)
            bool stepMatch = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(stepMatch, "Volume 2,000 with min 1,000 and step 1,000 passes pre-flight step validation");

            // 9. Ticket 2 Broker Step Units Mismatch (T1 = 2,000, T2 = 1,500 on step 1,000)
            bool stepMismatchT2 = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 1500, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!stepMismatchT2, "Ticket 2 volume 1,500 with step 1,000 is rejected by pre-flight step validation");
            Assert(rejection.Contains("TICKET 2 STEP"), "Rejection reason identifies TICKET 2 STEP mismatch");

            // 10. Broker Step = 0 (Bypass closure verification)
            bool stepZero = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 0, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!stepZero, "Broker Step = 0 is strictly rejected with fail-closed policy");
            Assert(rejection.Contains("INVALID BROKER METADATA"), "Rejection reason identifies INVALID BROKER METADATA for Step=0");

            // 11. Broker Step < 0 (Negative step)
            bool stepNeg = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, -100, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!stepNeg, "Broker Step < 0 is strictly rejected");
            Assert(rejection.Contains("INVALID BROKER METADATA"), "Rejection reason identifies INVALID BROKER METADATA for negative step");

            // 12. Broker Min Units <= 0
            bool minZero = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 0, 1000, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!minZero, "Broker Min Units = 0 is strictly rejected");
            Assert(rejection.Contains("INVALID BROKER METADATA"), "Rejection reason identifies INVALID BROKER METADATA for Min=0");

            // 13. Broker Max Units <= 0
            bool maxZero = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, 0, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!maxZero, "Broker Max Units = 0 is strictly rejected");
            Assert(rejection.Contains("INVALID BROKER METADATA"), "Rejection reason identifies INVALID BROKER METADATA for Max=0");

            // 14. Broker Max Units < Min Units (Inverted broker bounds)
            bool maxLessThanMin = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, 500, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!maxLessThanMin, "Broker Max < Min units is strictly rejected");
            Assert(rejection.Contains("INVALID BROKER METADATA"), "Rejection reason identifies INVALID BROKER METADATA for Max < Min");

            // 15. Broker Step = NaN
            bool nanStepPre = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, double.NaN, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!nanStepPre, "Broker Step = NaN is strictly rejected");
            Assert(rejection.Contains("INVALID NUMERIC"), "Rejection reason identifies INVALID NUMERIC for NaN step");

            // 16. Broker Min = NaN
            bool nanMinPre = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, double.NaN, 1000, maxUnits, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!nanMinPre, "Broker Min = NaN is strictly rejected");
            Assert(rejection.Contains("INVALID NUMERIC"), "Rejection reason identifies INVALID NUMERIC for NaN min");

            // 17. Broker Max = NaN
            bool nanMaxPre = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, double.NaN, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!nanMaxPre, "Broker Max = NaN is strictly rejected");
            Assert(rejection.Contains("INVALID NUMERIC"), "Rejection reason identifies INVALID NUMERIC for NaN max");

            // 18. Broker Max = Infinity
            bool infMaxPre = QuantumAIRiskEngine.ValidateFinalRiskPreFlight(2000, 2000, slPips, pipValue, equity, 100.0, 0, 4.0, maxLotCapUnits, 1000, 1000, double.PositiveInfinity, out actualMonetaryRisk, out actualRiskPct, out rejection);
            Assert(!infMaxPre, "Broker Max = Infinity is strictly rejected");
            Assert(rejection.Contains("INVALID NUMERIC"), "Rejection reason identifies INVALID NUMERIC for Infinity max");
        }
    }
}
