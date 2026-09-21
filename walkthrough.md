# Aliran Sambungan Akaun cTrader (Connection Wizard) Telah Ditetapkan Mengikut Urutan Yang Betul

## 1. Ringkasan Perubahan
Memastikan modul **Aliran Sambungan Akaun cTrader (Connection Wizard)** pada Tab 5 (`CTraderBrokerConnectionHub.tsx`) dan Modal Panduan Pengguna Baharu (`CommercialOnboardingModal.tsx`) mematuhi aliran urutan (flow) langkah-demi-langkah yang betul:

### Aliran Urutan Langkah (Sequential Flow):
1. **Langkah 1: Mod & Pelayan (Mod Sambungan & Pemilihan Broker)**
   - Pengguna memilih kaedah sambungan: *cTrader Open API Direct*, *cTrader FIX API 4.4*, atau *1-Click Spotware ID SSO*.
   - Memilih broker rakan kongsi (Spotware Cloud, Pepperstone, IC Markets, FxPro, Fondex, Tradeview).
   - Memilih persekitaran (*DEMO* vs *REAL LIVE*).
   - Menekan butang **"Seterusnya: Masukkan Kelayakan Akaun ➔"** untuk beralih ke# QuantumAI Phase 3A.1 — Subscriber Equity-Normalized Local Risk Engine
## Audit Remediation & Regression Verification Report

### Ringkasan Eksekutif & Penutupan Isu (All P1 & P2 Resolved)

Semua 5 penemuan audit dan jurang ujian broker step units telah diperbaiki, dikompilasi, dan disahkan sepenuhnya melalui unit test C# production (`RiskEngineTestRunner.exe`), suite Vitest, dan build production aplikasi (`npm run build`).

---

### Jadual Penutupan Isu

| Keutamaan | Isu Semakan | Tindakan Pembetulan | Status & Bukti |
|---|---|---|---|
| **P1** | Publication bridge dalam `telegramNotificationService.ts` & `autonomousMarketScannerService.ts` tidak meneruskan `recommendedRiskPct`/`maxRiskPct`. | Ditambah penerusan `recommendedRiskPct` dan `maxRiskPct` daripada `payload` dan `best` terus ke `publishCopierSignal()`. Signal subscriber kini mengekalkan parameter risiko tanpa jatuh ke default. | **RESOLVED & VERIFIED** (`telegramNotificationService.ts:1446`, `autonomousMarketScannerService.ts:764, 789, 942`) |
| **P1** | `/copier/test-dual-order` menggunakan pemboleh ubah risiko tanpa destructuring dalam handler. | Parameter `recommendedRiskPct` dan `maxRiskPct` kini di-destructure daripada `req.body || {}` di permulaan handler, menghapuskan `ReferenceError`. | **RESOLVED & VERIFIED** (`copier.ts:831-832`) |
| **P1** | `ValidateFinalRiskPreFlight()` menerima `PipValue = NaN` & tidak memeriksa broker step. | Ditambah pemeriksaan ketat `double.IsNaN` & `double.IsInfinity` untuk semua 12 parameter, pengesahan nilai positif, dan semakan integer modulo untuk `brokerStepUnits` pada kedua-dua tiket. | **RESOLVED & VERIFIED** (`QuantumAI_VIP_Receiver.cs:603-659`, C# Test: 77/77 PASS) |
| **P1** | Kegagalan simpan HWM dalam `EvaluateAccountAndPortfolioGuards()` meneruskan penilaian signal semasa. | Jika `QuantumAIRiskStorage.SaveState(_riskState)` gagal semasa mengemas kini HWM, guard kini serta-merta menetapkan `vetoReason` dan memulangkan `false` (fail-closed serta-merta). | **RESOLVED & VERIFIED** (`QuantumAI_VIP_Receiver.cs:1203-1209`) |
| **P2** | Server menaikkan ceiling melalui `Math.max(0.01, …)` dan pembundaran dua perpuluhan. | Sebarang input di luar julat `[0.01, 5.00]` (cth. `0.005%` atau `25.0%`) kini ditolak secara jelas dengan exception `MALFORMED_MAX_RISK`. Nilai sah dalam julat dikekalkan tanpa pembundaran/bumping paksa. | **RESOLVED & VERIFIED** (`copier.ts:364, 377`, Vitest: 25/25 PASS) |
| **P1** | Pengesahan `brokerStepUnits` (contoh: volume 1,500, min 1,000, step 1,000). | `ValidateFinalRiskPreFlight()` kini mengira `(volume - min) / step` dan menolak sebarang nilai bukan gandaan tepat step. Volume 1,500 ditolak dengan sebab `TICKET 1 STEP`, manakala volume 2,000 dibenarkan. | **RESOLVED & VERIFIED** (`QuantumAI_VIP_Receiver.cs:631-657`, C# Tests 7-9 PASS) |
