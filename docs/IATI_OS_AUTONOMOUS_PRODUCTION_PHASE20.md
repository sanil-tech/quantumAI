# IATI OS: Institutional Adaptive Trading Intelligence Operating System
## Phase 20: Fully Governed Autonomous AI Trading Platform

Dokumen ini merupakan spesifikasi rasmi dan kemuncak (pinnacle) untuk Fasa 20 bagi IATI OS. Fasa ini mentransformasikan keseluruhan ekosistem menjadi platform perdagangan kecerdasan buatan (AI) yang berautonomi sepenuhnya, dikawal ketat oleh enjin tadbir urus (governance), dan berupaya mengoptimumkan prestasinya secara berterusan (Continuous Learning Loop) tanpa mengorbankan keselamatan modal dan had risiko institusi.

---

### 1. Production Architecture (Autonomous AI Trading Platform)

Seni bina pengeluaran mengukuhkan autonomi AI dengan meletakkan `AI Governance Engine` sebagai pengadil mutlak di antara keputusan ejen dan perlaksanaan sebenar.

```mermaid
flowchart TD
    subgraph Data & Perception
        A[Market Data Layer] --> B[AI Quant Brain / Market Intelligence]
    end

    subgraph Autonomous Decision Layer
        B --> C[Multi-Agent Supervision]
        C -->|Consensus Reached| D[Decision Intelligence]
    end

    subgraph Governance & Control (The Firewall)
        D --> E[AI Governance Engine]
        E -->|Check: Data, Risk, Health| F{Decision Block}
        F -- ALLOW / LIMIT --> G[Risk Engine / Portfolio Autonomy]
        F -- BLOCK --> H[AI Self-Monitoring & Feedback]
    end

    subgraph Execution & Human Oversight
        G --> I[Broker Execution Engine]
        I --> J[Production Monitoring Dashboard]
        J --> K((Human Override))
        K -.->|Pause/Approve/Reject| E
    end

    subgraph Self-Improvement & Continuous Learning Loop
        I --> L[Observe & Analyse]
        L --> M[Learn & Suggest Improvements]
        M -.->|Require Validation| B
    end
```

---

### 2. Autonomous Workflow & Continuous Learning Loop

Autonomi AI dipacu oleh Kitaran Pembelajaran Berterusan (Continuous Learning Loop). Ia bukannya entiti bebas bertindak, tetapi beroperasi mengikut rentak pemerhatian dan tindakan yang berkaedah.

*   **Observe (Pemerhati):** Menyedut semua data pasaran, mikrostruktur, dan sentimen secara *real-time*.
*   **Analyse (Analisis):** Mengekstrak ciri (Feature Engineering) dan menilai keadaan rejim (Regime Detection).
*   **Decide (Membuat Keputusan):** Mencapai konsensus dalam kalangan *Multi-Agent Supervision* (Market, Risk, Strategy, Portfolio).
*   **Execute (Pelaksanaan):** Menghantar isyarat yang telah melepasi tapisan tadbir urus ke pasaran sebenar.
*   **Review (Semakan):** Menilai keputusan pelaksanaan (Slippage, Spread, Hasil PnL).
*   **Learn (Pembelajaran):** Memasukkan data hasil ke dalam *Prediction Memory* untuk menaik taraf *Adaptive Weighting*.
*   **Improve (Penambahbaikan):** AI menjana laporan cadangan penambahbaikan (*Suggest Improvements*). **Peringatan Penting:** AI dilarang keras melancarkan perubahan drastik atau utama ke dalam persekitaran produksi tanpa validasi manusia atau *Walk Forward Testing* berasingan.

---

### 3. Governance Model & Autonomy Level Control

Autonomi tidak bermaksud kebebasan tanpa had; ia bermaksud beroperasi dalam sempadan (boundaries) yang ditentukan.

*   **Autonomy Levels:**
    *   `Level 0:` Manual (Manusia sepenuhnya).
    *   `Level 1:` AI Assistant (Bantuan maklumat, tanpa cadangan pelaksanaan).
    *   `Level 2:` Human Approval (AI merancang, manusia meluluskan setiap posisi).
    *   `Level 3:` Supervised Automation (AI dibenarkan untuk parameter tertentu sahaja).
    *   `Level 4:` Autonomous Trading (AI bebas mengeksekusi dalam sempadan risiko institusi).
    *   `Level 5:` Adaptive Autonomous System (AI mengubah model mengikut pasaran tetapi dalam sekatan tegas).
*   **AI Governance Engine (AGE):** AGE memeriksa integriti keputusan. Syarat-syarat semakan termasuk: *Data Quality, Confidence Score, Risk Threshold, Market Condition, dan System Health*. AGE memulangkan 3 jenis keputusan: `ALLOW`, `LIMIT` (melaksanakan dengan separuh risiko), atau `BLOCK`.
*   **Multi-Agent Supervision:** Sesuatu *trade* hanya diterima jika wujud ambang persetujuan (*Agreement Threshold*) yang tinggi dari *Market Agent, Risk Agent, Strategy Agent, dan Portfolio Agent*.

---

### 4. AI & Production Monitoring System

Pemantauan pengeluaran beralih dari sekadar metrik IT (CPU/RAM) kepada pemantauan kognitif AI dan kesihatan perlaksanaan.

*   **Self-Monitoring AI:** AI secara aktif memantau tanda-tanda "sakit" seperti:
    *   *Performance Decay:* Kemerosotan Profit Factor.
    *   *Prediction Failure:* Apabila AI menjangkakan 90% keberangkalian menaik, tetapi pasaran jatuh merudum berulang kali.
    *   *Risk Increase:* Margin dan kelewatan (Drawdown) meningkat pantas.
    *   *Behaviour Change:* Jika pola algoritma tiba-tiba menunjukkan agresiviti pasaran yang luar biasa.
*   **Production Monitoring Dashboard:** Memaparkan *Live System Health, AI Confidence Matrix, Risk Allocation, Portfolio Performance, Market Condition/Regime, dan Hubungan Agent Consensus*.
*   **Human Override:** Mempunyai "Red Button" untuk kawalan penuh Manusia: `Pause`, `Approve`, `Reject`, `Modify`.

---

### 5. Deployment Strategy (Autonomous System)

Menghidupkan entiti AI berautonomi tinggi melibatkan stratifikasi peluncuran yang berperingkat.

1.  **Stage 1 - Digital Twin Simulation:** AI berfungsi dengan data historik besar-besaran (Walk Forward & Monte Carlo).
2.  **Stage 2 - Shadow Live Mode:** AI dibenarkan "membaca dan berfikir" berhubung data sebenar dan menjana diari keputusan maya tanpa pelaksanaan broker. Memerlukan *Human Validation* ke atas diari tersebut.
3.  **Stage 3 - Autonomy Level 2 (Human Approval Mode):** Berdagang dengan dana sebenar (kecil), dikawal selia di mana setiap keputusan diklik/lulus (Approve) secara manual oleh pedagang utama.
4.  **Stage 4 - Autonomy Level 4 (Autonomous Live):** Dilancarkan dengan *Policy Engine* dan *Circuit Breaker* dihidupkan pada sensitiviti maksimum.

---

### 6. Disaster Recovery Plan (Autonomous AI)

Jika AI "hilang pertimbangan" (Rogue Trading / Black Swan Event), tindak balas kecemasan mestilah automatik dan kukuh.

*   **Tier 1 (Soft Fail):** Kemerosotan kognitif dikesan (Contoh: Keyakinan AI jatuh mendadak). Tindakan: *Pause Autonomous Trading, beralih ke Level 2 (Human Approval)*.
*   **Tier 2 (Hard Fail):** Kerugian mencapai *Daily Loss Limit* yang ketat atau *Flash Crash* dikesan. Tindakan: *Circuit Breaker triggered, Close all positions, Kill API Connection, Alert CIO & SRE*.
*   **Disaster Recovery (Infrastructure):** Penduaan (Redundancy) pada Pangkalan Data (Multi-AZ) dan Pelayan Pemprosesan (Failover) jika *Node* AI utama lumpuh.
*   **Rollback Mechanism:** Jika *System Update* AI mula mengalami kepincangan (regression), modul mampu kembali secara automatik (auto-rollback) kepada Model dan Versi Strategi terakhir yang stabil.

---

### 7. Final Production Checklist (Go-Live)

Sebelum IATI OS (Fasa Keseluruhan) dibenarkan untuk memegang modal institusi dan bertindak berautonomi, senarai semak ini WAJIB dipatuhi:

*   [ ] **Explainable:** Boleh menerangkan sebab (Evidence, Risk, Confidence) setiap *trade* dijana.
*   [ ] **Auditable:** Semua tindakan dan keputusan pengiraan log direkod tanpa boleh dipadam (Tamper-proof logs).
*   [ ] **Secure:** Kunci Broker (API Keys) dienkripsi, pengesahan RBAC sedia untuk *Human Override*.
*   [ ] **Risk Controlled:** Ujian *Circuit Breaker* langsung telah dijalankan dengan jayanya. Portfolio Risk Enforcer 100% aktif.
*   [ ] **Adaptive:** Ejen ML membuktikan kebolehan mengenali *Regime Change* di persekitaran pasaran.
*   [ ] **Scalable:** Seni bina diuji tekan (Load Tested) untuk menampung ribuan strim tick-data tanpa kependaman tinggi.
*   [ ] **Disaster Recovery Verified:** *Kill switch* / butang panik disahkan berfungsi untuk memotong API terus ke broker.
*   [ ] **Governance Active:** *Governance Engine* berkuasa mutlak membatalkan isyarat daripada *Chief Decision Agent*.

---
**STATUS KESELURUHAN IATI OS: SIAP UNTUK PRODUCTION (GO-LIVE).**
Sistem telah dibina merangkumi 20 modul padu yang mengubah IATI OS daripada sebuah idea kepada ekosistem kepintaran pasaran yang canggih, selamat, kognitif, dan mentadbir urus secara automatik.
