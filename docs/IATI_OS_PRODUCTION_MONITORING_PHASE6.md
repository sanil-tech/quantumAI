# IATI OS: Institutional Adaptive Trading Intelligence Operating System
## Phase 6: Production Platform, Monitoring & Governance Engine Specification

Dokumen ini merupakan spesifikasi rasmi untuk Fasa 6 (Production Platform, Monitoring & Governance Engine) bagi IATI OS. Matlamat fasa ini adalah memastikan sistem operasi stabil 24/7, boleh diaudit, berdaya tahan terhadap kegagalan, dan memantau prestasi AI serta risiko secara masa nyata dengan kawal selia institusi.

---

### 1. Production Architecture & Infrastructure Design

Senibina pengeluaran (Production Architecture) IATI OS menggunakan pendekatan *microservices* teragih yang memisahkan pelaksanaan (execution) daripada logik berat (AI/Analytics) bagi mengelakkan isu kependaman (latency).

```mermaid
flowchart TD
    subgraph Governance & Monitoring Layer
        A[Dashboard & Metrics]
        B[Audit Trail / Logging]
        C[Alert System]
    end

    subgraph Data & Execution Layer (Low Latency)
        D[Data Feed Service]
        E[Execution Engine]
        F[Risk Engine]
    end

    subgraph AI & Intelligence Layer (Compute Heavy)
        G[Market Intelligence]
        H[Decision Engine]
        I[Learning & Analytics]
    end

    D --> G
    G --> H
    H --> F
    F --> E
    E --> D
    
    E -.-> I
    
    D & E & F & G & H & I -.-> B
    B --> A
    B -.-> C
```

---

### 2. Monitoring Architecture (Observability Engine)

Enjin Pemerhatian (Observability) melaksanakan konsep "Logs, Metrics, and Traces" merentasi tiga domain kesihatan:

1.  **System Health:** 
    *   CPU, Memory, API Status, Database Latency.
2.  **Trading Health:** 
    *   Posisi terbuka (Open Positions), Status Pelaksanaan (Execution), Ralat Pesanan (Order Errors), Pendedahan Risiko (Risk Exposure).
3.  **AI Health & Model Drift:** 
    *   Taburan Keyakinan (Confidence Distribution), Ketepatan Ramalan (Prediction Accuracy).
    *   *Model Drift Detection:* Sistem memantau kemerosotan prestasi sejarah (Cth: Win Rate stragegi A jatuh dari 82% ke 42%). Jika *drift* dikesan melebihi *threshold*, sistem mencetuskan amaran "Review Required".

---

### 3. Data Quality & Broker Connectivity Management

Lapisan ini memantau input dan output kepada dunia luar (Broker).

*   **Data Quality Monitoring:** Mengesan *missing candle*, kelewatan suapan (delayed feed), *abnormal spread*, dan data pendua. Jika data rosak dikesan, arahan **BLOCK TRADING** dikeluarkan secara automatik.
*   **Broker Management:** Memantau kependaman ping, *order rejection*, *slippage anomaly*. Menyediakan fungsi *Automatic Reconnect* dan *Position Reconciliation* (menyelaraskan posisi antara sistem dan pelayan broker jika sambungan terputus).

---

### 4. Logging Framework & Audit Trail System

Segala aktiviti dalam sistem mesti direkod menggunakan konsep W4 (Who, What, When, Why).

*   **Decision Log:**
    *   `Time:` 2026-08-06 10:30:00
    *   `Module:` Decision Engine
    *   `Action:` BUY EURUSD
    *   `Confidence:` 87%
    *   `Reason:` Trend Alignment + Liquidity Sweep Detected
*   **Audit Trail System:** Jika manusia (Portfolio Manager) atau sistem menukar had risiko daripada 1.0% kepada 0.5%, log akan merakam: *Who (System/User ID), What (Risk limit change), When (Timestamp), Why (Drawdown protection triggered).*

---

### 5. Change Management & Version Control

Tiada perubahan dibenarkan terus ke persekitaran produksi (Production).

*   **Version Control:** Setiap entiti mempunyai versinya (Strategy v3.2, AI Model v2.1, Risk Config v1.5).
*   **Pipeline Perubahan:** `Development` ➜ `Backtest` ➜ `Validation` ➜ `Shadow Mode` ➜ `Approval` ➜ `Production`.
*   **Shadow Trading Mode:** Sistem AI membuat keputusan pasaran secara *Live* tetapi TIDAK melaksanakan trade tersebut. Keputusan (Prediction) akan dibandingkan dengan pergerakan pasaran sebenar (Actual) untuk validasi sebelum kelulusan *Go-Live*.
*   **A/B Strategy Testing:** Membandingkan dua strategi (A dan B) serentak dalam persekitaran pasaran yang sama berdasarkan Profit Factor dan Risk-Adjusted Return.

---

### 6. Failure Recovery Plan & Disaster Recovery

Pelan kelangsungan perniagaan yang bertindak memulihkan sistem secara automatik:

*   **Detect -> Protect -> Recover -> Verify**
    *   *Senario: API Broker Terputus.*
    *   **Detect:** Heartbeat API gagal.
    *   **Protect:** *Trading Halt* diaktifkan (sekat semua *new order*).
    *   **Recover:** Sistem mencuba *Auto-Reconnect* setiap 5 saat.
    *   **Verify:** Selepas berjaya, buat *Position Reconciliation* untuk memastikan tiada "Ghost Trade".
*   **Disaster Recovery:** Mempunyai pelan sandaran (Backup), *Failover* ke pelayan gantian, dan *Rollback* sekiranya versi perisian baru menyebabkan ralat kritikal.

---

### 7. Security Engine & Governance

Memastikan persekitaran perdagangan dilindungi daripada ancaman luar dan dalam.

*   **Data Protection:** Penyulitan (Encryption) bagi API Keys, bukti kelayakan broker (Broker Credentials), dan log kritikal.
*   **Access Control:** Kawalan berasaskan peranan (Role-Based Access Control). *DevOps* tidak boleh mengubah parameter risiko; hanya *Risk Manager* yang mempunyai kebenaran (Trading Permission).
*   **Compliance:** Memastikan semua log mematuhi keperluan audit dan rekod perubahan (Change History) tidak boleh diubah (immutable).

---

### 8. Dashboard Specification & Trading KPIs

Papan Pemuka (Dashboard) menyatukan maklumat risikan untuk pandangan institusi:

*   **Live Widgets:** System Status, Market Condition (Regime), Risk Status (Current Drawdown, Exposure).
*   **Trading KPI Engine:** Mengira prestasi masa nyata:
    *   *Profit Factor, Win Rate, Expectancy, Sharpe Ratio, Sortino Ratio, Maximum Drawdown, Recovery Factor.*
*   **Daily AI Report:** Sistem secara automatik menjana ringkasan setiap penghujung hari:
    *   *Kandungan Laporan:* Market Summary, Trades Executed (Wins/Losses), Kesilapan AI (Mistakes/False Signals), Apa yang dipelajari (Learning), dan Cadangan (Recommendations).

---

### 9. Implementation Roadmap (Phase 6)

1.  **Tahap 1 (Core Infrastructure):** Pembinaan Kubernetes/Docker kluster dengan pengasingan *Low-Latency* dan *Compute-Heavy nodes*.
2.  **Tahap 2 (Observability):** Integrasi sistem Logging (Cth: ELK Stack / Datadog) untuk Metrik, Log, dan Traces.
3.  **Tahap 3 (Resilience):** Pembangunan *Broker Connectivity Management*, *Failure Recovery*, dan *Position Reconciliation*.
4.  **Tahap 4 (Governance):** Pengaktifan *Audit Trail*, RBAC Security, dan *Version Management*.
5.  **Tahap 5 (Validation):** Pengenalan *Shadow Trading Mode* dan kerangka ujian *A/B Strategy Testing*.
6.  **Tahap 6 (UI/Reporting):** Pembangunan *Institutional Dashboard* dan penjanaan *Daily AI Report*.
